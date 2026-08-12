<script setup lang="ts">
const config = useRuntimeConfig()
</script>

<template>
  <div class="min-h-screen bg-surface-50 dark:bg-surface-950 flex flex-col">
    <!-- No app header: the career-page hero is the header, so org branding dominates. -->
    <div class="mx-auto flex w-full max-w-5xl justify-end px-4 pt-4 sm:px-6 sm:pt-6">
      <LanguageSwitcher show-label show-name prominent align="right" />
    </div>

    <main class="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6 py-6 sm:py-8">
      <slot />
    </main>

    <footer class="border-t border-surface-200 dark:border-surface-800">
      <div class="mx-auto max-w-5xl px-4 sm:px-6 py-6">
        <p class="text-center text-xs text-surface-400">
          {{ $t('career.poweredBy') }}
          <a
            :href="config.public.marketingUrl"
            class="font-medium text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 underline underline-offset-2"
          >Reqcore</a>
        </p>
      </div>
    </footer>
  </div>
</template>
