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
      console.log(json)
      return {galleries: json}
    } catch(err) {
      console.error(err)
      return {}
    }
  }

  render() {
    return (
      <Layout>
        <h1 className="gallery-title">{process.env.GALLERY_TITLE}</h1>
        <div className="gallery">
          <ul id="lightgallery">
            {this.props.galleries.map((gallery, key) => {
              return (
                <li key={key}>
                  <Link href={`/gallery/${gallery.galleryId}/`} >
                    <a className="photo-link">
                      <img
                        src={`${process.env.GALLERY_URL}/${gallery.preview}`}
                        width="300"
                        height={Math.round(300 / gallery.imageSize.width * gallery.imageSize.height).toString()}
                      />
                    </a>
                  </Link>
                  <Link href={`/gallery/${gallery.galleryId}/`} >
                    <a className="photo-link-title">{_.startCase(gallery.galleryId)}</a>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </Layout>
    )
  }
}
