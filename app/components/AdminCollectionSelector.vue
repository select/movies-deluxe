<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <label class="block text-sm font-bold text-theme-textmuted uppercase tracking-wider">
          Select Collection
        </label>
        <span class="px-2 py-0.5 bg-theme-background border border-theme-border rounded text-[10px] font-mono text-theme-textmuted">
          {{ visibleCollectionsCount }}/{{ collectionsList.length }}
        </span>
      </div>
      <button
        class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
        @click="showCreateModal = true"
      >
        <div class="i-mdi-plus" />
        Create New
      </button>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="collection in collectionsList"
        :key="collection.id"
        class="px-4 py-2 rounded-xl border transition-all text-sm font-bold flex items-center gap-2"
        :class="[
          selectedId === collection.id
            ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20'
            : 'bg-theme-surface border-theme-border hover:border-theme-textmuted text-theme-text',
          collection.enabled === false ? 'opacity-60' : ''
        ]"
        @click="select(collection.id)"
      >
        {{ collection.name }}
        <div 
          v-if="collection.enabled === false"
          class="i-mdi-eye-off text-xs opacity-70"
        />
      </button>
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

          <!-- Tags Editor -->
          <div>
            <label class="block text-sm font-bold mb-1">Tags</label>
            <div class="flex flex-wrap gap-2 p-3 bg-theme-background border border-theme-border rounded-lg min-h-[50px]">
              <div
                v-for="tag in form.tags"
                :key="tag"
                class="flex items-center gap-1.5 px-3 py-1 bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-600/20 rounded-full text-sm font-medium group"
              >
                {{ tag }}
                <button
                  type="button"
                  class="p-0.5 hover:bg-blue-600/20 rounded-full transition-colors"
                  @click="removeTag(tag)"
                >
                  <div class="i-mdi-close text-xs" />
                </button>
              </div>

              <div class="relative flex-1 min-w-[120px]">
                <input
                  v-model="newTag"
                  type="text"
                  placeholder="Add tag..."
                  class="w-full bg-transparent border-none focus:ring-0 text-sm py-1"
                  @keydown.enter.prevent="addTag"
                  @keydown.backspace="handleBackspace"
                  @focus="showTagSuggestions = true"
                  @blur="handleTagBlur"
                >

                <!-- Suggestions Dropdown -->
                <div
                  v-if="showTagSuggestions && filteredTagSuggestions.length > 0"
                  class="absolute z-10 left-0 right-0 mt-2 bg-theme-surface border border-theme-border rounded-lg shadow-xl max-h-48 overflow-y-auto"
                >
                  <button
                    v-for="suggestion in filteredTagSuggestions"
                    :key="suggestion"
                    type="button"
                    class="w-full text-left px-4 py-2 text-sm hover:bg-theme-selection transition-colors"
                    @mousedown.prevent="selectTagSuggestion(suggestion)"
                  >
                    {{ suggestion }}
                  </button>
                </div>
              </div>
            </div>
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
const visibleCollectionsCount = computed(() => collectionsList.value.filter(c => c.enabled !== false).length)
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
  tags: [] as string[],
})

const newTag = ref('')
const showTagSuggestions = ref(false)

// Get all existing tags from all collections for suggestions
const allExistingTags = computed(() => {
  const allTags = new Set<string>()
  collections.value.forEach(c => {
    if (c.tags) {
      c.tags.forEach(t => allTags.add(t))
    }
  })
  return Array.from(allTags).sort()
})

const filteredTagSuggestions = computed(() => {
  const query = newTag.value.toLowerCase().trim()
  return allExistingTags.value.filter(t =>
    t.toLowerCase().includes(query) && !form.tags.includes(t)
  )
})

const addTag = () => {
  const tag = newTag.value.trim()
  if (tag && !form.tags.includes(tag)) {
    form.tags.push(tag)
    newTag.value = ''
  }
}

const removeTag = (tag: string) => {
  form.tags = form.tags.filter(t => t !== tag)
}

const handleBackspace = () => {
  if (newTag.value === '' && form.tags.length > 0) {
    form.tags.pop()
  }
}

const selectTagSuggestion = (suggestion: string) => {
  if (!form.tags.includes(suggestion)) {
    form.tags.push(suggestion)
  }
  newTag.value = ''
  showTagSuggestions.value = false
}

const handleTagBlur = () => {
  // Small delay to allow mousedown on suggestions
  setTimeout(() => {
    showTagSuggestions.value = false
  }, 200)
}

const editCollection = (collection: Collection) => {
  editingCollection.value = collection
  form.id = collection.id
  form.name = collection.name
  form.description = collection.description
  form.tags = [...(collection.tags || [])]
}

const closeModal = () => {
  showCreateModal.value = false
  editingCollection.value = null
  form.id = ''
  form.name = ''
  form.description = ''
  form.tags = []
  newTag.value = ''
  showTagSuggestions.value = false
}

const saveCollection = async () => {
  isSaving.value = true
  try {
    if (editingCollection.value) {
      // Use unified update endpoint
      const response = await $fetch<{ success: boolean; collection: Collection }>(
        '/api/admin/collections/update-collection',
        {
          method: 'POST',
          body: {
            collectionId: form.id,
            updates: {
              name: form.name,
              description: form.description,
              tags: { action: 'set', values: form.tags },
            },
          },
        }
      )

      if (response.success) {
        await collectionsStore.loadCollections()
        closeModal()
      }
    } else {
      // Create new collection
      const response = await $fetch<{ success: boolean; collection: Collection }>(
        '/api/admin/collections/create',
        {
          method: 'POST',
          body: form,
        }
      )

      if (response.success) {
        await collectionsStore.loadCollections()
        closeModal()
      }
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

const toggleEnabled = async (collection: Collection) => {
  const newEnabledState = collection.enabled === false
  try {
    const response = await $fetch<{ success: boolean; collection: Collection }>(
      '/api/admin/collections/update-collection',
      {
        method: 'POST',
        body: {
          collectionId: collection.id,
          updates: {
            enabled: newEnabledState,
          },
        },
      }
    )

    if (response.success) {
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
defineExpose({
  editCollection,
  toggleEnabled,
  confirmDelete,
  openCreateModal: () => showCreateModal.value = true
})
</script>
