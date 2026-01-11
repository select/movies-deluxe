<template>
  <div class="space-y-4">
    <!-- Loading state -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-8 space-y-2">
      <div class="i-mdi-loading animate-spin text-2xl text-theme-primary"></div>
      <span class="text-xs text-theme-textmuted">Loading sources...</span>
    </div>

    <!-- Content -->
    <div v-else class="space-y-4">
      <!-- Archive.org -->
      <div class="space-y-2">
        <AppInputCheckbox
          :checked="filters.sources.includes('archive.org')"
          @change="toggleSource('archive.org')"
        >
          <span class="flex items-center justify-between gap-2 flex-1">
            <span class="text-sm font-medium text-theme-text">Archive.org</span>
          </span>
        </AppInputCheckbox>
      </div>

      <!-- YouTube Channels -->
      <div class="space-y-3">
        <div class="text-[10px] font-bold text-theme-textmuted uppercase tracking-widest pl-1">
          YouTube Channels
        </div>
        <div
          class="pl-2 space-y-2 border-l-2 border-theme-border/30 max-h-[250px] overflow-y-auto scrollbar-thin pr-2"
        >
          <AppInputCheckbox
            v-for="channel in channels"
            :key="channel.id"
            :checked="filters.sources.includes(channel.name)"
            @change="toggleSource(channel.name)"
          >
            <span class="flex items-center justify-between gap-2 flex-1">
              <span class="text-sm text-theme-text">{{ channel.name }}</span>
              <span class="text-[10px] text-theme-textmuted font-medium">
                {{ formatCount(channel.count) }}
              </span>
            </span>
          </AppInputCheckbox>
        </div>
      </div>

      <!-- Actions -->
      <div
        v-if="filters.sources.length > 0"
        class="flex justify-end pt-2 border-t border-theme-border/30"
      >
        <button
          class="text-xs text-theme-primary hover:underline font-medium"
          @click="clearSources"
        >
          Clear ({{ filters.sources.length }})
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChannelOption } from '~/types'

const movieStore = useMovieStore()
const { filters } = storeToRefs(movieStore)
const { toggleSource, setSources } = movieStore

const channels = ref<ChannelOption[]>([])
const isLoading = ref(true)

const fetchChannels = async () => {
  isLoading.value = true
  try {
    const db = useDatabase()
    const options = await db.getFilterOptions()
    channels.value = options.channels
  } catch (err) {
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

const clearSources = () => {
  setSources([])
}

onMounted(() => {
  fetchChannels()
})
</script>
