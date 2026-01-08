<template>
  <div class="min-h-screen bg-theme-background text-theme-text transition-colors duration-300">
    <!-- Sliding Search Header -->
    <SearchHeader />

    <!-- Header -->
    <MovieHeader />

    <!-- Sidebar (responsive: vertical on desktop, horizontal on mobile) -->
    <Sidebar
      @open-filters="isFilterMenuOpen = true"
      @open-theme-selection="openThemeSelection"
    />

    <!-- Filter Menu -->
    <FilterMenu
      ref="filterMenuRef"
      :is-open="isFilterMenuOpen"
      @close="isFilterMenuOpen = false"
    />

    <!-- Page Content -->
    <slot />

    <!-- Toast Container -->
    <AppToastContainer />
  </div>
</template>

<script setup lang="ts">
import { useMagicKeys, whenever, onKeyStroke } from '@vueuse/core'

// Filter menu state (shared across all pages)
const isFilterMenuOpen = ref(false)
const filterMenuRef = ref()

/**
 * Open filter menu and scroll to theme section
 */
const openThemeSelection = () => {
  isFilterMenuOpen.value = true
  
  // Wait for menu to open and then scroll
  nextTick(() => {
    setTimeout(() => {
      filterMenuRef.value?.scrollToThemeSection()
    }, 300) // Match menu transition duration
  })
}

// Keyboard shortcuts
const keys = useMagicKeys()
const { Escape } = keys

// Escape key closes filter menu
if (Escape) {
  whenever(Escape, () => {
    if (isFilterMenuOpen.value) {
      isFilterMenuOpen.value = false
    }
  })
}

// 'K' key toggles filter menu (with Ctrl/Cmd modifier)
onKeyStroke('k', (e) => {
  if (e.ctrlKey || e.metaKey) {
    const activeElement = window.document.activeElement
    const isTyping = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA'
    
    if (!isTyping) {
      e.preventDefault()
      isFilterMenuOpen.value = !isFilterMenuOpen.value
    }
  }
})

const { setSearchOpen } = useUiStore()

// 'S' key or '/' key opens search
onKeyStroke(['s', 'S', '/'], (e) => {
  const activeElement = window.document.activeElement
  const isTyping =
    activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA'

  if (!isTyping) {
    // Only 'S' without modifiers or just '/'
    if (
      (e.key === 's' || e.key === 'S') &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault()
      if (useRoute().path !== '/search') {
        navigateTo('/search')
      }
      setSearchOpen(true)
    } else if (e.key === '/') {
      e.preventDefault()
      if (useRoute().path !== '/search') {
        navigateTo('/search')
      }
      setSearchOpen(true)
    }
  }
})
</script>
