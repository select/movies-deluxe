<template>
  <div class="p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
    <div class="flex items-center justify-between mb-2">
      <span class="text-xs font-medium text-gray-500 uppercase tracking-wider">{{ title }}</span>
      <div
        :class="[icon, iconColor]"
        class="text-xl"
      />
    </div>
    <div class="text-2xl font-bold">
      {{ value }}
    </div>
    <div
      v-if="showProgress"
      class="mt-1 flex items-center gap-2"
    >
      <div class="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          class="h-full transition-all duration-1000"
          :class="progressColor"
          :style="{ width: `${percent}%` }"
        />
      </div>
      <span class="text-[10px] font-medium">{{ percent?.toFixed(percentPrecision) }}%</span>
    </div>
    <div
      v-if="subtitle"
      class="text-[10px] text-gray-400 mt-1"
    >
      {{ subtitle }}
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  value: string | number
  icon: string
  iconColor?: string
  subtitle?: string
  showProgress?: boolean
  percent?: number
  progressColor?: string
  percentPrecision?: number
}>(), {
  iconColor: 'text-blue-500',
  showProgress: false,
  percent: 0,
  progressColor: 'bg-blue-500',
  percentPrecision: 0,
  subtitle: undefined,
})
</script>
