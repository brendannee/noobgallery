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
    const masonry = require('masonry-layout')
  }

  renderGallery() {
    if (!this.props.galleries || !this.props.galleries.length) {
      return (
        <div className="warning">
          <h3>No Galleries Found</h3>
        </div>
      )
    }

    const thumbnailWidth = 400

    return (
      <div
        id="lightgallery"
        className="grid gallery gallery-index"
        data-masonry={`{ "itemSelector": ".grid-item", "columnWidth": ${thumbnailWidth}, "gutter": 10 }`}
      >
        {this.props.galleries.map((gallery, key) => {
          const height = Math.round(thumbnailWidth / gallery.imageSize.width * gallery.imageSize.height);
          return (
            <div
              className="grid-item"
              key={key}
              style={{width: `${thumbnailWidth}px`, height: `${height + 40}px`}}
            >
              <Link href={`/gallery/${gallery.galleryId}/`} >
                <a className="photo-link">
                  <img
                    src={`${process.env.GALLERY_URL}/${gallery.medium}`}
                    width={thumbnailWidth}
                    height={height}
                  />
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
