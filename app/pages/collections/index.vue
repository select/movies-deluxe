<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Header -->
    <div class="mb-10">
      <h1 class="text-3xl font-black text-theme-text mb-2 tracking-tight">
        Collections
      </h1>
      <p class="text-theme-text-muted max-w-2xl leading-relaxed">
        Curated sets of movies organized by theme, actor, or genre.
      </p>
    </div>

    <!-- Loading State -->
    <div
      v-if="isLoading"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
    >
      <div
        v-for="i in 4"
        :key="i"
        class="h-64 rounded-2xl bg-theme-surface border border-theme-border/50 animate-pulse"
      />
    </div>

    <!-- Empty State -->
    <div
      v-else-if="collectionsList.length === 0"
      class="flex flex-col items-center justify-center py-20 text-center"
    >
      <div class="i-mdi-folder-open text-6xl text-theme-text-muted mb-4 opacity-20" />
      <h3 class="text-xl font-bold text-theme-text mb-2">
        No collections found
      </h3>
      <p class="text-theme-text-muted">
        Check back later for curated movie collections.
      </p>
    </div>

    <!-- Collections Grid -->
    <div
      v-else
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
    >
      <CollectionCard
        v-for="collection in collectionsList"
        :key="collection.id"
        :collection="collection"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
const collectionsStore = useCollectionsStore()
const { isLoading, collections } = storeToRefs(collectionsStore)

const collectionsList = computed(() => Array.from(collections.value.values()))

onMounted(() => {
  collectionsStore.loadCollections()
})

useHead({
  title: 'Collections - Movies Deluxe',
  meta: [
    { name: 'description', content: 'Curated movie collections from Movies Deluxe.' }
  ]
})
</script>
