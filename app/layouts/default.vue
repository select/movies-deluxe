<template>
  <div class="min-h-screen bg-theme-background text-theme-text transition-colors duration-300">
    <!-- Header -->
    <MovieHeader @open-filters="isFilterMenuOpen = true" />

    <!-- Sidebar (responsive: vertical on desktop, horizontal on mobile) -->
    <Sidebar @open-filters="isFilterMenuOpen = true" />

    <!-- Filter Menu -->
    <FilterMenu
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
</script>
