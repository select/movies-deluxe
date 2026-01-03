<template>
  <div class="space-y-4">
    <label class="block text-sm font-bold text-theme-textmuted uppercase tracking-wider">Select Collection</label>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <button
        v-for="collection in collectionsList"
        :key="collection.id"
        class="text-left p-4 rounded-xl border transition-all"
        :class="[
          selectedId === collection.id
            ? 'bg-blue-600/10 border-blue-600 ring-2 ring-blue-600/20'
            : 'bg-theme-surface border-theme-border hover:border-theme-textmuted',
        ]"
        @click="select(collection.id)"
      >
        <div class="flex items-center justify-between mb-2">
          <span
            class="font-bold text-lg"
            :class="selectedId === collection.id ? 'text-blue-600 dark:text-blue-400' : ''"
          >
            {{ collection.name }}
          </span>
          <div
            v-if="selectedId === collection.id"
            class="i-mdi-check-circle text-blue-600 text-xl"
          />
        </div>
        <p class="text-xs text-theme-textmuted line-clamp-1 mb-2">
          {{ collection.description || 'No description' }}
        </p>
        <div class="flex items-center gap-2 text-xs font-mono bg-theme-bg/50 px-2 py-1 rounded w-fit">
          <div class="i-mdi-movie" />
          {{ collection.movieIds.length }} movies
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const collectionsStore = useCollectionsStore()
const { collections } = storeToRefs(collectionsStore)

const collectionsList = computed(() => Array.from(collections.value.values()))
const selectedId = ref('')

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

const select = (id: string) => {
  selectedId.value = id
  emit('select', id)
}

onMounted(async () => {
  if (!collectionsStore.isLoaded) {
    await collectionsStore.loadCollections()
  }
})
</script>
