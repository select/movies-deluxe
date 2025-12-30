import puppeteer from 'puppeteer'
import { defineEventHandler, getQuery, createError } from 'h3'

export default defineEventHandler(async event => {
  const { q } = getQuery(event)

  if (!q || typeof q !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Query parameter "q" is required',
    })
  }

  let browser
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )

    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}`
    await page.goto(searchUrl, { waitUntil: 'networkidle2' })

    // Extract results
    const results = await page.evaluate(() => {
      const items: any[] = []
      const elements = document.querySelectorAll('div.g')

      elements.forEach(el => {
        const titleEl = el.querySelector('h3')
        const linkEl = el.querySelector('a')
        const snippetEl = el.querySelector('div.VwiC3b')

        if (titleEl && linkEl) {
          items.push({
            title: titleEl.innerText,
            link: linkEl.href,
            snippet: snippetEl ? (snippetEl as HTMLElement).innerText : '',
          })
        }
      })

      // Fallback: if div.g not found, try to find any IMDb links
      if (items.length === 0) {
        const links = document.querySelectorAll('a')
        links.forEach(link => {
          if (link.href.includes('imdb.com/title/tt')) {
            items.push({
              title: link.innerText || 'IMDb Result',
              link: link.href,
              snippet: '',
            })
          }
        })
      }

      return items
    })
    console.log('google q', q)
    console.log('google results', results)

    // Filter and format results to match OMDB search format
    const formattedResults = results
      .filter((r: any) => r.link && r.link.includes('imdb.com/title/tt'))
      .map((r: any) => {
        const imdbIdMatch = r.link.match(/tt\d+/)
        const imdbId = imdbIdMatch ? imdbIdMatch[0] : null

        // Try to extract year from title if available
        const yearMatch = r.title ? r.title.match(/\((\d{4})\)/) : null
        const year = yearMatch ? yearMatch[1] : 'N/A'

        // Clean title
        const cleanTitle =
          r.title && r.title !== 'IMDb Result'
            ? r.title
                .replace(/\s*\((\d{4})\)\s*-\s*IMDb/i, '')
                .replace(/\s*-\s*IMDb/i, '')
                .trim()
            : 'IMDb Result'

        return {
          Title: cleanTitle,
          Year: year,
          imdbID: imdbId,
          Type: 'movie',
          link: r.link,
          Snippet: r.snippet || '',
        }
      })
      .filter((r: any) => r.imdbID !== null)

    // Deduplicate by imdbID
    const uniqueResults = Array.from(
      new Map(formattedResults.map(item => [item.imdbID, item])).values()
    )

    return {
      Search: uniqueResults,
      totalResults: uniqueResults.length.toString(),
      Response: 'True',
    }
  } catch (error: any) {
    console.error('Google search error:', error)
    return {
      Search: [],
      totalResults: '0',
      Response: 'False',
      Error: error.message,
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})
