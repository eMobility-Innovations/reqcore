<script setup lang="ts">
const i18nHead = useLocaleHead({
  seo: true,
})

// Job listings/detail and branded career pages serve recruiter-authored,
// single-language content under every locale prefix, so their localized
// variants are noindex (see nuxt.config routeRules + the pages' robots meta).
// Strip the auto-generated hreflang alternates on those routes: advertising
// alternates that point at noindex URLs claims translations that don't exist,
// and Google drops hreflang clusters whose members aren't indexable. Every
// other route (marketing, /pricing) keeps its alternates; the canonical link
// and og:locale meta are left untouched.
const route = useRoute()
const isSingleLocaleUgc = computed(() =>
  /^\/(?:[a-z]{2}\/)?(?:jobs|career)(?:\/|$)/.test(route.path))
const i18nLinks = computed(() =>
  isSingleLocaleUgc.value
    ? i18nHead.value.link.filter((l) => !('hreflang' in l))
    : i18nHead.value.link)

useHead(() => ({
  htmlAttrs: i18nHead.value.htmlAttrs,
  link: i18nLinks.value,
  meta: i18nHead.value.meta,
}))

// Blocking inline script to apply dark mode before first paint (prevents white
// flash). The nonce attribute is required by the nonce-based CSP set in
// server/middleware/csp.ts — without it the script would be blocked by the
// Content Security Policy (CSP).
const _nonce = import.meta.server ? (useRequestEvent()?.context?.nonce ?? '') : ''
useHead({
  script: [
    {
      key: 'dark-mode-init',
      innerHTML: '(function(){try{var s=localStorage.getItem("reqcore-color-mode");var m=s||(window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light");document.documentElement.classList.toggle("dark",m==="dark");document.documentElement.style.colorScheme=m}catch(e){}})()',
      tagPosition: 'head',
      ...(_nonce ? { nonce: _nonce } : {}),
    },
  ],
})

// Sync Better Auth session → PostHog identity & org group
await usePostHogIdentity()
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <ClientOnly>
      <ConsentBanner />
    </ClientOnly>
  </div>
</template>
