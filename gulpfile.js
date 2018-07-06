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

const galleryLocation = untildify(process.env.GALLERY_LOCAL_PATH);
const imageExtensions = ['png','gif','jpeg','jpg','bmp'];
const extensionGlob = `/*.{${imageExtensions.join(',')}}`;

console.log(`Preparing: ${galleryLocation}`);

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

const folders = readdirSync(galleryLocation).filter(file => {
  return statSync(path.join(galleryLocation, file)).isDirectory();
});

function summarizeFolder(folder) {
  const galleryPath = path.join(galleryLocation, folder, 'large');
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
      src: `${folder}/${image}`,
      thumb: `${folder}/thumbs/${image}`,
      medium: `${folder}/medium/${image}`,
      large: `${folder}/large/${image}`,
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
    const images = JSON.parse(readFileSync(path.join(galleryLocation, folder, 'index.json'), 'utf8'))

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

gulp.task('large', () => {
  return mergeStream(folders.map(folder => {
    const galleryPath = path.join(galleryLocation, folder);
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
    const galleryPath = path.join(galleryLocation, folder);
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
    const galleryPath = path.join(galleryLocation, folder);
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

gulp.task('summarize', () => {
  return mergeStream(folders.map(folder => {
    const galleryPath = path.join(galleryLocation, folder);
    return gulp.src(galleryPath, {nocase: true})
       .pipe(parallel(file('index.json', JSON.stringify(summarizeFolder(folder)))), CORES)
       .pipe(gulp.dest('.', {cwd: galleryPath}))
       .pipe(debug({title: 'Created summary JSON'}));
  }));
});

gulp.task('summarizeGalleries', () => {
  return gulp.src(galleryLocation, {nocase: true})
     .pipe(parallel(file('index.json', JSON.stringify(summarizeGallery()))), CORES)
     .pipe(gulp.dest('.', {cwd: galleryLocation}))
     .pipe(debug({title: 'Created gallery summary JSON'}));
});

gulp.task('publish', () => {
  const publisher = awspublish.create({
    region: process.env.AWS_REGION,
    params: {
      Bucket: process.env.AWS_BUCKET
    },
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  });

  const headers = {
    'Cache-Control': 'max-age=315360000, no-transform, public'
  };

  return gulp.src(path.join(galleryLocation, '/**/*'))
    .pipe(parallel(awspublish.gzip(), CORES))
    .pipe(parallel(publisher.publish(headers), CORES))
    .pipe(publisher.cache())
    .pipe(awspublish.reporter());
});

gulp.task('resize', gulp.series('large', 'medium', 'thumbs'));

gulp.task('default', gulp.series('resize', 'summarize', 'summarizeGalleries', 'publish'));
