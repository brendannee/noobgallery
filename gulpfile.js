require('dotenv').config()

const path = require('path');
const untildify = require('untildify');
const { readdirSync, statSync, readFileSync } = require('fs');
const gulp = require('gulp');
const resize = require('gulp-image-resize');
const parallel = require('concurrent-transform');
const mergeStream = require('merge-stream');
const file = require('gulp-file');
const debug = require('gulp-debug');
const rename = require('gulp-rename');
const awspublish = require('gulp-awspublish');
const CORES = require('os').cpus().length;
const iptc = require('node-iptc');
const exif = require('exif-parser');

const galleryLocation = untildify(process.env.GALLERY_LOCAL_PATH);
const imageExtensions = ['png','gif','jpeg','jpg','bmp'];
const extensionGlob = `/*.{${imageExtensions.join(',')}}`;

console.log(`Preparing: ${galleryLocation}`);

const previewWidth = 1500;
const thumbWidth = 200;

const folders = readdirSync(galleryLocation).filter(file => {
  return statSync(path.join(galleryLocation, file)).isDirectory();
});

function summarizeFolder(folder) {
  const galleryPath = path.join(galleryLocation, folder);
  const images = readdirSync(galleryPath).filter(file => {
    const filePath = path.join(galleryPath, file);
    if (statSync(filePath).isDirectory()) {
      return false;
    }
    return imageExtensions.indexOf(path.extname(filePath).toLowerCase().substr(1)) !== -1;
  });

  return images.map(image => {
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
      preview: `${folder}/previews/${image}`,
      subHtml,
      location: {
        lat,
        lng
      }
    }
  });
}

function summarizeGallery() {
  return folders.map(folder => {
    const images = JSON.parse(readFileSync(path.join(galleryLocation, folder, 'index.json'), 'utf8'));

    const summary = {
      galleryId: folder
    }

    if (images && images.length) {
      summary.src = images[0].src
      summary.thumb = images[0].thumb
      summary.preview = images[0].preview
    }
    return summary
  })
}

gulp.task('previews', () => {
  return mergeStream(folders.map(folder => {
    const galleryPath = path.join(galleryLocation, folder);
    return gulp.src(path.join(galleryPath, extensionGlob), {nocase: true})
      .pipe(parallel(resize({width: previewWidth, quality: 0.5}), CORES))
      .pipe(rename(path => {
        path.dirname = '';
      }))
      .pipe(gulp.dest('previews', {cwd: galleryPath}))
      .pipe(debug({title: 'Created preview image'}));
  }));
});

gulp.task('thumbs', () => {
  return mergeStream(folders.map(folder => {
    const galleryPath = path.join(galleryLocation, folder);
    return gulp.src(path.join(galleryPath, 'previews', extensionGlob), {nocase: true})
      .pipe(parallel(resize({width: thumbWidth}), CORES))
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
    .pipe(awspublish.reporter())
    .pipe(debug({title: 'Published to Amazon S3'}));
});

gulp.task('resize', gulp.series('previews', 'thumbs'));

gulp.task('default', gulp.series('resize', 'summarize', 'summarizeGalleries', 'publish'));
