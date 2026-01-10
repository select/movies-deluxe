# Lazy Loading Optimization Plan

## Epic Goal

Optimize movie loading performance by implementing lazy loading strategies across the application. Only load the data that's needed when it's needed, reducing initial load times and memory usage.

## Current State Analysis

### Search Page (`/search`)

- **Current behavior**: Loads all movie IDs initially via `lightweightQuery`, then loads full movie data for visible rows
- **Issue**: Still loads ALL movie IDs upfront, which can be slow for large datasets
- **Components**: `search.vue`, `MovieVirtualGrid.vue`, `MovieCard.vue`

### Movie Detail Page (`/movie/[id]`)

- **Current behavior**: Loads full movie data from JSON file (`/movies/{imdbId}.json`)
- **Issue**: Loads ALL movies in store via `loadFromFile()` even though only one movie is needed
- **Line**: `app/pages/movie/[id].vue:518` - `if (totalMovies.value === 0) await loadFromFile()`

### Other Pages

- `/liked` - Needs to load liked movies only
- `/collections/[id]` - Needs to load collection movies only
- `/` (index) - May have similar issues

## Optimization Strategy

### 1. Search Page Optimization

**Goal**: Load count first, then load only visible movie IDs, then load full data for each visible row separately

**Current flow**:

```
1. loadFromFile() → Initialize DB
2. fetchLightweightMovies() → Load ALL movie IDs matching filters
3. MovieVirtualGrid renders visible rows
4. MovieCard displays each movie (uses cached data)
```

**Optimized flow**:

```
1. loadFromFile() → Initialize DB
2. fetchMovieCount() → Get total count only (for stats display)
3. fetchLightweightMovies(limit, offset) → Load only IDs for visible + buffer rows
4. MovieVirtualGrid renders visible rows
5. fetchMoviesByIds() → Load full data for each visible row separately (per-row basis)
6. MovieCard displays each movie
```

**Benefits**:

- Initial load only fetches count (fast)
- Only loads IDs for visible rows + buffer
- Full data loaded per-row as needed
- Reactive count display updates immediately

### 2. Movie Detail Page Optimization

**Goal**: Don't load all movies when viewing a single movie

**Current flow**:

```
1. Check if totalMovies === 0
2. If yes, call loadFromFile() → Loads entire DB
3. Call getMovieById() → Fetches from JSON file
```

**Optimized flow**:

```
1. Call getMovieById() directly → Fetches from JSON file
2. Only initialize DB if needed for related movies
3. Related movies use fetchMoviesByIds() with specific IDs
```

**Benefits**:

- No unnecessary DB initialization
- Faster page load
- Lower memory usage

### 3. Database Query Optimization

**New methods needed**:

- `getMovieCount(filters)` - Returns count only
- `fetchLightweightMovies(filters, limit, offset)` - Paginated ID loading
- Enhance `fetchMoviesByIds()` - Already exists, ensure it's used properly

## Implementation Tasks

### Phase 1: Database Layer

1. Add `getMovieCount()` method to database worker
2. Add pagination support to `lightweightQuery()` (already has limit/offset)
3. Ensure `queryByIds()` is optimized for batch loading

### Phase 2: Store Layer

1. Add `fetchMovieCount()` action to movie store
2. Modify `fetchLightweightMovies()` to support pagination
3. Add state for tracking loaded ranges (avoid re-fetching)
4. Ensure `fetchMoviesByIds()` is called per-row

### Phase 3: Search Page

1. Modify `search.vue` to fetch count first
2. Display count reactively before movies load
3. Implement paginated ID loading in virtual grid
4. Add per-row data fetching in MovieVirtualGrid

### Phase 4: Movie Detail Page

1. Remove unnecessary `loadFromFile()` call
2. Ensure `getMovieById()` works without full DB load
3. Optimize related movies loading

### Phase 5: Other Pages

1. Audit `/liked` page
2. Audit `/collections/[id]` page
3. Audit `/` (index) page
4. Apply similar optimizations

## Success Metrics

- Initial search page load time reduced by 50%+
- Movie detail page load time reduced by 70%+
- Memory usage reduced significantly
- Smooth scrolling maintained
- No visual regressions

## Technical Considerations

### Caching Strategy

- Keep `movieDetailsCache` for full movie data
- Add `movieIdCache` for lightweight data
- Implement cache invalidation on filter changes

### Virtual Scrolling

- Maintain current virtual scrolling behavior
- Ensure smooth scrolling with lazy loading
- Buffer rows appropriately (currently 3 rows)

### Error Handling

- Handle missing movies gracefully
- Show loading states appropriately
- Fallback to full load if lazy load fails

### Testing

- Test with large datasets (10k+ movies)
- Test rapid scrolling
- Test filter changes
- Test navigation between pages
- Test browser back/forward

## Dependencies

- SQLite WASM database (already in use)
- VueUse composables (already in use)
- Pinia store (already in use)
- Virtual scrolling (already implemented)

## Risks & Mitigations

- **Risk**: Complexity in state management
  - **Mitigation**: Clear separation of concerns, thorough testing
- **Risk**: Race conditions in lazy loading
  - **Mitigation**: Proper request cancellation, loading states
- **Risk**: Visual flickering during load
  - **Mitigation**: Skeleton loaders, smooth transitions
- **Risk**: Breaking existing functionality
  - **Mitigation**: Incremental rollout, feature flags if needed
