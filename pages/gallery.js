import React from 'react'
import Layout from '../components/layout'
import Error from 'next/error'
import $ from 'jquery'
import fetch from 'node-fetch'
import _ from 'lodash'

export default class Index extends React.Component {
  static async getInitialProps({ query: { id } }) {
    try {
      const res = await fetch(`${process.env.GALLERY_URL}/${id}/index.json`)
      const json = await res.json()
      return {images: json, galleryId: id}
    } catch(err) {
      console.error(err)
      return {}
    }
  }

  componentDidMount() {
    const masonry = require('masonry-layout')
    const lightgallery = require('lightgallery')
    const lgThumbanil = require('lg-thumbnail')
    const lgAutoplay = require('lg-autoplay')
    const lgFullscreen = require('lg-fullscreen')
    const lgPager = require('lg-pager')
    const lgZoom = require('lg-zoom')
    const lgHash = require('lg-hash')
    const lgShare = require('lg-share')

    $('#lightgallery').lightGallery({thumbnail: true})
  }

  render() {
    if (!this.props.images || !this.props.images.length) {
      return <Error statusCode={404} />
    }

    return (
      <Layout>
        <div class="gallery-wrapper">
          <h1 className="gallery-title">{_.startCase(this.props.galleryId)}</h1>
          <div className="breadcrumbs">
            <a className="breadcrumb" href="/">Home</a>
            <span className="breadcrumb">&raquo;</span>
            <a
              className="breadcrumb"
              href={`/gallery/${this.props.galleryId}/`}
            >{_.startCase(this.props.galleryId)}</a>
          </div>
          <div id="lightgallery" className="grid gallery" data-masonry='{ "itemSelector": ".grid-item", "columnWidth": 300, "gutter": 10 }'>
            {this.props.images.map((image, key) => {
              const width = 300;
              const height = Math.round(width / image.imageSize.width * image.imageSize.height);
              return (
                <div
                  className="grid-item"
                  key={key}
                  data-responsive={`${process.env.GALLERY_URL}/${image.thumb} 200, ${process.env.GALLERY_URL}/${image.medium} 600, ${process.env.GALLERY_URL}/${image.large} 3000`}
                  data-src={`${process.env.GALLERY_URL}/${image.src}`}
                  data-sub-html={image.subHtml}
                >
                  <a
                    href=""
                    className="photo-link"
                    style={{width: `${width}px`, height: `${height}px`}}
                  >
                    <img
                      src={`${process.env.GALLERY_URL}/${image.medium}`}
                      width={width}
                      height={height}
                    />
                  </a>
                </div>
              )
            })}
          </div>
        </div>
      </Layout>
    )
  }
}
