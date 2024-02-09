require('dotenv').config()

const fs = require('fs');
const glob = require('glob');
const path = require('path');
const util = require('util');
const untildify = require('untildify');
const { readdir, statSync, readFileSync } = require('fs');
const gulp = require('gulp');
const plumber = require('gulp-plumber');
const parallel = require('concurrent-transform');
const mergeStream = require('merge-stream');
const file = require('gulp-file');
const debug = require('gulp-debug');
// reduce debug noise
const debugDetailed = (args) =>
  debug(
    {...args,
    minimal: true,
		showFiles: false
  });
const es = require('event-stream');
const fancyLog = require('fancy-log');

const rename = require('gulp-rename');
const awspublish = require('gulp-awspublish');
const PluginError = require('plugin-error');
const Vinyl = require('vinyl');
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
if (!fs.existsSync(gallerySource))
  throw `Path ${gallerySource} does not exist - please check env.GALLERY_LOCAL_PATH`;

const galleryDest = './build';
const imageExtensions = ['png','gif','jpeg','jpg','bmp'];
const extensionGlob = `/*.{${imageExtensions.join(',')}}`;

fancyLog(`Preparing: ${gallerySource}`);

const largeWidth = 2400;
const mediumWidth = 800;
const thumbWidth = 200;

function writeCopyrightOnImage(pathToImageOrContents, imageFilePath, callback) {
  if (!process.env.COPYRIGHT_MESSAGE)
    return;

  const width = 300;
  const height = 50;
  const label = process.env.COPYRIGHT_MESSAGE;

  const svgForLabel = `
  <svg width="${width}" height="${height}" style="border: 1px dashed black;">
    <text font-size="20px" x="90%" y="50%" text-anchor="end" fill="#fff">${label}</text>
  </svg>
  `;

  const svgForLabelBuffer = Buffer.from(svgForLabel);
  sharp(pathToImageOrContents)
    .withMetadata()
    .rotate() // respect the EXIF orientation
    .composite([{
      input: svgForLabelBuffer,
      gravity: 'southeast'
  }])
    .png()
    .toBuffer()
    .then(buffer => callback(buffer),
      error => {
      handleError(error, `Error adding copyright to image: ${imageFilePath}`);
      return callback(); // continue anyway
    });
}

errors = []
function handleError(error, message) {
  console.error(message);
  console.error(error);
  errors.push({
    message,
    error
  });
}

function dumpErrors() {
  if (errors.length === 0) {
    fancyLog("NO errors occurred [ok]");
  } else {
    console.error(`${errors.length} errors occurred`);
    console.error(errors);
  }
}

function gulpWriteCopyrightOnImage() {
  return through.obj((file, _encoding, callback) => {
    if (file.isNull()) {
      this.push(file)
      return callback();
    }

    if (file.isStream()) {
      this.emit('error', new PluginError('gulpSharp', "Received a stream... Streams are not supported. Sorry."));
      return callback();
    }

    if (file.isBuffer()) {
      try {
        writeCopyrightOnImage(file.contents, file.path,
          buffer => {
            if (!buffer) {
              handleError('(no buffer)', `  copyright fail - no buffer for image: ${file.path}`);
              return callback(); // continue anyway
            }
            const newFile = new Vinyl({
              cwd: file.cwd,
              base: file.base,
              path: file.path,
              contents: buffer
            });

            callback(null, newFile);
          });
      } catch(error) {
        handleError(error, `Error adding copyright to image 2: ${file.path}`);
        return callback(); // continue anyway
      }
    }
  });
}

function gulpAddImageToDelete() {
  return through.obj((file, _encoding, callback) => {
    if (file.isNull()) {
      this.push(file)
      return callback();
    }

    if (file.isStream()) {
      this.emit('error', new PluginError('gulpAddImageToDelete', "Received a stream... Streams are not supported. Sorry."));
      return callback();
    }

    if (!fs.existsSync(file.path)) {
      handleError('(del)', `  gulpAddImageToDelete - file does not exist: ${file.path}`);
      return callback(); // continue anyway
    }

    imageCopiesToDelete.push(file.path);
    return callback(null, file); // continue
  });
}

function gulpDelFile() {
  return through.obj((file, _encoding, callback) => {
    if (file.isNull()) {
      this.push(file)
      return callback();
    }

    if (file.isStream()) {
      this.emit('error', new PluginError('del', "Received a stream... Streams are not supported. Sorry."));
      return callback();
    }

    if (!fs.existsSync(file.path)) {
      handleError('(del)', `  delete fail - file does not exist: ${file.path}`);
      return callback(); // continue anyway
    }

    try {
      del(file.path);
      return callback(); // continue
    } catch(error) {
      handleError(error, `Error deleting file 1: ${file.path}`);
      return callback(); // continue anyway
    }
  });
};

function gulpSharp(options){
  return through.obj((file, encoding, callback) => {
    if (file.isNull()) {
      this.push(file)
      return callback();
    }

    if (!options) {
      this.emit('error', new PluginError('gulpSharp', "You need to pass options to this plugin. See docs..."));
    }

    if (!options.resize) {
      this.emit('error', new PluginError('gulpSharp', "You must pass resize as an option and it must be an array with 2 values w,h."));
    }

    if (file.isStream()) {
      this.emit('error', new PluginError('gulpSharp', "Received a stream... Streams are not supported. Sorry."));
      return callback();
    }

    if (file.isBuffer()) {
      try {
        const image = sharp(file.contents);

        image
          .withMetadata()
          .rotate()
          .resize(options.resize)
          .jpeg({quality: options.quality || 80})
          .toBuffer()
          .then(data => {
            const newFile = new Vinyl({
              cwd: file.cwd,
              base: file.base,
              path: file.path,
              contents: data
            });

            callback(null, newFile);
        },
        error => {
          handleError(error, `Error resizing image: ${file.path}`);
          return callback(); // continue anyway
        });
      } catch(error) {
        handleError(error, `Error resizing image 2: ${file.path}`);
        return callback(); // continue anyway
      }
    }
  });
}

const summarizeImage = async (galleryPath, fileName) => {
  const buffer = readFileSync(path.join(galleryPath, 'large', fileName));
  const xmp = await xmpReader.fromBuffer(buffer)
  let subHtml = '';
  const galleryName = _getGalleryName(galleryPath);
  const photoTitle = path.basename(fileName, path.extname(fileName));
  let title = formatName(galleryName);

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
  fancyLog(` creating gallery JSON at ` + galleryPath + '...')
  const galleryName = _getGalleryName(galleryPath);
  const isTopLevel = galleryName === 'gallery';
  const galleryPathLarge = path.join(galleryPath, 'large');
  const files = await readFolder(galleryPathLarge)
    .catch(error => {
      // Hide errors, folder may not have any images
      return [];
    });

  const images = _.compact(await Promise.all(files.map(async fileName => {
    if (imageExtensions.includes(path.extname(fileName).toLowerCase().substring(1))) {
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
        title: formatName(fileName),
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

const formatName = name => {
  return name.replace(/\_/g, ' ').split(' ').map(word => _.capitalize(word)).join(' ');
}

const readGalleryJson = pathToExtraJson => {
  let extraJson = "{}";
  try {
    if (fs.existsSync(pathToExtraJson))
    {
      extraJson = readFileSync(pathToExtraJson, 'utf8');
    }
    parsed = JSON.parse(extraJson);
    if (parsed.tags) {
      // Change tags to lowercase to avoid duplicates across galleries.
      // Also handle if gallery.json incorrectly has its own duplicate tags.
      const newTags = [];
      parsed.tags.forEach(tag => {
        tag = tag.toLowerCase();
        if (!newTags.includes(tag)) {
          newTags.push(tag);
        }
      });
      parsed.tags = newTags;
    }

    return parsed;
  } catch(error) {
    handleError(error, `Error parsing JSON at ${pathToExtraJson}`);
    return {}; // continue anyway
  }
};

const readGalleryJsonForGallery = galleryPath => {
  const pathToExtraJson = path.join(galleryPath, 'gallery.json');
  return readGalleryJson(pathToExtraJson);
};

const _getGalleryName = (galleryPath) => galleryPath.split(path.sep).pop();

const createPugConfigForGallery = async (galleryPath, galleryDest, isBottomLevel) => {
  const items = JSON.parse(readFileSync(path.join(galleryPath, 'index.json'), 'utf8'));
  const isTopLevel = _getGalleryName(galleryPath) === 'gallery';
  return await _createPugConfig(galleryPath, galleryDest, isBottomLevel, items, isTopLevel);
};

const createPugConfigForOtherPage = async (pageDirPath, galleryDest) => {
  const isBottomLevel = false;
  const isTopLevel = true;
  return await _createPugConfig(pageDirPath, galleryDest, isBottomLevel, [], isTopLevel);
};

const _createPugConfig = async (galleryPath, galleryDest, isBottomLevel, items, isTopLevel) => {
  const galleryExtraJson = readGalleryJsonForGallery(galleryPath);
  if (!galleryExtraJson.tags && isTopLevel) {
    // add all available tags
    const tags = await collectTags(galleryPath);
    galleryExtraJson.tags = tags.tags;
  }
  
  const galleryName = _getGalleryName(galleryPath);
  const galleryTitle = isTopLevel ? process.env.GALLERY_TITLE : `${formatName(galleryName)} - ${process.env.GALLERY_TITLE}`;
  const breadcrumb = path.relative(galleryDest, galleryPath);

  isBottomLevel = isBottomLevel && !isTopLevel;
  const isForSale = !galleryExtraJson.tags || galleryExtraJson.tags.indexOf('not-for-sale') === -1;
  const showSaleLinks = isForSale && isBottomLevel;

  return {
    locals: {
      formatName,
      getTagHtmlFilename
    },
    data: {
      config: {
        assetPath: path.relative(galleryPath, path.join(galleryDest, 'static')),
        useIndexFile: process.env.USE_INDEX_FILE === 'true',
        forceHttps: process.env.FORCE_HTTPS === 'true',
        googleAnalytics: process.env.GOOGLE_ANALYTICS_ID,
        footerHtml: process.env.FOOTER_HTML,
        footerHtmlSuffix: process.env.FOOTER_HTML_SUFFIX,
        fotomotoStoreId: process.env.FOTOMOTO_STORE_ID
      },
      items,
      galleryName,
      galleryTitle,
      galleryDescription: process.env.GALLERY_DESCRIPTION,
      title: `${galleryTitle} : ${process.env.GALLERY_DESCRIPTION}`,
      breadcrumb,
      isTopLevel,
      showSaleLinks,
      galleryExtraJson,
      alwaysAddIndexHtml: process.env.ALWAYS_ADD_INDEX_HTML_FOR_CLOUD_FRONT === 'true'
    }
  };
};

const findGalleryJsonFiles = async dirPath => await glob.glob(`${dirPath}/**/gallery.json`);

// Collect tags from gallery.json input files
// TODO try to cache, as we call this repeatedly
const collectTags = async galleryPath => {
  const galleryJsonFiles = await findGalleryJsonFiles(galleryPath);
  
  const tags = [];
  const tagsToGalleries = {};

  for (const pathToGalleryJson of galleryJsonFiles) {
    const gallery = readGalleryJson(pathToGalleryJson);

    if (gallery.tags) {
      for (newTag of gallery.tags) {
        if (!tags.includes(newTag)) {
          tags.push(newTag);
          tagsToGalleries[newTag] = [];
        }
        const pathToGallery = path.dirname(pathToGalleryJson);
        tagsToGalleries[newTag].push(pathToGallery);
      }
    }
  }

  tags.sort();

  return {tags, tagsToGalleries};
};

const createGalleryHtml = async galleryPath => {
  fancyLog(` creating gallery HTML at ` + galleryPath + '...')

  const subfolders = await readFolder(galleryPath);

  let isBottomLevel = true;

  // Recursively create the Gallery HTML files
  await Promise.all(subfolders.map(async fileName => {
    const filePath = path.join(galleryPath, fileName);
    if (['large', 'medium', 'thumbs'].includes(fileName)) {
      return false;
    }

    if (statSync(filePath).isDirectory()) {
      isBottomLevel = false;
      await createGalleryHtml(filePath);
    }
  }));

  const pugConfig = await createPugConfigForGallery(galleryPath, galleryDest, isBottomLevel);

  const destination = pugConfig.data.isTopLevel ? galleryDest : galleryPath;

  return gulp.src('views/gallery.pug')
    .pipe(rename('index.html'))
    .pipe(pug(pugConfig))
    .pipe(gulp.dest(destination))
    .pipe(debug({title: 'Created gallery HTML'}));
};

const getTagHtmlFilename = tag => `tag_${tag}.html`;

const createGalleryTagsHtmlWithFilter = async (galleryPath, filterTags) => {
  fancyLog(` creating gallery tags HTML at ` + galleryPath + '...')

  const tags = await collectTags(galleryPath);
  fancyLog(`  tags found=${tags.tags}`);

  const isBottomLevel = false;

  const activeTags = tags.tags.filter(filterTags);

  let streams = await Promise.all(activeTags.map(async tag => {
    const pugConfig = await createPugConfigForGallery(galleryPath, galleryDest, isBottomLevel);
    pugConfig.data.breadcrumb = path.join(path.relative(galleryDest, galleryPath), tag);
    const tagGalleryTitle = '[' + tag + '] galleries';
    pugConfig.data.title = `${tagGalleryTitle} - ${process.env.GALLERY_TITLE} : ${process.env.GALLERY_DESCRIPTION}`,
    pugConfig.data.galleryTitle = `${tagGalleryTitle} - ${process.env.GALLERY_TITLE}`;
    // add all available tags, for clickable links:
    pugConfig.data.tags = tags.tags;

    pugConfig.data.tagThisPage = tag;
    pugConfig.data.tagGalleries = [];
    const tagGalleries = await Promise.all(tags.tagsToGalleries[tag].map(async function(galleryPath) { return { galleryPath, config: await createPugConfigForGallery(galleryPath, galleryDest, true)}}));
    for (const tagGallery of tagGalleries) {
      const images = tagGallery.config.data.items;
      const coverImages = images.filter(i => i.isCover);
      const coverImage = (coverImages.length === 0) ? images[0] : coverImages[0];
      const galleryUrl = path.relative(galleryPath, tagGallery.galleryPath);
      const adjustImageUrl = imageUrl => `${galleryUrl}/${imageUrl}`;
      coverImage.thumb = adjustImageUrl(coverImage.thumb);
      coverImage.medium = adjustImageUrl(coverImage.medium);
      coverImage.large = adjustImageUrl(coverImage.large);

      const galleryTitle = tagGallery.config.data.galleryTitle;
      pugConfig.data.tagGalleries.push({
          coverImage,
          type: 'gallery',
          filePath: tagGallery.galleryPath,
          galleryUrl,
          title: formatName(galleryTitle),
      });
    }

    fancyLog(`  creating tag page for ${tag}`)

    return gulp.src('views/gallery-tag.pug')
      .pipe(pug(pugConfig))
      .pipe(rename(getTagHtmlFilename(tag)));
  }));

  // Merge all streams and output to files
  es.merge(streams)
    .pipe(gulp.dest(path.join(galleryDest, 'gallery')))
    .pipe(debug({title: 'Created gallery tag HTML'}));
};

const createAboutHtml = async dirPath => {
  fancyLog(` creating about HTML at ` + dirPath + '...')

  const pugConfig = await createPugConfigForOtherPage(dirPath, galleryDest);

  return gulp.src('views/about.pug')
    .pipe(rename('about.html'))
    .pipe(pug(pugConfig))
    .pipe(gulp.dest(galleryDest))
    .pipe(debug({title: 'Created about HTML'}));
};

const createErrorHtml = async errorDirPath => {
  fancyLog(` creating error HTML at ` + errorDirPath + '...')

  const pugConfig = await createPugConfigForOtherPage(errorDirPath, galleryDest);

  return gulp.src('views/error.pug')
    .pipe(rename('error.html'))
    .pipe(pug(pugConfig))
    .pipe(gulp.dest(galleryDest))
    .pipe(debug({title: 'Created error HTML'}));
};

let imageCopiesToDelete = []
gulp.task('copyOriginals', () => {
  return gulp.src(path.join(gallerySource, '**', extensionGlob), {nocase: true})
    .pipe(gulp.dest(path.join(galleryDest, 'gallery')))
    .pipe(parallel(gulpAddImageToDelete()), CORES)
    .pipe(debugDetailed({title: 'Copied full versions of photos'}));
});

gulp.task('copyGalleryJson', () => {
  return gulp.src(path.join(gallerySource, '**', '/gallery.json'), {nocase: true})
    .pipe(gulp.dest(path.join(galleryDest, 'gallery')))
    .pipe(debugDetailed({title: 'Copied gallery.json extra JSON for gallery'}));
});

gulp.task('writeCopyright', () => {
  return gulp.src(path.join(galleryDest, '**', extensionGlob), {nocase: true})
  .pipe(plumber({ errorHandler: true }))
  .pipe(parallel(gulpWriteCopyrightOnImage()), CORES)
  .pipe(gulp.dest(file => file.base )) // write back to same location
  .pipe(debugDetailed({title: 'Write copyright on image'}));
});

// Delete the copies of originals, as not want them uploaded to S3 where they could be downloaded
gulp.task('deleteOriginalCopies', () => {
  return gulp.src(imageCopiesToDelete, {nocase: true})
  .pipe(plumber({ errorHandler: true }))
  .pipe(parallel(gulpDelFile()), CORES)
  .pipe(gulp.dest(file => file.base )) // write back to same location
  .pipe(debugDetailed({title: 'Delete copy of original image'}));
});

gulp.task('large', () => {
  return gulp.src(path.join(galleryDest, '**', extensionGlob), {nocase: true})
    .pipe(plumber({ errorHandler: true }))
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
    .pipe(gulp.dest(file => file.base )) // write back to same location
    .pipe(debugDetailed({title: 'Created large image'}));
});

gulp.task('medium', () => {
  return gulp.src(path.join(galleryDest, '**', extensionGlob), {nocase: true})
    .pipe(plumber({ errorHandler: true }))
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
    .pipe(gulp.dest(file => file.base )) // write back to same location
    .pipe(debugDetailed({title: 'Created medium image'}));
});

gulp.task('thumb', () => {
  return gulp.src(path.join(galleryDest, '**', extensionGlob), {nocase: true})
    .pipe(plumber({ errorHandler: true }))
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
    .pipe(gulp.dest(file => file.base )) // write back to same location
    .pipe(debugDetailed({title: 'Created thumbnail image'}));
});

gulp.task('aboutHtml', () => createAboutHtml(galleryDest));
gulp.task('errorHtml', () => createErrorHtml(galleryDest));
gulp.task('galleryJson', () => createGalleryJson(path.join(galleryDest, 'gallery')));
// Filter tags into groups - why: unfortunately the stream mechanism has an upper limit of about 36 items, beyond which it silently fails to output tag pages.
gulp.task('galleryTagsHtml_a_to_f', () => createGalleryTagsHtmlWithFilter(path.join(galleryDest, 'gallery'), tag => tag[0] <= 'f'));
gulp.task('galleryTagsHtml_g_to_l', () => createGalleryTagsHtmlWithFilter(path.join(galleryDest, 'gallery'), tag => tag[0] >= 'g' && tag[0] <= 'l'));
gulp.task('galleryTagsHtml_m_to_r', () => createGalleryTagsHtmlWithFilter(path.join(galleryDest, 'gallery'), tag => tag[0] >= 'm' && tag[0] <= 'r'));
gulp.task('galleryTagsHtml_s_to_z', () => createGalleryTagsHtmlWithFilter(path.join(galleryDest, 'gallery'), tag => tag[0] >= 's' && tag[0] <= 'z'));
gulp.task('galleryTagsHtml', gulp.series('galleryTagsHtml_a_to_f', 'galleryTagsHtml_g_to_l', 'galleryTagsHtml_m_to_r', 'galleryTagsHtml_s_to_z'));

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

  const concurrentUploads = 1000;

  // Set caching headers to 20 minutes for json and html files
  return mergeStream(
    gulp.src([path.join(galleryDest, '/**/*'), `!${path.join(galleryDest, '/**/*.{json,html}')}`])
      .pipe(parallel(awspublish.gzip(), concurrentUploads))
      .pipe(parallel(publisher.publish({
        'Cache-Control': 'max-age=315360000, no-transform, public'
      }), concurrentUploads))
      .pipe(publisher.sync(null, [/^.*\.(json|html)$/]))
      .pipe(publisher.cache())
      .pipe(awspublish.reporter()),
    gulp.src(path.join(galleryDest, '/**/*.{json,html}'))
      .pipe(parallel(awspublish.gzip(), concurrentUploads))
      .pipe(parallel(publisher.publish({
        'Cache-Control': 'max-age=1200, no-transform, public'
      }), concurrentUploads))
      .pipe(publisher.sync(null, [/^.*\.(png|PNG|gif|GIF|jpeg|JPEG|jpg|JPG|bmp|BMP)$/, /^static/, /^favicon.ico/]))
      .pipe(publisher.cache())
      .pipe(awspublish.reporter())
  );
});

gulp.task('clean', () => {
  return del(galleryDest);
});

gulp.task('dumpErrors', callback => {
  dumpErrors();
  callback();
});

gulp.task('resize', gulp.parallel('large', 'medium', 'thumb'));

gulp.task('html', gulp.series('galleryJson', gulp.parallel('aboutHtml', 'errorHtml', 'galleryTagsHtml', 'galleryHtml'), gulp.parallel('copyStatic', 'favicon')))

gulp.task('build', gulp.series('clean', gulp.parallel('copyOriginals', 'copyGalleryJson'), 'writeCopyright', 'resize', 'deleteOriginalCopies', 'html', 'dumpErrors'));

gulp.task('deploy', gulp.series('build', 'publishAWS', 'dumpErrors'));
