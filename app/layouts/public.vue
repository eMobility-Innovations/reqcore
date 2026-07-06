<script setup lang="ts">
// ── ESC overlay: brand-aware public job board layout ───────────────────────
// Supports 'remote-crew' (current RC branding) and 'escooter-clinic' (ESC brand).
// Brand is selected via NUXT_PUBLIC_BRAND runtime env (per-container).
// All brand-specific styles are scoped to this layout + public/brand/ assets
// so base files stay byte-for-byte upstream.
//
// Iframe embed mode: ?embed=1 hides header/footer and posts height via postMessage.

const config = useRuntimeConfig()
const route = useRoute()

const brand = (config.public.brand as string) || 'remote-crew'
// Embed detection must survive in-app navigation. The board first loads with
// ?embed=1 (SSR-safe), but base job-card and 'All positions' links do not carry
// the query forward — so once we know we are embedded (query OR actually inside
// an iframe) we latch it for the whole session. Fixes the header/footer chrome
// re-appearing when opening a job or going back. Applies to every embedded brand.
const embedLatch = useState('rc-embed-latch', () => false)
const isEmbed = computed(() => !!route.query.embed || embedLatch.value)

// Brand configuration map
const brandConfig = {
  'remote-crew': {
    logoSrc: '/brand/remote-crew-logo-footer.svg',
    logoAlt: 'Remote Crew',
    siteUrl: 'https://remotecrew.co.uk',
    siteName: 'remotecrew.co.uk',
    footerText: '© Remote Crew',
    footerLink: 'Hire smarter →',
    cssClass: 'rc-brand-remote-crew',
  },
  'escooter-clinic': {
    logoSrc: '/brand/escooter-clinic-logo.png',
    logoAlt: 'Escooter Clinic',
    siteUrl: 'https://escooterclinic.co.uk',
    siteName: 'escooterclinic.co.uk',
    footerText: '© Escooter Clinic',
    footerLink: 'Visit our store →',
    cssClass: 'rc-brand-escooter-clinic',
  },
} as const

const bc = computed(
  () =>
    brandConfig[brand as keyof typeof brandConfig] ?? brandConfig['remote-crew'],
)

// ── Brand-aware favicon ────────────────────────────────────────────────────
// Overrides the global nuxt.config default when running as escooter-clinic.
// Browsers use the last matching <link rel="icon"> so layout-level wins.
useHead({
  link: brand === 'escooter-clinic'
    ? [
        { rel: 'icon', type: 'image/png', href: '/brand/escooter-clinic-favicon.png' },
        { rel: 'shortcut icon', type: 'image/x-icon', href: '/brand/escooter-clinic-favicon.ico' },
      ]
    : [],
})

// ── Force light mode before first paint ───────────────────────────────────
// Mirrors the nonce-based inline-script pattern in app.vue.
// Both RC and ESC brands are light-themed — always force light on public pages.
const _nonce = import.meta.server
  ? (useRequestEvent()?.context?.nonce ?? '')
  : ''
useHead({
  script: [
    {
      key: 'rc-force-light',
      innerHTML:
        // Persist light to localStorage so app.vue's pre-paint dark-mode-init
        // (which reads this key FIRST) never adds .dark on any subsequent load
        // or client navigation — kills the dark flash when opening a job. Then
        // remove any .dark already applied this paint.
        'try{localStorage.setItem("reqcore-color-mode","light");document.documentElement.classList.remove("dark");document.documentElement.style.colorScheme="light"}catch(e){}',
      tagPosition: 'head',
      ...(_nonce ? { nonce: _nonce } : {}),
    },
  ],
})

// ── Keep light pinned after hydration ────────────────────────────────────
// The color-mode plugin re-applies .dark on hydration based on OS preference.
// Use a MutationObserver to keep light always winning on public pages.
if (import.meta.client) {
  let _rcLightObserver: MutationObserver | null = null

  const _forceLight = () => {
    const html = document.documentElement
    if (html.classList.contains('dark')) html.classList.remove('dark')
    if (html.style.colorScheme !== 'light') html.style.colorScheme = 'light'
  }

  onMounted(() => {
    // Latch embed mode: query param OR running inside an iframe. Cross-origin
    // access to window.top throws — that itself means we are embedded.
    let _inIframe = false
    try { _inIframe = window.self !== window.top } catch { _inIframe = true }
    let _storedEmbed = false
    try { _storedEmbed = sessionStorage.getItem('rc-embed') === '1' } catch {}
    if (route.query.embed || _inIframe || _storedEmbed) {
      embedLatch.value = true
      try { sessionStorage.setItem('rc-embed', '1') } catch {}
    }
    _forceLight()
    _rcLightObserver = new MutationObserver(_forceLight)
    _rcLightObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    })

    // ── Iframe embed: auto-height postMessage ─────────────────────────────
    if (isEmbed.value) {
      const sendHeight = () => {
        const h = document.documentElement.scrollHeight
        window.parent.postMessage({ type: 'reqcore-embed-height', height: h }, '*')
      }
      sendHeight()
      const ro = new ResizeObserver(sendHeight)
      ro.observe(document.documentElement)
      // Store on window for disconnect in onBeforeUnmount
      ;(window as any).__rcResizeObserver = ro
    }
  })

  onBeforeUnmount(() => {
    _rcLightObserver?.disconnect()
    _rcLightObserver = null
    if (isEmbed.value) {
      ;(window as any).__rcResizeObserver?.disconnect()
    }
  })
}
</script>

<template>
  <div
    class="rc-public"
    :class="[bc.cssClass, { 'rc-embed': isEmbed, 'min-h-screen': !isEmbed }]"
  >
    <!-- Header — hidden in embed mode -->
    <header v-if="!isEmbed" class="rc-header">
      <div class="mx-auto max-w-3xl px-4 sm:px-6 py-4 flex items-center justify-between">
        <a :href="bc.siteUrl" :aria-label="bc.logoAlt">
          <img :src="bc.logoSrc" :alt="bc.logoAlt" class="h-7 w-auto" />
        </a>
        <a
          :href="bc.siteUrl"
          class="text-sm font-medium transition-colors"
          style="color: var(--rc-ink); opacity: 0.7"
        >
          {{ bc.siteName }}
        </a>
      </div>
    </header>

    <!-- Content -->
    <main class="mx-auto max-w-3xl px-4 sm:px-6 py-8">
      <slot />
    </main>

    <!-- Footer — hidden in embed mode -->
    <footer v-if="!isEmbed" class="rc-footer">
      <div class="mx-auto max-w-3xl px-4 sm:px-6 py-6 flex items-center justify-between gap-4">
        <span class="text-xs" style="color: var(--rc-ink); opacity: 0.6">{{ bc.footerText }}</span>
        <a
          :href="bc.siteUrl"
          class="text-xs font-medium transition-colors"
          style="color: var(--rc-ink); opacity: 0.7"
        >
          {{ bc.footerLink }}
        </a>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* ── Font faces (self-hosted, font-src 'self' CSP compliant) ─────────────── */
@font-face {
  font-family: 'Akira Expanded';
  src: url('/brand/fonts/AkiraExpanded.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Akira Expanded';
  src: url('/brand/fonts/AkiraExpanded-Bold.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Montserrat';
  src: url('/brand/fonts/montserrat-latin-300-normal.woff2') format('woff2');
  font-weight: 300;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Montserrat';
  src: url('/brand/fonts/montserrat-latin-400-normal.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Montserrat';
  src: url('/brand/fonts/montserrat-latin-700-normal.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Montserrat';
  src: url('/brand/fonts/montserrat-latin-900-normal.woff2') format('woff2');
  font-weight: 900;
  font-style: normal;
  font-display: swap;
}

/* ── Shared public wrapper ───────────────────────────────────────────────── */
.rc-public {
  /* Default ink (overridden per brand) */
  --rc-ink: #2a2952;
}

/* ── Remote Crew brand palette ───────────────────────────────────────────── */
.rc-brand-remote-crew {
  --rc-ink: #2a2952;

  --color-brand-50: #eef0fe;
  --color-brand-100: #e0e3fd;
  --color-brand-200: #c7ccfb;
  --color-brand-300: #a5adf7;
  --color-brand-400: #8189f1;
  --color-brand-500: #5b62ec;
  --color-brand-600: #444ce7; /* primary buttons / active */
  --color-brand-700: #3a43d6;
  --color-brand-800: #2f37b8;
  --color-brand-900: #2a2952; /* deep navy */
  --color-brand-950: #1d1d3a;

  --color-accent-400: #7efce0;
  --color-accent-500: #5efbd7; /* mint highlight */
  --color-accent-600: #28d3b5;

  background-color: #f3f0ec; /* Remote Crew cream */
  color: #2a2952;
}

/* ── Escooter Clinic brand palette ───────────────────────────────────────── */
.rc-brand-escooter-clinic {
  --rc-ink: #1d1d1b;

  /* Red primary — maps to reqcore brand scale so job titles/buttons/links go red */
  --color-brand-50: #fff1f1;
  --color-brand-100: #ffe0e0;
  --color-brand-200: #ffc5c5;
  --color-brand-300: #ff9a9a;
  --color-brand-400: #ff5f5f;
  --color-brand-500: #f83030;
  --color-brand-600: #e30d13; /* ESC primary red */
  --color-brand-700: #c00a10;
  --color-brand-800: #9f0d12;
  --color-brand-900: #841216;
  --color-brand-950: #480509;

  /* Cyan secondary */
  --color-accent-400: #5af6f3;
  --color-accent-500: #0de3dd; /* ESC cyan */
  --color-accent-600: #09b8b3;

  background-color: #f0f0f0; /* ESC light grey background */
  color: #1d1d1b;
  font-family: 'Montserrat', sans-serif;
}

/* ESC sub-headings use Akira Expanded (display font). */
.rc-brand-escooter-clinic :deep(h2),
.rc-brand-escooter-clinic :deep(h3) {
  font-family: 'Akira Expanded', sans-serif;
  font-weight: 700;
}

/* ESC H1 uses Montserrat — brand-manager call (Michal): the main page heading
   must be legible above all, so it drops the heavy Akira display face. */
.rc-brand-escooter-clinic :deep(h1) {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  letter-spacing: -0.01em;
}

/* ESC job cards — white surface */
.rc-brand-escooter-clinic :deep(.job-card),
.rc-brand-escooter-clinic :deep([data-job-card]) {
  background-color: #ffffff;
}

/* ESC job-card titles — brand red + uppercase (design-QA: “CURRENT OPPORTUNITIES” mock) */
.rc-brand-escooter-clinic :deep(.rc-job-title) {
  color: var(--color-brand-600); /* #E30D13 ESC red */
  text-transform: uppercase;
  line-height: 1.3;
}
.rc-brand-escooter-clinic :deep(a:hover .rc-job-title) {
  color: var(--color-brand-700); /* darker red on hover */
}

/* ── Header / Footer shared styles ───────────────────────────────────────── */
.rc-header {
  background-color: #ffffff;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.rc-footer {
  margin-top: 3rem;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}

/* ── Embed mode — chrome-less transparent wrapper ────────────────────────── */
.rc-embed {
  background-color: transparent;
  /* No padding/min-height so content sits flush inside the iframe */
}
.rc-embed main {
  /* Symmetric vertical padding so the board sits evenly inside the iframe
     (top/bottom margins equal — was padding-top:0 which left an uneven gap). */
  padding-top: 2rem;
  padding-bottom: 2rem;
}
</style>
