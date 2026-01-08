import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Nitro plugin to inject splash screen HTML into rendered pages.
 * This prevents FOUC (Flash of Unstyled Content) during hydration.
 */
export default defineNitroPlugin(nitroApp => {
  // Read the logo SVG file at build time
  const logoPath = resolve(process.cwd(), 'app/assets/logo.svg')
  const logoSvg = readFileSync(logoPath, 'utf-8')

  nitroApp.hooks.hook('render:html', html => {
    // Inject splash screen as first child of body
    html.bodyAppend.unshift(`
      <div id="app-splash">
        <div class="splash-content">
          <div class="splash-logo">
            ${logoSvg}
          </div>
        </div>
      </div>
    `)
  })
})
