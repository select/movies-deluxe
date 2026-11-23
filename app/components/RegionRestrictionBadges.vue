<template>
  <div
    v-if="allowedCodes.length > 0 || blockedCodes.length > 0"
    :class="compact ? 'space-y-1' : 'space-y-2'"
  >
    <!-- Allowed regions -->
    <div
      v-if="allowedCodes.length > 0"
      class="flex flex-wrap items-center"
      :class="[compact ? 'gap-1' : 'gap-1.5', compact && isAllowedExpanded ? 'max-w-xs' : '']"
    >
      <span
        class="font-medium text-theme-textmuted/80 flex items-center gap-1 select-none"
        :class="compact ? 'text-[10px]' : 'text-xs mr-1'"
      >
        <span
          class="i-mdi-earth text-emerald-600/70 dark:text-emerald-400/70"
          :class="compact ? 'text-xs' : 'text-sm'"
        ></span>
        {{ compact ? 'Only:' : 'Available in' }}
      </span>
      <span
        v-for="code in visibleAllowed"
        :key="`allowed-${code}`"
        :title="getRegionName(code)"
        class="group/badge relative inline-flex items-center rounded font-medium tracking-wide bg-emerald-500/10 text-emerald-700/85 dark:text-emerald-300/80 border border-emerald-500/15 cursor-default select-none"
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
        v-if="allowedCodes.length > effectiveLimit"
        type="button"
        :title="
          isAllowedExpanded
            ? 'Collapse region list'
            : `Show all ${allowedCodes.length} allowed regions`
        "
        class="rounded font-medium text-theme-textmuted hover:text-theme-text bg-theme-surface border border-theme-border/50 hover:bg-theme-selection transition-colors cursor-pointer"
        :class="compact ? 'px-1.5 py-0.5 text-[10px] leading-none' : 'px-2 py-0.5 text-[11px]'"
        @click="isAllowedExpanded = !isAllowedExpanded"
      >
        {{
          isAllowedExpanded
            ? 'Show less'
            : compact
              ? `+${allowedCodes.length - effectiveLimit}`
              : `+${allowedCodes.length - effectiveLimit} more`
        }}
      </button>
    </div>

    <!-- Blocked regions -->
    <div
      v-if="blockedCodes.length > 0"
      class="flex flex-wrap items-center"
      :class="[compact ? 'gap-1' : 'gap-1.5', compact && isBlockedExpanded ? 'max-w-xs' : '']"
    >
      <span
        class="font-medium text-theme-textmuted/80 flex items-center gap-1 select-none"
        :class="compact ? 'text-[10px]' : 'text-xs mr-1'"
      >
        <span
          class="i-mdi-earth-off text-red-600/70 dark:text-red-400/70"
          :class="compact ? 'text-xs' : 'text-sm'"
        ></span>
        {{ compact ? 'Blocked:' : 'Blocked in' }}
      </span>
      <span
        v-for="code in visibleBlocked"
        :key="`blocked-${code}`"
        :title="getRegionName(code)"
        class="group/badge relative inline-flex items-center rounded font-medium tracking-wide bg-red-500/10 text-red-700/85 dark:text-red-300/80 border border-red-500/15 cursor-default select-none"
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
        v-if="blockedCodes.length > effectiveLimit"
        type="button"
        :title="
          isBlockedExpanded
            ? 'Collapse region list'
            : `Show all ${blockedCodes.length} blocked regions`
        "
        class="rounded font-medium text-theme-textmuted hover:text-theme-text bg-theme-surface border border-theme-border/50 hover:bg-theme-selection transition-colors cursor-pointer"
        :class="compact ? 'px-1.5 py-0.5 text-[10px] leading-none' : 'px-2 py-0.5 text-[11px]'"
        @click="isBlockedExpanded = !isBlockedExpanded"
      >
        {{
          isBlockedExpanded
            ? 'Show less'
            : compact
              ? `+${blockedCodes.length - effectiveLimit}`
              : `+${blockedCodes.length - effectiveLimit} more`
        }}
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
  isAllowedExpanded.value ? allowedCodes.value : allowedCodes.value.slice(0, effectiveLimit.value)
)

const visibleBlocked = computed(() =>
  isBlockedExpanded.value ? blockedCodes.value : blockedCodes.value.slice(0, effectiveLimit.value)
)
</script>
