<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <label class="block text-sm font-bold text-theme-textmuted uppercase tracking-wider">
        Select Collection
      </label>
      <button
        class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
        @click="showCreateModal = true"
      >
        <div class="i-mdi-plus" />
        Create New
      </button>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="collection in collectionsList"
        :key="collection.id"
        class="relative group"
      >
        <button
          class="w-full text-left p-4 rounded-xl border transition-all h-full"
          :class="[
            selectedId === collection.id
              ? 'bg-blue-600/10 border-blue-600 ring-2 ring-blue-600/20'
              : 'bg-theme-surface border-theme-border hover:border-theme-textmuted',
          ]"
          @click="select(collection.id)"
        >
          <div class="flex items-center justify-between mb-2 pr-12">
            <span
              class="font-bold text-lg truncate"
              :class="selectedId === collection.id ? 'text-blue-600 dark:text-blue-400' : ''"
            >
              {{ collection.name }}
            </span>
            <div
              v-if="selectedId === collection.id"
              class="i-mdi-check-circle text-blue-600 text-xl flex-shrink-0"
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

        <!-- Management Actions (Visible on hover or if selected) -->
        <div
          class="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          :class="{ 'opacity-100': selectedId === collection.id }"
        >
          <button
            class="p-1.5 hover:bg-theme-selection rounded-lg text-blue-500 transition-colors"
            title="Edit Collection"
            @click.stop="editCollection(collection)"
          >
            <div class="i-mdi-pencil text-lg" />
          </button>
          <button
            class="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-red-500 transition-colors"
            title="Delete Collection"
            @click.stop="confirmDelete(collection)"
          >
            <div class="i-mdi-delete text-lg" />
          </button>
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div
      v-if="showCreateModal || editingCollection"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <div
        class="bg-theme-surface rounded-2xl w-full max-w-lg shadow-2xl border border-theme-border overflow-hidden"
      >
        <div class="p-6 border-b border-theme-border flex items-center justify-between">
          <h3 class="text-xl font-bold">
            {{ editingCollection ? 'Edit Collection' : 'Create New Collection' }}
          </h3>
          <button
            class="p-2 hover:bg-theme-selection rounded-full transition-colors"
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
              class="w-full px-4 py-2 rounded-lg border border-theme-border bg-theme-surface text-sm font-mono"
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
              class="w-full px-4 py-2 rounded-lg border border-theme-border bg-theme-surface text-sm"
              required
            >
          </div>
          <div>
            <label class="block text-sm font-bold mb-1">Description</label>
            <textarea
              v-model="form.description"
              rows="3"
              placeholder="Describe this collection..."
              class="w-full px-4 py-2 rounded-lg border border-theme-border bg-theme-surface text-sm"
            />
          </div>

          <div class="pt-4 flex gap-3">
            <button
              type="button"
              class="flex-1 px-4 py-2 border border-theme-border rounded-lg font-bold hover:bg-theme-selection transition-colors"
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
  </div>
</template>

<script setup lang="ts">
import type { Collection } from '~/types'

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

// Management Logic
const showCreateModal = ref(false)
const editingCollection = ref<Collection | null>(null)
const isSaving = ref(false)

const form = reactive({
  id: '',
  name: '',
  description: '',
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

    const response = await $fetch<{ success: boolean; collection: Collection }>(endpoint, {
      method: 'POST',
      body: form,
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
  if (
    !confirm(
      `Are you sure you want to delete the collection "${collection.name}"? This cannot be undone.`
    )
  ) {
    return
  }

  try {
    const response = await $fetch<{ success: boolean }>('/api/admin/collections/delete', {
      method: 'POST',
      body: { id: collection.id },
    })

    if (response.success) {
      if (selectedId.value === collection.id) {
        selectedId.value = ''
        emit('select', '')
      }
      await collectionsStore.loadCollections()
    }
  } catch {
    // Error handled by store
  }
}

onMounted(async () => {
  if (!collectionsStore.isLoaded) {
    await collectionsStore.loadCollections()
  }
})
</script>
