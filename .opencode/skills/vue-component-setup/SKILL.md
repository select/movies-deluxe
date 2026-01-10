---
name: vue-component-setup
description: Rules for vue component setup. Use this when writing a new vue component or when reviewing an exisinging component.
license: MIT
---

Use these patterns when needed
GOOD

````ts
const props = defineProps<{collection: { id: string name: string }}>()
const emit = defineEmits<{ updated: [newId: string] }>()
const model = defineModel({ required: true }) // making the v-model required
const model = defineModel({ default: 0 }) // providing a default value
const { progress } = storeToRefs(useAdminStore()) // use a reactive ref from store
const { setProgress } = useAdminStore() // use a store action
const archiveProgress = computed(() => progress.value.archive)
function onUpdate(event: string) { setProgress(event) }
``

Never use the following patterns
BAD
```ts
import { utilFkt } from '../utils/utilName' // bad, utils/ are alway auto-imported
````
