<script setup lang="ts">
definePageMeta({
  layout: 'career-public',
})

const route = useRoute()
const { t, locale, defaultLocale } = useI18n()
const localePath = useLocalePath()
const requestURL = useRequestURL()

const slug = computed(() => route.params.slug as string)

/** Forward source-tracking query params (?ref=, utm_*) through to the job page. */
const sourceQuery = computed(() => {
  const q: Record<string, string> = {}
  if (route.query.ref) q.ref = route.query.ref as string
  if (route.query.utm_source) q.utm_source = route.query.utm_source as string
  if (route.query.utm_medium) q.utm_medium = route.query.utm_medium as string
  if (route.query.utm_campaign) q.utm_campaign = route.query.utm_campaign as string
  if (route.query.utm_term) q.utm_term = route.query.utm_term as string
  if (route.query.utm_content) q.utm_content = route.query.utm_content as string
  return q
})

const { data, status, error } = useFetch(() => `/api/public/career-page/${slug.value}`, {
  key: 'career-page-public',
})

const jobs = computed(() => data.value?.jobs ?? [])
const notFound = computed(() => !!error.value || (status.value !== 'pending' && !data.value))
const offline = computed(() => data.value?.offline === true)

const state = computed<'loading' | 'empty' | 'ready' | 'offline' | 'notfound'>(() => {
  if (notFound.value) return 'notfound'
  if (offline.value) return 'offline'
  if (status.value === 'pending' && !data.value) return 'loading'
  if (jobs.value.length === 0) return 'empty'
  return 'ready'
})

// ─────────────────────────────────────────────
// Absolute URLs — needed for canonical, og:image and JSON-LD.
// ─────────────────────────────────────────────
const origin = computed(() => requestURL.origin)
function absUrl(path?: string | null): string | null {
  if (!path) return null
  if (/^https?:\/\//.test(path)) return path
  return `${origin.value}${path.startsWith('/') ? '' : '/'}${path}`
}

/** Canonical URL uses the resolved (custom-or-org) slug so both URLs dedupe. */
const canonicalPath = computed(() =>
  localePath(`/career/${data.value?.canonicalSlug ?? slug.value}`))
const canonicalUrl = computed(() => absUrl(canonicalPath.value))

// Share image: hero banner first, then logo, then the Reqcore default.
const shareImage = computed(() =>
  absUrl(data.value?.banner) ?? absUrl(data.value?.logo) ?? absUrl('/reqcore-banner-github.jpeg'))

const pageTitle = computed(() =>
  (data.value?.name ? t('career.metaTitle', { name: data.value.name }) : t('career.eyebrow')))
const pageDescription = computed(() =>
  data.value?.description
  || (data.value?.name ? t('career.headlineWithName', { name: data.value.name }) : t('career.openRoles')))

// Opt out of indexing when the page is not a live, default-locale page:
//  - offline/notfound still return 200 (rendering an "unavailable"/"not found"
//    body), so exclude them to avoid a soft 404 — the /career/** route rule
//    otherwise marks the namespace indexable.
//  - localized variants (`/es/career/x`, …) serve the same single-language,
//    recruiter-authored content under a locale prefix; the nuxt.config
//    routeRules already send them `X-Robots-Tag: noindex`, so mirror that here
//    instead of letting the meta assert `index` against the header.
// Live default-locale pages (ready/empty) stay indexable.
const robots = computed(() =>
  (state.value === 'offline' || state.value === 'notfound' || locale.value !== defaultLocale)
    ? 'noindex, nofollow'
    : 'index, follow')

useSeoMeta({
  title: () => pageTitle.value,
  description: () => pageDescription.value,
  robots: () => robots.value,
  ogTitle: () => pageTitle.value,
  ogDescription: () => pageDescription.value,
  ogType: 'website',
  ogUrl: () => canonicalUrl.value,
  ogImage: () => shareImage.value,
  twitterCard: 'summary_large_image',
  twitterTitle: () => pageTitle.value,
  twitterDescription: () => pageDescription.value,
  twitterImage: () => shareImage.value,
})

// ─────────────────────────────────────────────
// SEO — JSON-LD structured data (server-rendered).
// Organization identity + an ItemList of the open roles. Each role links to its
// own /jobs/:slug page, which carries the full JobPosting markup Google indexes
// for Google for Jobs — so this page reinforces discovery without emitting
// incomplete JobPosting objects here.
// ─────────────────────────────────────────────
const jsonLd = computed(() => {
  if (!data.value?.name || (state.value !== 'ready' && state.value !== 'empty')) return null

  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Organization',
      'name': data.value.name,
      'url': canonicalUrl.value,
      ...(data.value.logo ? { logo: absUrl(data.value.logo) } : {}),
    },
  ]

  if (jobs.value.length) {
    graph.push({
      '@type': 'ItemList',
      'itemListElement': jobs.value.map((j, i) => ({
        '@type': 'ListItem',
        'position': i + 1,
        'name': j.title,
        'url': absUrl(localePath(`/jobs/${j.slug}`)),
      })),
    })
  }

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
})

useHead({
  link: () => (canonicalUrl.value ? [{ rel: 'canonical', href: canonicalUrl.value }] : []),
  script: () =>
    jsonLd.value ? [{ type: 'application/ld+json', innerHTML: jsonLd.value }] : [],
})
</script>

<template>
  <CareerPageView
    :name="data?.name"
    :logo="data?.logo"
    :banner="data?.banner"
    :banner-position="data?.bannerPosition"
    :accent-color="data?.accentColor"
    :headline="data?.headline"
    :description="data?.description"
    :jobs="jobs"
    :job-count="jobs.length"
    :state="state"
    :source-query="sourceQuery"
  />
</template>
