# Test Scripts

Manual test scripts for validating core functionality. These are **not** automated unit tests (no Vitest yet), but rather executable scripts for manual verification during development.

## Available Tests

### Title Cleaning Tests

#### `test-title-cleaning.ts`

**Purpose:** Runs built-in test suite from `titleCleaner.ts`  
**Usage:** `pnpm tsx tests/test-title-cleaning.ts`  
**Tests:** All cleaning rules with example inputs/outputs

#### `test-clean-direct.ts`

**Purpose:** Test `cleanTitle()` with actual YouTube titles  
**Usage:** `pnpm tsx tests/test-clean-direct.ts`  
**Tests:** Real-world YouTube title cleaning (German movies)

#### `test-real-titles.ts`

**Purpose:** Test title cleaner with database titles  
**Usage:** `pnpm tsx tests/test-real-titles.ts`  
**Tests:** Validates cleaning on actual movie database entries

### Data Structure Tests

#### `test-movie-store.ts`

**Purpose:** Verify movie store refactoring and data loading  
**Usage:** `pnpm tsx tests/test-movie-store.ts`  
**Tests:**

- Loading movies from `public/data/movies.json`
- Filtering by source (Archive.org, YouTube)
- OMDB metadata enrichment
- Search functionality
- Poster URL logic

### OMDB Matching Tests

#### `test-cyrano-fix.ts`

**Purpose:** Verify OMDB year-based matching fix  
**Usage:** `pnpm tsx tests/test-cyrano-fix.ts`  
**Requires:** `NUXT_PUBLIC_OMDB_API_KEY` or `OMDB_API_KEY` env var  
**Tests:**

- Matching with year parameter (1950 vs 1990 versions)
- Matching without year
- Prevents wrong version matches

## Running Tests

```bash
# Run all title cleaning tests
pnpm tsx tests/test-title-cleaning.ts
pnpm tsx tests/test-clean-direct.ts
pnpm tsx tests/test-real-titles.ts

# Test movie store
pnpm tsx tests/test-movie-store.ts

# Test OMDB matching (requires API key)
OMDB_API_KEY=your_key pnpm tsx tests/test-cyrano-fix.ts
```

## Future: Automated Testing

These manual tests should eventually be converted to proper unit tests using Vitest. For now, they serve as:

- Development validation tools
- Regression testing for critical fixes
- Documentation of expected behavior

## Removed Tests

- `test-regex.ts` - One-off regex debugging (obsolete)
- `test-opencode.ts` - Experimental OpenCode SDK testing (not core functionality)
