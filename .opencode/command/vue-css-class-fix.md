---
description: Check for correct vue template class usage
---

BAD

````vue
<div
  :class="[
    'max-w-none mx-auto px-4 lg:px-[6%] flex items-center justify-between',
    isHeroPage ? 'py-6 md:py-10' : 'py-3'
  ]"
>
GOOD
```vue
<div class="max-w-none mx-auto px-4 lg:px-[6%] flex items-center justify-between"
  :class="{
    'py-6 md:py-10': isHeroPage,
    'py-3': !isHeroPage
    }"
/>
````

$ARGUMENTS
