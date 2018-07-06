import Link from 'next/link'
import Head from 'next/head'

export default ({ children, title = 'Wandering Noobs' }) => (
  <div>
    <Head>
      <title>{ title }</title>
      <meta charSet='utf-8' />
      <meta name='viewport' content='initial-scale=1.0, width=device-width' />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/lightgallery.js@1.0.3/dist/css/lightgallery.min.css" />
      <link rel="stylesheet" href="/static/css/style.css" />
    </Head>
    <header>
      <nav>
      </nav>
    </header>

    { children }

    <footer>
      Powered by <a href="https://github.com/brendannee/noobgallery">noobgallery</a>
    </footer>
  </div>
)
