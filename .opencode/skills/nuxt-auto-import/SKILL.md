---
name: nuxt-auto-import
description: Guide for checking and fixing Nuxt 4 auto-import usage. Use this when reviewing impors in Vue components, composables, or TypeScript files in a Nuxt 4 project.
---

# Nuxt 4 Auto-Import Rules

## ✅ Auto-Imported (No import needed)

- `app/components/*.vue` - All components
- `app/composables/*.ts` - All composables
- `app/stores/*.ts` - All stores
- `app/utils/*.ts` - Root level only (nested files need imports)
- `shared/types/*.ts` - Server + App
- `shared/utils/*.ts` - Server + App
- `server/utils/` - Server only

Look for bad or unnecessary imports and fix them

## ❌ NOT Auto-Imported (Require import)

- `app/types/` - Use `import type { ... } from '~/types'`
- `app/utils/nested/` - Nested utils need imports
- `app/layouts/`, `pages/`, `plugins/`, `workers/` - All need imports
