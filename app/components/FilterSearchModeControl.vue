<template>
  <div class="p-2 min-w-[240px]">
    <div class="space-y-1">
      <button
        v-for="mode in modes"
        :key="mode.id"
        class="w-full flex items-start gap-3 p-3 rounded-xl transition-all text-left group"
        :class="[
          filters.searchMode === mode.id
            ? 'bg-theme-primary/10 text-theme-primary'
            : 'hover:bg-theme-surface text-theme-textmuted hover:text-theme-text',
        ]"
        @click="selectMode(mode.id)"
      >
        <div
          :class="[
            mode.icon,
            'text-xl mt-0.5',
            filters.searchMode === mode.id
              ? 'text-theme-primary'
              : 'text-theme-textmuted group-hover:text-theme-text',
          ]"
        ></div>
        <div class="flex-1 min-w-0">
          <div class="font-bold text-sm flex items-center gap-2">
            {{ mode.label }}
            <div v-if="filters.searchMode === mode.id" class="i-mdi-check text-theme-primary"></div>
          </div>
          <div class="text-xs opacity-70 leading-relaxed mt-0.5">
            {{ mode.description }}
          </div>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const movieStore = useMovieStore()
const { filters } = storeToRefs(movieStore)

const modes = [
  {
    id: 'keyword' as SearchMode,
    label: 'Keyword',
    icon: 'i-mdi-alphabetical',
    description: 'Traditional search. Matches exact words in titles, actors, or descriptions.',
  },
  {
    id: 'semantic' as SearchMode,
    label: 'Semantic',
    icon: 'i-mdi-brain',
    description: 'AI-powered search. Understands meaning and concepts (e.g., "space travel").',
  },
  {
    id: 'hybrid' as SearchMode,
    label: 'Hybrid',
    icon: 'i-mdi-auto-fix',
    description: 'Best of both worlds. Combines keyword precision with semantic understanding.',
  },
]

const selectMode = (mode: SearchMode) => {
  filters.value.searchMode = mode
}
</script>
