<script setup lang="ts">
// ── ESC overlay: Remote Crew white-label for the public job board ──────────
// Confined to this leaf layout (+ /public/brand assets) so base files and the
// shared design system (app/assets/css/main.css) stay byte-for-byte upstream.
//
// Remote Crew is a light-themed site (cream #f3f0ec, navy #2a2952, mint #5efbd7,
// indigo #444CE7). reqcore defaults to a system-driven dark theme, so we force
// light for public pages and remap the brand/accent CSS variables on a wrapper —
// child job pages (cards, buttons, links) inherit Remote Crew colours for free.

// Force light mode before first paint. Mirrors the nonce-based inline-script
// pattern in app.vue (the CSP in server/middleware/csp.ts is nonce-based).
const _nonce = import.meta.server ? (useRequestEvent()?.context?.nonce ?? "") : "";
useHead({
  script: [
    {
      key: "rc-force-light",
      innerHTML:
        "try{document.documentElement.classList.remove(\"dark\");document.documentElement.style.colorScheme=\"light\"}catch(e){}",
      tagPosition: "head",
      ...(_nonce ? { nonce: _nonce } : {}),
    },
  ],
});
</script>

<template>
  <div class="rc-public min-h-screen">
    <!-- Header -->
    <header class="rc-header">
      <div class="mx-auto max-w-3xl px-4 sm:px-6 py-4 flex items-center justify-between">
        <a href="https://remotecrew.co.uk" aria-label="Remote Crew">
          <img src="/brand/remote-crew-logo-footer.svg" alt="Remote Crew" class="h-7 w-auto" />
        </a>
        <a
          href="https://remotecrew.co.uk"
          class="text-sm font-medium text-[#2a2952]/70 hover:text-[#2a2952] transition-colors"
        >
          remotecrew.co.uk
        </a>
      </div>
    </header>

    <!-- Content -->
    <main class="mx-auto max-w-3xl px-4 sm:px-6 py-8">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="rc-footer">
      <div class="mx-auto max-w-3xl px-4 sm:px-6 py-6 flex items-center justify-between gap-4">
        <span class="text-xs text-[#2a2952]/60">&copy; Remote Crew</span>
        <a
          href="https://remotecrew.co.uk"
          class="text-xs font-medium text-[#2a2952]/70 hover:text-[#2a2952] transition-colors"
        >
          Hire smarter &rarr;
        </a>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* Remote Crew brand palette, scoped to the public board. Remapping reqcore’s
   --color-brand-* / --color-accent-* makes child pages (job cards, primary
   buttons, links) render in Remote Crew colours without touching their markup. */
.rc-public {
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

.rc-header {
  background-color: #ffffff;
  border-bottom: 1px solid rgba(42, 41, 82, 0.1);
}

.rc-footer {
  margin-top: 3rem;
  border-top: 1px solid rgba(42, 41, 82, 0.1);
}
</style>
