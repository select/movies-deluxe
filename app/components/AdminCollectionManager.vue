<template>
  <section class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-bold flex items-center gap-2">
        <div class="i-mdi:movie-roll-multiple text-blue-600" />
        Collection Management
      </h2>
      <button
        class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
        @click="showCreateModal = true"
      >
        <div class="i-mdi-plus" />
        Create Collection
      </button>
    </div>

    <!-- Collections List -->
    <div class="grid grid-cols-1 gap-4">
      <div
        v-for="collection in collectionsList"
        :key="collection.id"
        class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <h3 class="font-bold text-lg">
              {{ collection.name }}
            </h3>
            <span class="text-xs font-mono text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
              {{ collection.id }}
            </span>
          </div>
          <p class="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
            {{ collection.description }}
          </p>
          <div class="flex items-center gap-4 mt-2 text-xs text-gray-400">
            <span class="flex items-center gap-1">
              <div class="i-mdi-movie" />
              {{ collection.movieIds.length }} movies
            </span>
            <span class="flex items-center gap-1">
              <div class="i-mdi-clock-outline" />
              Updated {{ formatDate(collection.updatedAt) }}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <NuxtLink
            :to="`/collections/${collection.id}`"
            class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 transition-colors"
            title="View Collection"
          >
            <div class="i-mdi-eye text-xl" />
          </NuxtLink>
          <button
            class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-blue-500 transition-colors"
            title="Edit Collection"
            @click="editCollection(collection)"
          >
            <div class="i-mdi-pencil text-xl" />
          </button>
          <button
            class="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-red-500 transition-colors"
            title="Delete Collection"
            @click="confirmDelete(collection)"
          >
            <div class="i-mdi-delete text-xl" />
          </button>
        </div>
      </div>

      <div
        v-if="collectionsList.length === 0"
        class="py-12 text-center text-gray-500 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl"
      >
        No collections found. Create one to get started.
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div
      v-if="showCreateModal || editingCollection"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div class="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 class="text-xl font-bold">
            {{ editingCollection ? 'Edit Collection' : 'Create New Collection' }}
          </h3>
          <button
            class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            @click="closeModal"
          >
            <div class="i-mdi-close text-xl" />
          </button>
        </div>

        <form
          class="p-6 space-y-4"
          @submit.prevent="saveCollection"
        >
          <div>
            <label class="block text-sm font-bold mb-1">ID (URL Slug)</label>
            <input
              v-model="form.id"
              type="text"
              placeholder="e.g. charlie-chaplin"
              class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-mono"
              :disabled="!!editingCollection"
              required
            >
          </div>
          <div>
            <label class="block text-sm font-bold mb-1">Name</label>
            <input
              v-model="form.name"
              type="text"
              placeholder="e.g. Charlie Chaplin"
              class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              required
            >
          </div>
          <div>
            <label class="block text-sm font-bold mb-1">Description</label>
            <textarea
              v-model="form.description"
              rows="3"
              placeholder="Describe this collection..."
              class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
            />
          </div>

          <div class="pt-4 flex gap-3">
            <button
              type="button"
              class="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              @click="closeModal"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-500 transition-colors disabled:opacity-50"
              :disabled="isSaving"
            >
              <div
                v-if="isSaving"
                class="i-mdi-loading animate-spin mx-auto"
              />
              <span v-else>{{ editingCollection ? 'Update' : 'Create' }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const collectionsStore = useCollectionsStore()
const { collections } = storeToRefs(collectionsStore)

const collectionsList = computed(() => Array.from(collections.value.values()))

const showCreateModal = ref(false)
const editingCollection = ref<Collection | null>(null)
const isSaving = ref(false)

const form = reactive({
  id: '',
  name: '',
  description: ''
})

const editCollection = (collection: Collection) => {
  editingCollection.value = collection
  form.id = collection.id
  form.name = collection.name
  form.description = collection.description
}

const closeModal = () => {
  showCreateModal.value = false
  editingCollection.value = null
  form.id = ''
  form.name = ''
  form.description = ''
}

const saveCollection = async () => {
  isSaving.value = true
  try {
    const endpoint = editingCollection.value
      ? '/api/admin/collections/update'
      : '/api/admin/collections/create'

    const response = await $fetch<{ success: boolean, collection: Collection }>(endpoint, {
      method: 'POST',
      body: form
    })

    if (response.success) {
      await collectionsStore.loadCollections()
      closeModal()
    }
  } catch {
    // Error handled by store
  } finally {
    isSaving.value = false
  }
}

const confirmDelete = async (collection: Collection) => {
  if (!confirm(`Are you sure you want to delete the collection "${collection.name}"? This cannot be undone.`)) {
    return
  }

  try {
    const response = await $fetch<{ success: boolean }>('/api/admin/collections/delete', {
      method: 'POST',
      body: { id: collection.id }
    })

    if (response.success) {
      await collectionsStore.loadCollections()
    }
  } catch {
    // Error handled by store
  }
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

onMounted(() => {
  collectionsStore.loadCollections()
})
</script>
