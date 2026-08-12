/**
 * Require-org middleware — redirects users without an active organization
 * to the org creation page. Must be used after the `auth` middleware.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { data: session } = await authClient.useSession(useFetch)
  const localePath = useLocalePath()

  if (session.value && !session.value.session.activeOrganizationId) {
    const checkoutIntent = parseBillingCheckoutIntent(to.query)
    if (checkoutIntent) {
      return navigateTo(localePath({
        path: '/onboarding/create-org',
        query: buildBillingCheckoutQuery(checkoutIntent),
      }))
    }

    if (hasFreePlanIntent(to.query)) {
      return navigateTo(localePath({
        path: '/onboarding/create-org',
        query: { plan: 'free' },
      }))
    }

    return navigateTo(localePath('/onboarding/create-org'))
  }
})
