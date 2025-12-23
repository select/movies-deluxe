---
description: Nuxt 4 best practices
---

## Linting typing

Set up

- pnpm
- npm config fixed versions
- linting with eslint (`@nuxt/eslint`),
- oxlint (with eslint plugin),
- type checking,
- prettier,
- conventional commits with git hooks (simple git hooks)
  set up npm scripts for lint and type checks

## Nuxt 4

### defineModel instead of defineProps modelValue

Use the new nuxt syntax for defining v-model two-way binding.

```
const model = defineModel()
// making the v-model required
const model = defineModel({ required: true })
// providing a default value
const model = defineModel({ default: 0 })
```

### Auto-Import Rules

**Auto-imported (no import needed):**

- Components from `app/components/`
- Composables from `app/composables/`
- Utils from `app/utils/`
- Nuxt/Vue built-ins: `ref`, `computed`, `useState`, `useFetch`, etc.

### Pinia auto import

Set up autoimport for pinia stores, refactor code to not import after setup is complete.
Example

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  // ... other options
  modules: ['@pinia/nuxt'],
  pinia: {
    storesDirs: ['./stores/**', './custom-folder/stores/**'],
  },
})
```

### UnoCSS

UnoCSS is a CSS framework similar to Tailwind

#### Setup

Nuxt module `@unocss/nuxt`.
Use packages: `@unocss/preset-web-fonts`, `@unocss/preset-wind4` (important: version 4), `@unocss/reset`, `unocss`
use presetIcons,
set up fonts and use nuxt config to set global font

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  app: {
    head: {
      bodyAttrs: {
        class: 'font-sans',
      },
    },
  },
})
```
