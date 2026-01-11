---
description: Commit changed and new files with conventional commit message
---

Look for files that have changed or that are new
Create one or several commits, bundle changes when it makes sense.

Create a git commit following Conventional Commits format: `<type>(<scope>): <subject>`

1. Run `git status`, `git diff`, and `git log --oneline -5`
2. Analyze changes and new and determine type/scope
3. Create one or more commits
4. Draft message (lowercase, present tense, imperative, max 120 chars)
5. Stage files with `git add` and commit

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`
**Scopes**: `scraper`, `validation`, `enrichment`, `store`, `types`, `utils`, `config`, `deps`, `admin`, `ui`

**Best Practices**:

- ✅ Present tense ("add" not "added"), be specific, reference beads issues
- ❌ No past tense, vague terms, capitals, periods, or secrets

**Example**: `feat(admin): add omdb enrichment panel`
