# Agent Instructions

## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" -t bug|feature|task -p 0-4 --json
bd create "Issue title" -p 1 --deps discovered-from:bd-123 --json
bd create "Subtask" --parent <epic-id> --json  # Hierarchical subtask (gets ID like epic-id.1)
```

**Claim and update:**

```bash
bd update bd-42 --status in_progress --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task**: `bd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`
6. **Commit together**: Always commit the `.beads/issues.jsonl` file together with the code changes so issue state stays in sync with code state

### Auto-Sync

bd automatically syncs with git:

- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### GitHub Copilot Integration

If using GitHub Copilot, also create `.github/copilot-instructions.md` for automatic instruction loading.
Run `bd onboard` to get the content, or see step 2 of the onboard instructions.

### MCP Server (Recommended)

If using Claude or MCP-compatible clients, install the beads MCP server:

```bash
pip install beads-mcp
```

Add to MCP config (e.g., `~/.config/claude/config.json`):

```json
{
  "beads": {
    "command": "beads-mcp",
    "args": []
  }
}
```

Then use `mcp__beads__*` functions instead of CLI commands.

### Managing AI-Generated Planning Documents

AI assistants often create planning and design documents during development:

- PLAN.md, IMPLEMENTATION.md, ARCHITECTURE.md
- DESIGN.md, CODEBASE_SUMMARY.md, INTEGRATION_PLAN.md
- TESTING_GUIDE.md, TECHNICAL_DESIGN.md, and similar files

**Best Practice: Use a dedicated directory for these ephemeral files**

**Recommended approach:**

- Create a `history/` directory in the project root
- Store ALL AI-generated planning/design docs in `history/`
- Keep the repository root clean and focused on permanent project files
- Only access `history/` when explicitly asked to review past planning

**Example .gitignore entry (optional):**

```
# AI planning documents (ephemeral)
history/
```

**Benefits:**

- ✅ Clean repository root
- ✅ Clear separation between ephemeral and permanent documentation
- ✅ Easy to exclude from version control if desired
- ✅ Preserves planning history for archeological research
- ✅ Reduces noise when browsing the project

### CLI Help

Run `bd <command> --help` to see all available flags for any command.
For example: `bd create --help` shows `--parent`, `--deps`, `--assignee`, etc.

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ✅ Store AI planning docs in `history/` directory
- ✅ Run `bd <cmd> --help` to discover available flags
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems
- ❌ Do NOT clutter repo root with planning documents

For more details, see README.md and QUICKSTART.md.

## Commit Message Format (Conventional Commits)

**IMPORTANT**: This project uses **Conventional Commits** for ALL commit messages. Commits are automatically validated using commitlint and git hooks.

### Why Conventional Commits?

- **Automated changelogs**: Generate release notes automatically
- **Semantic versioning**: Determine version bumps from commit history
- **Clear history**: Understand changes at a glance
- **Better collaboration**: Consistent format across all contributors
- **CI/CD integration**: Trigger builds/deployments based on commit types

### Format Specification

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Header (required)**: `<type>(<scope>): <subject>`

- Maximum 120 characters
- Type and subject are required
- Scope is optional but recommended
- Subject must be lowercase, no period at end

**Body (optional)**: Detailed description

- Separated from header by blank line
- Maximum 120 characters per line
- Explain the "why" not the "what"

**Footer (optional)**: Metadata

- Separated from body by blank line
- Breaking changes: `BREAKING CHANGE: description`
- Issue references: `Closes #123`, `Fixes #456`

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

### Scope Usage (Optional)

Scopes provide context about what part of the codebase changed:

**Common scopes for this project:**

- `scraper` - Scraping scripts (archive, youtube)
- `validation` - Data validation
- `enrichment` - OMDB enrichment
- `store` - Pinia store
- `types` - TypeScript types
- `utils` - Utility functions
- `config` - Configuration files
- `deps` - Dependencies

**Examples:**

```bash
feat(scraper): add archive.org movie scraping
fix(validation): correct imdb id format check
docs(readme): add scraping instructions
refactor(store): simplify movie loading logic
```

**No scope is also valid:**

```bash
feat: add movie search functionality
fix: correct data validation logic
```

### Breaking Changes

Breaking changes MUST be indicated in the commit footer using `BREAKING CHANGE:` followed by a description.

**Format:**

```
feat(api): change movie data structure

BREAKING CHANGE: Movie entries now use nested source objects instead of flat structure. Update all consumers to use movie.sources[0].url instead of movie.url.
```

**Alternative (NOT recommended):**

```
feat(api)!: change movie data structure
```

### Good Examples

```bash
# Simple feature
feat(scraper): add youtube channel scraping

# Bug fix with scope
fix(validation): handle missing imdb ids correctly

# Feature with body
feat(enrichment): add omdb api integration

Integrate OMDB API to enrich movie metadata with ratings,
plot summaries, and additional details. Includes rate limiting
and error handling for API failures.

# Breaking change
refactor(types)!: restructure movie entry interface

BREAKING CHANGE: MovieEntry interface now requires 'sources' array
instead of single 'url' field. Migration guide in docs/migration.md.

Closes #42

# Multiple issues
fix(validation): improve duplicate detection

Fixes #123, #124, #125
```

### Bad Examples

```bash
# ❌ Missing type
Add youtube scraping

# ❌ Uppercase subject
feat(scraper): Add YouTube scraping

# ❌ Period at end
feat(scraper): add youtube scraping.

# ❌ Too vague
fix: bug fix

# ❌ Wrong type
update: add new feature

# ❌ No subject
feat(scraper):

# ❌ Breaking change in subject (use footer instead)
feat(api): BREAKING: change data structure
```

### Validation

Commits are automatically validated on every commit using:

- **commitlint**: Validates commit message format
- **git hooks**: Runs validation before commit is created

**What gets validated:**

- ✅ Type is one of the allowed types
- ✅ Subject is lowercase and doesn't end with period
- ✅ Header is max 120 characters
- ✅ Body lines are max 120 characters
- ✅ Proper blank lines between sections

**If validation fails:**

```bash
$ git commit -m "Add feature"
⧗   input: Add feature
✖   type must be one of [feat, fix, docs, ...] [type-enum]
✖   found 1 problems, 0 warnings
```

### Emergency Bypass

**Use sparingly!** If you absolutely must bypass validation:

```bash
git commit --no-verify -m "emergency fix"
```

**When to use `--no-verify`:**

- ✅ Emergency hotfixes in production
- ✅ Reverting broken commits
- ✅ Fixing broken git hooks

**When NOT to use:**

- ❌ "I don't want to write a proper message"
- ❌ Regular development work
- ❌ "It's faster this way"

### Testing the Setup

**Test invalid commit (should fail):**

```bash
echo "invalid message" | npx commitlint
# Expected: ✖ type must be one of [feat, fix, ...]
```

**Test valid commit (should pass):**

```bash
echo "feat: add new feature" | npx commitlint
# Expected: (no output, exit code 0)
```

**Test with git:**

```bash
# This should fail
git commit --allow-empty -m "invalid message"

# This should succeed
git commit --allow-empty -m "feat: test conventional commits"
```

### CI/CD Integration

**GitHub Actions example:**

```yaml
- name: Validate commit messages
  run: |
    pnpm commitlint --from=HEAD~1 --to=HEAD
```

**Pre-push validation:**

```bash
# Validate all commits since main
git log main..HEAD --format=%s | while read msg; do
  echo "$msg" | npx commitlint
done
```

### Rules and Best Practices

**DO:**

- ✅ Use present tense: "add feature" not "added feature"
- ✅ Use imperative mood: "fix bug" not "fixes bug"
- ✅ Be specific: "fix validation for imdb ids" not "fix bug"
- ✅ Reference issues: "Closes #123" in footer
- ✅ Explain WHY in body, not WHAT (code shows what)
- ✅ Use scopes to provide context
- ✅ Keep subject under 72 chars (120 is max, but shorter is better)

**DON'T:**

- ❌ Use past tense: "added", "fixed"
- ❌ Use vague descriptions: "update", "change", "modify"
- ❌ Capitalize subject
- ❌ End subject with period
- ❌ Mix multiple unrelated changes in one commit
- ❌ Use `--no-verify` for regular commits
- ❌ Forget to reference related issues

### Integration with bd (beads)

When closing beads issues, reference them in commit footer:

```bash
feat(scraper): add youtube channel scraping

Implements youtube scraping for configured channels.
Includes rate limiting and error handling.

Closes movies-deluxe-uq0.12
```

### Tools and Resources

**Installed packages:**

- `@commitlint/cli` - Commit message linter
- `@commitlint/config-conventional` - Conventional commits rules
- `simple-git-hooks` - Git hooks manager
- `lint-staged` - Run linters on staged files

**Configuration files:**

- `commitlint.config.js` - Commitlint rules
- `package.json` - Git hooks and lint-staged config

**Useful commands:**

```bash
# Validate last commit
git log -1 --pretty=%B | npx commitlint

# Validate commit range
npx commitlint --from=HEAD~5 --to=HEAD

# Reinstall git hooks
pnpm simple-git-hooks

# Check hook status
ls -la .git/hooks/commit-msg .git/hooks/pre-commit
```

### Important Rules

- ✅ Use conventional commits for ALL commits
- ✅ Always include a type (feat, fix, docs, etc.)
- ✅ Keep subject lowercase and concise
- ✅ Use body to explain WHY, not WHAT
- ✅ Reference issues in footer
- ✅ Use `BREAKING CHANGE:` footer for breaking changes
- ✅ Test your commit message before committing
- ❌ Do NOT use `--no-verify` for regular commits
- ❌ Do NOT use vague commit messages
- ❌ Do NOT mix unrelated changes
- ❌ Do NOT forget to explain breaking changes

For more details, see https://www.conventionalcommits.org/

## Nuxt 4 Directory Structure

**IMPORTANT**: This project uses **Nuxt 4** with its standard directory conventions. Understanding the directory structure is essential for proper code organization.

### Why Follow Nuxt Conventions?

- **Auto-imports**: Components, composables, and utilities are automatically imported
- **File-based routing**: Pages are automatically registered as routes
- **Type safety**: TypeScript types are auto-generated from directory structure
- **Developer experience**: Consistent structure across all Nuxt projects
- **Build optimization**: Nuxt optimizes based on directory usage

### Standard Nuxt 4 Directories

#### `app/` - Application Source Code

The main application directory containing all frontend code.

**Subdirectories:**

- `app/pages/` - File-based routing (e.g., `index.vue` → `/`, `about.vue` → `/about`)
- `app/components/` - Vue components (auto-imported globally)
- `app/composables/` - Vue composables (auto-imported, e.g., `useMovies.ts`)
- `app/layouts/` - Layout components (e.g., `default.vue`, `admin.vue`)
- `app/middleware/` - Route middleware (e.g., `auth.ts`)
- `app/plugins/` - Vue plugins (auto-registered)
- `app/stores/` - Pinia stores (e.g., `useMovieStore.ts`)
- `app/utils/` - Utility functions (auto-imported)
- `app/assets/` - Assets processed by build tool (CSS, images)
- `app.vue` - Root application component (optional)

**Current usage in this project:**

```
app/
├── pages/
│   └── index.vue          # Movie listing page (route: /)
└── stores/
    └── useMovieStore.ts   # Pinia store for movie data
```

#### `server/` - Server-Side Code

Backend API routes and server middleware.

**Subdirectories:**

- `server/api/` - API endpoints (e.g., `movies.get.ts` → `/api/movies`)
- `server/routes/` - Server routes (e.g., `sitemap.xml.ts` → `/sitemap.xml`)
- `server/middleware/` - Server middleware (runs on every request)
- `server/plugins/` - Server plugins (Nitro plugins)
- `server/utils/` - Server utility functions

**Not currently used** - Movie data is loaded from static JSON file.

**Future use cases:**

- `/api/movies` - Dynamic movie data endpoint
- `/api/search` - Movie search API
- `/api/omdb` - OMDB proxy endpoint

#### `public/` - Static Assets

Files served directly without processing. Accessible at root URL.

**Current usage:**

```
public/
├── posters/              # Movie poster images (57 files)
│   ├── tt0284688.jpg
│   └── ...
├── data/
│   └── movies.json       # Static movie database (106 movies)
├── favicon.ico
└── robots.txt
```

**Access pattern:**

- `/posters/tt0284688.jpg` → `public/posters/tt0284688.jpg`
- `/data/movies.json` → `public/data/movies.json`

#### `types/` - TypeScript Type Definitions

Shared TypeScript types and interfaces.

**Current usage:**

```
types/
└── movie.ts              # MovieEntry interface
```

**Best practices:**

- Use for shared types across frontend and backend
- Auto-imported in Nuxt components
- Keep types close to their usage (e.g., store types in store file)

#### `scripts/` - Build and Utility Scripts

Node.js scripts for data processing, scraping, and maintenance.

**Current usage:**

```
scripts/
├── utils/                # Shared script utilities
│   ├── aiTitleExtractor.ts
│   ├── dataManager.ts
│   ├── imageDownloader.ts
│   ├── logger.ts
│   └── omdbMatcher.ts
├── scrape-archive.ts     # Archive.org scraper
├── scrape-youtube.ts     # YouTube scraper
├── enrich-omdb.ts        # OMDB metadata enrichment
├── download-posters.ts   # Poster downloader
├── deduplicate.ts        # Duplicate detection
└── validate-data.ts      # Data validation
```

**Not part of Nuxt build** - Run manually via `pnpm tsx scripts/<name>.ts`

#### `config/` - Configuration Files

Project-specific configuration data.

**Current usage:**

```
config/
├── youtube-channels.json # YouTube channel configurations
└── README.md
```

#### `data/` - Backend Data Storage

Primary data storage (not served publicly).

**Current usage:**

```
data/
└── movies.json           # Master movie database (106 movies)
```

**Note:** Copied to `public/data/movies.json` for frontend access.

#### Root Configuration Files

- `nuxt.config.ts` - Nuxt configuration (modules, dev server, build options)
- `uno.config.ts` - UnoCSS configuration (presets, theme, shortcuts)
- `tsconfig.json` - TypeScript configuration
- `eslint.config.ts` - ESLint configuration
- `package.json` - Dependencies and scripts
- `.prettierrc` - Prettier configuration
- `commitlint.config.js` - Commit message validation

### Project-Specific Conventions

#### Where to Put New Code

**Frontend components:**

```
app/components/MovieCard.vue       # Reusable movie card component
app/components/SearchBar.vue       # Search bar component
```

**Pages (routes):**

```
app/pages/index.vue                # Home page (/)
app/pages/movies/[id].vue          # Movie detail page (/movies/:id)
app/pages/about.vue                # About page (/about)
```

**Composables (reusable logic):**

```
app/composables/useMovies.ts       # Movie data composable
app/composables/useSearch.ts       # Search logic composable
```

**Stores (global state):**

```
app/stores/useMovieStore.ts        # Movie data store (current)
app/stores/useUserStore.ts         # User preferences store
```

**API endpoints:**

```
server/api/movies.get.ts           # GET /api/movies
server/api/movies/[id].get.ts      # GET /api/movies/:id
server/api/search.post.ts          # POST /api/search
```

**Utility functions:**

```
app/utils/formatDate.ts            # Frontend utilities (auto-imported)
server/utils/database.ts           # Server utilities (auto-imported)
scripts/utils/scraper.ts           # Script utilities (manual import)
```

**Types:**

```
types/movie.ts                     # Shared types (auto-imported)
app/types/components.ts            # Component-specific types
server/types/api.ts                # API-specific types
```

**Static assets:**

```
public/posters/tt1234567.jpg       # Poster images
public/images/logo.png             # Site images
public/fonts/custom.woff2          # Custom fonts
```

**Processed assets:**

```
app/assets/styles/main.css         # CSS (processed by Vite)
app/assets/images/hero.jpg         # Images (optimized by Vite)
```

#### Naming Conventions

**Files:**

- Components: `PascalCase.vue` (e.g., `MovieCard.vue`)
- Pages: `kebab-case.vue` (e.g., `movie-detail.vue`)
- Composables: `camelCase.ts` starting with `use` (e.g., `useMovies.ts`)
- Stores: `camelCase.ts` starting with `use` (e.g., `useMovieStore.ts`)
- Utils: `camelCase.ts` (e.g., `formatDate.ts`)
- API routes: `kebab-case.method.ts` (e.g., `movies.get.ts`)

**Exports:**

- Composables: `export function useMovies() { ... }`
- Stores: `export const useMovieStore = defineStore('movie', ...)`
- Utils: `export function formatDate() { ... }`
- Types: `export interface MovieEntry { ... }`

#### Auto-Import Rules

**Automatically imported (no import statement needed):**

- Components from `app/components/`
- Composables from `app/composables/`
- Utils from `app/utils/`
- Nuxt built-ins: `ref`, `computed`, `useState`, `useFetch`, etc.
- Vue built-ins: `onMounted`, `watch`, `nextTick`, etc.

**Requires manual import:**

- Types from `types/`
- Scripts from `scripts/`
- External packages from `node_modules`
- Server utils in frontend code (and vice versa)

**Example:**

```vue
<script setup lang="ts">
// ✅ Auto-imported (no import needed)
const movieStore = useMovieStore()
const movies = ref([])
const isDark = useDark()

// ❌ Requires manual import
import type { MovieEntry } from '~/types/movie'
import { someExternalLib } from 'external-package'
</script>
```

### Development Workflow

**Starting development:**

```bash
pnpm dev                  # Start dev server (port 3003)
```

**Running scripts:**

```bash
pnpm tsx scripts/scrape-archive.ts      # Run scraper
pnpm tsx scripts/download-posters.ts    # Download posters
```

**Building for production:**

```bash
pnpm build                # Build for production
pnpm preview              # Preview production build
```

**Type checking:**

```bash
pnpm nuxi typecheck       # Check TypeScript types
```

### Important Rules

- ✅ Follow Nuxt 4 directory conventions
- ✅ Use `app/` for all frontend code
- ✅ Use `server/` for all backend code
- ✅ Use `public/` for static assets (no processing)
- ✅ Use `app/assets/` for processed assets (CSS, optimized images)
- ✅ Leverage auto-imports (components, composables, utils)
- ✅ Use file-based routing in `app/pages/`
- ✅ Keep scripts separate in `scripts/` directory
- ✅ Store types in `types/` for sharing across app
- ❌ Do NOT put frontend code in `server/`
- ❌ Do NOT put backend code in `app/`
- ❌ Do NOT put processed assets in `public/`
- ❌ Do NOT manually import auto-imported items

### Resources

- **Nuxt 4 Docs**: https://nuxt.com/docs
- **Directory Structure**: https://nuxt.com/docs/guide/directory-structure
- **Auto-imports**: https://nuxt.com/docs/guide/concepts/auto-imports
- **File-based Routing**: https://nuxt.com/docs/guide/directory-structure/pages
