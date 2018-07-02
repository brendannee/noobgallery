# gallery


## Prepping Images

There is a gulp task included that takes a folder of folders that contain images and preps them and uploads them to Amazon S3 for use on a gallery website.

It creates resized versions of all photos that are 1500px wide in a subfolder called `previews` and versions that are 200px wide in a subfolder called `thumbs`. It also summarizes each folder as a JSON file called `index.json` with image metadata and paths to images.

All of this is then uploaded to an Amazon S3 bucket you specify.

### Installation

Install imagemagick and graphicsmagick

Mac OS X (using Homebrew):

    brew install imagemagick
    brew install graphicsmagick

### Configuration

Add a `.env` file with the following variables:

GALLERY_LOCAL_PATH=~/path/to/your/gallery/root
AWS_REGION=us-east-1
AWS_BUCKET=yourbucket
AWS_ACCESS_KEY=YOUR_AWS_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET KEY


### Running

    gulp

## Credits

Based on [egp-prep](https://github.com/timmydoza/epg-prep).
