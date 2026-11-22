<template>
  <main class="md:ml-16">
    <div class="px-4 lg:px-[6%] py-8">
      <!-- Header with Search -->
      <div class="mb-10 flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
        <div class="flex-1">
          <h1 class="text-3xl font-black text-theme-text mb-2 tracking-tight">Collections</h1>
          <p class="text-theme-textmuted max-w-2xl leading-relaxed">
            Curated sets of movies organized by theme, actor, or genre.
          </p>
          <div
            v-if="searchQuery && filteredCollections.length === 0"
            class="mt-3 text-sm text-theme-textmuted"
          >
            No collections found matching "{{ searchQuery }}"
          </div>
          <div v-else-if="searchQuery" class="mt-3 text-sm text-theme-textmuted">
            Found {{ filteredCollections.length }} collection{{
              filteredCollections.length === 1 ? '' : 's'
            }}
          </div>
        </div>

        <!-- Search Bar -->
        <div v-if="collections.size > 0" class="relative w-full md:w-64 md:flex-shrink-0">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <div class="i-mdi-magnify text-lg text-theme-textmuted"></div>
          </div>
          <input
            v-model="searchQuery"
            type="text"
            class="block w-full pl-10 pr-10 py-2 bg-theme-surface/50 border border-theme-border/50 focus:border-theme-primary rounded-full text-sm text-theme-text placeholder-theme-textmuted focus:outline-none transition-all focus:bg-theme-surface"
            placeholder="Search..."
          />
          <button
            v-if="searchQuery"
            class="absolute inset-y-0 right-0 pr-3 flex items-center"
            @click="searchQuery = ''"
          >
            <div
              class="i-mdi-close text-base text-theme-textmuted hover:text-theme-text transition-colors"
            ></div>
          </button>
        </div>
      </div>

      <!-- Minimal Jump-to-Category Bar -->
      <nav
        v-if="!isLoading && !searchQuery && categorizedSections.length > 1"
        aria-label="Jump to category"
        class="mb-8 flex flex-wrap items-center gap-2"
      >
        <button
          v-for="section in categorizedSections"
          :key="section.slug"
          type="button"
          class="px-3 py-1 rounded-full text-xs font-medium bg-theme-surface/60 hover:bg-theme-primary hover:text-white text-theme-textmuted border border-theme-border/50 transition-colors flex items-center gap-1.5"
          @click="jumpToCategory(section.slug)"
        >
          <span>{{ section.name }}</span>
          <span class="opacity-60 font-mono text-[11px]">{{ section.items.length }}</span>
        </button>
      </nav>

      <!-- Loading State -->
      <div
        v-if="isLoading"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
      >
        <CollectionCardSkeleton v-for="i in 8" :key="i" />
      </div>

      <!-- Empty State -->
      <div
        v-else-if="collections.size === 0"
        class="flex flex-col items-center justify-center py-20 text-center"
      >
        <div class="i-mdi:movie-roll text-6xl text-theme-textmuted mb-4 opacity-20"></div>
        <h3 class="text-xl font-bold text-theme-text mb-2">No collections found</h3>
        <p class="text-theme-textmuted">Check back later for curated movie collections.</p>
      </div>

      <!-- Search Results Flat Grid -->
      <div
        v-else-if="searchQuery.trim()"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
      >
        <CollectionCard
          v-for="collection in filteredCollections"
          :key="collection.id"
          :collection="collection"
        />
      </div>

      <!-- Categorized Collections Sections -->
      <div v-else class="space-y-10">
        <section
          v-for="section in categorizedSections"
          :id="`category-${section.slug}`"
          :key="section.slug"
          class="scroll-mt-8"
        >
          <div class="flex items-baseline gap-2 mb-4 border-b border-theme-border/30 pb-1.5">
            <h2 class="text-xs font-semibold uppercase tracking-widest text-theme-textmuted/80">
              {{ section.name }}
            </h2>
            <span class="text-[11px] font-mono text-theme-textmuted/50">
              {{ section.items.length }}
            </span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <CollectionCard
              v-for="collection in section.items"
              :key="collection.id"
              :collection="collection"
            />
          </div>
        </section>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import Fuse from 'fuse.js'
import { storeToRefs } from '#imports'
import { useCollectionsStore } from '~/stores/useCollectionsStore'
import { ref, computed, onMounted } from 'vue'
import { useRuntimeConfig, useHead } from '#app'
import CollectionCardSkeleton from '~/components/CollectionCardSkeleton.vue'
import CollectionCard from '~/components/CollectionCard.vue'

import type { Collection } from '#shared/types/collections'

const { isLoading, collections } = storeToRefs(useCollectionsStore())
const { loadCollections } = useCollectionsStore()

const searchQuery = ref('')

const CATEGORY_ORDER = [
  'Featured',
  'Directors',
  'Icons & Legends',
  'Genres',
  'Themes & Creatures',
  'Decades',
  'Other',
]

function slugifyCategory(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function jumpToCategory(slug: string) {
  const el = document.getElementById(`category-${slug}`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// Filter collections based on search query and enabled status
const filteredCollections = computed(() => {
  const allCollections = Array.from(collections.value.values()).filter(c => c.enabled !== false)

  if (!searchQuery.value.trim()) {
    // No search query - just filter out disabled collections
    return allCollections.filter(c => c.enabled !== false)
  }

  // Create a fuse instance with all collections for search
  const fuse = new Fuse(allCollections, {
    keys: [
      { name: 'name', weight: 2 },
      { name: 'description', weight: 1 },
      { name: 'tags', weight: 1.5 },
    ],
    threshold: 0.3,
    ignoreLocation: true,
  })

  // Search all collections, then filter out disabled ones from results
  const results = fuse.search(searchQuery.value)
  return results.map(result => result.item)
})

const categorizedSections = computed(() => {
  const groups = new Map<string, Collection[]>()
  for (const col of filteredCollections.value) {
    const cat = col.category || 'Other'
    const list = groups.get(cat) || []
    list.push(col)
    groups.set(cat, list)
  }

  return Array.from(groups.entries())
    .sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a[0])
      const ib = CATEGORY_ORDER.indexOf(b[0])
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
    .map(([name, items]) => ({
      name,
      slug: slugifyCategory(name),
      items,
    }))
})

onMounted(() => {
  loadCollections()
})

const {
  public: { siteUrl },
} = useRuntimeConfig()

useHead({
  title: 'Collections - Movies Deluxe',
  meta: [
    { name: 'description', content: 'Curated movie collections from Movies Deluxe.' },
    // Open Graph
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: 'Movies Deluxe' },
    { property: 'og:title', content: 'Collections - Movies Deluxe' },
    { property: 'og:description', content: 'Curated movie collections from Movies Deluxe.' },
    { property: 'og:url', content: `${siteUrl}/collections` },
    // Twitter Card
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: 'Collections - Movies Deluxe' },
    { name: 'twitter:description', content: 'Curated movie collections from Movies Deluxe.' },
  ],
})
</script>
