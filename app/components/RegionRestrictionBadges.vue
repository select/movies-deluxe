<template>
  <div v-if="allowedCodes.length > 0 || blockedCodes.length > 0" class="space-y-2">
    <!-- Allowed regions -->
    <div v-if="allowedCodes.length > 0" class="flex flex-wrap items-center gap-1.5">
      <span
        class="text-xs font-medium text-theme-textmuted mr-1 flex items-center gap-1 select-none"
      >
        <span class="i-mdi-earth text-sm text-emerald-600 dark:text-emerald-400"></span>
        Available in
      </span>
      <span
        v-for="code in visibleAllowed"
        :key="`allowed-${code}`"
        :title="getRegionName(code)"
        class="group/badge relative inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold tracking-wide bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 cursor-default select-none"
      >
        {{ code }}
        <span
          class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap opacity-0 group-hover/badge:opacity-100 transition-opacity pointer-events-none glass text-theme-text border border-theme-border/40 shadow-sm z-20"
        >
          {{ getRegionName(code) }}
        </span>
      </span>
      <button
        v-if="allowedCodes.length > COLLAPSE_THRESHOLD"
        type="button"
        class="px-2 py-0.5 rounded text-[11px] font-medium text-theme-textmuted hover:text-theme-text bg-theme-surface border border-theme-border/50 hover:bg-theme-selection transition-colors cursor-pointer"
        @click="isAllowedExpanded = !isAllowedExpanded"
      >
        {{ isAllowedExpanded ? 'Show less' : `+${allowedCodes.length - COLLAPSE_THRESHOLD} more` }}
      </button>
    </div>

    <!-- Blocked regions -->
    <div v-if="blockedCodes.length > 0" class="flex flex-wrap items-center gap-1.5">
      <span
        class="text-xs font-medium text-theme-textmuted mr-1 flex items-center gap-1 select-none"
      >
        <span class="i-mdi-earth-off text-sm text-red-600 dark:text-red-400"></span>
        Blocked in
      </span>
      <span
        v-for="code in visibleBlocked"
        :key="`blocked-${code}`"
        :title="getRegionName(code)"
        class="group/badge relative inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold tracking-wide bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/25 cursor-default select-none"
      >
        {{ code }}
        <span
          class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap opacity-0 group-hover/badge:opacity-100 transition-opacity pointer-events-none glass text-theme-text border border-theme-border/40 shadow-sm z-20"
        >
          {{ getRegionName(code) }}
        </span>
      </span>
      <button
        v-if="blockedCodes.length > COLLAPSE_THRESHOLD"
        type="button"
        class="px-2 py-0.5 rounded text-[11px] font-medium text-theme-textmuted hover:text-theme-text bg-theme-surface border border-theme-border/50 hover:bg-theme-selection transition-colors cursor-pointer"
        @click="isBlockedExpanded = !isBlockedExpanded"
      >
        {{ isBlockedExpanded ? 'Show less' : `+${blockedCodes.length - COLLAPSE_THRESHOLD} more` }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { YouTubeRegionRestriction } from '#shared/types/movie'
import { getRegionName } from '~/utils/regionNames'

const COLLAPSE_THRESHOLD = 14

const props = defineProps<{
  regionRestriction: YouTubeRegionRestriction
}>()

const isAllowedExpanded = ref(false)
const isBlockedExpanded = ref(false)

watch(
  () => props.regionRestriction,
  () => {
    isAllowedExpanded.value = false
    isBlockedExpanded.value = false
  }
)

const allowedCodes = computed(() =>
  (props.regionRestriction.allowed || []).map(code => code.trim().toUpperCase()).filter(Boolean)
)

const blockedCodes = computed(() =>
  (props.regionRestriction.blocked || []).map(code => code.trim().toUpperCase()).filter(Boolean)
)

const visibleAllowed = computed(() =>
  isAllowedExpanded.value ? allowedCodes.value : allowedCodes.value.slice(0, COLLAPSE_THRESHOLD)
)

const visibleBlocked = computed(() =>
  isBlockedExpanded.value ? blockedCodes.value : blockedCodes.value.slice(0, COLLAPSE_THRESHOLD)
)
</script>
