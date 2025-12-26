/**
 * Nitro plugin to inject splash screen HTML into rendered pages.
 * This prevents FOUC (Flash of Unstyled Content) during hydration.
 */
export default defineNitroPlugin(nitroApp => {
  nitroApp.hooks.hook('render:html', html => {
    // Inject splash screen as first child of body
    html.bodyAppend.unshift(`
      <div id="app-splash">
        <div class="splash-spinner"></div>
      </div>
    `)
  })
})
