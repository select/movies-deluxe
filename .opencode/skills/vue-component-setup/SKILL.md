---
name: vue-component-setup
description: Rules for vue component setup. Use this when writing a new vue component or when reviewing an exisinging component.
license: MIT
---

Use these patterns when createing a vue components

```vue
<template>...</template>
<script setup lang="ts">
...
</script>
<style scoped>
...
</style>
```

Only use style for custom animations, use unocss for all styling

Script setup
GOOD

```ts
const props = defineProps<{collection: { id: string name: string }}>()
const emit = defineEmits<{ updated: [newId: string] }>()
const model = defineModel({ required: true }) // making the v-model required
const model = defineModel({ default: 0 }) // providing a default value
```

Use VueUse composables that are installed in this project, vueuse needs to be imported
GOOD

```ts
import { onClickOutside } from '@vueuse/core'
onClickOutside(themeMenuRef, () => { ... }
```

When using refs and functions from pinia stores
GOOD

```ts
// do not import useSomeStore they are always auto-imported
const { progress } = storeToRefs(useAdminStore()) // use a reactive ref from store
const { setProgress } = useAdminStore() // use a store action
const archiveProgress = computed(() => progress.value.archive)
function onUpdate(event: string) {
  setProgress(event)
}
```

Never use the following patterns
BAD

```ts
// utils/ and shared/types/ are alway auto-imported
import { utilFkt } from '../utils/utilName'
import { MovieMetadata } from '../shared/types/movie' alway
```
