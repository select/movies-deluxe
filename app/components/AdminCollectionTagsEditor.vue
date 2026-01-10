<template>
  <div class="space-y-4">
    <label class="block text-sm font-bold text-theme-textmuted uppercase tracking-wider">
      Collection Tags
    </label>

    <div
      class="flex flex-wrap gap-2 p-3 bg-theme-surface border border-theme-border rounded-xl min-h-[50px]"
    >
      <div
        v-for="tag in tags"
        :key="tag"
        class="flex items-center gap-1.5 px-3 py-1 bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-600/20 rounded-full text-sm font-medium group"
      >
        {{ tag }}
        <button
          class="p-0.5 hover:bg-blue-600/20 rounded-full transition-colors"
          @click="removeTag(tag)"
        >
          <div class="i-mdi-close text-xs"></div>
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
          @focus="showSuggestions = true"
          @blur="handleBlur"
        />

        <!-- Suggestions Dropdown -->
        <div
          v-if="showSuggestions && filteredSuggestions.length > 0"
          class="absolute z-10 left-0 right-0 mt-2 bg-theme-surface border border-theme-border rounded-lg shadow-xl max-h-48 overflow-y-auto"
        >
          <button
            v-for="suggestion in filteredSuggestions"
            :key="suggestion"
            class="w-full text-left px-4 py-2 text-sm hover:bg-theme-selection transition-colors"
            @mousedown.prevent="selectSuggestion(suggestion)"
          >
            {{ suggestion }}
          </button>
        </div>
      </div>
    </div>

    <div class="flex justify-end">
      <button
        class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
        :disabled="!hasChanges || isSaving"
        @click="saveTags"
      >
        <div v-if="isSaving" class="i-mdi-loading animate-spin"></div>
        <div v-else class="i-mdi-content-save"></div>
        Save Tags
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  collectionId: string
  initialTags?: string[]
}>()

const collectionsStore = useCollectionsStore()
const { collections } = storeToRefs(collectionsStore)

const tags = ref<string[]>([...(props.initialTags || [])])
const newTag = ref('')
const isSaving = ref(false)
const showSuggestions = ref(false)

const hasChanges = computed(() => {
  const initial = props.initialTags || []
  if (tags.value.length !== initial.length) return true
  return tags.value.some((t, i) => t !== initial[i])
})

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

const filteredSuggestions = computed(() => {
  const query = newTag.value.toLowerCase().trim()
  return allExistingTags.value.filter(
    t => t.toLowerCase().includes(query) && !tags.value.includes(t)
  )
})

const addTag = () => {
  const tag = newTag.value.trim()
  if (tag && !tags.value.includes(tag)) {
    tags.value.push(tag)
    newTag.value = ''
  }
}

const removeTag = (tag: string) => {
  tags.value = tags.value.filter(t => t !== tag)
}

const handleBackspace = () => {
  if (newTag.value === '' && tags.value.length > 0) {
    tags.value.pop()
  }
}

const selectSuggestion = (suggestion: string) => {
  if (!tags.value.includes(suggestion)) {
    tags.value.push(suggestion)
  }
  newTag.value = ''
  showSuggestions.value = false
}

const handleBlur = () => {
  // Small delay to allow mousedown on suggestions
  setTimeout(() => {
    showSuggestions.value = false
  }, 200)
}

const saveTags = async () => {
  isSaving.value = true
  try {
    const success = await collectionsStore.updateCollectionTags(props.collectionId, tags.value)
    if (success) {
      // Success toast or notification could be added here
    }
  } finally {
    isSaving.value = false
  }
}

// Watch for prop changes
watch(
  () => props.initialTags,
  newVal => {
    tags.value = [...(newVal || [])]
  },
  { deep: true }
)
</script>
