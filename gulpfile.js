require('dotenv').config()

const path = require('path');
const untildify = require('untildify');
const { readdirSync, statSync, readFileSync } = require('fs');
const gulp = require('gulp');
const parallel = require('concurrent-transform');
const mergeStream = require('merge-stream');
const file = require('gulp-file');
const debug = require('gulp-debug');
const rename = require('gulp-rename');
const gutil = require('gulp-util');
const awspublish = require('gulp-awspublish');
const CORES = require('os').cpus().length;
const iptc = require('node-iptc');
const exif = require('exif-parser');
const _ = require('lodash');
const through = require('through2');
const sharp = require('sharp');
const del = require('del');
const pug = require('gulp-pug');

const gallerySource = untildify(process.env.GALLERY_LOCAL_PATH);
const galleryTemp = './build';
const imageExtensions = ['png','gif','jpeg','jpg','bmp'];
const extensionGlob = `/*.{${imageExtensions.join(',')}}`;

console.log(`Preparing: ${gallerySource}`);

const largeWidth = 3000;
const mediumWidth = 800;
const thumbWidth = 200;

function gulpSharp(options){
  return through.obj((file, encoding, callback) => {
    if (file.isNull()) {
      this.push(file)
      return callback();
    }

    if (!options) {
      this.emit('error', new gutil.PluginError('gulpSharp', "You need to pass options to this plugin. See docs..."));
    }

    if (!options.resize) {
      this.emit('error', new gutil.PluginError('gulpSharp', "You must pass resize as an option and it must be an array with 2 values w,h."));
    }

    if (file.isStream()) {
      this.emit('error', new gutil.PluginError('gulpSharp', "Received a stream... Streams are not supported. Sorry."));
      return callback();
    }

    if (file.isBuffer()) {
      const image = sharp(file.contents);

      image
        .metadata()
        .then(function(metadata){
          return image
            .rotate()
            .resize(...options.resize)
            .max()
            .withoutEnlargement()
            .jpeg({quality: options.quality || 80})
            .toBuffer()
        })
        .then(function(data){
          if (options.progressive){
            image.progressive()
          }

          if (options.stripMetadata){
            // if true - then we keep all EXIF data of image
            // otherwise default behavior is to strip it all
            image.withMetadata();
          }
          return image;
        })

        .then(function(sequentialRead){
          if (options.sequentialRead){
            image.sequentialRead()
          }
          return image;

         })

        .then(function(trellisQuantisation){
          if (options.trellisQuantisation){
            image.trellisQuantisation()
          }
          return image;
        })

        .then(function(data) {
          const newFile = new gutil.File({
            cwd: file.cwd,
            base: file.base,
            path: file.path,
            contents: image
          });
          callback(null, newFile);
      });
    }
  });
}

const folders = readdirSync(gallerySource).filter(file => {
  return statSync(path.join(gallerySource, file)).isDirectory();
});

function summarizeFolder(folder) {
  const galleryPath = path.join(galleryTemp, 'gallery', folder, 'large');
  const images = readdirSync(galleryPath).filter(file => {
    const filePath = path.join(galleryPath, file);
    if (statSync(filePath).isDirectory()) {
      return false;
    }
    return imageExtensions.includes(path.extname(filePath).toLowerCase().substr(1))
  });

  return _.sortBy(images.map(image => {
    const buffer = readFileSync(path.join(galleryPath, image));
    const iptcData = iptc(buffer);

    let subHtml = '';
    if (iptcData) {
      if (iptcData.object_name) {
        subHtml += `<h4>${iptcData.object_name}</h4>`;
      }
      if (iptcData.caption) {
        subHtml += `<p>${iptcData.caption}</p>`;
      }
    }

    const parser = exif.create(buffer);
    const exifData = parser.parse();

    let createDate;
    let lat;
    let lng;
    if (exifData && exifData.tags) {
      createDate = exifData.tags.CreateDate;

      if (exifData.tags.GPSLatitude && exifData.tags.GPSLongitude) {
        lat = exifData.tags.GPSLatitude;
        lng = exifData.tags.GPSLongitude;
      }
    }

    return {
      src: `${image}`,
      thumb: `thumbs/${image}`,
      medium: `medium/${image}`,
      large: `large/${image}`,
      createDate,
      subHtml,
      location: {
        lat,
        lng
      },
      imageSize: exifData.imageSize,
      isCover: image.toLowerCase().startsWith('cover')
    }
  }), ['createDate']);
}

function summarizeGallery() {
  return folders.map(folder => {
    const images = JSON.parse(readFileSync(path.join(galleryTemp, 'gallery', folder, 'index.json'), 'utf8'))

    const summary = {
      galleryId: folder
    }

    if (images && images.length) {
      const cover = _.find(images, {isCover: true}) || images[0]

      summary.src = cover.src
      summary.thumb = cover.thumb
      summary.medium = cover.medium
      summary.large = cover.large
      summary.imageSize = cover.imageSize
    }
    return summary
  })
}

gulp.task('copyOriginals', () => {
  return gulp.src(path.join(gallerySource, '**', extensionGlob), {nocase: true})
    .pipe(gulp.dest(path.join(galleryTemp, 'gallery')))
    .pipe(debug({title: 'Copied full versions of photos'}));
});

gulp.task('large', () => {
  return mergeStream(folders.map(folder => {
    const galleryPath = path.join(galleryTemp, 'gallery', folder);
    return gulp.src(path.join(galleryPath, extensionGlob), {nocase: true})
      .pipe(parallel(gulpSharp({
        resize: [largeWidth, largeWidth],
        quality: 88,
        rotate: true
      }), CORES))
      .pipe(rename(path => {
        path.dirname = '';
      }))
      .pipe(gulp.dest('large', {cwd: galleryPath}))
      .pipe(debug({title: 'Created large image'}));
  }));
});

gulp.task('medium', () => {
  return mergeStream(folders.map(folder => {
    const galleryPath = path.join(galleryTemp, 'gallery', folder);
    return gulp.src(path.join(galleryPath, extensionGlob), {nocase: true})
      .pipe(parallel(gulpSharp({
        resize: [mediumWidth, mediumWidth],
        quality: 88,
        rotate: true
      }), CORES))
      .pipe(rename(path => {
        path.dirname = '';
      }))
      .pipe(gulp.dest('medium', {cwd: galleryPath}))
      .pipe(debug({title: 'Created medium image'}));
  }));
});

gulp.task('thumbs', () => {
  return mergeStream(folders.map(folder => {
    const galleryPath = path.join(galleryTemp, 'gallery', folder);
    return gulp.src(path.join(galleryPath, 'medium', extensionGlob), {nocase: true})
      .pipe(parallel(gulpSharp({
        resize: [thumbWidth, thumbWidth],
        quality: 80,
        rotate: true
      }), CORES))
      .pipe(rename(function(path) {
        path.dirname = '';
      }))
      .pipe(gulp.dest('thumbs', {cwd: galleryPath}))
      .pipe(debug({title: 'Created thumbnail'}));
  }));
});

gulp.task('galleryHtml', () => {
  return mergeStream(_.flatten(folders.map(folder => {
    const galleryPath = path.join(galleryTemp, 'gallery', folder);
    const images = summarizeFolder(folder);
    const pugConfig = {
      locals: {
        _
      },
      data: {
        config: {
          galleryDescription: process.env.GALLERY_DESCRIPTION,
          assetPath: '../../static'
        },
        images,
        galleryId: folder,
        galleryTitle: `${_.startCase(folder)} - ${process.env.GALLERY_TITLE}`,
        title: `${_.startCase(folder)} - ${process.env.GALLERY_TITLE}`
      }
    };

    return [
      gulp.src('views/gallery.pug')
        .pipe(rename('index.html'))
        .pipe(pug(pugConfig))
        .pipe(gulp.dest(galleryPath))
        .pipe(debug({title: 'Created gallery HTML'})),
      file('index.json', JSON.stringify(images), {src: true})
        .pipe(gulp.dest(galleryPath))
    ];
  })));
});

gulp.task('indexHtml', () => {
  return gulp.src('views/{index,error}.pug')
    .pipe(pug({
      locals: {
        _
      },
      data: {
        config: {
          assetPath: './static'
        },
        galleries: summarizeGallery(),
        galleryTitle: process.env.GALLERY_TITLE,
        title: process.env.GALLERY_TITLE,
        description: process.env.GALLERY_DESCRIPTION
      }
    }))
    .pipe(gulp.dest(galleryTemp))
    .pipe(debug({title: 'Created gallery index HTML'}));
});

gulp.task('copyStatic', () => {
  const libraries = [
    {
      src: './static/**/*.*',
      dest: path.join(galleryTemp, 'static')
    },
    {
      src: './node_modules/lightgallery.js/dist/**/*.*',
      dest: path.join(galleryTemp, 'static', 'lightgallery.js')
    },
    {
      src: './node_modules/lg-thumbnail.js/dist/**/*.*',
      dest: path.join(galleryTemp, 'static', 'lg-thumbnail.js')
    },
    {
      src: './node_modules/lg-autoplay.js/dist/**/*.*',
      dest: path.join(galleryTemp, 'static', 'lg-autoplay.js')
    },
    {
      src: './node_modules/lg-fullscreen.js/dist/**/*.*',
      dest: path.join(galleryTemp, 'static', 'lg-fullscreen.js')
    },
    {
      src: './node_modules/lg-pager.js/dist/**/*.*',
      dest: path.join(galleryTemp, 'static', 'lg-pager.js')
    },
    {
      src: './node_modules/lg-zoom.js/dist/**/*.*',
      dest: path.join(galleryTemp, 'static', 'lg-zoom.js')
    },
    {
      src: './node_modules/lg-hash.js/dist/**/*.*',
      dest: path.join(galleryTemp, 'static', 'lg-hash.js')
    },
    {
      src: './node_modules/lg-share.js/dist/**/*.*',
      dest: path.join(galleryTemp, 'static', 'lg-share.js')
    },
    {
      src: './node_modules/masonry-layout/dist/**/*.*',
      dest: path.join(galleryTemp, 'static', 'masonry-layout')
    },
    {
      src: './node_modules/imagesloaded/imagesloaded.pkgd.min.js',
      dest: path.join(galleryTemp, 'static', 'imagesloaded')
    }
  ]

  return mergeStream(libraries.map(library => {
    return gulp.src(library.src)
      .pipe(gulp.dest(library.dest));
  }))
  .pipe(debug({title: 'Copied static files'}));
});

gulp.task('favicon', () => {
  return gulp.src(path.join(gallerySource, 'favicon.ico'), {allowEmpty: true})
    .pipe(gulp.dest(galleryTemp))
    .pipe(debug({title: 'Copied favicon'}));
});

gulp.task('publishAWS', () => {
  const publisher = awspublish.create({
    region: process.env.AWS_REGION,
    params: {
      Bucket: process.env.AWS_BUCKET
    },
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  });

  // Set caching headers to 20 minutes for json and html files
  return mergeStream(
    gulp.src([path.join(galleryTemp, '/**/*'), `!${path.join(galleryTemp, '/**/*.{json,html}')}`])
      .pipe(parallel(awspublish.gzip(), CORES))
      .pipe(parallel(publisher.publish({
        'Cache-Control': 'max-age=315360000, no-transform, public'
      }), CORES))
      .pipe(publisher.cache())
      .pipe(awspublish.reporter()),
    gulp.src(path.join(galleryTemp, '/**/*.{json,html}'))
      .pipe(parallel(awspublish.gzip(), CORES))
      .pipe(parallel(publisher.publish({
        'Cache-Control': 'max-age=1200, no-transform, public'
      }), CORES))
      .pipe(publisher.cache())
      .pipe(awspublish.reporter())
  );
});

gulp.task('clean', () => {
   return del(galleryTemp);
});

gulp.task('resize', gulp.parallel('large', 'medium', 'thumbs'));

gulp.task('html', gulp.series('galleryHtml', gulp.parallel('indexHtml', 'copyStatic', 'favicon')))

gulp.task('build', gulp.series('copyOriginals', 'resize', 'html'));

gulp.task('deploy', gulp.series('build', 'publishAWS'));
