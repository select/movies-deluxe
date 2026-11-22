# Agent Instructions

# 🚨 SESSION CLOSE PROTOCOL 🚨

**CRITICAL**: Before saying "done" or "complete", you MUST run this checklist:

```
[ ] 1. pnpm typecheck          (check for type errors)
[ ] 2. git status              (check what changed)
[ ] 3. git add <files>         (stage code changes)
[ ] 4. git commit -m "..."     (commit code changes)
```

Use the commit-message skill to craft a good commit message

# Working with code

## Commands

```bash
# Code Quality
pnpm lint:fix               # Auto-fix issues
pnpm typecheck              # TypeScript checking (slow, may timeout)
```

**Testing**: No test framework configured. Do NOT run tests.

## Code Style

**Formatting**: No semicolons, single quotes, 2 spaces, 100 char width, LF line endings

**Vue**: Use `<script setup lang="ts">`, `ref()` for reactivity

## Nuxt 4 Directory Structure

### Key Directories

**`app/`** - Frontend code (Nuxt 4 application layer)

- `pages/` - File-based routing (`index.vue` → `/`, `movie-detail.vue` → `/movie-detail`)
- `components/` - Vue components (auto-imported globally)
- `composables/` - Composables (auto-imported, prefix with `use`)
- `stores/` - Pinia stores (auto-imported, prefix with `use`)
- `utils/` - Utility functions (auto-imported)
- `assets/` - Processed assets (CSS, images, fonts)
- `types/` - Frontend-only TypeScript types (import via `~/types`)
- `layouts/` - Layout components for pages
- `plugins/` - Nuxt plugins
- `workers/` - Web Workers

**`server/`** - Backend code (Nuxt server layer)

- `api/` - API endpoints (file-based routing)
- `plugins/` - Server plugins
- `utils/` - Server-side utilities

**`shared/`** - Code shared between frontend and backend

- `types/` - TypeScript types used on both server and frontend (import via `~/shared/types`)
- `utils/` - Shared utility functions

**`public/`** - Static files served at root (no processing)

- `data/` - Static data files (e.g., `movies.json`)
- `movies/` - Movie video files
- `posters/` - Movie poster images
- Files served directly at root URL

**`scripts/`** - Node.js scripts (NOT part of Nuxt build)

- Run via `pnpm tsx scripts/<name>.ts`
- Used for data processing, maintenance tasks, etc.

**`config/`** - Project configuration data files

**`data/`** - Source data files (processed by scripts)

**Important Rules:**

- ✅ Use `app/` for frontend, `server/` for backend, `public/` for static files
- ✅ Use explicit imports (enforced in strict mode by `nuxt-explicit-imports`)
- ✅ Use file-based routing in `app/pages/`

### Explicit Import Rules

Auto-imports are disabled (`explicitImports: { mode: 'strict' }` in `nuxt.config.ts`). Always import Vue APIs (`vue`), Nuxt composables (`#app`), components (`~/components/...` or `#components`), Pinia helpers (`#imports`), stores (`~/stores/...`), composables (`~/composables/...`), utils (`~/utils/...`), shared types/utils (`#shared/...`), and server utils (`#server/...`, `h3`, `nitropack/runtime`) explicitly. Run `pnpm exec nuxt-explicit-imports check` to verify.

## Frontend Verification

**IMPORTANT**: Always verify frontend changes using the **frontend-verification** skill.
