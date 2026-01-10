# Agent Instructions

# Beads Workflow Context

> **Context Recovery**: Run `bd prime` after compaction, clear, or new session
> Hooks auto-call this in Claude Code when .beads/ detected

# 🚨 SESSION CLOSE PROTOCOL 🚨

**CRITICAL**: Before saying "done" or "complete", you MUST run this checklist:

```
[ ] 1. git status              (check what changed)
[ ] 2. git add <files>         (stage code changes)
[ ] 3. bd sync --from-main     (pull beads updates from main)
[ ] 4. git commit -m "..."     (commit code changes)
```

Use the commit-message skill to craft a good commit message
**Note:** This is an ephemeral branch (no upstream). Code is merged to main locally, not pushed.

## Core Rules

- Track ALL work in beads (no TodoWrite tool, no markdown TODOs)
- Use `bd create` to create issues, not TodoWrite tool
- Git workflow: hooks auto-sync, run `bd sync` at session end
- Session management: check `bd ready` for available work

## Essential Commands

### Finding Work

- `bd ready` - Show issues ready to work (no blockers)
- `bd list --status=open` - All open issues
- `bd list --status=in_progress` - Your active work
- `bd show <id>` - Detailed issue view with dependencies

### Creating & Updating

- `bd create --title="..." --type=task|bug|feature` - New issue
- `bd update <id> --status=in_progress` - Claim work
- `bd update <id> --assignee=username` - Assign to someone
- `bd close <id>` - Mark complete
- `bd close <id1> <id2> ...` - Close multiple issues at once (more efficient)
- `bd close <id> --reason="explanation"` - Close with reason
- **Tip**: When creating multiple issues/tasks/epics, use parallel subagents for efficiency

### Dependencies & Blocking

- `bd dep add <issue> <depends-on>` - Add dependency (issue depends on depends-on)
- `bd blocked` - Show all blocked issues
- `bd show <id>` - See what's blocking/blocked by this issue

### Sync & Collaboration

- `bd sync --from-main` - Pull beads updates from main (for ephemeral branches)
- `bd sync --status` - Check sync status without syncing

### Project Health

- `bd stats` - Project statistics (open/closed/blocked counts)
- `bd doctor` - Check for issues (sync problems, missing hooks)

## Common Workflows

**Working on an issue:**
When working on a list of issues use a subagent.
Finish the sub issue and return to main threat to look for the next sub issue.

**Starting work:**

```bash
bd ready           # Find available work
bd show <id>       # Review issue details
bd update <id> --status=in_progress  # Claim it
```

**Completing work:**

```bash
bd close <id1> <id2> ...    # Close all completed issues at once
bd sync --from-main         # Pull latest beads from main
git add . && git commit -m "..."  # Commit your changes
# Merge to main when ready (local merge, not push)
```

**Creating dependent work:**

```bash
# Run bd create commands in parallel (use subagents for many items)
bd create --title="Implement feature X" --type=feature
bd create --title="Write tests for X" --type=task
bd dep add beads-yyy beads-xxx  # Tests depend on Feature (Feature blocks tests)
```

## Commands

```bash
# Development
pnpm dev                    # Dev server (port 3003)
pnpm tsx scripts/<name>.ts  # Run scripts

# Code Quality
pnpm lint:fix               # Auto-fix issues
pnpm typecheck              # TypeScript checking (slow, may timeout)
```

**Testing**: ❌ No test framework configured. Do NOT run tests.

## Issue Tracking with bd (beads)

**IMPORTANT**: Use **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs or task lists.

**Why bd?** Dependency-aware, git-friendly (auto-syncs to `.beads/issues.jsonl`), agent-optimized with JSON output.

**Auto-Sync**: Exports to JSONL after changes (5s debounce), imports on `git pull`. Always commit `.beads/issues.jsonl` with code changes.

**AI Planning Docs**: Store ephemeral planning documents (PLAN.md, IMPLEMENTATION.md, etc.) in `history/` directory to keep repo root clean. When adding a planing doc for a epic reference it in the epic description.

## Code Style

**Formatting**: No semicolons, single quotes, 2 spaces, 100 char width, LF line endings

**Linting**:

- Unused vars start with `_`
- `console.log` warning in frontend, allowed in `scripts/`, `server/`
- Prefer `const` over `let`

**Auto-imports**: use the nuxt-auto-import skill if needed

**Naming**:

- Components: `PascalCase.vue`
- Pages: `kebab-case.vue`
- Composables/Stores: `useCamelCase.ts`
- Utils: `camelCase.ts`
- Types: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`

**Error Handling**: Always use try/catch for async operations, return fallback values

**Vue**: Use `<script setup lang="ts">`, `ref()` for reactivity

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
- ✅ Leverage auto-imports
- ✅ Use file-based routing in `app/pages/`

### Naming Conventions

- Components: `PascalCase.vue` (e.g., `MovieCard.vue`)
- Pages: `kebab-case.vue` (e.g., `movie-detail.vue`)
- Composables/Stores: `useCamelCase.ts` (e.g., `useMovieStore.ts`)
- Utils: `camelCase.ts` (e.g., `formatDate.ts`)

### Auto-Import Rules

**Auto-imported (no import needed):**

When you see import errors please read @.opencode/command/nuxt-autoimport.md

### Development Commands

```bash
pnpm dev                              # Start dev server (port 3003)
pnpm tsx scripts/<name>.ts            # Run scripts
```

## Frontend Verification

**IMPORTANT**: Always verify frontend changes using the **chrome-devtools** MCP.

- When using the MCP server nerver kill chorme before or after usage

### Dev Server Management

- **Check first**: Always check if dev server is already running
  - Use `curl -s http://localhost:3003/api/readyz` to check server status
  - If returns JSON with `"status": "ready"`, server is running
- **Ask user to start Dev server**: if it's not already running
- **NEVER stop at end**: Do NOT kill the server when you're done working
  - Leave it running for continuous frontend verification

### Verification Steps

- Use `chrome-devtools_navigate_page` to `http://localhost:3003`
- Use `chrome-devtools_take_screenshot` or `chrome-devtools_take_snapshot` to verify UI
- Check console for errors with `chrome-devtools_list_console_messages`
