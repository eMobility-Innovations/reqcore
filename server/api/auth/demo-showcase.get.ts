/**
 * Public live-demo entry point.
 *
 * Older marketing links pointed directly at this API route. The demo now opens
 * through the regular sign-in page so visitors can see the prefilled demo
 * credentials before signing in.
 */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')

  return sendRedirect(event, '/auth/sign-in?live=1')
})
