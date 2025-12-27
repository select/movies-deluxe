# Agent Instructions

## Commands

```bash
# Development
pnpm dev                    # Dev server (port 3003)
pnpm build                  # Production build
pnpm tsx scripts/<name>.ts  # Run scripts

# Code Quality
pnpm lint                   # Run oxlint + eslint
pnpm lint:fix               # Auto-fix issues
pnpm format                 # Format with Prettier
pnpm typecheck              # TypeScript checking

# Database
pnpm db:generate            # Generate SQLite from movies.json
```

**Testing**: ❌ No test framework configured. Do NOT run tests.

## Code Style

**Formatting**: No semicolons, single quotes, 2 spaces, 100 char width, LF line endings

**Linting**:

- Unused vars start with `_`
- `console.log` warning in frontend, allowed in `scripts/`, `server/`
- Prefer `const` over `let`

**Auto-imports**: Components, composables, utils, Vue/Nuxt built-ins (no import needed)
**Manual imports**: Types (`import type { ... }`), external packages

**Naming**:

- Components: `PascalCase.vue`
- Pages: `kebab-case.vue`
- Composables/Stores: `useCamelCase.ts`
- Utils: `camelCase.ts`
- Types: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`

**Error Handling**: Always use try/catch for async operations, return fallback values

**Vue**: Use `<script setup lang="ts">`, `ref()` for primitives, `reactive()` for objects

## Issue Tracking with bd (beads)

**IMPORTANT**: Use **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs or task lists.

**Why bd?** Dependency-aware, git-friendly (auto-syncs to `.beads/issues.jsonl`), agent-optimized with JSON output.

**Auto-Sync**: Exports to JSONL after changes (5s debounce), imports on `git pull`. Always commit `.beads/issues.jsonl` with code changes.

**MCP Server** (optional): `pip install beads-mcp`, then add to MCP config for `mcp__beads__*` functions.

**AI Planning Docs**: Store ephemeral planning documents (PLAN.md, IMPLEMENTATION.md, etc.) in `history/` directory to keep repo root clean.

## Commit Message Format (Conventional Commits)

**IMPORTANT**: This project uses **Conventional Commits** for ALL commit messages. Commits are automatically validated using commitlint and git hooks.

### Format Specification

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Header (required)**: `<type>(<scope>): <subject>`

- Maximum 120 characters
- Type and subject are required, scope is optional
- Subject must be lowercase, no period at end

### Commit Types

| Type       | Description               | Example                                               |
| ---------- | ------------------------- | ----------------------------------------------------- |
| `feat`     | New feature               | `feat(scraper): add youtube channel scraping`         |
| `fix`      | Bug fix                   | `fix(validation): handle missing imdb ids correctly`  |
| `docs`     | Documentation only        | `docs(readme): update installation instructions`      |
| `style`    | Code style/formatting     | `style(app): fix indentation in movie store`          |
| `refactor` | Code refactoring          | `refactor(utils): simplify data manager logic`        |
| `perf`     | Performance improvement   | `perf(store): add caching for movie queries`          |
| `test`     | Add/update tests          | `test(validation): add tests for duplicate detection` |
| `build`    | Build system/dependencies | `build: add commitlint and git hooks`                 |
| `ci`       | CI/CD changes             | `ci: add github actions workflow`                     |
| `chore`    | Maintenance tasks         | `chore: update dependencies`                          |
| `revert`   | Revert previous commit    | `revert: feat(scraper): add youtube scraping`         |

### Common Scopes

`scraper`, `validation`, `enrichment`, `store`, `types`, `utils`, `config`, `deps`

### Breaking Changes

Use `BREAKING CHANGE:` in footer:

```
feat(api): change movie data structure

BREAKING CHANGE: Movie entries now use nested source objects instead of flat structure.
```

### Good Examples

```bash
feat(scraper): add youtube channel scraping
fix(validation): handle missing imdb ids correctly
feat(enrichment): add omdb api integration

Integrate OMDB API to enrich movie metadata with ratings,
plot summaries, and additional details.

Closes movies-deluxe-uq0.12
```

### Rules

**DO:**

- ✅ Use present tense: "add feature" not "added feature"
- ✅ Use imperative mood: "fix bug" not "fixes bug"
- ✅ Be specific: "fix validation for imdb ids" not "fix bug"
- ✅ Reference issues: "Closes #123" in footer
- ✅ Explain WHY in body, not WHAT

**DON'T:**

- ❌ Use past tense: "added", "fixed"
- ❌ Use vague descriptions: "update", "change", "modify"
- ❌ Capitalize subject
- ❌ End subject with period
- ❌ Use `--no-verify` for regular commits

### Emergency Bypass

```bash
git commit --no-verify -m "emergency fix"
```

Use ONLY for emergency hotfixes, reverting broken commits, or fixing broken git hooks.

### Validation

Commits are validated on every commit. If validation fails:

```bash
$ git commit -m "Add feature"
⧗   input: Add feature
✖   type must be one of [feat, fix, docs, ...] [type-enum]
```

**Test your setup:**

```bash
echo "feat: add new feature" | npx commitlint  # Should pass
echo "invalid message" | npx commitlint        # Should fail
```

For more details, see https://www.conventionalcommits.org/

## Nuxt 4 Directory Structure

**IMPORTANT**: This project uses **Nuxt 4** with standard directory conventions. Key features: auto-imports, file-based routing, and type safety.

### Key Directories

**`app/`** - Frontend code

- `pages/` - File-based routing (`index.vue` → `/`)
- `components/` - Vue components (auto-imported)
- `composables/` - Composables (auto-imported, prefix with `use`)
- `stores/` - Pinia stores (auto-imported, prefix with `use`)
- `utils/` - Utility functions (auto-imported)
- `assets/` - Processed assets (CSS, images)
- `types/` - Frotnend TypeScript types (`~/types`)
- `shared/types/` - TypeScript types that are used on server and frontend (`~/types`)
  **`public/`** - Static files served at root (no processing)
  **`scripts/`** - Node.js scripts (NOT part of Nuxt build)
- Run via `pnpm tsx scripts/<name>.ts`
- Scripts write directly to `public/data/movies.json`

**`config/`** - Project configuration data

**Important Rules:**

- ✅ Use `app/` for frontend, `server/` for backend, `public/` for static files
- ✅ Leverage auto-imports (components, composables, utils)
- ✅ Use file-based routing in `app/pages/`
- ❌ Do NOT manually import auto-imported items
- ❌ Do NOT put processed assets in `public/`

### Naming Conventions

- Components: `PascalCase.vue` (e.g., `MovieCard.vue`)
- Pages: `kebab-case.vue` (e.g., `movie-detail.vue`)
- Composables/Stores: `useCamelCase.ts` (e.g., `useMovieStore.ts`)
- Utils: `camelCase.ts` (e.g., `formatDate.ts`)

### Auto-Import Rules

**Auto-imported (no import needed):**

- Components from `app/components/`
- Composables from `app/composables/`
- Utils from `app/utils/`
- Nuxt/Vue built-ins: `ref`, `computed`, `useState`, `useFetch`, etc.

**Manual import required:**

- Types from `types/` (e.g., `import type { MovieEntry } from '~/types/movie'`)
- External packages
- Scripts

### Development Commands

```bash
pnpm dev                              # Start dev server (port 3003)
pnpm build                            # Build for production
pnpm tsx scripts/<name>.ts            # Run scripts
```

## Frontend Verification

**IMPORTANT**: Always verify frontend changes using the **chrome-devtools** MCP.

### Dev Server Management

- **Check first**: Always check if dev server is already running before starting it
  - Use `curl -s http://localhost:3003/api/readyz` to check server status
  - If returns JSON with `"status": "ready"`, server is running
- **Start if needed**: Only start the server if it's not already running (`pnpm dev`)
- **Restart anytime**: You can restart the server whenever needed (e.g., after config changes, dependency updates)
  - Kill existing server first, then start new one
  - Always wait until ready before testing (use `/api/readyz` endpoint)
- **NEVER stop at end**: Do NOT kill the server when you're done working
  - Leave it running for continuous frontend verification
  - Prevents unnecessary restarts in future sessions

### Verification Steps

- Use `chrome-devtools_navigate_page` to `http://localhost:3003`
- Use `chrome-devtools_take_screenshot` or `chrome-devtools_take_snapshot` to verify UI
- Check console for errors with `chrome-devtools_list_console_messages`
