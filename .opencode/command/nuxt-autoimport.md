---
description: Check for correct usage of Nuxt 4 auto-import
---

**Auto-imported** = No `import` statement needed. Use directly.

**Fix type errors**: Run `nuxt prepare` to rebuild auto-import list.

**Import path**: Use `~` prefix in `/app` (e.g., `~/types/index`)

## ✅ Auto-Imported (No import needed)

- `app/components/*.vue` - All components
- `app/composables/*.ts` - All composables
- `app/stores/*.ts` - All stores
- `app/utils/*.ts` - Root level only (nested files need imports)
- `shared/types/*.ts` - Server + App
- `shared/utils/*.ts` - Server + App

## ❌ NOT Auto-Imported (Require import)

- `app/types/` - Use `import type { ... } from '~/types'`
- `app/utils/nested/` - Nested utils need imports
- `app/layouts/`, `pages/`, `plugins/`, `workers/` - All need imports

**Action**: Remove unnecessary imports for auto-imported modules.
