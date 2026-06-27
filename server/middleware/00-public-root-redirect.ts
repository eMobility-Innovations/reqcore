/**
 * Redirect the site root to /jobs on public job-board containers.
 *
 * Public containers (app-public, app-esc) have NUXT_PUBLIC_ORG_SLUG set to a
 * non-empty string.  The admin container (app / ats.fiszu.com) has an empty
 * orgSlug and must NOT be redirected.
 *
 * Runs first (00- prefix sorts before csp.ts) so the redirect is cheap --
 * no further middleware or rendering is triggered.
 */
export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname

  if (path !== '/') {
    return
  }

  const orgSlug = useRuntimeConfig(event).public.orgSlug

  if (orgSlug && orgSlug.trim() !== '') {
    return sendRedirect(event, '/jobs', 302)
  }
})
