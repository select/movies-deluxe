# Vector Search Implementation Research

**Date**: 2026-01-13  
**Issue**: movies-deluxe-i1cu  
**Status**: Research Complete

## Executive Summary

This document outlines the research findings for integrating sqlite-vec with the existing movies-deluxe SQLite infrastructure to enable semantic search and similarity recommendations.

## Current SQLite Setup

### Frontend (Browser WASM)

- **Package**: `@sqlite.org/sqlite-wasm` v3.51.1-build2
- **Location**: `app/workers/database.worker.ts`
- **Database Loading**: Fetches pre-built `movies.db` from `/data/movies.db` and deserializes into memory using `sqlite3_deserialize()`
- **WASM Files**: Copied from `node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm` to `public/sqlite-wasm/` via `scripts/copy-sqlite-wasm.ts`

### Backend (Build Time)

- **Package**: `better-sqlite3` v12.5.0
- **Location**: `server/utils/generateSQLite.ts`
- **Purpose**: Generates `public/data/movies.db` from `data/movies.json`
- **Schema**: Movies, genres, countries, FTS5 search, collections
- **Size**: ~31k+ movies

## sqlite-vec Overview

### What is sqlite-vec?

- **Pure C** SQLite extension with **no dependencies**
- **Runs anywhere** SQLite runs (Linux/MacOS/Windows/WASM/mobile)
- **Vector formats**: float32, int8, binary
- **Virtual table**: `vec0` for storing and querying vectors
- **Distance metrics**: L2 (Euclidean), cosine similarity
- **Size**: Single file (`sqlite-vec.c` + `sqlite-vec.h`)

### Key Features

- KNN (K-Nearest Neighbors) queries
- Metadata columns for non-vector data
- Partition keys for organizing vectors
- Auxiliary columns for additional context
- Binary and scalar quantization support
- Matryoshka embeddings (variable dimensions)

## Integration Approaches

### Option 1: WASM Extension Loading (Recommended)

**Approach**: Load sqlite-vec as a WASM extension in the browser worker

**Pros**:

- ✅ No backend changes needed
- ✅ Client-side vector search (privacy-friendly)
- ✅ Works with existing WASM setup
- ✅ sqlite-vec has official WASM support

**Cons**:

- ❌ Need to compile sqlite-vec to WASM
- ❌ Slightly larger bundle size (~50-100KB)
- ❌ Extension loading in WASM requires special setup

**Implementation**:

1. Compile sqlite-vec to WASM or use pre-built WASM from releases
2. Copy `vec0.wasm` to `public/sqlite-wasm/`
3. Load extension in `database.worker.ts` using `sqlite3.capi.sqlite3_load_extension()`
4. Add vec0 table to schema in `generateSQLite.ts`

**Status**: ⚠️ **BLOCKER** - `@sqlite.org/sqlite-wasm` may not support runtime extension loading. Need to investigate if extensions can be loaded in WASM environment.

### Option 2: Statically Compile sqlite-vec into WASM

**Approach**: Rebuild SQLite WASM with sqlite-vec compiled in

**Pros**:

- ✅ No runtime extension loading needed
- ✅ Guaranteed compatibility
- ✅ Single WASM file

**Cons**:

- ❌ Complex build process
- ❌ Need to maintain custom SQLite WASM build
- ❌ Harder to update sqlite-vec versions
- ❌ May conflict with `@sqlite.org/sqlite-wasm` package

**Implementation**:

1. Clone SQLite WASM source
2. Add sqlite-vec.c to build
3. Compile with Emscripten
4. Replace `@sqlite.org/sqlite-wasm` with custom build

**Status**: ❌ **NOT RECOMMENDED** - Too complex, hard to maintain

### Option 3: Backend-Only Vector Search

**Approach**: Keep vectors in backend SQLite, expose via API

**Pros**:

- ✅ Simple integration with better-sqlite3
- ✅ Can use npm package `sqlite-vec` directly
- ✅ No WASM complications

**Cons**:

- ❌ Requires API calls for every search
- ❌ Slower than client-side search
- ❌ Doesn't leverage existing client-side DB
- ❌ Privacy concerns (embeddings sent to server)

**Implementation**:

1. Install `sqlite-vec` npm package
2. Load extension in `generateSQLite.ts`
3. Create API endpoint for vector search
4. Frontend calls API for semantic search

**Status**: ⚠️ **FALLBACK OPTION** - Use if WASM approach fails

## Vector Table Schema

### Proposed Schema

```sql
CREATE VIRTUAL TABLE vec_movies USING vec0(
  movie_id TEXT PRIMARY KEY,
  embedding FLOAT[384]  -- nomic-embed-text dimensions
);
```

### Alternative with Metadata

```sql
CREATE VIRTUAL TABLE vec_movies USING vec0(
  movie_id TEXT PRIMARY KEY,
  embedding FLOAT[384],
  +title TEXT,           -- metadata column (not indexed)
  +year INTEGER,         -- metadata column
  +genre TEXT            -- metadata column
);
```

Metadata columns (prefixed with `+`) are stored but not used for vector search, useful for returning results without joins.

## Embedding Generation

### Model: nomic-embed-text

- **Dimensions**: 384
- **Provider**: Ollama (local)
- **Input**: Markdown representation of movie
- **Batch size**: 100 movies per batch (to avoid rate limits)

### Movie Markdown Format

```markdown
# The Shawshank Redemption (1994)

Genres: Drama, Crime
Director: Frank Darabont
Actors: Tim Robbins, Morgan Freeman
Country: USA
Plot: Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.
```

### Storage

**Option A**: Store embeddings in `data/embeddings.json` (temporary)

```json
{
  "tt0111161": [0.123, -0.456, ...],
  "tt0068646": [0.789, 0.234, ...]
}
```

**Option B**: Store directly in SQLite during build

- Pro: Single source of truth
- Con: Larger database file (~31k movies × 384 dims × 4 bytes = ~47MB)

## Performance Considerations

### Database Size Impact

- **Current DB**: ~50MB (31k movies)
- **With vectors**: ~50MB + 47MB = ~97MB
- **With int8 quantization**: ~50MB + 12MB = ~62MB (75% smaller)
- **With binary quantization**: ~50MB + 1.5MB = ~51.5MB (97% smaller)

### Query Performance

- **KNN search**: O(n) brute force (acceptable for 31k vectors)
- **Expected latency**: 10-50ms for top-20 results
- **Optimization**: Use partition keys to split by genre/year if needed

### Memory Usage

- **WASM heap**: Need to ensure sufficient memory for vectors
- **Current**: ~50MB database
- **With vectors**: ~100MB total (should fit in 256MB WASM heap)

## Recommended Implementation Plan

### Phase 1: Backend Integration (Proof of Concept)

1. Install `sqlite-vec` npm package
2. Add vec0 table to `generateSQLite.ts`
3. Create embedding generation script
4. Test vector search in backend

### Phase 2: WASM Investigation

1. Research `@sqlite.org/sqlite-wasm` extension loading
2. Test loading sqlite-vec in WASM environment
3. If successful, proceed to Phase 3
4. If blocked, use backend-only approach (Option 3)

### Phase 3: Frontend Integration (if WASM works)

1. Copy sqlite-vec WASM files to public/
2. Load extension in database.worker.ts
3. Implement vector search in useMovieStore
4. Add UI toggle for semantic search

### Phase 4: Optimization

1. Implement binary/scalar quantization
2. Add partition keys for faster search
3. Cache embeddings for common queries
4. Benchmark and tune performance

## Open Questions

1. **WASM Extension Loading**: Can `@sqlite.org/sqlite-wasm` load extensions at runtime?

   - **Action**: Test with simple extension first
   - **Fallback**: Use backend-only approach

2. **Embedding Storage**: JSON file vs SQLite?

   - **Recommendation**: SQLite for single source of truth
   - **Alternative**: JSON for easier debugging during development

3. **Quantization**: Use int8 or binary?

   - **Recommendation**: Start with float32, add quantization later
   - **Reason**: Easier to debug, acceptable size for 31k movies

4. **Ollama Availability**: Require local Ollama or use API?
   - **Recommendation**: Local Ollama for build-time generation
   - **Alternative**: Pre-generate embeddings and commit to repo

## Next Steps

1. ✅ Complete this research document
2. ⬜ Test sqlite-vec with better-sqlite3 (backend)
3. ⬜ Create embedding generation script
4. ⬜ Test WASM extension loading
5. ⬜ Choose final integration approach
6. ⬜ Implement Phase 1 (backend POC)

## References

- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec)
- [sqlite-vec Documentation](https://alexgarcia.xyz/sqlite-vec/)
- [sqlite-vec NPM Package](https://www.npmjs.com/package/sqlite-vec)
- [Ollama Embeddings](https://ollama.com/blog/embedding-models)
- [nomic-embed-text Model](https://ollama.com/library/nomic-embed-text)
- [@sqlite.org/sqlite-wasm](https://www.npmjs.com/package/@sqlite.org/sqlite-wasm)

## Conclusion

**Recommended Approach**: Start with **Option 3 (Backend-Only)** as a proof of concept, then investigate **Option 1 (WASM Extension)** for production.

**Rationale**:

- Backend integration is straightforward and low-risk
- Provides immediate value for testing embeddings and search quality
- WASM approach requires more research but offers better UX
- Can migrate from backend to frontend later without changing schema

**Estimated Effort**:

- Backend POC: 2-4 hours
- WASM investigation: 4-8 hours
- Full implementation: 16-24 hours
- Optimization: 8-16 hours

**Risk Level**: Medium

- WASM extension loading is uncertain
- Embedding generation requires Ollama setup
- Database size increase may impact load times
