const prod = process.env.NODE_ENV === 'production'

module.exports = {
  'process.env.GALLERY_URL': 'http://img.wanderingnoobs.com.s3-website-us-east-1.amazonaws.com',
  'process.env.GALLERY_TITLE': 'Wandering Noobs'
}
