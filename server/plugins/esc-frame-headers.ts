// ── ESC overlay: allow the Escooter Clinic public job board to be framed ──────
// The ESC board (jobs.escooterclinic.co.uk) is embedded as an <iframe> inside
// the idoSell storefront (escooterclinic.co.uk — the "CURRENT OPPORTUNITIES"
// section). By default the app blocks ALL framing for clickjacking protection:
//   - X-Frame-Options: DENY        (static nitro routeRule in nuxt.config.ts)
//   - CSP frame-ancestors 'none'   (server/middleware/csp.ts)
// Both of those base files stay byte-for-byte upstream. This plugin runs in the
// `beforeResponse` hook (AFTER both the routeRule headers and the csp middleware)
// so it deterministically wins, and ONLY for the escooter-clinic brand container.
// It is a no-op for the Remote Crew board and the admin app, which keep strict
// no-framing.
//
// Security: framing is permitted ONLY from the trusted idoSell parent origins
// (apex + www). X-Frame-Options is removed because it cannot express a
// cross-origin allow-list and DENY would override CSP frame-ancestors.

const ESC_FRAME_ANCESTORS =
  "frame-ancestors 'self' https://escooterclinic.co.uk https://www.escooterclinic.co.uk"

export default defineNitroPlugin((nitroApp) => {
  const brand = process.env.NUXT_PUBLIC_BRAND || 'remote-crew'
  if (brand !== 'escooter-clinic') return // RC / admin: keep strict no-framing

  nitroApp.hooks.hook('beforeResponse', (event) => {
    const path = event.path || ''
    // Only HTML board responses need framing; skip APIs, bundles, ingest proxy
    // and static assets (mirrors the skip list in server/middleware/csp.ts).
    if (
      path.startsWith('/api/') ||
      path.startsWith('/_nuxt/') ||
      path.startsWith('/ingest/') ||
      /\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf|eot|webp|avif|gif|json|xml|txt|map)(\?|$)/i.test(
        path,
      )
    ) {
      return
    }

    // X-Frame-Options can't allow a cross-origin parent; DENY would block the
    // iframe even though CSP frame-ancestors permits it → drop it.
    removeResponseHeader(event, 'X-Frame-Options')

    // Rewrite CSP frame-ancestors (emitted with a per-request nonce by
    // server/middleware/csp.ts) to permit the idoSell storefront origins.
    // All other CSP directives are left intact.
    const csp = getResponseHeader(event, 'Content-Security-Policy')
    if (typeof csp === 'string' && /frame-ancestors[^;]*/i.test(csp)) {
      setResponseHeader(
        event,
        'Content-Security-Policy',
        csp.replace(/frame-ancestors[^;]*/i, ESC_FRAME_ANCESTORS),
      )
    }
  })
})
