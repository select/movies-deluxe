---
name: commit-message
description: Guide for creating commit message. This skill should be used when you try to create a commit message.
license: MIT
---

## Commit Message Format (Conventional Commits)

**Format**: `<type>(<scope>): <subject>` (max 120 chars, lowercase subject, no period)

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

**Common Scopes**: `admin`, `collections`, `ui`, `components`, `store`, `filters`, `scraper`, `types`, `ai`, `omdb`, `youtube`, `search`, `db`, `data`, `api`, `config`, `deps`

**Multi-Scope**: Choose primary scope for changes spanning multiple areas. Split unrelated changes into separate commits. Omit scope for global changes.

**Rules**:

- ✅ Present tense, imperative mood: "add feature" not "added feature"
- ✅ Be specific, reference issues in footer: `Closes #123`
- ❌ No past tense, vague descriptions, capitalized subject, or trailing period

**Body** (optional): Add blank line after subject, then explain what/why (not how). Body lines max 120 chars. Use for complex changes needing context.

**Examples**:

```bash
feat(scraper): add youtube channel scraping
fix(validation): handle missing imdb ids correctly
feat(enrichment): add omdb api integration

Integrate OMDB API to enrich movie metadata.

Closes movies-deluxe-uq0.12
```

**Breaking Changes**: Add `BREAKING CHANGE:` in footer
