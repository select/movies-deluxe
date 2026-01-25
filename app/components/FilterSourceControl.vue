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
        <AppInputCheckbox v-model="archiveOrgSelected">
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
            v-model="getChannelSelected(channel.name).value"
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
const { filters: storeFilters } = storeToRefs(movieStore)

const injectedFilters = inject(FILTER_STATE_KEY, null)
const filters = injectedFilters || storeFilters

const channels = ref<ChannelOption[]>([])
const isLoading = ref(true)

// Helper computed properties for v-model binding
const archiveOrgSelected = computed({
  get: () => filters.value.sources.includes('archive.org'),
  set: (value: boolean) => {
    if (value) {
      filters.value.sources = [...filters.value.sources, 'archive.org']
    } else {
      filters.value.sources = filters.value.sources.filter((s: string) => s !== 'archive.org')
    }
  },
})

const getChannelSelected = (channelName: string) => {
  return computed({
    get: () => filters.value.sources.includes(channelName),
    set: (value: boolean) => {
      if (value) {
        filters.value.sources = [...filters.value.sources, channelName]
      } else {
        filters.value.sources = filters.value.sources.filter((s: string) => s !== channelName)
      }
    },
  })
}

const fetchChannels = async () => {
  isLoading.value = true
  try {
    const options = await movieStore.getFilterOptions()
    channels.value = options.channels
  } catch {
    // Error handled by UI
  } finally {
    isLoading.value = false
  }
}

const clearSources = () => {
  filters.value.sources = []
}

onMounted(() => {
  fetchChannels()
})
</script>
