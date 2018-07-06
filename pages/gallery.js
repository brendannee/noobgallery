import React from 'react'
import Layout from '../components/layout'
import Error from 'next/error'
import fetch from 'node-fetch'
import _ from 'lodash'

export default class Index extends React.Component {
  static async getInitialProps({ query: { id } }) {
    try {
      // Force new json every 5 minutes
      const ts = Math.floor(Date.now() / (5 * 60 * 1000))
      const res = await fetch(`${process.env.GALLERY_URL}/${id}/index.json?ts=${ts}`)
      const json = await res.json()
      return {images: json, galleryId: id}
    } catch(err) {
      console.error(err)
      return {}
    }
  }

  componentDidMount() {
    const Masonry = require('masonry-layout')
    const imagesLoaded = require('imagesloaded')

    require('lightgallery.js')
    require('lg-thumbnail.js')
    require('lg-autoplay.js')
    require('lg-fullscreen.js')
    require('lg-pager.js')
    require('lg-zoom.js')
    require('lg-hash.js')
    require('lg-share.js')

    const masonryLayout = new Masonry(document.querySelector('.gallery'), {
      itemSelector: '.grid-item',
      columnWidth: '.grid-sizer',
      gutter: '.gutter-sizer',
      percentPosition: true
    })

    imagesLoaded(document.querySelector('.gallery'), () => {
      masonryLayout.layout()
    })

    masonryLayout.on('layoutComplete', () => {
      document.querySelector('.gallery').classList.add('masonry')
    });

    lightGallery(document.getElementById('lightgallery'), {
      selector: '.grid-item'
    })
  }

  render() {
    if (!this.props.images || !this.props.images.length) {
      return <Error statusCode={404} />
    }

    const galleryTitle = _.startCase(this.props.galleryId)

    return (
      <Layout title={`${galleryTitle} - ${process.env.GALLERY_TITLE}`}>
        <div className="gallery-wrapper">
          <h1 className="gallery-title">{galleryTitle}</h1>
          <div className="breadcrumbs">
            <a className="breadcrumb" href="/">Home</a>
            <span className="breadcrumb">&raquo;</span>
            <a
              className="breadcrumb"
              href={`/gallery/${this.props.galleryId}/`}
            >{_.startCase(this.props.galleryId)}</a>
          </div>
          <div id="lightgallery" className="gallery">
            <div className="grid-sizer"></div>
            <div className="gutter-sizer"></div>
            {this.props.images.map((image, key) => {
              return (
                <div
                  className={`grid-item ${image.imageSize.width > image.imageSize.height * 2 ? 'grid-item--width2' : ''}`}
                  key={key}
                  data-responsive={`${process.env.GALLERY_URL}/${image.thumb} 200, ${process.env.GALLERY_URL}/${image.medium} 600, ${process.env.GALLERY_URL}/${image.large} 3000`}
                  data-src={`${process.env.GALLERY_URL}/${image.src}`}
                  data-sub-html={image.subHtml}
                >
                  <a href="" className="photo-link">
                    <img src={`${process.env.GALLERY_URL}/${image.medium}`} />
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
