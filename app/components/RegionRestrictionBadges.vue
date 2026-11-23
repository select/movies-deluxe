<template>
  <div
    v-if="allowedCodes.length > 0 || blockedCodes.length > 0"
    :class="compact ? 'space-y-1' : 'space-y-2'"
  >
    <!-- Allowed regions -->
    <div
      v-if="allowedCodes.length > 0"
      class="flex flex-wrap items-center"
      :class="compact ? 'gap-1' : 'gap-1.5'"
    >
      <span
        class="font-medium text-theme-textmuted flex items-center gap-1 select-none"
        :class="compact ? 'text-[10px]' : 'text-xs mr-1'"
      >
        <span
          class="i-mdi-earth text-emerald-600 dark:text-emerald-400"
          :class="compact ? 'text-xs' : 'text-sm'"
        ></span>
        {{ compact ? 'Only:' : 'Available in' }}
      </span>
      <span
        v-for="code in visibleAllowed"
        :key="`allowed-${code}`"
        :title="getRegionName(code)"
        class="group/badge relative inline-flex items-center rounded font-semibold tracking-wide bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 cursor-default select-none"
        :class="compact ? 'px-1 py-0.5 text-[10px] leading-none' : 'px-1.5 py-0.5 text-[11px]'"
      >
        {{ code }}
        <span
          class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap opacity-0 group-hover/badge:opacity-100 transition-opacity pointer-events-none glass text-theme-text border border-theme-border/40 shadow-sm z-20"
        >
          {{ getRegionName(code) }}
        </span>
      </span>
      <button
        v-if="compact && allowedCodes.length > effectiveLimit"
        type="button"
        :title="`Select source to view all ${allowedCodes.length} regions`"
        class="px-1.5 py-0.5 rounded text-[10px] leading-none font-medium text-theme-textmuted hover:text-theme-text bg-theme-surface border border-theme-border/50 hover:bg-theme-selection transition-colors cursor-pointer"
        @click="emit('selectSource')"
      >
        +{{ allowedCodes.length - effectiveLimit }}
      </button>
      <button
        v-else-if="!compact && allowedCodes.length > effectiveLimit"
        type="button"
        class="px-2 py-0.5 rounded text-[11px] font-medium text-theme-textmuted hover:text-theme-text bg-theme-surface border border-theme-border/50 hover:bg-theme-selection transition-colors cursor-pointer"
        @click="isAllowedExpanded = !isAllowedExpanded"
      >
        {{ isAllowedExpanded ? 'Show less' : `+${allowedCodes.length - effectiveLimit} more` }}
      </button>
    </div>

    <!-- Blocked regions -->
    <div
      v-if="blockedCodes.length > 0"
      class="flex flex-wrap items-center"
      :class="compact ? 'gap-1' : 'gap-1.5'"
    >
      <span
        class="font-medium text-theme-textmuted flex items-center gap-1 select-none"
        :class="compact ? 'text-[10px]' : 'text-xs mr-1'"
      >
        <span
          class="i-mdi-earth-off text-red-600 dark:text-red-400"
          :class="compact ? 'text-xs' : 'text-sm'"
        ></span>
        {{ compact ? 'Blocked:' : 'Blocked in' }}
      </span>
      <span
        v-for="code in visibleBlocked"
        :key="`blocked-${code}`"
        :title="getRegionName(code)"
        class="group/badge relative inline-flex items-center rounded font-semibold tracking-wide bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/25 cursor-default select-none"
        :class="compact ? 'px-1 py-0.5 text-[10px] leading-none' : 'px-1.5 py-0.5 text-[11px]'"
      >
        {{ code }}
        <span
          class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap opacity-0 group-hover/badge:opacity-100 transition-opacity pointer-events-none glass text-theme-text border border-theme-border/40 shadow-sm z-20"
        >
          {{ getRegionName(code) }}
        </span>
      </span>
      <button
        v-if="compact && blockedCodes.length > effectiveLimit"
        type="button"
        :title="`Select source to view all ${blockedCodes.length} regions`"
        class="px-1.5 py-0.5 rounded text-[10px] leading-none font-medium text-theme-textmuted hover:text-theme-text bg-theme-surface border border-theme-border/50 hover:bg-theme-selection transition-colors cursor-pointer"
        @click="emit('selectSource')"
      >
        +{{ blockedCodes.length - effectiveLimit }}
      </button>
      <button
        v-else-if="!compact && blockedCodes.length > effectiveLimit"
        type="button"
        class="px-2 py-0.5 rounded text-[11px] font-medium text-theme-textmuted hover:text-theme-text bg-theme-surface border border-theme-border/50 hover:bg-theme-selection transition-colors cursor-pointer"
        @click="isBlockedExpanded = !isBlockedExpanded"
      >
        {{ isBlockedExpanded ? 'Show less' : `+${blockedCodes.length - effectiveLimit} more` }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { YouTubeRegionRestriction } from '#shared/types/movie'
import { getRegionName } from '~/utils/regionNames'

const DEFAULT_LIMIT = 14
const DEFAULT_COMPACT_LIMIT = 5

const props = withDefaults(
  defineProps<{
    regionRestriction: YouTubeRegionRestriction
    compact?: boolean
    maxVisible?: number
  }>(),
  {
    compact: false,
    maxVisible: undefined,
  }
)

const emit = defineEmits<{
  selectSource: []
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

const effectiveLimit = computed(
  () => props.maxVisible ?? (props.compact ? DEFAULT_COMPACT_LIMIT : DEFAULT_LIMIT)
)

const allowedCodes = computed(() =>
  (props.regionRestriction.allowed || []).map(code => code.trim().toUpperCase()).filter(Boolean)
)

const blockedCodes = computed(() =>
  (props.regionRestriction.blocked || []).map(code => code.trim().toUpperCase()).filter(Boolean)
)

const visibleAllowed = computed(() =>
  !props.compact && isAllowedExpanded.value
    ? allowedCodes.value
    : allowedCodes.value.slice(0, effectiveLimit.value)
)

const visibleBlocked = computed(() =>
  !props.compact && isBlockedExpanded.value
    ? blockedCodes.value
    : blockedCodes.value.slice(0, effectiveLimit.value)
)
</script>
