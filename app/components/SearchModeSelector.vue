<template>
  <div class="flex items-center gap-0.5 p-1 bg-theme-surface/30 rounded-xl relative group/modes">
    <!-- Hover Background Shape -->
    <div
      class="absolute bg-theme-primary/10 rounded-lg transition-all duration-300 ease-out pointer-events-none opacity-0 group-hover/modes:opacity-100"
      :style="hoverStyle"
    ></div>

    <button
      v-for="mode in modes"
      :key="mode.id"
      ref="modeButtons"
      class="group relative z-10 p-2 rounded-lg transition-all duration-200 flex items-center justify-center"
      :class="[
        filters.searchMode === mode.id
          ? 'text-theme-primary'
          : isSemanticDisabled(mode.id)
            ? 'text-theme-textmuted/50 cursor-not-allowed'
            : 'text-theme-textmuted hover:text-theme-text',
      ]"
      :disabled="isSemanticDisabled(mode.id)"
      :aria-label="`Search mode: ${mode.label}`"
      @click="selectMode(mode.id)"
      @mouseenter="updateHover(mode.id)"
      @mouseleave="clearHover"
    >
      <!-- Loading spinner for semantic mode -->
      <div
        v-if="mode.id === 'semantic' && isEmbeddingsLoading"
        class="i-mdi-loading animate-spin text-xl md:text-2xl"
      ></div>
      <div v-else :class="mode.icon" class="text-xl md:text-2xl"></div>

      <!-- Tooltip -->
      <div
        class="absolute top-full mt-3 px-3 py-2 bg-theme-surface border border-theme-border shadow-2xl rounded-xl text-xs w-56 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 z-50 translate-y-2 group-hover:translate-y-0 left-0 md:left-1/2 md:-translate-x-1/2 text-left"
      >
        <div class="flex items-center gap-2 mb-1">
          <div :class="mode.icon" class="text-theme-primary text-base"></div>
          <div class="font-bold text-theme-text">{{ mode.label }}</div>
        </div>
        <div class="text-theme-textmuted leading-relaxed">{{ mode.description }}</div>

        <!-- Loading state message (for semantic) -->
        <div
          v-if="mode.id === 'semantic' && isEmbeddingsLoading"
          class="mt-2 pt-2 border-t border-theme-border/50"
        >
          <div class="flex items-center gap-2 text-theme-warning">
            <div class="i-mdi-loading animate-spin text-sm"></div>
            <span>Loading embeddings...</span>
          </div>
        </div>

        <!-- Not loaded message (for semantic) -->
        <div
          v-else-if="mode.id === 'semantic' && !isEmbeddingsLoaded"
          class="mt-2 pt-2 border-t border-theme-border/50"
        >
          <div class="flex items-center gap-2 text-theme-textmuted">
            <div class="i-mdi-information-outline text-sm"></div>
            <span>Embeddings not loaded</span>
          </div>
        </div>

        <!-- Model Info (only for semantic when loaded) -->
        <div
          v-else-if="mode.id === 'semantic' && modelInfo"
          class="mt-2 pt-2 border-t border-theme-border/50 space-y-1"
        >
          <div class="flex justify-between items-center">
            <span class="text-theme-textmuted">Model:</span>
            <span class="text-theme-text font-medium">{{ modelInfo.name }}</span>
          </div>
          <div class="flex justify-between items-center text-[10px]">
            <span class="text-theme-textmuted">Dimensions:</span>
            <span class="text-theme-text">{{ modelInfo.dimensions }}</span>
          </div>
          <div class="flex justify-between items-center text-[10px]">
            <span class="text-theme-textmuted">Source:</span>
            <span class="text-theme-text">Browser (WebGPU/WASM)</span>
          </div>
        </div>

        <!-- Arrow -->
        <div
          class="absolute -top-1 w-2 h-2 bg-theme-surface border-t border-l border-theme-border rotate-45 left-4 md:left-1/2 md:-translate-x-1/2"
        ></div>
      </div>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { SearchMode } from '~/types'
import type { EmbeddingModelConfig } from '~~/config/embedding-models'

const movieStore = useMovieStore()
const { filters: storeFilters, isEmbeddingsLoaded, isEmbeddingsLoading } = storeToRefs(movieStore)

const db = useDatabase()
const modelInfo = ref<EmbeddingModelConfig | null>(null)

const injectedFilters = inject(FILTER_STATE_KEY, null)
const filters = injectedFilters || storeFilters

const modes = [
  {
    id: 'exact' as SearchMode,
    label: 'Exact',
    icon: 'i-mdi-alphabetical',
    description: 'Traditional search. Matches exact words in titles, actors, or descriptions.',
  },
  {
    id: 'semantic' as SearchMode,
    label: 'Semantic',
    icon: 'i-mdi-sparkles',
    description: 'AI-powered search. Understands meaning and concepts (e.g., "space travel").',
  },
]

const modeButtons = ref<HTMLButtonElement[]>([])
const hoveredMode = ref<string | null>(null)
const hoverStyle = ref({
  left: '0px',
  width: '0px',
  height: '0px',
  top: '0px',
})

/**
 * Check if semantic mode should be disabled
 */
const isSemanticDisabled = (modeId: SearchMode): boolean => {
  return modeId === 'semantic' && !isEmbeddingsLoaded.value
}

const selectMode = (mode: SearchMode) => {
  // Don't allow selecting semantic mode if embeddings aren't loaded
  if (isSemanticDisabled(mode)) {
    return
  }
  filters.value.searchMode = mode
}

onMounted(async () => {
  modelInfo.value = await db.getEmbeddingModelInfo()
})

const updateHover = (modeId: string) => {
  hoveredMode.value = modeId
  const index = modes.findIndex(m => m.id === modeId)
  const el = modeButtons.value[index]
  if (el) {
    hoverStyle.value = {
      left: `${el.offsetLeft}px`,
      width: `${el.offsetWidth}px`,
      height: `${el.offsetHeight}px`,
      top: `${el.offsetTop}px`,
    }
  }
}

const clearHover = () => {
  hoveredMode.value = null
}

// Ensure hover style is updated if buttons move (e.g. on resize)
const { width } = useWindowSize()
watch(width, () => {
  if (hoveredMode.value) {
    updateHover(hoveredMode.value)
  }
})
</script>
