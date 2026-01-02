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
        title="All Movies"
        :class="{ 'bg-theme-primary/20': route.path === '/' }"
      >
        <div class="i-mdi-home text-xl" />
      </NuxtLink>

      <!-- Search -->
      <button
        class="p-2 hover:bg-theme-selection rounded-full transition-colors relative group"
        title="Search (Shift+S)"
        @click="handleSearchClick"
      >
        <div class="i-mdi-magnify text-xl" />
      </button>

      <!-- Liked Movies -->
      <NuxtLink
        to="/liked"
        class="p-2 hover:bg-theme-selection rounded-full transition-colors relative group"
        title="Liked Movies"
        :class="{ 'bg-theme-accent/20': route.path === '/liked' }"
      >
        <div class="i-mdi-heart text-xl" :class="{ 'text-theme-accent': route.path === '/liked' }" />
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
        <div class="i-mdi:movie-roll text-xl" :class="{ 'text-theme-primary': route.path.startsWith('/collections') }" />
      </NuxtLink>

      <!-- Dark Mode Toggle -->
      <button
        class="p-2 hover:bg-theme-selection rounded-full transition-colors"
        title="Theme Selection"
        @click="openThemeSelection"
      >
        <div
          v-if="isDark"
          class="i-material-symbols-light-wb-sunny text-xl "
        />
        <div
          v-else
          class="i-material-symbols-light-dark-mode text-xl "
        />
      </button>

      <!-- Filters -->
      <div class="relative group">
        <button
          class="p-2 hover:bg-theme-selection rounded-full transition-colors relative"
          title="Filters"
          :class="{ 'bg-theme-primary/20': activeFiltersCount > 0 }"
          @click="openFilters"
        >
          <div class="i-mdi-filter-variant text-xl" :class="{ 'text-theme-primary': activeFiltersCount > 0 }" />
          <span
            v-if="activeFiltersCount > 0"
            class="absolute top-0 -right-1 bg-theme-primary text-white text-xs rounded-full size-4 flex items-center justify-center font-medium"
          >
            {{ activeFiltersCount > 9 ? '9+' : activeFiltersCount }}
          </span>
        </button>

        <!-- Clear Filters Button (appears on hover when filters are active) -->
        <button
          v-if="activeFiltersCount > 0"
          class="absolute -top-1 -right-1 size-5 rounded-full bg-theme-surface/90 backdrop-blur-sm border border-theme-border shadow-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-theme-accent/20 hover:border-theme-accent z-10"
          title="Clear all filters"
          @click.stop="clearFilters"
        >
          <div class="i-mdi-close text-xs text-theme-textmuted hover:text-theme-accent" />
        </button>
      </div>

      <!-- GitHub Link -->
      <a
        href="https://github.com/select/movies-deluxe"
        target="_blank"
        rel="noopener noreferrer"
        class="p-2 hover:bg-theme-selection rounded-full transition-colors"
        title="View on GitHub"
      >
        <div class="i-mdi-github text-xl" />
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
      <div class="i-mdi-chevron-left text-lg" />
    </button>

    <div
      ref="scrollContainer"
      class="flex items-center gap-1 px-2 h-full overflow-x-auto scrollbar-hidden scroll-smooth"
      @scroll="updateScrollState"
    >
      <!-- Search -->
      <button
        class="p-2 hover:bg-theme-selection rounded-full transition-colors relative flex-shrink-0"
        aria-label="Search"
        @click="handleSearchClick"
      >
        <div class="i-mdi-magnify text-2xl" />
      </button>

      <!-- Home -->
      <NuxtLink
        to="/"
        class="p-2 hover:bg-theme-selection rounded-full transition-colors relative flex-shrink-0"
        aria-label="All Movies"
        :class="{ 'bg-theme-primary/20': route.path === '/' }"
      >
        <div class="i-mdi-home text-2xl" />
      </NuxtLink>

      <!-- Liked Movies -->

      <NuxtLink
        to="/liked"
        class="p-2 hover:bg-theme-selection rounded-full transition-colors relative group flex-shrink-0"
        aria-label="Liked Movies"
        :class="{ 'bg-theme-accent/20': route.path === '/liked' }"
      >
        <div class="i-mdi-heart text-2xl" :class="{ 'text-theme-accent': route.path === '/liked' }" />
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
        <div class="i-mdi:movie-roll text-2xl" :class="{ 'text-theme-primary': route.path.startsWith('/collections') }" />
      </NuxtLink>

      <!-- Dark Mode Toggle -->
      <button
        class="p-2 hover:bg-theme-selection rounded-full transition-colors flex-shrink-0"
        aria-label="Theme Selection"
        @click="openThemeSelection"
      >
        <div
          v-if="isDark"
          class="i-material-symbols-light-wb-sunny text-2xl text-theme-accent"
        />
        <div
          v-else
          class="i-material-symbols-light-dark-mode text-2xl text-theme-primary"
        />
      </button>

      <!-- Filters -->
      <div class="relative group flex-shrink-0">
        <button
          class="p-2 hover:bg-theme-selection rounded-full transition-colors relative"
          aria-label="Filters"
          :class="{ 'bg-theme-primary/20': activeFiltersCount > 0 }"
          @click="openFilters"
        >
          <div class="i-mdi-filter-variant text-2xl" :class="{ 'text-theme-primary': activeFiltersCount > 0 }" />
          <span
            v-if="activeFiltersCount > 0"
            class="absolute -top-1 -right-1 bg-theme-primary text-white text-xs rounded-full size-5 flex items-center justify-center font-medium"
          >
            {{ activeFiltersCount > 9 ? '9+' : activeFiltersCount }}
          </span>
        </button>

        <!-- Clear Filters Button (appears on hover when filters are active) -->
        <button
          v-if="activeFiltersCount > 0"
          class="absolute -top-1 -right-1 size-6 rounded-full bg-theme-surface/90 backdrop-blur-sm border border-theme-border shadow-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-theme-accent/20 hover:border-theme-accent z-10"
          aria-label="Clear all filters"
          @click.stop="clearFilters"
        >
          <div class="i-mdi-close text-sm text-theme-textmuted hover:text-theme-accent" />
        </button>
      </div>

      <!-- GitHub Link -->
      <a
        href="https://github.com/select/movies-deluxe"
        target="_blank"
        rel="noopener noreferrer"
        class="p-2 hover:bg-theme-selection rounded-full transition-colors flex-shrink-0"
        aria-label="View on GitHub"
      >
        <div class="i-mdi-github text-2xl" />
      </a>
    </div>

    <!-- Right Scroll Indicator -->
    <button
      v-if="canScrollRight"
      class="absolute right-1 z-10 p-1 rounded-full bg-theme-surface/80 backdrop-blur-sm text-theme-textmuted animate-pulse hover:bg-theme-selection transition-colors"
      aria-label="Scroll right"
      @click="scroll('right')"
    >
      <div class="i-mdi-chevron-right text-lg" />
    </button>
  </aside>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  openFilters: []
  openThemeSelection: []
}>()

const movieStore = useMovieStore()
const { likedCount, activeFiltersCount } = storeToRefs(movieStore)

const uiStore = useUiStore()
const { setSearchOpen } = uiStore
const { isDark } = storeToRefs(uiStore)

const route = useRoute()

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
  updateScrollState()
  window.addEventListener('resize', updateScrollState)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateScrollState)
})

// Watch for changes in active filters count as it might change width
watch(activeFiltersCount, () => {
  nextTick(updateScrollState)
})

const openFilters = () => {
  emit('openFilters')
}

const openThemeSelection = () => {
  emit('openThemeSelection')
}

const clearFilters = () => {
  movieStore.resetFilters()
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
  // Navigate to home page if not already there
  if (route.path !== '/') {
    await navigateTo('/')
  }
  // Open search header
  setSearchOpen(true)
}
</script>
