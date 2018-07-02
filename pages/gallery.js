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
      console.log(json)
      return {images: json, galleryId: id}
    } catch(err) {
      console.error(err)
      return {}
    }
  }

  componentDidMount() {
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
        <h1 className="gallery-title"><a href="/">Home</a> &raquo; {_.startCase(this.props.galleryId)}</h1>
        <div className="gallery">
          <ul id="lightgallery">
            {this.props.images.map((image, key) => {
              return (
                <li
                  key={key}
                  data-responsive={`${process.env.GALLERY_URL}/${image.thumb} 200, ${process.env.GALLERY_URL}/${image.preview} 1500, ${process.env.GALLERY_URL}/${image.large} 3000`}
                  data-src={`${process.env.GALLERY_URL}/${image.src}`}
                  data-sub-html={image.subHtml}
                >
                  <a href="" className="photo-link">
                    <img
                      src={`${process.env.GALLERY_URL}/${image.preview}`}
                      width="300"
                      height={Math.round(300 / image.imageSize.width * image.imageSize.height).toString()}
                    />
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      </Layout>
    )
  }
}
