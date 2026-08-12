<script setup lang="ts">
import { ArrowRight, Building2, Check, Cloud, Rocket, Sparkles } from 'lucide-vue-next'
import type { Component } from 'vue'
import { BILLING_PLANS, type BillingPlanId } from '~~/shared/billing'

const props = withDefaults(defineProps<{
  compact?: boolean
  onDark?: boolean
}>(), {
  compact: false,
  onDark: false,
})

const emit = defineEmits<{
  (e: 'select'): void
}>()

const localePath = useLocalePath()

const paidIcons = {
  solo: Sparkles,
  team: Building2,
  scale: Rocket,
} satisfies Record<BillingPlanId, Component>

const paidHighlights = {
  solo: '2 active roles',
  team: '8 roles + integrations',
  scale: 'SSO + controls',
} satisfies Record<BillingPlanId, string>

const options = computed(() => [
  {
    id: 'free',
    name: 'Try for free',
    tagline: 'One live role, unlimited applicants, no card required.',
    price: '$0',
    badge: 'Best first step',
    icon: Cloud,
    featured: false,
    to: localePath({ path: '/auth/sign-up', query: { plan: 'free' } }),
    details: ['1 active role', 'First AI shortlist free'],
  },
  ...BILLING_PLANS.map((plan) => ({
    id: plan.id,
    name: plan.name,
    tagline: plan.tagline,
    price: `$${plan.monthlyPrice}/mo`,
    badge: plan.id === 'team' ? 'Most popular' : paidHighlights[plan.id],
    icon: paidIcons[plan.id],
    featured: plan.id === 'team',
    to: localePath({
      path: '/auth/sign-up',
      query: { plan: plan.id, billing: 'monthly' },
    }),
    details: [
      `Up to ${plan.activeRoleLimit} active roles`,
      plan.id === 'solo' ? 'Unlimited AI shortlists' : plan.features[2] ?? 'Advanced hiring workflow',
    ],
  })),
])
</script>

<template>
  <div class="space-y-2">
    <NuxtLink
      v-for="option in options"
      :key="option.id"
      :to="option.to"
      class="group relative flex items-start gap-3 rounded-lg border p-3 text-left no-underline transition-all duration-200 hover:-translate-y-px hover:shadow-lg"
      :class="[
        props.onDark ? 'bg-white/[0.04]' : 'bg-white dark:bg-surface-950',
        option.featured
          ? props.onDark
            ? 'border-brand-400/40 ring-1 ring-brand-400/20 hover:border-brand-300/60'
            : 'border-brand-300 shadow-brand-500/10 ring-1 ring-brand-100 hover:border-brand-400 dark:border-brand-700 dark:ring-brand-900/70'
          : props.onDark
            ? 'border-white/[0.08] hover:border-white/[0.16] hover:bg-white/[0.06]'
            : 'border-surface-200 hover:border-surface-300 dark:border-surface-800 dark:hover:border-surface-700',
      ]"
      @click="emit('select')"
    >
      <div
        class="flex size-9 shrink-0 items-center justify-center rounded-lg"
        :class="option.featured
          ? 'bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-sm shadow-brand-500/25'
          : props.onDark
            ? 'bg-white/[0.08] text-white/75'
            : 'bg-surface-100 text-surface-600 dark:bg-surface-900 dark:text-surface-300'"
      >
        <component :is="option.icon" class="size-4" />
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2">
          <p class="truncate text-sm font-semibold" :class="props.onDark ? 'text-white' : 'text-surface-950 dark:text-white'">{{ option.name }}</p>
          <span
            class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            :class="option.featured
              ? props.onDark
                ? 'bg-brand-400/15 text-brand-200'
                : 'bg-brand-500/15 text-brand-700 dark:text-brand-300'
              : props.onDark
                ? 'bg-white/[0.08] text-white/45'
                : 'bg-surface-100 text-surface-500 dark:bg-surface-900 dark:text-surface-400'"
          >
            {{ option.badge }}
          </span>
        </div>
        <p class="mt-0.5 text-xs leading-5" :class="props.onDark ? 'text-white/50' : 'text-surface-500 dark:text-surface-400'">
          {{ option.tagline }}
        </p>
        <div v-if="!props.compact" class="mt-2 flex flex-wrap gap-1.5">
          <span
            v-for="detail in option.details"
            :key="detail"
            class="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium"
            :class="props.onDark ? 'bg-white/[0.06] text-white/65' : 'bg-surface-50 text-surface-600 dark:bg-surface-900 dark:text-surface-300'"
          >
            <Check class="size-3 text-brand-500" />
            {{ detail }}
          </span>
        </div>
      </div>

      <div class="flex shrink-0 flex-col items-end gap-1">
        <span class="text-xs font-semibold" :class="props.onDark ? 'text-white/85' : 'text-surface-900 dark:text-surface-100'">{{ option.price }}</span>
        <ArrowRight class="size-3.5 transition-all group-hover:translate-x-0.5 group-hover:text-brand-500" :class="props.onDark ? 'text-white/25' : 'text-surface-300'" />
      </div>
    </NuxtLink>
  </div>
</template>
