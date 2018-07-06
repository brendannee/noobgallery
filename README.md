# noobgallery

noobgallery is a photo gallery powered by [lightgallery](https://sachinchoolur.github.io/lightGallery/). It uses [nextjs](https://nextjs.org/) to serve pages and Amazon S3 to store and serve images.

A helper gulp task is included to prep images and write summary JSON files to be uploaded to Amazon S3.

You can see noobgallery in action at https://wanderingnoobs.com.

## Configuration

noobgallery uses Amazon S3 to host images. You'll need to:

* Create an Amazon S3 bucket.
* Set the bucket to be publicly readable.
* Enable static website hosting on the bucket, use `index.json` as the index document. Note the bucket URL.
* Create an IAM user with AmazonS3FullAccess permission programatic access to the S3 bucket and get the Access key id and secret access key.

Add a `.env` file with the following variables:

    GALLERY_TITLE=Your Gallery Name
    GALLERY_DESCRIPTION=Photos by a noob
    GALLERY_LOCAL_PATH=~/path/to/your/gallery/root
    GALLERY_URL=http://url.to-your-s3-bucket.com
    AWS_REGION=us-east-1
    AWS_BUCKET=yourbucketname
    AWS_ACCESS_KEY=YOUR_AWS_ACCESS_KEY
    AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET KEY

Be sure the `GALLERY_URL` does not have a trailing slash.

## Setup

Install dependencies

    npm install

## Organizing images

Create a folder to contain all your galleries, and then a folder for each gallery. The name of the folder will be the name of the gallery, with underscores converted to spaces.

Galleries will be sorted by `createDate` from the image EXIF data.

If you want to specify which image should be the cover representing an entire gallery, name it `cover.jpg`. This is optional, if no file named `cover.jpg` is found it will use the first image chronologically.

Example directory structure:

    gallery_root_folder
    ├── new_york
    │   ├── cover.jpg
    │   ├── file2.jpg
    │   └── file3.jpg
    └── barcelona   
        ├── file1.jpg
        ├── file2.jpg
        └── file3.jpg

If an image has an IPTC `object_name` set, this will be used as the photo title and the IPTC `caption` will be used as the photo description. If this information isn't set, no title or description will be shown.

## Preprocessing and publishing images

A preprocessing and publishing task is included that takes a folder of folders that contain images and preps them and uploads them to Amazon S3 for use on a gallery website.

It creates resized versions of all photos that are 3000px wide in a subfolder called `large`, 800px wide in a subfolder called `medium` and 200px wide in a subfolder called `thumbs`. It also summarizes each folder as a JSON file called `index.json` with image metadata and paths to images.

All of this is then uploaded to an Amazon S3 bucket you specify.

To run the preprocessing and publishing task:

    npm run publish

If your `.env` file is has the correct variables, images will be processed locally and the results will be uploaded to Amazon S3.

## Running locally

    npm run dev

Open http://localhost:3000 in your browser.

## Deploying

You can deploy this app to [now](https://zeit.co/now) easily:

    now --dotenv

## Credits

Inspired by:
* [express-photo-gallery](https://github.com/timmydoza/express-photo-gallery)
* [egp-prep](https://github.com/timmydoza/epg-prep)
* [gulp-sharp-minimal](https://github.com/pupil-labs/gulp-sharp-minimal)
