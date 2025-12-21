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

**IMPORTANT**: This project uses **Nuxt 4** with standard directory conventions. Key features: auto-imports, file-based routing, and type safety.

### Key Directories

**`app/`** - Frontend code

- `pages/` - File-based routing (`index.vue` → `/`)
- `components/` - Vue components (auto-imported)
- `composables/` - Composables (auto-imported, prefix with `use`)
- `stores/` - Pinia stores (auto-imported, prefix with `use`)
- `utils/` - Utility functions (auto-imported)
- `assets/` - Processed assets (CSS, images)

**`public/`** - Static files served at root (no processing)

- `posters/` - Movie poster images (57 files)
- `data/movies.json` - Static movie database

**`types/`** - Shared TypeScript types (auto-imported)

**`scripts/`** - Node.js scripts (NOT part of Nuxt build)

- Run via `pnpm tsx scripts/<name>.ts`

**`config/`** - Project configuration data

**`data/`** - Backend data storage (copied to `public/` for frontend)

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

### Important Rules

- ✅ Use `app/` for frontend, `server/` for backend, `public/` for static files
- ✅ Leverage auto-imports (components, composables, utils)
- ✅ Use file-based routing in `app/pages/`
- ❌ Do NOT manually import auto-imported items
- ❌ Do NOT put processed assets in `public/`
