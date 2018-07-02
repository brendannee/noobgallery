import React from 'react'
import Layout from '../components/layout'
import Link from 'next/link'
import fetch from 'node-fetch'
import _ from 'lodash'

export default class Index extends React.Component {
  static async getInitialProps() {

    try {
      const res = await fetch(`${process.env.GALLERY_URL}/index.json`)
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

  render() {
    return (
      <Layout>
        <div class="gallery-wrapper">
          <h1 className="gallery-title">{process.env.GALLERY_TITLE}</h1>
          <div id="lightgallery" className="grid gallery gallery-index" data-masonry='{ "itemSelector": ".grid-item", "columnWidth": 300, "gutter": 10 }'>
            {this.props.galleries.map((gallery, key) => {
              const width = 300;
              const height = Math.round(width / gallery.imageSize.width * gallery.imageSize.height).toString();
              return (
                <div
                  className="grid-item"
                  key={key}
                  style={{width: `${width}px`, height: `${height + 40}px`}}
                >
                  <Link href={`/gallery/${gallery.galleryId}/`} >
                    <a className="photo-link">
                      <img
                        src={`${process.env.GALLERY_URL}/${gallery.medium}`}
                        width={width}
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
        </div>
      </Layout>
    )
  }
}
