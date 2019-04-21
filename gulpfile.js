require('dotenv').config()

const path = require('path');
const util = require('util');
const stream = require('stream');
const untildify = require('untildify');
const { readdir, readdirSync, statSync, readFileSync } = require('fs');
const gulp = require('gulp');
const parallel = require('concurrent-transform');
const mergeStream = require('merge-stream');
const file = require('gulp-file');
const debug = require('gulp-debug');
const rename = require('gulp-rename');
const gutil = require('gulp-util');
const awspublish = require('gulp-awspublish');
const CORES = require('os').cpus().length;
const xmpReader = require('xmp-reader');
const exif = require('exif-parser');
const _ = require('lodash');
const through = require('through2');
const sharp = require('sharp');
const del = require('del');
const pug = require('gulp-pug');
const readFolder = util.promisify(readdir);

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
        .withMetadata()
        .rotate()
        .resize(options.resize)
        .jpeg({quality: options.quality || 80})
        .toBuffer()
        .then(function(data) {
          const newFile = new gutil.File({
            cwd: file.cwd,
            base: file.base,
            path: file.path,
            contents: data
          });
          callback(null, newFile);
      });
    }
  });
}

const folders = readdirSync(gallerySource).filter(file => {
  return statSync(path.join(gallerySource, file)).isDirectory();
});

const summarizeImage = async (filePath, fileName) => {
  const buffer = readFileSync(filePath);
      const xmp = await xmpReader.fromBuffer(buffer)
      let subHtml = '';
      let title = '';
      let description = '';

      if (xmp) {
        if (xmp.title) {
          subHtml += `<h4>${xmp.title}</h4>`;
          title = xmp.title;
        }
        if (xmp.description) {
          subHtml += `<p>${xmp.description}</p>`;
          description = xmp.description;
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
        thumb: `thumbs/${fileName}`,
        medium: `medium/${fileName}`,
        large: `large/${fileName}`,
        createDate,
        subHtml,
        title,
        description,
        location: {
          lat,
          lng
        },
        imageSize: exifData.imageSize,
        isCover: fileName.toLowerCase().startsWith('cover'),
        fileName,
        src: filePath,
        fileName,
        type: 'image',
      }
}

const summarizeFolder = async folder => {
  const galleryPath = path.join(galleryTemp, 'gallery', folder, 'large');
  const items = await readFolder(galleryPath)
    .catch(error => {
      // Hide errors
      return [];
    });

  const galleryItems =  _.compact(await Promise.all(items.map(async fileName => {
    const filePath = path.join(galleryPath, fileName);
    if (statSync(filePath).isDirectory()) {
      // return {
      //   type: 'gallery',
      //   filePath,
      //   fileName,
      // };
    } else if (imageExtensions.includes(path.extname(filePath).toLowerCase().substr(1))) {
      return summarizeImage(filePath, fileName)
    }

    return false;
  })));

  return _.sortBy(galleryItems, ['createDate']);
}

function summarizeGallery() {
  return folders.map(folder => {
    const images = JSON.parse(readFileSync(path.join(galleryTemp, 'gallery', folder, 'index.json'), 'utf8'))

    const notFoundImageUrl = path.join('static', 'images', 'not_found.png');
    const cover = {
      src: notFoundImageUrl,
      thumb: notFoundImageUrl,
      medium: notFoundImageUrl,
      large: notFoundImageUrl,
      imageSize: {
        height: 225,
        width: 225,
      },
    }

    if (images && images.length) {
      const image = _.find(images, {isCover: true}) || images[0];
      cover.src = image.src;
      cover.thumb = path.join('gallery', folder, image.thumb);
      cover.medium = path.join('gallery', folder, image.medium);
      cover.large = path.join('gallery', folder, image.large);
      cover.imageSize = image.imageSize;
    }

    return {
      galleryId: folder,
      src: cover.src,
      thumb: cover.thumb,
      medium: cover.medium,
      large: cover.large,
      imageSize: cover.imageSize,
    };
  });
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
        resize: {
          width: largeWidth,
          height: largeWidth,
          withoutEnlargement: true,
          fit: 'inside',
          keepMetadata: true
        },
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
        resize: {
          width: mediumWidth,
          height: mediumWidth,
          withoutEnlargement: true,
          fit: 'inside'
        },
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
        resize: {
          width: thumbWidth,
          height: thumbWidth,
          withoutEnlargement: true,
          fit: 'inside'
        },
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

gulp.task('galleryJson', () => {
  return Promise.all(folders.map(async folder => {
    const galleryPath = path.join(galleryTemp, 'gallery', folder);
    const images = await summarizeFolder(folder);
    return new Promise((resolve, reject) => {
      file('index.json', JSON.stringify(images), {src: true})
        .pipe(gulp.dest(galleryPath))
        .on('end', resolve);
    });
  }));
});

gulp.task('galleryHtml', () => {
  return mergeStream(folders.map(folder => {
    const galleryPath = path.join(galleryTemp, 'gallery', folder);
    const images = JSON.parse(readFileSync(path.join(galleryPath, 'index.json'), 'utf8'))
    const pugConfig = {
      locals: {
        _
      },
      data: {
        config: {
          galleryDescription: process.env.GALLERY_DESCRIPTION,
          assetPath: '../../static',
          forceHttps: process.env.FORCE_HTTPS
        },
        images,
        galleryId: folder,
        galleryTitle: `${_.startCase(folder)} - ${process.env.GALLERY_TITLE}`,
        title: `${_.startCase(folder)} - ${process.env.GALLERY_TITLE}`
      }
    };

    return gulp.src('views/gallery.pug')
        .pipe(rename('index.html'))
        .pipe(pug(pugConfig))
        .pipe(gulp.dest(galleryPath))
        .pipe(debug({title: 'Created gallery HTML'}))
  }));
});

gulp.task('indexHtml', () => {
  return gulp.src('views/{index,error}.pug')
    .pipe(pug({
      locals: {
        _
      },
      data: {
        config: {
          assetPath: './static',
          useIndexFile: process.env.USE_INDEX_FILE,
          forceHttps: process.env.FORCE_HTTPS
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

gulp.task('html', gulp.series('galleryJson', 'galleryHtml', gulp.parallel('indexHtml', 'copyStatic', 'favicon')))

gulp.task('build', gulp.series('clean', 'copyOriginals', 'resize', 'html'));

gulp.task('deploy', gulp.series('build', 'publishAWS'));
