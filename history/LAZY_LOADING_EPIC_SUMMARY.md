# Lazy Loading Optimization Epic - Summary

## Epic Overview

**Epic ID**: `movies-deluxe-n3ae`  
**Title**: Lazy Loading Optimization Epic  
**Priority**: High (2)  
**Status**: Open

### Description

Optimize movie loading performance by implementing lazy loading strategies. Currently, the app loads all movie data upfront which is slow for large datasets. This epic implements:

1. Load count first on search page
2. Load only visible movie IDs with pagination
3. Load full movie data per-row as needed
4. Remove unnecessary DB initialization on movie detail pages

### Expected Improvements

- **50%+** faster search page load
- **70%+** faster movie detail page load
- **Significantly reduced** memory usage

---

## Implementation Phases

### Phase 1: Database Layer (Foundation)

**Ready to start** - No blockers

| ID                   | Task                                         | Priority | Status |
| -------------------- | -------------------------------------------- | -------- | ------ |
| `movies-deluxe-mhnh` | Add getMovieCount() to database worker       | 2        | Open   |
| `movies-deluxe-u9lb` | Add pagination support to lightweightQuery() | 2        | Open   |
| `movies-deluxe-fljq` | Optimize queryByIds() for batch loading      | 2        | Open   |

**Details**:

- Add `getMovieCount(filters)` method for fast count-only queries
- Enhance `lightweightQuery()` with proper limit/offset pagination
- Optimize `queryByIds()` for efficient batch loading with caching

---

### Phase 2: Store Layer

**Blocked by**: Phase 1 tasks

| ID                   | Task                                           | Priority | Status | Depends On           |
| -------------------- | ---------------------------------------------- | -------- | ------ | -------------------- |
| `movies-deluxe-xacq` | Add fetchMovieCount() action to movie store    | 2        | Open   | `movies-deluxe-mhnh` |
| `movies-deluxe-im84` | Modify fetchLightweightMovies() for pagination | 2        | Open   | `movies-deluxe-u9lb` |

**Details**:

- Add `fetchMovieCount()` action that calls database method
- Update `fetchLightweightMovies()` to support pagination parameters
- Add state tracking for loaded ranges

---

### Phase 3: Search Page Implementation

**Blocked by**: Phase 1 & 2 tasks

| ID                   | Task                                          | Priority | Status | Depends On                                 |
| -------------------- | --------------------------------------------- | -------- | ------ | ------------------------------------------ |
| `movies-deluxe-5dji` | Add per-row data fetching to MovieVirtualGrid | 2        | Open   | `movies-deluxe-fljq`, `movies-deluxe-im84` |
| `movies-deluxe-rek1` | Update search.vue to fetch count first        | 2        | Open   | `movies-deluxe-xacq`, `movies-deluxe-5dji` |

**Details**:

- Modify `MovieVirtualGrid` to fetch full movie data per-row
- Update `search.vue` to fetch count first, then paginated IDs
- Display count reactively before movies load
- Implement proper loading states

---

### Phase 4: Movie Detail Page Optimization

**Blocked by**: Phase 1 tasks

| ID                   | Task                                                     | Priority | Status | Depends On           |
| -------------------- | -------------------------------------------------------- | -------- | ------ | -------------------- |
| `movies-deluxe-2fdu` | Remove unnecessary loadFromFile() from movie detail page | 2        | Open   | `movies-deluxe-fljq` |
| `movies-deluxe-5ei6` | Optimize related movies loading                          | 2        | Open   | `movies-deluxe-fljq` |

**Details**:

- Remove `loadFromFile()` call from `movie/[id].vue` (line 518)
- Ensure `getMovieById()` works independently
- Update `getRelatedMovies()` to use `fetchMoviesByIds()`
- Only initialize DB if needed for related movies

---

### Phase 5: Other Pages Optimization

**Blocked by**: Phase 1 & 2 tasks

| ID                   | Task                                      | Priority | Status | Depends On           |
| -------------------- | ----------------------------------------- | -------- | ------ | -------------------- |
| `movies-deluxe-yz8x` | Audit and optimize /liked page            | 1        | Open   | `movies-deluxe-fljq` |
| `movies-deluxe-z1l1` | Audit and optimize /collections/[id] page | 1        | Open   | `movies-deluxe-fljq` |
| `movies-deluxe-5hoz` | Audit and optimize / (index) page         | 1        | Open   | `movies-deluxe-im84` |

**Details**:

- `/liked`: Load only liked movies using `fetchMoviesByIds()`
- `/collections/[id]`: Load only collection movies, add virtual scrolling if needed
- `/` (index): Apply similar optimizations as search page

---

### Phase 6: Polish & Testing

**Blocked by**: All implementation phases

| ID                   | Task                                  | Priority | Status | Depends On           |
| -------------------- | ------------------------------------- | -------- | ------ | -------------------- |
| `movies-deluxe-hbt4` | Add loading states and error handling | 2        | Open   | All Phase 3-5 tasks  |
| `movies-deluxe-iuj3` | Test lazy loading with large datasets | 2        | Open   | `movies-deluxe-hbt4` |

**Details**:

- Implement proper loading states for all lazy loading operations
- Add skeleton loaders where appropriate
- Implement error handling with fallback to full load
- Test with 10k+ movies dataset
- Document performance metrics before and after

---

## Dependency Graph

```
Epic (movies-deluxe-n3ae)
├── Phase 1: Database Layer (Ready to start)
│   ├── movies-deluxe-mhnh (getMovieCount)
│   ├── movies-deluxe-u9lb (pagination)
│   └── movies-deluxe-fljq (queryByIds optimization)
│
├── Phase 2: Store Layer
│   ├── movies-deluxe-xacq (fetchMovieCount) ← depends on mhnh
│   └── movies-deluxe-im84 (fetchLightweightMovies) ← depends on u9lb
│
├── Phase 3: Search Page
│   ├── movies-deluxe-5dji (per-row fetching) ← depends on fljq, im84
│   └── movies-deluxe-rek1 (search.vue) ← depends on xacq, 5dji
│
├── Phase 4: Movie Detail Page
│   ├── movies-deluxe-2fdu (remove loadFromFile) ← depends on fljq
│   └── movies-deluxe-5ei6 (related movies) ← depends on fljq
│
├── Phase 5: Other Pages
│   ├── movies-deluxe-yz8x (/liked) ← depends on fljq
│   ├── movies-deluxe-z1l1 (/collections) ← depends on fljq
│   └── movies-deluxe-5hoz (/ index) ← depends on im84
│
└── Phase 6: Polish & Testing
    ├── movies-deluxe-hbt4 (loading states) ← depends on all Phase 3-5
    └── movies-deluxe-iuj3 (testing) ← depends on hbt4
```

---

## Current Status

### Ready to Start (4 tasks)

1. **Epic**: `movies-deluxe-n3ae` - Lazy Loading Optimization Epic
2. **Task**: `movies-deluxe-mhnh` - Add getMovieCount() to database worker
3. **Task**: `movies-deluxe-u9lb` - Add pagination support to lightweightQuery()
4. **Task**: `movies-deluxe-fljq` - Optimize queryByIds() for batch loading

### Blocked (11 tasks)

All other tasks are blocked by Phase 1 tasks.

### Project Stats

- **Total Issues**: 181
- **Open Issues**: 15
- **Blocked Issues**: 11
- **Ready Issues**: 4

---

## Key Files to Modify

### Database Layer

- `app/composables/useDatabase.ts` - Add getMovieCount, enhance pagination
- `workers/database.worker.ts` - Implement new query methods

### Store Layer

- `app/stores/useMovieStore.ts` - Add fetchMovieCount, modify fetchLightweightMovies

### Components

- `app/components/MovieVirtualGrid.vue` - Add per-row data fetching
- `app/components/MovieCard.vue` - Handle loading states

### Pages

- `app/pages/search.vue` - Fetch count first, paginated loading
- `app/pages/movie/[id].vue` - Remove loadFromFile() call (line 518)
- `app/pages/liked.vue` - Optimize for lazy loading
- `app/pages/collections/[id].vue` - Optimize for lazy loading
- `app/pages/index.vue` - Optimize for lazy loading

---

## Success Criteria

### Performance Metrics

- [ ] Search page initial load time reduced by 50%+
- [ ] Movie detail page load time reduced by 70%+
- [ ] Memory usage significantly reduced
- [ ] Smooth scrolling maintained (60fps)

### Functionality

- [ ] Count displays immediately on search page
- [ ] Movies load progressively as user scrolls
- [ ] No visual regressions
- [ ] All pages work without loading entire database
- [ ] Error handling works correctly
- [ ] Browser back/forward navigation works

### Testing

- [ ] Tested with 10k+ movies dataset
- [ ] Tested rapid scrolling
- [ ] Tested filter changes
- [ ] Tested navigation between pages
- [ ] Performance metrics documented

---

## Next Steps

1. **Start Phase 1**: Begin with the 3 database layer tasks (all ready to start)
2. **Review Planning**: Review the implementation plan document at `history/LAZY_LOADING_OPTIMIZATION_PLAN.md`
3. **Track Progress**: Use `bd ready` to see available tasks, `bd blocked` to see blocked tasks
4. **Update Status**: Mark tasks as `in_progress` when starting, `completed` when done

---

## Commands Reference

```bash
# View ready tasks
bd ready

# View blocked tasks
bd blocked

# View epic details
bd show movies-deluxe-n3ae

# Start working on a task
bd update <task-id> --status=in_progress

# Complete a task
bd close <task-id>

# View project stats
bd stats
```

---

**Created**: 2026-01-10  
**Last Updated**: 2026-01-10  
**Status**: Planning Complete - Ready for Implementation
