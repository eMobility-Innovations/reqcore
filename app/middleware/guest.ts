/**
 * Guest middleware — redirects authenticated users away from auth pages.
 * Apply to sign-in, sign-up, etc. to prevent logged-in users from seeing them.
 *
 * If the user arrived with a pending invitation (via ?invitation=<id>),
 * redirect to the accept-invitation page so it auto-accepts.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { data: session } = await authClient.useSession(useFetch)
  const localePath = useLocalePath()

  if (session.value) {
    const pendingInvitation = to.query.invitation as string | undefined
    const checkoutIntent = parseBillingCheckoutIntent(to.query)

    // The shared demo account is a read-only showcase identity. A demo visitor
    // who arrives here from a pricing-plan click (or an invitation) wants to act
    // as *themselves*, not the demo — so don't silently funnel the demo session
    // into checkout/invite-accept. Hand off to the server-side demo sign-out
    // endpoint, which reliably clears the auth cookies and bounces back to
    // /auth/sign-up with the chosen plan preserved. (`external` forces a full
    // navigation so the Set-Cookie headers take effect.)
    const demoEmail = (useRuntimeConfig().public.liveDemoEmail as string) || 'demo@reqcore.com'
    const isDemoSession = session.value.user.email === demoEmail
    if (isDemoSession && (checkoutIntent || hasFreePlanIntent(to.query) || pendingInvitation)) {
      return navigateTo(
        { path: '/api/auth/demo-fresh-signup', query: to.query },
        { external: true },
      )
    }

    if (pendingInvitation) {
      return navigateTo(localePath(`/auth/accept-invitation/${pendingInvitation}`))
    }

    if (checkoutIntent) {
      const query = buildBillingCheckoutQuery(checkoutIntent)
      return navigateTo(localePath({
        path: session.value.session.activeOrganizationId
          ? '/dashboard/settings/billing'
          : '/onboarding/create-org',
        query,
      }))
    }

    if (hasFreePlanIntent(to.query) && !session.value.session.activeOrganizationId) {
      return navigateTo(localePath({
        path: '/onboarding/create-org',
        query: { plan: 'free' },
      }))
    }

    return navigateTo(localePath('/dashboard'))
  }
})
