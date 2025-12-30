<template>
  <header class="transition-all duration-300">
    <div
      :class="[
        'max-w-none mx-auto px-4 lg:px-[6%] flex items-center justify-between',
        isHeroPage ? 'py-6 md:py-10' : 'py-3'
      ]"
    >
      <div>
        <NuxtLink to="/">
          <h1
            :class="[
              'font-bold text-theme-text transition-all duration-300',
              isHeroPage ? 'text-3xl md:text-5xl lg:text-6xl' : 'text-xl md:text-2xl'
            ]"
          >
            Movies Deluxe
          </h1>
        </NuxtLink>
        <p
          v-if="isHeroPage"
          class="text-base md:text-lg text-theme-text-muted mt-2 max-w-2xl transition-opacity duration-300"
        >
          Free legal movie streams from Archive.org and YouTube
        </p>
      </div>

      <!-- Dark Mode Toggle -->
      <AppDarkModeToggle
        @click.prevent="emit('open-filters')"
      />
    </div>
  </header>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  'open-filters': []
}>()

const route = useRoute()
const isHeroPage = computed(() => {
  return route.path === '/' || route.path === '/collections' || route.path === '/collections/'
})
</script>
