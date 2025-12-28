---
description: Check for correct vue reactivity usage
---

BAD

```ts
const adminStore = useAdminStore()
const progress = computed(() => adminStore.progress.archive)
```

GOOD

```ts
const { progress } = storeToRefs(useAdminStore())
const progress = computed(() => progress.value.archive)
```

BAD

```vue
<script setup lang="ts">
const { progress: storeProgress } = storeToRefs(useAdminStore())
const progress = computed(() => storeProgress.value.omdb)
</script>
</template>
<div class="flex items-center gap-1 text-green-600 dark:text-green-400">
  <div class="i-mdi-check-circle" />
  Success: {{ progress.successCurrent || 0 }}
</div>
<template>
```

GOOD

```vue
<script setup lang="ts">
const { progress } = storeToRefs(useAdminStore())
</script>
</template>
<div class="flex items-center gap-1 text-green-600 dark:text-green-400">
  <div class="i-mdi-check-circle" />
  Success: {{ progress.omdb.successCurrent || 0 }}
</div>
<template>
```

with functions

```ts
const { progress } = storeToRefs(useAdminStore())
const { setProgress } = useAdminStore()
const progress = computed(() => progress.value.archive)
function onUpdate(event: string) {
  setProgress(event)
}
```
