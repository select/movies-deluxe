<template>
  <!-- Desktop: Vertical Sidebar (left side) -->
  <aside
    class="hidden md:block fixed left-4 top-1/2 -translate-y-1/2 z-40 glass shadow-2xl rounded-full w-12 border-theme-border/30"
  >
    <div class="flex flex-col items-center gap-2 py-2">
      <!-- Home -->
      <NuxtLink
        to="/"
        class="p-2 hover:bg-theme-selection rounded-full transition-colors relative group"
        title="Home"
        :class="{ 'bg-theme-primary/20': route.path === '/' }"
      >
        <div class="i-mdi-home text-xl"></div>
      </NuxtLink>

      <!-- Search -->
      <NuxtLink
        to="/search"
        class="p-2 hover:bg-theme-selection rounded-full transition-colors relative group"
        title="Search (Shift+S)"
        :class="{ 'bg-theme-primary/20': route.path === '/search' }"
        @click="handleSearchClick"
      >
        <div
          class="i-mdi-magnify text-xl"
          :class="{ 'text-theme-primary': route.path === '/search' }"
        ></div>
      </NuxtLink>

      <!-- Liked Movies -->
      <NuxtLink
        to="/liked"
        class="p-2 hover:bg-theme-selection rounded-full transition-colors relative group"
        title="Liked Movies"
        :class="{ 'bg-theme-accent/20': route.path === '/liked' }"
      >
        <div
          class="i-mdi-heart text-xl"
          :class="{ 'text-theme-accent': route.path === '/liked' }"
        ></div>
        <span
          v-if="likedCount > 0"
          class="absolute top-0 -right-1 bg-theme-accent text-white text-xs rounded-full size-4 flex items-center justify-center font-medium"
        >
          {{ likedCount > 99 ? '99+' : likedCount }}
        </span>
      </NuxtLink>

      <!-- Collections -->
      <NuxtLink
        to="/collections"
        class="p-2 hover:bg-theme-selection rounded-full transition-colors relative group"
        title="Collections"
        :class="{ 'bg-theme-primary/20': route.path.startsWith('/collections') }"
      >
        <div
          class="i-mdi:movie-roll text-xl"
          :class="{ 'text-theme-primary': route.path.startsWith('/collections') }"
        ></div>
      </NuxtLink>

      <!-- Admin (localhost only) -->
      <NuxtLink
        v-if="isDev"
        to="/admin"
        class="p-2 hover:bg-theme-selection rounded-full transition-colors relative group"
        title="Admin"
        :class="{ 'bg-theme-accent/20': route.path.startsWith('/admin') }"
      >
        <div
          class="i-mdi-shield-crown text-xl"
          :class="{ 'text-theme-accent': route.path.startsWith('/admin') }"
        ></div>
      </NuxtLink>

      <!-- Dark Mode Toggle -->
      <button
        class="p-2 hover:bg-theme-selection rounded-full transition-colors"
        title="Theme Selection"
        @click="openThemeSelection"
      >
        <div v-if="isDark" class="i-material-symbols-light-wb-sunny text-xl"></div>
        <div v-else class="i-material-symbols-light-dark-mode text-xl"></div>
      </button>

      <!-- GitHub Link -->
      <a
        href="https://github.com/select/movies-deluxe"
        target="_blank"
        rel="noopener noreferrer"
        class="p-2 hover:bg-theme-selection rounded-full transition-colors"
        title="View on GitHub"
      >
        <div class="i-mdi-github text-xl"></div>
      </a>
    </div>
  </aside>

  <!-- Mobile: Horizontal Sidebar (bottom center) -->
  <aside
    class="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50 glass shadow-2xl rounded-full h-14 border-theme-border/30 max-w-[calc(100vw-2rem)] flex items-center group/sidebar"
  >
    <!-- Left Scroll Indicator -->
    <button
      v-if="canScrollLeft"
      class="absolute left-1 z-10 p-1 rounded-full bg-theme-surface/80 backdrop-blur-sm text-theme-textmuted animate-pulse hover:bg-theme-selection transition-colors"
      aria-label="Scroll left"
      @click="scroll('left')"
    >
      <div class="i-mdi-chevron-left text-lg"></div>
    </button>

    <div
      ref="scrollContainer"
      class="flex items-center gap-1 px-2 h-full overflow-x-auto scrollbar-hidden scroll-smooth"
      @scroll="updateScrollState"
    >
      <!-- Search -->
      <NuxtLink
        to="/search"
        class="p-2 hover:bg-theme-selection rounded-full transition-colors relative flex-shrink-0"
        aria-label="Search"
        :class="{ 'bg-theme-primary/20': route.path === '/search' }"
        @click="handleSearchClick"
      >
        <div
          class="i-mdi-magnify text-2xl"
          :class="{ 'text-theme-primary': route.path === '/search' }"
        ></div>
      </NuxtLink>

      <!-- Home -->
      <NuxtLink
        to="/"
        class="p-2 hover:bg-theme-selection rounded-full transition-colors relative flex-shrink-0"
        aria-label="Home"
        :class="{ 'bg-theme-primary/20': route.path === '/' }"
      >
        <div class="i-mdi-home text-2xl"></div>
      </NuxtLink>

      <!-- Liked Movies -->

      <NuxtLink
        to="/liked"
        class="p-2 hover:bg-theme-selection rounded-full transition-colors relative group flex-shrink-0"
        aria-label="Liked Movies"
        :class="{ 'bg-theme-accent/20': route.path === '/liked' }"
      >
        <div
          class="i-mdi-heart text-2xl"
          :class="{ 'text-theme-accent': route.path === '/liked' }"
        ></div>
        <span
          v-if="likedCount > 0"
          class="absolute -top-1 -right-1 bg-theme-accent text-white text-xs rounded-full size-5 flex items-center justify-center font-medium"
        >
          {{ likedCount > 99 ? '99+' : likedCount }}
        </span>
      </NuxtLink>

      <!-- Collections -->
      <NuxtLink
        to="/collections"
        class="p-2 hover:bg-theme-selection rounded-full transition-colors relative group flex-shrink-0"
        aria-label="Collections"
        :class="{ 'bg-theme-primary/20': route.path.startsWith('/collections') }"
      >
        <div
          class="i-mdi:movie-roll text-2xl"
          :class="{ 'text-theme-primary': route.path.startsWith('/collections') }"
        ></div>
      </NuxtLink>

      <!-- Admin (localhost only) -->
      <NuxtLink
        v-if="isDev"
        to="/admin"
        class="p-2 hover:bg-theme-selection rounded-full transition-colors relative group flex-shrink-0"
        aria-label="Admin"
        :class="{ 'bg-theme-accent/20': route.path.startsWith('/admin') }"
      >
        <div
          class="i-mdi-shield-crown text-2xl"
          :class="{ 'text-theme-accent': route.path.startsWith('/admin') }"
        ></div>
      </NuxtLink>

      <!-- Dark Mode Toggle -->
      <button
        class="p-2 hover:bg-theme-selection rounded-full transition-colors flex-shrink-0"
        aria-label="Theme Selection"
        @click="openThemeSelection"
      >
        <div v-if="isDark" class="i-material-symbols-light-wb-sunny text-2xl"></div>
        <div v-else class="i-material-symbols-light-dark-mode text-2xl"></div>
      </button>

      <!-- GitHub Link -->
      <a
        href="https://github.com/select/movies-deluxe"
        target="_blank"
        rel="noopener noreferrer"
        class="p-2 hover:bg-theme-selection rounded-full transition-colors flex-shrink-0"
        aria-label="View on GitHub"
      >
        <div class="i-mdi-github text-2xl"></div>
      </a>
    </div>

    <!-- Right Scroll Indicator -->
    <button
      v-if="canScrollRight"
      class="absolute right-1 z-10 p-1 rounded-full bg-theme-surface/80 backdrop-blur-sm text-theme-textmuted animate-pulse hover:bg-theme-selection transition-colors"
      aria-label="Scroll right"
      @click="scroll('right')"
    >
      <div class="i-mdi-chevron-right text-lg"></div>
    </button>
  </aside>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  openThemeSelection: []
}>()

const movieStore = useMovieStore()
const { likedCount } = storeToRefs(movieStore)

const uiStore = useUiStore()
const { setSearchOpen } = uiStore
const { isDark } = storeToRefs(uiStore)

const route = useRoute()

const isDev = ref(false)

const scrollContainer = ref<HTMLElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)

const updateScrollState = () => {
  if (!scrollContainer.value) return
  const { scrollLeft, scrollWidth, clientWidth } = scrollContainer.value
  canScrollLeft.value = scrollLeft > 5
  canScrollRight.value = scrollLeft + clientWidth < scrollWidth - 5
}

onMounted(() => {
  isDev.value = isLocalhost()
  updateScrollState()
  window.addEventListener('resize', updateScrollState)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateScrollState)
})

const openThemeSelection = () => {
  emit('openThemeSelection')
}

const scroll = (direction: 'left' | 'right') => {
  if (!scrollContainer.value) return
  const scrollAmount = 100
  scrollContainer.value.scrollBy({
    left: direction === 'left' ? -scrollAmount : scrollAmount,
    behavior: 'smooth',
  })
}

const handleSearchClick = async () => {
  // Navigate to search page if not already there
  if (route.path !== '/search') {
    await navigateTo('/search')
  }
  // Open search header
  setSearchOpen(true)
}
</script>
