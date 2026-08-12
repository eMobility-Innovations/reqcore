<script setup lang="ts">
import {
  Globe2, Loader2, Check, Copy, ExternalLink, Lock, ImageUp, Trash2,
} from 'lucide-vue-next'

definePageMeta({
  fullbleed: true,
})

useSeoMeta({
  title: 'Career Page — Reqcore',
  description: 'Customize your organization\'s public career page',
})

const localePath = useLocalePath()
const { track } = useTrack()
const { allowed: canManage } = usePermission({ organization: ['update'] })
const { activeOrg } = useCurrentOrg()
const { hasFeature } = usePlanFeature()
const canUse = computed(() => hasFeature('careerPage'))

const {
  config,
  status: fetchStatus,
  updateCareerPage,
  careerPagePath,
  logoUrl,
  bannerUrl,
  uploadAsset,
  removeAsset,
} = useCareerPage()

// ─────────────────────────────────────────────
// Form state
// ─────────────────────────────────────────────
const form = reactive({
  enabled: true,
  slug: '',
  accentColor: '',
  headline: '',
  description: '',
  bannerPosition: 50,
})

const isSaving = ref(false)
const saveSuccess = ref(false)
const saveError = ref('')

// Hydrate the form once the config lands.
watch(config, (c) => {
  if (!c) return
  form.enabled = c.enabled
  form.slug = c.slug ?? ''
  form.accentColor = c.accentColor ?? ''
  form.headline = c.headline ?? ''
  form.description = c.description ?? ''
  form.bannerPosition = c.bannerPosition ?? 50
}, { immediate: true })

const accentPresets = [
  '#4f46e5', // indigo (brand-ish)
  '#0ea5e9', // sky
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#14b8a6', // teal
]

const accentHexValid = computed(() => {
  const v = form.accentColor.trim()
  return v === '' || /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)
})

const previewAccent = computed(() => form.accentColor.trim() || null)

const normalizedSlug = computed(() => form.slug.trim().toLowerCase())
const slugValid = computed(() => {
  const v = normalizedSlug.value
  return v === '' || (v.length >= 3 && v.length <= 60 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v))
})

const isDirty = computed(() => {
  const c = config.value
  if (!c) return false
  return form.enabled !== c.enabled
    || (normalizedSlug.value || null) !== (c.slug ?? null)
    || (form.accentColor.trim() || null) !== (c.accentColor ?? null)
    || (form.headline.trim() || null) !== (c.headline ?? null)
    || (form.description.trim() || null) !== (c.description ?? null)
    || form.bannerPosition !== (c.bannerPosition ?? 50)
})

function revert() {
  const c = config.value
  if (!c) return
  form.enabled = c.enabled
  form.slug = c.slug ?? ''
  form.accentColor = c.accentColor ?? ''
  form.headline = c.headline ?? ''
  form.description = c.description ?? ''
  form.bannerPosition = c.bannerPosition ?? 50
  saveError.value = ''
}

// ─────────────────────────────────────────────
// Preview jobs — the org's real open roles, best-effort.
// Falls back to sample cards inside CareerPageView when empty.
// ─────────────────────────────────────────────
const { data: jobsData } = useFetch('/api/jobs', {
  key: 'career-page-preview-jobs',
  query: { status: 'open', limit: 50 },
})
const previewJobs = computed(() => jobsData.value?.data ?? [])

// ─────────────────────────────────────────────
// Public URL
// ─────────────────────────────────────────────
const siteOrigin = computed(() => {
  if (import.meta.client) return window.location.origin
  return 'https://app.reqcore.com'
})
const publicUrl = computed(() => careerPagePath.value ? `${siteOrigin.value}${careerPagePath.value}` : '')
const copiedUrl = ref(false)

async function copyUrl() {
  if (!publicUrl.value) return
  try {
    await navigator.clipboard.writeText(publicUrl.value)
    copiedUrl.value = true
    setTimeout(() => { copiedUrl.value = false }, 2000)
  } catch {
    // non-HTTPS fallback — ignore
  }
}

// ─────────────────────────────────────────────
// Image assets — logo + hero banner (upload persists immediately)
// ─────────────────────────────────────────────
const ASSET_MAX_BYTES: Record<'logo' | 'banner', number> = {
  logo: 2 * 1024 * 1024,
  banner: 15 * 1024 * 1024,
}
const ASSET_ACCEPT = 'image/png,image/jpeg,image/webp'

const uploadingAsset = ref<'logo' | 'banner' | null>(null)
const assetError = ref('')
const logoInput = ref<HTMLInputElement | null>(null)
const bannerInput = ref<HTMLInputElement | null>(null)

// Preview prefers the uploaded career-page logo, then the org profile logo.
const previewLogo = computed(() => logoUrl.value ?? activeOrg.value?.logo ?? null)

function openAssetPicker(kind: 'logo' | 'banner') {
  if (!canManage.value || uploadingAsset.value === kind) return
  const input = kind === 'logo' ? logoInput.value : bannerInput.value
  input?.click()
}

async function onAssetChange(kind: 'logo' | 'banner', e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-selecting the same file
  if (!file) return

  assetError.value = ''
  if (!ASSET_ACCEPT.split(',').includes(file.type)) {
    assetError.value = 'Use a PNG, JPEG, or WebP image.'
    return
  }
  if (file.size > ASSET_MAX_BYTES[kind]) {
    assetError.value = `Image too large. Max ${ASSET_MAX_BYTES[kind] / 1024 / 1024} MB.`
    return
  }

  uploadingAsset.value = kind
  try {
    await uploadAsset(kind, file)
    track('career_page_asset_uploaded', { kind })
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string }; message?: string }
    assetError.value = fetchErr.data?.statusMessage ?? fetchErr.message ?? 'Failed to upload image'
  } finally {
    uploadingAsset.value = null
  }
}

async function onAssetRemove(kind: 'logo' | 'banner') {
  if (!canManage.value) return
  assetError.value = ''
  uploadingAsset.value = kind
  try {
    await removeAsset(kind)
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string }; message?: string }
    assetError.value = fetchErr.data?.statusMessage ?? fetchErr.message ?? 'Failed to remove image'
  } finally {
    uploadingAsset.value = null
  }
}

// ─────────────────────────────────────────────
// Save
// ─────────────────────────────────────────────
async function handleSave() {
  if (!canManage.value || !canUse.value) return
  if (!accentHexValid.value) {
    saveError.value = 'Accent color must be a hex value like #4f46e5.'
    return
  }
  if (!slugValid.value) {
    saveError.value = 'Web address must be 3–60 characters: lowercase letters, numbers and hyphens.'
    return
  }

  isSaving.value = true
  saveError.value = ''
  saveSuccess.value = false

  try {
    await updateCareerPage({
      enabled: form.enabled,
      slug: normalizedSlug.value || null,
      accentColor: form.accentColor.trim() || null,
      headline: form.headline.trim() || null,
      description: form.description.trim() || null,
      bannerPosition: form.bannerPosition,
    })
    track('career_page_updated')
    saveSuccess.value = true
    setTimeout(() => { saveSuccess.value = false }, 2500)
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string }; message?: string }
    saveError.value = fetchErr.data?.statusMessage ?? fetchErr.message ?? 'Failed to save career page'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <!-- Plan gate -->
  <div v-if="!canUse" class="mx-auto max-w-2xl py-6">
    <div class="mb-6">
      <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-100">Career Page</h1>
      <p class="mt-1 text-sm text-surface-500 dark:text-surface-400">
        A branded page listing your open roles. Share one link instead of pasting job ads everywhere.
      </p>
    </div>
    <FeatureLockCard feature="careerPage" />
  </div>

  <!-- Loading -->
  <div v-else-if="fetchStatus === 'pending' && !config" class="flex items-center gap-3 py-12 justify-center">
    <Loader2 class="size-5 animate-spin text-surface-400" />
    <span class="text-sm text-surface-400">Loading career page settings…</span>
  </div>

  <!-- Editor -->
  <div
    v-else
    class="flex min-h-full flex-col bg-surface-50 dark:bg-surface-950 lg:h-full lg:min-h-0 lg:overflow-hidden"
  >
    <!-- Top toolbar -->
    <div class="shrink-0 border-b border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 px-4 sm:px-6 py-3">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <h1 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Career Page</h1>
          <p class="text-xs text-surface-500 dark:text-surface-400 truncate">
            {{ publicUrl || 'No public link configured' }}
          </p>
        </div>

        <div class="flex items-center gap-2">
          <!-- Copy / Open public link -->
          <button
            v-if="publicUrl"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-2.5 py-1.5 text-xs font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
            title="Copy public link"
            @click="copyUrl"
          >
            <Check v-if="copiedUrl" class="size-3.5 text-emerald-500" />
            <Copy v-else class="size-3.5" />
            <span class="hidden sm:inline">{{ copiedUrl ? 'Copied' : 'Copy link' }}</span>
          </button>
          <NuxtLink
            v-if="careerPagePath"
            :to="careerPagePath"
            target="_blank"
            class="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-2.5 py-1.5 text-xs font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors no-underline"
            title="Open live page"
          >
            <ExternalLink class="size-3.5" />
            <span class="hidden sm:inline">Open</span>
          </NuxtLink>

          <div class="hidden sm:block h-5 w-px bg-surface-200 dark:bg-surface-700" />

          <!-- Unsaved indicator -->
          <span
            v-if="isDirty"
            class="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400"
          >
            <span class="size-1.5 rounded-full bg-amber-500" />
            Unsaved
          </span>
          <span
            v-else-if="saveSuccess"
            class="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"
          >
            <Check class="size-3.5" />
            Saved
          </span>

          <!-- Revert -->
          <button
            type="button"
            :disabled="!isDirty || isSaving"
            class="rounded-lg px-3 py-1.5 text-xs font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            @click="revert"
          >
            Revert
          </button>

          <!-- Save -->
          <button
            type="button"
            :disabled="!canManage || isSaving || !accentHexValid || !slugValid || !isDirty"
            class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            @click="handleSave"
          >
            <Loader2 v-if="isSaving" class="size-3.5 animate-spin" />
            <Check v-else class="size-3.5" />
            {{ isSaving ? 'Saving…' : 'Save changes' }}
          </button>
        </div>
      </div>

      <!-- Error banner -->
      <div
        v-if="saveError"
        class="mt-2 rounded-lg border border-danger-200 dark:border-danger-900 bg-danger-50 dark:bg-danger-950/30 px-3 py-2 text-xs text-danger-700 dark:text-danger-300"
      >
        {{ saveError }}
      </div>
    </div>

    <!-- Body: preview + control rail -->
    <div class="flex flex-1 min-h-0 flex-col lg:flex-row">
      <!-- Preview pane -->
      <div class="flex flex-col h-[55vh] lg:h-auto lg:flex-1 lg:min-h-0 min-w-0 border-b lg:border-b-0 lg:border-r border-surface-200 dark:border-surface-800 bg-surface-100 dark:bg-surface-900">
        <!-- Browser frame -->
        <div class="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900">
          <div class="flex items-center gap-1.5">
            <span class="size-2.5 rounded-full bg-rose-300 dark:bg-rose-500/50" />
            <span class="size-2.5 rounded-full bg-amber-300 dark:bg-amber-500/50" />
            <span class="size-2.5 rounded-full bg-emerald-300 dark:bg-emerald-500/50" />
          </div>
          <div class="ml-2 flex-1 min-w-0 flex items-center gap-1.5 rounded-md bg-surface-100 dark:bg-surface-800 px-2.5 py-1">
            <Globe2 class="size-3.5 text-surface-400 shrink-0" />
            <span class="text-xs text-surface-500 dark:text-surface-400 truncate">{{ publicUrl || '/career/your-company' }}</span>
          </div>
        </div>
        <!-- Scrollable preview canvas -->
        <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-surface-50 dark:bg-surface-950">
          <div class="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-10">
            <CareerPageView
              preview
              :name="activeOrg?.name"
              :logo="previewLogo"
              :banner="bannerUrl"
              :banner-position="form.bannerPosition"
              :accent-color="previewAccent"
              :headline="form.headline"
              :description="form.description"
              :jobs="previewJobs"
              :job-count="previewJobs.length"
              state="ready"
            />
          </div>
        </div>
      </div>

      <!-- Control rail -->
      <div class="lg:w-80 shrink-0 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain bg-white dark:bg-surface-900">
        <div class="p-4 space-y-4">
          <!-- Status -->
          <section class="rounded-xl border border-surface-200 dark:border-surface-800 overflow-hidden">
            <div class="px-4 py-3 border-b border-surface-100 dark:border-surface-800">
              <h2 class="text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">Status</h2>
            </div>
            <div class="px-4 py-4">
              <label class="flex items-center justify-between gap-4 cursor-pointer">
                <div>
                  <p class="text-sm font-medium text-surface-900 dark:text-surface-100">Page is live</p>
                  <p class="text-xs text-surface-500 dark:text-surface-400">Turn off to hide the page from applicants.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  :aria-checked="form.enabled"
                  :disabled="!canManage"
                  class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  :class="form.enabled ? 'bg-brand-600' : 'bg-surface-300 dark:bg-surface-700'"
                  @click="form.enabled = !form.enabled"
                >
                  <span
                    class="inline-block size-5 transform rounded-full bg-white shadow transition-transform"
                    :class="form.enabled ? 'translate-x-5' : 'translate-x-0.5'"
                  />
                </button>
              </label>
            </div>
          </section>

          <!-- Language -->
          <section class="rounded-xl border border-surface-200 dark:border-surface-800">
            <div class="px-4 py-3 border-b border-surface-100 dark:border-surface-800">
              <h2 class="text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">Language</h2>
            </div>
            <div class="px-4 py-4 space-y-3">
              <p class="text-xs text-surface-500 dark:text-surface-400">
                Switch the language used in this editor and the career page preview.
              </p>
              <LanguageSwitcher show-name prominent align="left" />
            </div>
          </section>

          <!-- Web address -->
          <section class="rounded-xl border border-surface-200 dark:border-surface-800 overflow-hidden">
            <div class="px-4 py-3 border-b border-surface-100 dark:border-surface-800">
              <h2 class="text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">Web address</h2>
            </div>
            <div class="px-4 py-4 space-y-2">
              <label class="block text-sm font-medium text-surface-700 dark:text-surface-300">Custom URL</label>
              <div
                class="flex items-center rounded-lg border bg-white dark:bg-surface-800 overflow-hidden focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500 transition-colors"
                :class="slugValid ? 'border-surface-200 dark:border-surface-700' : 'border-danger-400'"
              >
                <span class="pl-2.5 pr-0.5 py-2 text-sm text-surface-400 select-none whitespace-nowrap">/career/</span>
                <input
                  v-model="form.slug"
                  type="text"
                  maxlength="60"
                  :placeholder="activeOrg?.slug ?? 'your-company'"
                  :disabled="!canManage"
                  class="min-w-0 flex-1 bg-transparent py-2 pr-2.5 text-sm font-mono text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none disabled:opacity-60"
                >
              </div>
              <p v-if="!slugValid" class="text-xs text-danger-600 dark:text-danger-400">
                Use 3–60 lowercase letters, numbers and hyphens.
              </p>
              <p v-else class="text-xs text-surface-400">
                Leave blank to use your organization slug (<span class="font-mono">{{ activeOrg?.slug }}</span>).
              </p>
            </div>
          </section>

          <!-- Brand -->
          <section class="rounded-xl border border-surface-200 dark:border-surface-800 overflow-hidden">
            <div class="px-4 py-3 border-b border-surface-100 dark:border-surface-800">
              <h2 class="text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">Brand</h2>
            </div>
            <div class="px-4 py-4 space-y-4">
              <!-- Accent color -->
              <div>
                <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">Accent color</label>
                <div class="flex flex-wrap items-center gap-2">
                  <button
                    v-for="color in accentPresets"
                    :key="color"
                    type="button"
                    class="size-7 rounded-full border-2 transition-transform hover:scale-110"
                    :class="form.accentColor === color ? 'border-surface-900 dark:border-white' : 'border-transparent'"
                    :style="{ backgroundColor: color }"
                    :aria-label="`Accent ${color}`"
                    @click="form.accentColor = form.accentColor === color ? '' : color"
                  />
                  <div class="flex items-center gap-2 ml-1">
                    <input
                      v-model="form.accentColor"
                      type="text"
                      placeholder="#4f46e5"
                      class="w-24 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-2.5 py-1.5 text-sm font-mono text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                      :class="!accentHexValid && 'border-danger-400 focus:ring-danger-500'"
                    >
                    <button
                      v-if="form.accentColor"
                      type="button"
                      class="text-xs text-surface-400 hover:text-surface-600 dark:hover:text-surface-200"
                      @click="form.accentColor = ''"
                    >
                      Reset
                    </button>
                  </div>
                </div>
                <p v-if="!accentHexValid" class="mt-1.5 text-xs text-danger-600 dark:text-danger-400">
                  Use a hex color like #4f46e5.
                </p>
              </div>

              <!-- Logo -->
              <div>
                <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">Logo</label>
                <div class="flex items-center gap-3">
                  <div class="size-14 shrink-0 rounded-xl overflow-hidden border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 flex items-center justify-center">
                    <img v-if="previewLogo" :src="previewLogo" alt="Logo" class="size-full object-contain">
                    <ImageUp v-else class="size-5 text-surface-300" />
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <button
                      type="button"
                      :disabled="!canManage || uploadingAsset === 'logo'"
                      class="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-2.5 py-1.5 text-xs font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors cursor-pointer"
                      :class="(!canManage || uploadingAsset === 'logo') && 'opacity-50 cursor-not-allowed'"
                      @click="openAssetPicker('logo')"
                    >
                      <Loader2 v-if="uploadingAsset === 'logo'" class="size-3.5 animate-spin" />
                      <ImageUp v-else class="size-3.5" />
                      {{ logoUrl ? 'Replace' : 'Upload' }}
                    </button>
                    <input
                      ref="logoInput"
                      type="file"
                      :accept="ASSET_ACCEPT"
                      class="hidden"
                      :disabled="!canManage || uploadingAsset === 'logo'"
                      @change="onAssetChange('logo', $event)"
                    >
                    <button
                      v-if="logoUrl"
                      type="button"
                      :disabled="!canManage || uploadingAsset === 'logo'"
                      class="inline-flex items-center gap-1 text-xs text-surface-400 hover:text-danger-600 dark:hover:text-danger-400 disabled:opacity-50 transition-colors"
                      @click="onAssetRemove('logo')"
                    >
                      <Trash2 class="size-3" />
                      Remove
                    </button>
                  </div>
                </div>
                <p class="mt-1.5 text-xs text-surface-400">PNG, JPEG or WebP · up to 2 MB. Falls back to your organization logo.</p>
              </div>

              <!-- Banner -->
              <div>
                <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">Hero banner</label>
                <div class="rounded-xl overflow-hidden border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800">
                  <div class="aspect-[16/6] w-full flex items-center justify-center">
                    <img
                      v-if="bannerUrl"
                      :src="bannerUrl"
                      alt="Banner"
                      class="size-full object-cover"
                      :style="{ objectPosition: `center ${form.bannerPosition}%` }"
                    >
                    <ImageUp v-else class="size-6 text-surface-300" />
                  </div>
                </div>
                <div class="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    :disabled="!canManage || uploadingAsset === 'banner'"
                    class="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-2.5 py-1.5 text-xs font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors cursor-pointer"
                    :class="(!canManage || uploadingAsset === 'banner') && 'opacity-50 cursor-not-allowed'"
                    @click="openAssetPicker('banner')"
                  >
                    <Loader2 v-if="uploadingAsset === 'banner'" class="size-3.5 animate-spin" />
                    <ImageUp v-else class="size-3.5" />
                    {{ bannerUrl ? 'Replace' : 'Upload' }}
                  </button>
                  <input
                    ref="bannerInput"
                    type="file"
                    :accept="ASSET_ACCEPT"
                    class="hidden"
                    :disabled="!canManage || uploadingAsset === 'banner'"
                    @change="onAssetChange('banner', $event)"
                  >
                  <button
                    v-if="bannerUrl"
                    type="button"
                    :disabled="!canManage || uploadingAsset === 'banner'"
                    class="inline-flex items-center gap-1 text-xs text-surface-400 hover:text-danger-600 dark:hover:text-danger-400 disabled:opacity-50 transition-colors"
                    @click="onAssetRemove('banner')"
                  >
                    <Trash2 class="size-3" />
                    Remove
                  </button>
                </div>
                <p class="mt-1.5 text-xs text-surface-400">PNG, JPEG or WebP · up to 15 MB. Optimized automatically.</p>

                <!-- Vertical reposition — only meaningful once a banner is set. -->
                <div v-if="bannerUrl" class="mt-3">
                  <div class="flex items-center justify-between">
                    <label for="banner-position" class="text-xs font-medium text-surface-600 dark:text-surface-300">Vertical position</label>
                    <button
                      v-if="form.bannerPosition !== 50"
                      type="button"
                      :disabled="!canManage"
                      class="text-xs text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 disabled:opacity-50"
                      @click="form.bannerPosition = 50"
                    >
                      Center
                    </button>
                  </div>
                  <input
                    id="banner-position"
                    v-model.number="form.bannerPosition"
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    :disabled="!canManage"
                    class="mt-1.5 w-full accent-brand-600 disabled:opacity-50"
                    aria-label="Banner vertical position"
                  >
                  <div class="flex justify-between text-[10px] uppercase tracking-wide text-surface-400">
                    <span>Top</span>
                    <span>Bottom</span>
                  </div>
                </div>
              </div>

              <!-- Asset upload error -->
              <p v-if="assetError" class="text-xs text-danger-600 dark:text-danger-400">{{ assetError }}</p>

              <!-- Name note -->
              <div class="flex items-start gap-2 rounded-lg bg-surface-50 dark:bg-surface-800/50 px-3 py-2.5">
                <Lock class="size-3.5 text-surface-400 shrink-0 mt-0.5" />
                <p class="text-xs text-surface-500 dark:text-surface-400">
                  Your company name comes from your
                  <NuxtLink :to="localePath('/dashboard/settings/general')" class="font-medium text-brand-600 dark:text-brand-400 hover:underline no-underline">organization profile</NuxtLink>.
                </p>
              </div>
            </div>
          </section>

          <!-- Content -->
          <section class="rounded-xl border border-surface-200 dark:border-surface-800 overflow-hidden">
            <div class="px-4 py-3 border-b border-surface-100 dark:border-surface-800">
              <h2 class="text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">Content</h2>
            </div>
            <div class="px-4 py-4 space-y-4">
              <!-- Headline -->
              <label class="flex flex-col gap-1">
                <span class="text-sm font-medium text-surface-700 dark:text-surface-300">Headline</span>
                <input
                  v-model="form.headline"
                  type="text"
                  maxlength="140"
                  placeholder="Open roles at your company"
                  class="w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                >
                <span class="text-xs text-surface-400">{{ form.headline.length }}/140</span>
              </label>

              <!-- Description -->
              <label class="flex flex-col gap-1">
                <span class="text-sm font-medium text-surface-700 dark:text-surface-300">About your company</span>
                <textarea
                  v-model="form.description"
                  rows="4"
                  maxlength="1000"
                  placeholder="A short intro for candidates visiting your page."
                  class="w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors resize-y"
                />
                <span class="text-xs text-surface-400">{{ form.description.length }}/1000</span>
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
