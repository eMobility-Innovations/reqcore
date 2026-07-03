<script setup lang="ts">
const { data: session } = await authClient.useSession(useFetch)

useSeoMeta({
  title: 'Pricing',
  description: 'Unlimited applicants on every plan. Priced by the roles you keep open, never by your volume. Free until your first AI shortlist — no card.',
  ogTitle: 'Reqcore Pricing',
  ogDescription: 'Unlimited applicants on every plan, priced by active roles. Start free on one role — no card.',
})

definePageMeta({ layout: false })
</script>

<template>
  <div class="min-h-screen bg-white text-surface-900 dark:bg-[#09090b] dark:text-white">
    <PublicNavBar active-page="pricing" compact />

    <main>
      <PublicPricingSection :signed-in="Boolean(session?.user)" />
    </main>
  </div>
</template>
