<template>
  <header class="transition-all duration-300">
    <div
    class="md:ml-16 max-w-none mx-auto px-4  flex items-center justify-between"
      :class="{
	      'py-6 md:py-10 lg:px-[6%]': isHeroPage,
	      'py-3': !isHeroPage
	     }"
    >
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
  </header>
</template>

<script setup lang="ts">
const route = useRoute()
const isHeroPage = computed(() => {
  return route.path === '/' || route.path === '/collections' || route.path === '/collections/'
})
</script>
