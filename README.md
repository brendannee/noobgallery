# noobgallery

noobgallery is a photo gallery powered by [lightgallery](https://sachinchoolur.github.io/lightGallery/). It uses [nextjs](https://nextjs.org/) to serve pages and Amazon S3 to store and serve images.

A helper gulp task is included to prep images and write summary JSON files to be uploaded to Amazon S3.

## Configuration

Add a `.env` file with the following variables:

    GALLERY_LOCAL_PATH=~/path/to/your/gallery/root
    GALLERY_URL=http://url.to-your-s3-bucket.com
    GALLERY_TITLE=Your Gallery Name
    GALLERY_DESCRIPTION=Photos by a noob
    AWS_REGION=us-east-1
    AWS_BUCKET=yourbucket
    AWS_ACCESS_KEY=YOUR_AWS_ACCESS_KEY
    AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET KEY

## Preprocessing and publishing images

A preprocessing and publishing task is included that takes a folder of folders that contain images and preps them and uploads them to Amazon S3 for use on a gallery website.

It creates resized versions of all photos that are 3000px wide in a subfolder called `large`, 1500px wide in a subfolder called `previews` and 200px wide in a subfolder called `thumbs`. It also summarizes each folder as a JSON file called `index.json` with image metadata and paths to images.

All of this is then uploaded to an Amazon S3 bucket you specify.

To install the dependencies necessary for the preprocessing and publishing task, install `libvips` for image resizing.

Mac OS X (using Homebrew):

    brew install vips --with-webp --with-graphicsmagick

To run the preprocessing and publishing task:

    npm run publish

If your `.env` file is has the correct variables, images will be processed locally and the results will be uploaded to Amazon S3.

## Credits

Inspired by:
* [express-photo-gallery](https://github.com/timmydoza/express-photo-gallery)
* [egp-prep](https://github.com/timmydoza/epg-prep)
* [gulp-sharp-minimal](https://github.com/pupil-labs/gulp-sharp-minimal)
