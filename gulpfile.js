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
const moment = require('moment');
const through = require('through2');
const sharp = require('sharp');
const del = require('del');
const pug = require('gulp-pug');
const readFolder = util.promisify(readdir);

const gallerySource = untildify(process.env.GALLERY_LOCAL_PATH);
const galleryDest = './build';
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

const summarizeImage = async (galleryPath, fileName) => {
  const buffer = readFileSync(path.join(galleryPath, 'large', fileName));
  const xmp = await xmpReader.fromBuffer(buffer)
  let subHtml = '';
  const galleryName = galleryPath.split(path.sep).pop();
  const photoTitle = path.basename(fileName, path.extname(fileName));
  let title = _.startCase(galleryName);

  if (photoTitle !== 'cover') {
    title += ` - ${photoTitle}`;
  }

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

  if (createDate && process.env.SHOW_CREATED_DATE !== 'false') {
    subHtml += `<p>Taken ${moment.unix(createDate).format('MMM D, YYYY')}</p>`;
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
    src: path.join(galleryPath, fileName),
    fileName,
    type: 'image',
  }
}

const getNotFoundImage = () => {
  const notFoundImageUrl = path.join('/', 'static', 'images', 'not_found.png');
  return {
    src: notFoundImageUrl,
    thumb: notFoundImageUrl,
    medium: notFoundImageUrl,
    large: notFoundImageUrl,
    imageSize: {
      height: 225,
      width: 225,
    },
  }
}

const getCoverImage = galleryPath => {
  const items = JSON.parse(readFileSync(path.join(galleryPath, 'index.json'), 'utf8'));

  if (items && items.length) {
    const image = items.find(item => item.isCover === true && item.type !== 'gallery') || items[0];
    if (image.src) {
      return image;
    }
  }
}

const createGalleryJson = async galleryPath => {
  const galleryName = galleryPath.split(path.sep).pop();
  const isTopLevel = galleryName === 'gallery';
  const galleryPathLarge = path.join(galleryPath, 'large');
  const files = await readFolder(galleryPathLarge)
    .catch(error => {
      // Hide errors, folder may not have any images
      return [];
    });

  const images = _.compact(await Promise.all(files.map(async fileName => {
    if (imageExtensions.includes(path.extname(fileName).toLowerCase().substr(1))) {
      return summarizeImage(galleryPath, fileName)
    }

    return false;
  })));

  const subfolders = await readFolder(galleryPath);

  const subgalleries = _.compact(await Promise.all(subfolders.map(async fileName => {
    const subgalleryFilePath = path.join(galleryPath, fileName);
    const subgalleryUrlPath = isTopLevel ? path.join('gallery', fileName) : fileName;
    if (statSync(subgalleryFilePath).isDirectory()) {
      if (['large', 'medium', 'thumbs'].includes(fileName)) {
        return false;
      }

      await createGalleryJson(subgalleryFilePath);
      let cover = getCoverImage(subgalleryFilePath);

      if (cover) {
        cover.thumb = path.join(subgalleryUrlPath, cover.thumb);
        cover.medium = path.join(subgalleryUrlPath, cover.medium);
        cover.large = path.join(subgalleryUrlPath, cover.large);
      } else {
        cover = getNotFoundImage();
      }

      return {
        ...cover,
        type: 'gallery',
        filePath: subgalleryFilePath,
        galleryUrl: subgalleryUrlPath,
        title: _.startCase(fileName),
      };
    }

    return false;
  })));

  const items = [...subgalleries, ..._.sortBy(images, ['createDate'])];

  return new Promise((resolve, reject) => {
    file('index.json', JSON.stringify(items), {src: true})
      .pipe(gulp.dest(galleryPath))
      .on('end', resolve);
  });
}

const createGalleryHtml = async galleryPath => {
  const subfolders = await readFolder(galleryPath);

  await Promise.all(subfolders.map(async fileName => {
    const filePath = path.join(galleryPath, fileName);
    if (['large', 'medium', 'thumbs'].includes(fileName)) {
      return false;
    }

    if (statSync(filePath).isDirectory()) {
      await createGalleryHtml(filePath);
    }
  }));

  const items = JSON.parse(readFileSync(path.join(galleryPath, 'index.json'), 'utf8'));
  const galleryName = galleryPath.split(path.sep).pop();
  const isTopLevel = galleryName === 'gallery';
  const galleryTitle = isTopLevel ? process.env.GALLERY_TITLE : `${_.startCase(galleryName)} - ${process.env.GALLERY_TITLE}`;
  const breadcrumb = path.relative(galleryDest, galleryPath);

  const pugConfig = {
    locals: {
      _
    },
    data: {
      config: {
        assetPath: path.relative(galleryPath, path.join(galleryDest, 'static')),
        useIndexFile: process.env.USE_INDEX_FILE,
        forceHttps: process.env.FORCE_HTTPS,
        googleAnalytics: process.env.GOOGLE_ANALYTICS_ID,
        footerHtml: process.env.FOOTER_HTML,
      },
      items,
      galleryName,
      galleryTitle,
      galleryDescription: process.env.GALLERY_DESCRIPTION,
      title: `${galleryTitle} : ${process.env.GALLERY_DESCRIPTION}`,
      breadcrumb,
      isTopLevel,
    }
  };

  const destination = isTopLevel ? galleryDest : galleryPath;

  return gulp.src('views/gallery.pug')
    .pipe(rename('index.html'))
    .pipe(pug(pugConfig))
    .pipe(gulp.dest(destination))
    .pipe(debug({title: 'Created gallery HTML'}))
}

gulp.task('copyOriginals', () => {
  return gulp.src(path.join(gallerySource, '**', extensionGlob), {nocase: true})
    .pipe(gulp.dest(path.join(galleryDest, 'gallery')))
    .pipe(debug({title: 'Copied full versions of photos'}));
});

gulp.task('large', () => {
  return gulp.src(path.join(gallerySource, '**', extensionGlob), {nocase: true})
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
    .pipe(rename(filePath => {
      filePath.dirname = path.join(filePath.dirname, 'large');
    }))
    .pipe(gulp.dest('gallery', {cwd: galleryDest}))
    .pipe(debug({title: 'Created large image'}));
});

gulp.task('medium', () => {
  return gulp.src(path.join(gallerySource, '**', extensionGlob), {nocase: true})
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
    .pipe(rename(filePath => {
      filePath.dirname = path.join(filePath.dirname, 'medium');
    }))
    .pipe(gulp.dest('gallery', {cwd: galleryDest}))
    .pipe(debug({title: 'Created medium image'}));
});

gulp.task('thumb', () => {
  return gulp.src(path.join(gallerySource, '**', extensionGlob), {nocase: true})
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
    .pipe(rename(filePath => {
      filePath.dirname = path.join(filePath.dirname, 'thumbs');
    }))
    .pipe(gulp.dest('gallery', {cwd: galleryDest}))
    .pipe(debug({title: 'Created thumbnail image'}));
});

gulp.task('galleryJson', () => createGalleryJson(path.join(galleryDest, 'gallery')));

gulp.task('galleryHtml', () => createGalleryHtml(path.join(galleryDest, 'gallery')));

gulp.task('copyStatic', () => {
  const libraries = [
    {
      src: './static/**/*.*',
      dest: path.join(galleryDest, 'static')
    },
    {
      src: './node_modules/lightgallery.js/dist/**/*.*',
      dest: path.join(galleryDest, 'static', 'lightgallery.js')
    },
    {
      src: './node_modules/lg-thumbnail.js/dist/**/*.*',
      dest: path.join(galleryDest, 'static', 'lg-thumbnail.js')
    },
    {
      src: './node_modules/lg-autoplay.js/dist/**/*.*',
      dest: path.join(galleryDest, 'static', 'lg-autoplay.js')
    },
    {
      src: './node_modules/lg-fullscreen.js/dist/**/*.*',
      dest: path.join(galleryDest, 'static', 'lg-fullscreen.js')
    },
    {
      src: './node_modules/lg-pager.js/dist/**/*.*',
      dest: path.join(galleryDest, 'static', 'lg-pager.js')
    },
    {
      src: './node_modules/lg-zoom.js/dist/**/*.*',
      dest: path.join(galleryDest, 'static', 'lg-zoom.js')
    },
    {
      src: './node_modules/lg-hash.js/dist/**/*.*',
      dest: path.join(galleryDest, 'static', 'lg-hash.js')
    },
    {
      src: './node_modules/lg-share.js/dist/**/*.*',
      dest: path.join(galleryDest, 'static', 'lg-share.js')
    },
    {
      src: './node_modules/masonry-layout/dist/**/*.*',
      dest: path.join(galleryDest, 'static', 'masonry-layout')
    },
    {
      src: './node_modules/imagesloaded/imagesloaded.pkgd.min.js',
      dest: path.join(galleryDest, 'static', 'imagesloaded')
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
    .pipe(gulp.dest(galleryDest))
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
    gulp.src([path.join(galleryDest, '/**/*'), `!${path.join(galleryDest, '/**/*.{json,html}')}`])
      .pipe(parallel(awspublish.gzip(), CORES))
      .pipe(parallel(publisher.publish({
        'Cache-Control': 'max-age=315360000, no-transform, public'
      }), CORES))
      .pipe(publisher.cache())
      .pipe(awspublish.reporter()),
    gulp.src(path.join(galleryDest, '/**/*.{json,html}'))
      .pipe(parallel(awspublish.gzip(), CORES))
      .pipe(parallel(publisher.publish({
        'Cache-Control': 'max-age=1200, no-transform, public'
      }), CORES))
      .pipe(publisher.cache())
      .pipe(awspublish.reporter())
  );
});

gulp.task('clean', () => {
  return del(galleryDest);
});

gulp.task('resize', gulp.parallel('large', 'medium', 'thumb'));

gulp.task('html', gulp.series('galleryJson', 'galleryHtml', gulp.parallel('copyStatic', 'favicon')))

gulp.task('build', gulp.series('clean', 'copyOriginals', 'resize', 'html'));

gulp.task('deploy', gulp.series('build', 'publishAWS'));
