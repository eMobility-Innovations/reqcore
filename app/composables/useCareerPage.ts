/**
 * Composable for the active org's career-page configuration.
 * Wraps GET/PUT /api/career-page and derives the public career-page URL from
 * the active org's slug.
 */
export function useCareerPage() {
  const localePath = useLocalePath()
  const { activeOrg } = useCurrentOrg()

  const { data, status, refresh } = useFetch('/api/career-page', {
    key: 'career-page',
    headers: useRequestHeaders(['cookie']),
  })

  const canUse = computed(() => data.value?.canUse ?? false)
  const enabled = computed(() => data.value?.enabled ?? true)
  const slug = computed(() => data.value?.slug ?? null)
  const accentColor = computed(() => data.value?.accentColor ?? null)
  const headline = computed(() => data.value?.headline ?? null)
  const description = computed(() => data.value?.description ?? null)
  const bannerPosition = computed(() => data.value?.bannerPosition ?? 50)

  /**
   * The slug that resolves the public page: the custom slug if set, otherwise
   * the org slug.
   */
  const publicSlug = computed(() => slug.value || activeOrg.value?.slug || null)

  /** Public career-page path for the active org (locale-prefixed). */
  const careerPagePath = computed(() => {
    if (!publicSlug.value) return null
    return localePath(`/career/${publicSlug.value}`)
  })

  // ─────────────────────────────────────────────
  // Image assets (logo + hero banner)
  // ─────────────────────────────────────────────
  // Cache-busting version so a fresh upload replaces the shown image.
  const assetVersion = computed(() =>
    data.value?.updatedAt ? new Date(data.value.updatedAt).getTime() : 0)

  function assetUrl(kind: 'logo' | 'banner') {
    const slug = activeOrg.value?.slug
    if (!slug) return null
    return `/api/public/career-page/${slug}/asset?kind=${kind}&v=${assetVersion.value}`
  }

  /** Serve URL for the uploaded career-page logo, or null if none is set. */
  const logoUrl = computed(() => (data.value?.hasLogo ? assetUrl('logo') : null))
  /** Serve URL for the uploaded hero banner, or null if none is set. */
  const bannerUrl = computed(() => (data.value?.hasBanner ? assetUrl('banner') : null))

  /** Upload a logo or banner image. Persists immediately, then refreshes. */
  async function uploadAsset(kind: 'logo' | 'banner', file: File) {
    const body = new FormData()
    body.append('kind', kind)
    body.append('file', file)
    await $fetch('/api/career-page/asset', { method: 'POST', body })
    await refresh()
  }

  /** Remove a previously uploaded logo or banner. */
  async function removeAsset(kind: 'logo' | 'banner') {
    await $fetch('/api/career-page/asset', { method: 'DELETE', query: { kind } })
    await refresh()
  }

  async function updateCareerPage(payload: {
    enabled?: boolean
    slug?: string | null
    accentColor?: string | null
    headline?: string | null
    description?: string | null
    bannerPosition?: number
  }) {
    await $fetch('/api/career-page', { method: 'PUT', body: payload })
    await refresh()
  }

  return {
    config: data,
    canUse,
    enabled,
    slug,
    publicSlug,
    accentColor,
    headline,
    description,
    bannerPosition,
    status,
    careerPagePath,
    logoUrl,
    bannerUrl,
    updateCareerPage,
    uploadAsset,
    removeAsset,
    refresh,
  }
}
