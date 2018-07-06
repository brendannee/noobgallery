import React from 'react'
import Layout from '../components/layout'
import Link from 'next/link'
import fetch from 'node-fetch'
import _ from 'lodash'

export default class Index extends React.Component {
  static async getInitialProps() {

    try {
      // Force new json every 5 minutes
      const ts = Math.floor(Date.now() / (5 * 60 * 1000))
      const res = await fetch(`${process.env.GALLERY_URL}/index.json?ts=${ts}`)
      const json = await res.json()
      return {galleries: json}
    } catch(err) {
      console.error(err)
      return {}
    }
  }

  componentDidMount() {
    const Masonry = require('masonry-layout')
    const imagesLoaded = require('imagesloaded')

    const elem = document.querySelector('.grid');
    const masonryLayout = new Masonry(elem, {
      itemSelector: '.grid-item',
      columnWidth: '.grid-sizer',
      gutter: '.gutter-sizer',
      percentPosition: true
    })

    imagesLoaded(document.querySelector('.grid'), () => {
      masonryLayout.layout()
    })

    masonryLayout.on('layoutComplete', () => {
      document.querySelector('.grid').classList.add('masonry')
    });
  }

  renderGallery() {
    if (!this.props.galleries || !this.props.galleries.length) {
      return (
        <div className="warning">
          <h3>No Galleries Found</h3>
        </div>
      )
    }

    return (
      <div
        id="lightgallery"
        className="grid gallery gallery-index"
      >
        <div className="grid-sizer"></div>
        <div className="gutter-sizer"></div>
        {this.props.galleries.map((gallery, key) => {
          return (
            <div
              className={`grid-item ${gallery.imageSize.width > gallery.imageSize.height * 2 ? 'grid-item--width2' : ''}`}
              key={key}
            >
              <Link href={`/gallery/${gallery.galleryId}/`}>
                <a className="photo-link">
                  <img src={`${process.env.GALLERY_URL}/${gallery.medium}`} />
                </a>
              </Link>
              <Link href={`/gallery/${gallery.galleryId}/`} >
                <a className="photo-link-title">{_.startCase(gallery.galleryId)}</a>
              </Link>
            </div>
          )
        })}
      </div>
    )
  }

  render() {
    return (
      <Layout>
        <div className="gallery-wrapper">
          <h1 className="gallery-title">{process.env.GALLERY_TITLE}</h1>
          <div className="gallery-description">{process.env.GALLERY_DESCRIPTION}</div>
          {this.renderGallery()}
        </div>
      </Layout>
    )
  }
}
