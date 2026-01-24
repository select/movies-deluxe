<template>
  <div class="min-h-screen bg-theme-background text-theme-text transition-colors duration-300">
    <!-- Header -->
    <MovieHeader />

    <!-- Sidebar (responsive: vertical on desktop, horizontal on mobile) -->
    <AppSidebar @open-theme-selection="isThemeMenuOpen = true" />

    <!-- Theme Menu -->
    <ThemeMenu :is-open="isThemeMenuOpen" @close="isThemeMenuOpen = false" />

    <!-- Page Content with mobile bottom padding for navigation clearance -->
    <div class="pb-24 md:pb-0">
      <slot></slot>
    </div>

    <!-- Toast Container -->
    <AppToastContainer />
  </div>
</template>

<script setup lang="ts">
import { useMagicKeys, whenever, onKeyStroke } from '@vueuse/core'

// Menu state
const isThemeMenuOpen = ref(false)

// Keyboard shortcuts
const keys = useMagicKeys()
const { Escape } = keys

// Escape key closes menus
if (Escape) {
  whenever(Escape, () => {
    if (isThemeMenuOpen.value) {
      isThemeMenuOpen.value = false
    }
  })
}

// 'K' key navigates to search page (with Ctrl/Cmd modifier)
onKeyStroke('k', e => {
  if (e.ctrlKey || e.metaKey) {
    const activeElement = window.document.activeElement
    const isTyping = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA'

    if (!isTyping) {
      e.preventDefault()
      navigateTo('/search')
    }
  }
})

// 'S' key or '/' key opens search (navigates to search page)
onKeyStroke(['s', 'S', '/'], e => {
  const activeElement = window.document.activeElement
  const isTyping = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA'

  if (!isTyping) {
    // Only 'S' without modifiers or just '/'
    if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      navigateTo('/search')
    } else if (e.key === '/') {
      e.preventDefault()
      navigateTo('/search')
    }
  }
})
</script>
