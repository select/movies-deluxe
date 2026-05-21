import { readFileSync } from 'fs'
import { resolve } from 'path'
import Database from 'better-sqlite3'

/**
 * Dynamic sitemap.xml generation for Google Search Console.
 * Lists all movie pages, collection pages, and static pages.
 */
export default defineEventHandler(event => {
  const siteUrl = 'https://mdlx.org'

  // Static pages
  const staticPages = ['/', '/search', '/liked', '/collections']

  // Movie pages from DB
  let movieIds: string[] = []
  try {
    const dbPath = resolve('public/data/movies.db')
    const db = new Database(dbPath, { readonly: true })
    const rows = db.prepare('SELECT movieId FROM movies').all() as { movieId: string }[]
    db.close()
    movieIds = rows.map(r => r.movieId)
  } catch {
    // DB might not be available in all environments
  }

  // Collection pages
  let collectionIds: string[] = []
  try {
    const collectionsPath = resolve('public/data/collections.json')
    const collections = JSON.parse(readFileSync(collectionsPath, 'utf-8'))
    collectionIds = Object.keys(collections).filter(k => k !== '_schema')
  } catch {
    // Collections file might not exist
  }

  const today = new Date().toISOString().split('T')[0]

  const urls = [
    ...staticPages.map(
      path =>
        `  <url><loc>${siteUrl}${path === '/' ? '' : path}</loc><changefreq>weekly</changefreq><priority>${path === '/' ? '1.0' : '0.5'}</priority><lastmod>${today}</lastmod></url>`
    ),
    ...collectionIds.map(
      id =>
        `  <url><loc>${siteUrl}/collections/${id}</loc><changefreq>weekly</changefreq><priority>0.7</priority><lastmod>${today}</lastmod></url>`
    ),
    ...movieIds.map(
      id =>
        `  <url><loc>${siteUrl}/movie/${id}</loc><changefreq>monthly</changefreq><priority>0.6</priority><lastmod>${today}</lastmod></url>`
    ),
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`

  setResponseHeader(event, 'content-type', 'application/xml')
  setResponseHeader(event, 'cache-control', 'public, max-age=3600')
  return xml
})
