<script setup lang="ts">
import { Menu, Moon, Sun, X } from 'lucide-vue-next'

defineProps<{
  activePage?: 'home' | 'features' | 'pricing' | 'jobs' | 'roadmap' | 'blog' | 'docs'
  compact?: boolean
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const { data: session } = await authClient.useSession(useFetch)
const { isDark, toggle: toggleColorMode } = useColorMode()
const route = useRoute()
const mobileMenuOpen = ref(false)

const navLinks = computed(() => [
  { to: localePath('/pricing'), label: t('home.nav.pricing'), page: 'pricing' },
  { to: localePath('/jobs'), label: t('home.nav.openPositions'), page: 'jobs' },
])

watch(() => route.fullPath, () => {
  mobileMenuOpen.value = false
})
</script>

<template>
  <nav class="fixed inset-x-0 top-0 z-50 border-b border-surface-200/80 dark:border-white/[0.06] bg-white/90 dark:bg-[#09090b]/90 backdrop-blur-xl">
    <div
      class="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6"
      :class="compact ? 'h-12' : 'h-14'"
    >
      <NuxtLink
        :to="localePath('/')"
        class="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-surface-900 dark:text-white"
      >
        <img
          src="/eagle-mascot-logo-128.png"
          alt="Reqcore mascot"
          width="28"
          height="28"
          loading="eager"
          decoding="sync"
          class="h-7 w-7 object-contain"
        />
        Reqcore
      </NuxtLink>

      <!-- Center nav links (desktop) -->
      <div class="hidden items-center gap-1 md:flex">
        <NuxtLink
          v-for="link in navLinks"
          :key="link.to"
          :to="link.to"
          class="rounded-md px-3 py-1.5 text-[13px] font-medium transition"
          :class="activePage === link.page ? 'text-surface-900 dark:text-white bg-surface-100 dark:bg-white/[0.06]' : 'text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white hover:bg-surface-100 dark:hover:bg-white/[0.04]'"
        >
          {{ link.label }}
        </NuxtLink>
      </div>

      <!-- Right: session actions + language switcher -->
      <div class="flex items-center gap-2">
        <ClientOnly>
          <button
            class="inline-flex items-center justify-center size-8 rounded-lg text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-white hover:bg-surface-100 dark:hover:bg-white/10 transition-all duration-200 cursor-pointer border-0 bg-transparent"
            :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="toggleColorMode"
          >
            <Sun v-if="isDark" class="size-4" />
            <Moon v-else class="size-4" />
          </button>
          <template #fallback>
            <div class="size-8" aria-hidden="true" />
          </template>
        </ClientOnly>
        <LanguageSwitcher />
        <template v-if="session?.user">
          <NuxtLink
            :to="localePath('/dashboard')"
            class="rounded-md bg-surface-900 dark:bg-white px-3.5 py-1.5 text-[13px] font-semibold text-white dark:text-[#09090b] transition hover:bg-surface-800 dark:hover:bg-white/90"
          >
            {{ t('home.nav.dashboard') }}
          </NuxtLink>
        </template>
        <template v-else>
          <NuxtLink
            :to="localePath('/auth/sign-in')"
            class="hidden rounded-md px-3 py-1.5 text-[13px] font-medium text-surface-500 dark:text-surface-400 transition hover:text-surface-900 dark:hover:text-white sm:inline-flex"
          >
            {{ t('home.nav.logIn') }}
          </NuxtLink>
          <NuxtLink
            :to="localePath('/auth/sign-up')"
            class="rounded-md bg-surface-900 dark:bg-white px-3.5 py-1.5 text-[13px] font-semibold text-white dark:text-[#09090b] transition hover:bg-surface-800 dark:hover:bg-white/90"
          >
            {{ t('home.nav.signUp') }}
          </NuxtLink>
        </template>
        <button
          class="inline-flex size-8 items-center justify-center rounded-lg border-0 bg-transparent text-surface-500 transition hover:bg-surface-100 hover:text-surface-700 dark:text-surface-400 dark:hover:bg-white/10 dark:hover:text-white md:hidden"
          :title="mobileMenuOpen ? 'Close navigation' : 'Open navigation'"
          :aria-expanded="mobileMenuOpen"
          aria-controls="public-mobile-nav"
          @click="mobileMenuOpen = !mobileMenuOpen"
        >
          <X v-if="mobileMenuOpen" class="size-4" />
          <Menu v-else class="size-4" />
        </button>
      </div>
    </div>
    <div
      v-if="mobileMenuOpen"
      id="public-mobile-nav"
      class="border-t border-surface-200/80 bg-white px-4 py-3 shadow-sm dark:border-white/[0.06] dark:bg-[#09090b] md:hidden"
    >
      <div class="mx-auto flex max-w-6xl flex-col gap-1">
        <NuxtLink
          v-for="link in navLinks"
          :key="`mobile-${link.to}`"
          :to="link.to"
          class="rounded-md px-3 py-2 text-sm font-medium transition"
          :class="activePage === link.page ? 'bg-surface-100 text-surface-900 dark:bg-white/[0.06] dark:text-white' : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900 dark:text-surface-300 dark:hover:bg-white/[0.06] dark:hover:text-white'"
        >
          {{ link.label }}
        </NuxtLink>
      </div>
    </div>
  </nav>
</template>
