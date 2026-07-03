/**
 * Composable for privacy-respecting PostHog event tracking.
 *
 * Wraps posthog.capture() with auto-enrichment (route path, viewport width).
 *
 * Events are ALWAYS captured — even before the consent banner is answered —
 * because PostHog runs in `persistence: 'memory'` mode by default, so the
 * anonymous distinct id never reaches the visitor's storage (no cookies, no
 * localStorage).  When the user later accepts cookies, persistence is
 * upgraded and `identify(userId, …)` automatically aliases the in-memory
 * anonymous id to the user id, so the in-session funnel is preserved.
 */
import type { PostHog } from 'posthog-js'

function getPostHog(): PostHog | undefined {
  const $ph = (useNuxtApp() as Record<string, unknown>).$posthog as (() => PostHog) | undefined
  return $ph?.()
}

export function useTrack() {
  const route = useRoute()

  function track(eventName: string, properties?: Record<string, unknown>) {
    if (!import.meta.client) return
    const ph = getPostHog()
    if (!ph) return

    ph.capture(eventName, {
      path: route.path,
      viewport_width: window.innerWidth,
      ...properties,
    })
  }

  function captureError(error: unknown, properties?: Record<string, unknown>) {
    if (!import.meta.client) return
    const ph = getPostHog()
    if (!ph) return

    ph.captureException(error instanceof Error ? error : new Error(String(error)), {
      path: route.path,
      viewport_width: window.innerWidth,
      ...properties,
    })
  }

  /**
   * Attach properties to the current PostHog *person* profile.
   *
   * Logged-in users are always identified by their opaque `user.id`
   * (see usePostHogIdentity), so these properties persist on the user's
   * account profile in PostHog even for visitors who never accepted
   * cookies. Use this for durable, account-level segmentation data
   * (e.g. onboarding survey answers) rather than per-event context.
   */
  function setPersonProperties(properties: Record<string, unknown>) {
    if (!import.meta.client) return
    const ph = getPostHog()
    if (!ph) return

    ph.setPersonProperties(properties)
  }

  return { track, captureError, setPersonProperties }
}
