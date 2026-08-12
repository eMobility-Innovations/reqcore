<script setup lang="ts">
import {
  Briefcase, MapPin, ChevronRight, Building2, Sparkles, Search, X,
} from 'lucide-vue-next'

/**
 * CareerPageView — single source of truth for how a career page renders.
 * Used by both the public page (app/pages/career/[slug]/index.vue) and the
 * dashboard live-preview editor, so the editor is truly WYSIWYG.
 *
 * Guardrails: the only brandable surfaces are the accent color, logo, name,
 * headline and description. Layout/typography are owned by Reqcore.
 */

interface Job {
  id: string
  title: string
  slug: string
  location?: string | null
  type?: string | null
  experienceLevel?: string | null
  remoteStatus?: string | null
  salaryMin?: number | null
  salaryMax?: number | null
  salaryCurrency?: string | null
  salaryUnit?: string | null
  salaryNegotiable?: boolean | null
  createdAt: string
}

const props = withDefaults(defineProps<{
  name?: string | null
  logo?: string | null
  banner?: string | null
  /** Vertical focal point of the banner, 0–100 (percent). 50 = centered. */
  bannerPosition?: number | null
  accentColor?: string | null
  headline?: string | null
  description?: string | null
  jobs?: Job[] | null
  jobCount?: number | null
  state?: 'loading' | 'empty' | 'ready' | 'offline' | 'notfound'
  /** Editor mode: disables navigation and falls back to sample cards when empty. */
  preview?: boolean
  /** Forwarded onto job links on the public page. */
  sourceQuery?: Record<string, string>
}>(), {
  name: '',
  logo: null,
  banner: null,
  bannerPosition: 50,
  accentColor: null,
  headline: null,
  description: null,
  jobs: null,
  jobCount: null,
  state: 'ready',
  preview: false,
  sourceQuery: () => ({}),
})

const { t, locale } = useI18n()
const localePath = useLocalePath()

const BRAND_FALLBACK = '#4f46e5'
const accent = computed(() => props.accentColor?.trim() || null)
const accentVar = computed(() => accent.value ?? BRAND_FALLBACK)

// Vertical focal point for the object-cover banner. Clamped to 0–100 so a bad
// value can't push the crop off-frame; horizontal stays centered.
const bannerObjectPosition = computed(() => {
  const y = Math.min(100, Math.max(0, props.bannerPosition ?? 50))
  return `center ${y}%`
})

const resolvedName = computed(() => props.name?.trim() || 'Your company')
const resolvedHeadline = computed(
  () => props.headline?.trim()
    || (props.name ? t('career.headlineWithName', { name: props.name }) : t('career.openRoles')),
)

// Employment metadata labels resolve through i18n, falling back to the raw value.
const typeLabels = computed<Record<string, string>>(() => ({
  full_time: t('career.type.full_time'),
  part_time: t('career.type.part_time'),
  contract: t('career.type.contract'),
  internship: t('career.type.internship'),
}))
const experienceLabels = computed<Record<string, string>>(() => ({
  junior: t('career.experience.junior'),
  mid: t('career.experience.mid'),
  senior: t('career.experience.senior'),
  lead: t('career.experience.lead'),
}))
const remoteLabels = computed<Record<string, string>>(() => ({
  remote: t('career.remote.remote'),
  hybrid: t('career.remote.hybrid'),
  onsite: t('career.remote.onsite'),
}))

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(locale.value, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Expand #rgb → #rrggbb so we can append alpha bytes. */
function normalizeHex(hex: string) {
  const h = hex.replace('#', '').trim()
  if (h.length === 3) return h.split('').map((c) => c + c).join('')
  return h
}
function hexRgba(hex: string | null, alpha: number) {
  const base = hex?.trim() ? normalizeHex(hex) : normalizeHex(BRAND_FALLBACK)
  const r = parseInt(base.slice(0, 2), 16)
  const g = parseInt(base.slice(2, 4), 16)
  const b = parseInt(base.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function formatSalary(j: Job) {
  if (j.salaryNegotiable) return null
  if (j.salaryMin == null && j.salaryMax == null) return null
  const cur = j.salaryCurrency || 'USD'
  const symbol: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' }
  const sym = symbol[cur] ?? `${cur} `
  const unit = j.salaryUnit === 'HOUR' ? '/hr' : j.salaryUnit === 'MONTH' ? '/mo' : '/yr'
  const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`
  if (j.salaryMin != null && j.salaryMax != null) return `${sym}${fmt(j.salaryMin)}–${fmt(j.salaryMax)}${unit}`
  const single = j.salaryMin ?? j.salaryMax
  return `${sym}${fmt(single as number)}${unit}`
}

const displayJobs = computed<Job[]>(() => {
  if (props.jobs?.length) return props.jobs
  if (props.preview) {
    // Sample cards so the editor always shows layout when there are no open roles.
    return [
      { id: 's1', title: 'Senior Product Engineer', slug: 'sample-1', location: 'Berlin, DE', type: 'full_time', experienceLevel: 'senior', remoteStatus: 'remote', createdAt: new Date().toISOString() },
      { id: 's2', title: 'Customer Success Lead', slug: 'sample-2', location: 'Remote', type: 'full_time', experienceLevel: 'mid', remoteStatus: 'remote', createdAt: new Date().toISOString() },
    ]
  }
  return []
})

const totalRoles = computed(() => props.jobCount ?? props.jobs?.length ?? 0)

// ─────────────────────────────────────────────
// Filtering — only surfaces once a page has enough roles that a flat list
// starts to get unwieldy. Never shown in the editor preview.
// ─────────────────────────────────────────────
const FILTER_MIN_ROLES = 6

const searchQuery = ref('')
const locationFilter = ref('')
const typeFilter = ref('')

const showFilters = computed(() => !props.preview && displayJobs.value.length >= FILTER_MIN_ROLES)

const locationOptions = computed(() => {
  const set = new Set<string>()
  for (const j of displayJobs.value) if (j.location?.trim()) set.add(j.location.trim())
  return [...set].sort((a, b) => a.localeCompare(b))
})
const typeOptions = computed(() => {
  const set = new Set<string>()
  for (const j of displayJobs.value) if (j.type) set.add(j.type)
  return [...set]
})

const filteredJobs = computed<Job[]>(() => {
  if (!showFilters.value) return displayJobs.value
  const q = searchQuery.value.trim().toLowerCase()
  return displayJobs.value.filter((j) => {
    if (locationFilter.value && j.location !== locationFilter.value) return false
    if (typeFilter.value && j.type !== typeFilter.value) return false
    if (q && !`${j.title} ${j.location ?? ''}`.toLowerCase().includes(q)) return false
    return true
  })
})

const hasActiveFilters = computed(
  () => !!(searchQuery.value.trim() || locationFilter.value || typeFilter.value),
)
function clearFilters() {
  searchQuery.value = ''
  locationFilter.value = ''
  typeFilter.value = ''
}
</script>

<template>
  <div :style="{ '--accent': accentVar }">
    <!-- ── Not found ───────────────────────────────────────── -->
    <div
      v-if="state === 'notfound'"
      class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-6 py-20 text-center"
    >
      <Building2 class="size-10 text-surface-300 mx-auto mb-4" />
      <h1 class="text-lg font-semibold text-surface-700 dark:text-surface-300 mb-1">
        {{ $t('career.notFoundTitle') }}
      </h1>
      <p class="text-sm text-surface-500">{{ $t('career.notFoundBody') }}</p>
    </div>

    <!-- ── Offline / disabled ──────────────────────────────── -->
    <div
      v-else-if="state === 'offline'"
      class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-6 py-20 text-center"
    >
      <Building2 class="size-10 text-surface-300 mx-auto mb-4" />
      <h1 class="text-lg font-semibold text-surface-700 dark:text-surface-300 mb-1">
        {{ $t('career.offlineTitle', { name: resolvedName }) }}
      </h1>
      <p class="text-sm text-surface-500">{{ $t('career.offlineBody') }}</p>
    </div>

    <template v-else>
      <!-- ── Hero ─────────────────────────────────────────── -->
      <header class="relative overflow-hidden rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900">
        <!-- Hero banner image, when set — otherwise a thin accent bar. -->
        <div v-if="banner" class="relative w-full h-36 sm:h-52 bg-surface-100 dark:bg-surface-800">
          <img
            :src="banner"
            :alt="`${resolvedName} banner`"
            class="size-full object-cover"
            :style="{ objectPosition: bannerObjectPosition }"
          >
          <div
            class="absolute inset-x-0 bottom-0 h-1"
            :class="!accent && 'bg-brand-600'"
            :style="accent ? { backgroundColor: accent } : undefined"
          />
        </div>
        <div
          v-else
          class="h-1.5 w-full"
          :class="!accent && 'bg-brand-600'"
          :style="accent ? { backgroundColor: accent } : undefined"
        />
        <div class="px-6 sm:px-10 py-10 sm:py-14">
          <div class="flex items-center gap-4">
            <div
              v-if="logo"
              class="size-14 sm:size-16 rounded-2xl overflow-hidden border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-800 shrink-0"
            >
              <img :src="logo" :alt="resolvedName" class="size-full object-contain">
            </div>
            <div
              v-else
              class="flex items-center justify-center size-14 sm:size-16 rounded-2xl text-white text-2xl font-semibold shrink-0"
              :class="!accent && 'bg-brand-600'"
              :style="accent ? { backgroundColor: accent } : undefined"
            >
              {{ resolvedName.charAt(0).toUpperCase() }}
            </div>
            <div class="min-w-0">
              <p class="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-surface-400 dark:text-surface-500">
                <span
                  class="size-1.5 rounded-full"
                  :style="{ backgroundColor: accentVar }"
                />
                {{ $t('career.eyebrow') }}
              </p>
              <p class="text-lg sm:text-xl font-bold text-surface-900 dark:text-surface-100 truncate">
                {{ resolvedName }}
              </p>
            </div>
          </div>

          <h1 class="mt-8 text-3xl sm:text-4xl font-semibold tracking-tight text-surface-900 dark:text-surface-100">
            {{ resolvedHeadline }}
          </h1>
          <p
            v-if="description"
            class="mt-4 text-base text-surface-600 dark:text-surface-400 max-w-2xl whitespace-pre-line"
          >
            {{ description }}
          </p>

          <div v-if="totalRoles > 0" class="mt-6 flex items-center gap-2">
            <span
              class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
              :style="{ color: accentVar, backgroundColor: hexRgba(accent, 0.1) }"
            >
              <Sparkles class="size-3.5" />
              {{ $t('career.openRolesCount', { count: totalRoles }, totalRoles) }}
            </span>
          </div>
        </div>
      </header>

      <!-- ── Roles ───────────────────────────────────────── -->
      <section class="mt-10">
        <div class="flex items-baseline justify-between mb-4">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">
            {{ $t('career.openRoles') }}
          </h2>
          <span v-if="totalRoles > 0" class="text-xs text-surface-400">
            <template v-if="showFilters && hasActiveFilters">{{ $t('career.filteredOf', { shown: filteredJobs.length, total: totalRoles }) }}</template>
            <template v-else>{{ $t('career.totalCount', { total: totalRoles }) }}</template>
          </span>
        </div>

        <!-- Filter bar — appears once the list is long enough to warrant it -->
        <div v-if="showFilters" class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div class="relative flex-1 min-w-0">
            <Search class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-surface-400" />
            <input
              v-model="searchQuery"
              type="search"
              :placeholder="$t('career.searchPlaceholder')"
              :aria-label="$t('career.searchPlaceholder')"
              class="w-full rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 pl-9 pr-3 py-2 text-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)] transition-colors"
            >
          </div>
          <select
            v-if="locationOptions.length > 1"
            v-model="locationFilter"
            :aria-label="$t('career.allLocations')"
            class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-3 py-2 text-sm text-surface-700 dark:text-surface-300 focus:outline-none focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)] transition-colors"
          >
            <option value="">{{ $t('career.allLocations') }}</option>
            <option v-for="loc in locationOptions" :key="loc" :value="loc">{{ loc }}</option>
          </select>
          <select
            v-if="typeOptions.length > 1"
            v-model="typeFilter"
            :aria-label="$t('career.allTypes')"
            class="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-3 py-2 text-sm text-surface-700 dark:text-surface-300 focus:outline-none focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)] transition-colors"
          >
            <option value="">{{ $t('career.allTypes') }}</option>
            <option v-for="opt in typeOptions" :key="opt" :value="opt">{{ typeLabels[opt] ?? opt }}</option>
          </select>
          <button
            v-if="hasActiveFilters"
            type="button"
            class="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 transition-colors"
            @click="clearFilters"
          >
            <X class="size-3.5" />
            {{ $t('career.clear') }}
          </button>
        </div>

        <!-- Loading skeleton -->
        <div v-if="state === 'loading'" class="space-y-3">
          <div
            v-for="i in 3"
            :key="i"
            class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-5 py-4"
          >
            <div class="h-4 w-1/3 rounded bg-surface-100 dark:bg-surface-800 animate-pulse" />
            <div class="mt-3 h-3 w-1/2 rounded bg-surface-100 dark:bg-surface-800 animate-pulse" />
          </div>
        </div>

        <!-- Empty -->
        <div
          v-else-if="state === 'empty' && !displayJobs.length"
          class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-6 py-16 text-center"
        >
          <Briefcase class="size-10 text-surface-300 mx-auto mb-4" />
          <h3 class="text-base font-semibold text-surface-700 dark:text-surface-300 mb-1">{{ $t('career.emptyTitle') }}</h3>
          <p class="text-sm text-surface-500">{{ $t('career.emptyBody') }}</p>
        </div>

        <!-- No matches for the active filters -->
        <div
          v-else-if="showFilters && !filteredJobs.length"
          class="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-6 py-14 text-center"
        >
          <Search class="size-8 text-surface-300 mx-auto mb-3" />
          <h3 class="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-1">{{ $t('career.noMatchesTitle') }}</h3>
          <button
            type="button"
            class="mt-1 text-sm font-medium text-[color:var(--accent)] hover:underline"
            @click="clearFilters"
          >
            {{ $t('career.clearFilters') }}
          </button>
        </div>

        <!-- Job list -->
        <div v-else class="space-y-3">
          <template v-if="!preview">
            <NuxtLink
              v-for="j in filteredJobs"
              :key="j.id"
              :to="{ path: localePath(`/jobs/${j.slug}`), query: sourceQuery }"
              class="group block rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-5 py-4 transition-all hover:border-[color:var(--accent)] hover:shadow-sm"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <h3 class="text-base font-semibold text-surface-900 dark:text-surface-100 group-hover:text-[color:var(--accent)] transition-colors">
                    {{ j.title }}
                  </h3>
                  <div class="flex flex-wrap items-center gap-2 mt-2 text-sm text-surface-500 dark:text-surface-400">
                    <span
                      v-if="j.type"
                      class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                      :style="{ color: accentVar, backgroundColor: hexRgba(accent, 0.1) }"
                    >{{ typeLabels[j.type] ?? j.type }}</span>
                    <span v-if="j.experienceLevel">{{ experienceLabels[j.experienceLevel] ?? j.experienceLevel }}</span>
                    <span v-if="j.location" class="inline-flex items-center gap-1"><MapPin class="size-3.5" />{{ j.location }}</span>
                    <span v-if="j.remoteStatus" class="inline-flex items-center gap-1"><Briefcase class="size-3.5" />{{ remoteLabels[j.remoteStatus] ?? j.remoteStatus }}</span>
                    <span v-if="formatSalary(j)" class="font-medium text-surface-600 dark:text-surface-300">{{ formatSalary(j) }}</span>
                    <span class="text-surface-400">· {{ $t('career.posted', { date: formatDate(j.createdAt) }) }}</span>
                  </div>
                </div>
                <ChevronRight class="size-5 text-surface-300 group-hover:text-[color:var(--accent)] shrink-0 mt-1 transition-colors" />
              </div>
            </NuxtLink>
          </template>
          <template v-else>
            <div
              v-for="j in displayJobs"
              :key="j.id"
              class="group block rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-5 py-4 transition-all hover:border-[color:var(--accent)] hover:shadow-sm"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <h3 class="text-base font-semibold text-surface-900 dark:text-surface-100 group-hover:text-[color:var(--accent)] transition-colors">
                    {{ j.title }}
                  </h3>
                  <div class="flex flex-wrap items-center gap-2 mt-2 text-sm text-surface-500 dark:text-surface-400">
                    <span
                      v-if="j.type"
                      class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                      :style="{ color: accentVar, backgroundColor: hexRgba(accent, 0.1) }"
                    >{{ typeLabels[j.type] ?? j.type }}</span>
                    <span v-if="j.experienceLevel">{{ experienceLabels[j.experienceLevel] ?? j.experienceLevel }}</span>
                    <span v-if="j.location" class="inline-flex items-center gap-1"><MapPin class="size-3.5" />{{ j.location }}</span>
                    <span v-if="j.remoteStatus" class="inline-flex items-center gap-1"><Briefcase class="size-3.5" />{{ remoteLabels[j.remoteStatus] ?? j.remoteStatus }}</span>
                    <span v-if="formatSalary(j)" class="font-medium text-surface-600 dark:text-surface-300">{{ formatSalary(j) }}</span>
                    <span class="text-surface-400">· {{ $t('career.posted', { date: formatDate(j.createdAt) }) }}</span>
                  </div>
                </div>
                <ChevronRight class="size-5 text-surface-300 group-hover:text-[color:var(--accent)] shrink-0 mt-1 transition-colors" />
              </div>
            </div>
          </template>
        </div>
      </section>
    </template>
  </div>
</template>
