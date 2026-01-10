<template>
  <header class="transition-all duration-300">
    <div
      class="md:ml-16 max-w-none mx-auto px-4 flex lg:flex-row flex-col lg:items-end justify-between gap-8"
      :class="{
        'py-6 md:py-10 lg:px-[6%]': isHeroPage,
        'py-3': !isHeroPage,
      }"
    >
      <NuxtLink to="/" class="grow">
        <div
          class="w-full i-app-logo text-theme-text transition-all duration-300"
          :class="{
            ' max-w-md h-16': isHeroPage,
            'max-w-xs h-12': !isHeroPage,
          }"
        ></div>
      </NuxtLink>
      <p
        v-if="isHeroPage && route.path !== '/'"
        class="text-base md:text-lg text-theme-textmuted mt-2 max-w-2xl transition-opacity duration-300"
      >
        Free legal movie streams from Archive.org and YouTube
      </p>
    </div>
  </header>
</template>

<script setup lang="ts">
const route = useRoute()
const isHeroPage = computed(() => {
  return (
    route.path === '/' ||
    route.path.startsWith('/collections') ||
    route.path.startsWith('/liked') ||
    route.path.startsWith('/search')
  )
})
</script>
