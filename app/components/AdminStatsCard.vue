<template>
  <div class="p-4 rounded-xl shadow-sm border border-theme-border bg-theme-surface">
    <div class="flex items-center justify-between mb-2">
      <span class="text-xs font-medium text-theme-textmuted uppercase tracking-wider">{{
        title
      }}</span>
      <div class="text-xl" :class="[icon, iconColor]"></div>
    </div>
    <div class="text-2xl font-bold flex items-baseline gap-2">
      {{ value.toLocaleString() }}
      <span
        v-if="failed && failed > 0"
        class="text-xs font-medium text-orange-500"
        :title="`${failed} failed`"
      >
        +{{ failed }} failed
      </span>
    </div>
    <div v-if="showProgress" class="mt-1 flex items-center gap-2">
      <div class="flex-1 h-1 bg-theme-border rounded-full overflow-hidden flex">
        <div
          class="h-full transition-all duration-1000"
          :class="progressColor"
          :style="{ width: `${percent}%` }"
        ></div>
        <div
          v-if="failed && failed > 0 && failedPercent !== undefined"
          class="h-full bg-orange-400 transition-all duration-1000"
          :style="{ width: `${failedPercent}%` }"
        ></div>
      </div>
      <span class="text-[10px] font-medium">{{ percent?.toFixed(percentPrecision) }}%</span>
    </div>
    <div
      v-if="subtitle || (failureRate !== undefined && failureRate > 0)"
      class="flex items-center justify-between text-[10px] mt-1"
    >
      <span v-if="subtitle" class="text-theme-textmuted">
        {{ subtitle }}
      </span>
      <span
        v-if="failureRate !== undefined && failureRate > 0"
        :class="failureRate > 20 ? 'text-red-500 font-bold' : 'text-orange-500'"
      >
        {{ failureRate.toFixed(1) }}% fail
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    value: string | number
    icon: string
    iconColor?: string
    subtitle?: string
    showProgress?: boolean
    percent?: number
    progressColor?: string
    percentPrecision?: number
    failed?: number
    failedPercent?: number
    failureRate?: number
  }>(),
  {
    iconColor: 'text-blue-500',
    showProgress: false,
    percent: 0,
    progressColor: 'bg-blue-500',
    percentPrecision: 0,
    subtitle: undefined,
    failed: undefined,
    failedPercent: undefined,
    failureRate: undefined,
  }
)
</script>
