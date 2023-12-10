# noobgallery

noobgallery is a static photo gallery powered by [lightgallery.js](https://sachinchoolur.github.io/lightgallery.js/). It can be deployed to Amazon S3, which allows a huge amount of storage. (around $0.02/GB per month).

<img width="800" src="https://user-images.githubusercontent.com/96217/99756404-ef6e0c00-2aa1-11eb-9369-dde7ecb308ce.png">

You can see noobgallery in action at https://picturethecity.com.

## Configuration

noobgallery uses Amazon S3 to host images. You'll need to:

* Create an Amazon S3 bucket.
* Set the bucket to be publicly readable.
* Enable static website hosting on the bucket, use `index.html` as the index document. Note the bucket URL.
* Create an IAM user with a new policy to have programatic access to upload the site to the bucket.
  * note: it is not recommended to use AmazonS3FullAccess, as that grants too much permission.

Example AWS Policy:

```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::BUCKETNAME"]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:PutObjectAcl",
        "s3:GetObject",
        "s3:GetObjectAcl",
        "s3:DeleteObject",
        "s3:ListMultipartUploadParts",
        "s3:AbortMultipartUpload"
      ],
      "Resource": ["arn:aws:s3:::BUCKETNAME/*"]
    }
  ]
}
```

* to read more about the AWS access, see [gulp-awspublish](https://github.com/pgherveou/gulp-awspublish).

* create a new Access key id and secret access key for that user.

Add a `.env` file with the following variables:

    GALLERY_TITLE=Your Gallery Name
    GALLERY_DESCRIPTION=Photos by a noob.
    GALLERY_LOCAL_PATH=~/path/to/your/gallery/root
    AWS_REGION=us-east-1
    AWS_BUCKET=yourbucketname
    AWS_ACCESS_KEY=YOUR_AWS_ACCESS_KEY
    AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET KEY
    USE_INDEX_FILE=true
    FORCE_HTTPS=false
    GOOGLE_ANALYTICS_ID=YOUR_GOOGLE_ANALYTICS_ID
    SHOW_CREATED_DATE=true
    FOOTER_HTML=&copy; 2019 <a href="https://yourwebsite.com">A great photographer</a>

## Setup

Install dependencies

    yarn

## Organizing images

Create a folder to contain all your galleries, and then a folder for each gallery. The name of the folder will be the name of the gallery, with underscores converted to spaces.

Galleries will be sorted by `createDate` from the image EXIF data.

If you want to specify which image should be the cover representing an entire gallery, name it `cover.jpg`. This is optional, if no file named `cover.jpg` is found it will use the first image chronologically.

Example directory structure:

    gallery_root_folder
    ├── favicon.ico
    ├── new_york
    │   ├── cover.jpg
    │   ├── file2.jpg
    │   └── file3.jpg
    └── barcelona   
        ├── file1.jpg
        ├── file2.jpg
        └── file3.jpg

Optionally, you can include a `favicon.ico` file in your gallery root folder.

## Image Metadata

If an image has an XMP `Title` set, this will be used as the photo title. The XMP `Description` will be used as the photo description. If this information isn't set, no title or description will be show.

Want to add metadata to a photo manually with the command line? Use [exiftool](https://www.sno.phy.queensu.ca/~phil/exiftool/) to do:

    exiftool -XMP:Title="The Eiffel Tower" -XMP:Description="A nice description of this" /path/to/your/image.jpg 

## Preprocessing and running locally

A preprocessing and publishing task is included that takes a folder of folders that contain images and preps them and uploads them to Amazon S3 for use on a gallery website.

It creates resized versions of all photos that are 3000px wide in a subfolder called `large`, 800px wide in a subfolder called `medium` and 200px wide in a subfolder called `thumbs`. It also summarizes each folder as a JSON file called `index.json` with image metadata and paths to images.

To run the preprocessing task:

    yarn build

If your `.env` file is has the correct variables, images will be processed locally and moved to the `./build` folder inside of this project.

To run locally

    yarn start

Open http://localhost:5000 in your browser.

## Deploying

You can deploy the site to Amazon S3 with:

    yarn deploy

This will work as long as you specify your AWS S3 credentials in a `.env` file.

After publishing, you can view your gallery using the AWS S3 URL you set up, which can be a custom domain name that you own. See more about [static hosting with Amazon S3](https://docs.aws.amazon.com/AmazonS3/latest/dev/website-hosting-custom-domain-walkthrough.html).

If you want cleaner URLs, you can set up [Amazon CloudFront CDN and setup a Lambda@Edge function to set subdirectory indexes](https://aws.amazon.com/blogs/compute/implementing-default-directory-indexes-in-amazon-s3-backed-amazon-cloudfront-origins-using-lambdaedge/). If you do this, you can set `USE_INDEX_FILE` to false in the `.env` file and `index.html` will be removed from all links.

## Credits

Inspired by:
* [lightgallery.js](https://sachinchoolur.github.io/lightgallery.js/)
* [express-photo-gallery](https://github.com/timmydoza/express-photo-gallery)
* [egp-prep](https://github.com/timmydoza/epg-prep)
* [gulp-sharp-minimal](https://github.com/pupil-labs/gulp-sharp-minimal)
