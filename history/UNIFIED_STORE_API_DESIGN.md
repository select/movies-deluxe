# Unified Store API Design

## Overview

This document defines the complete API for the unified movie store that consolidates `useMovieStore`, `useFilterStore`, `useLikedMoviesStore`, and `useWatchlistStore` into a single source of truth.

## Type Definitions

### Extended Movie Interface

```typescript
/**
 * Extended MovieEntry with user metadata
 * Extends the existing MovieEntry type with like/watchlist fields
 */
export interface ExtendedMovieEntry extends MovieEntry {
  // User metadata (embedded in movie object)
  isLiked?: boolean
  likedAt?: number
  inWatchlist?: boolean
  addedToWatchlistAt?: number
}
```

### Filter State

```typescript
/**
 * Filter state interface (same as current FilterState)
 */
export interface UnifiedFilterState {
  // Sorting
  sort: {
    field: SortField
    direction: SortDirection
  }
  previousSort?: {
    field: SortField
    direction: SortDirection
  }

  // Filters
  sources: string[] // 'archive.org' or YouTube channel names
  minRating: number // 0-10
  minYear: number // 1910-2025
  minVotes: number // 0+
  genres: string[] // Selected genres
  countries: string[] // Selected countries
  searchQuery: string // Search text
  showMissingMetadataOnly: boolean // Dev filter

  // Pagination
  currentPage: number
  lastScrollY: number
}
```

### Store State

```typescript
/**
 * Internal store state
 */
interface StoreState {
  // Single source of truth - all movies stored here
  allMovies: Map<string, ExtendedMovieEntry>

  // Cache for movie details
  movieDetailsCache: Map<string, ExtendedMovieEntry>

  // Loading states
  isInitialLoading: boolean
  isFiltering: boolean
  isLoading: {
    movies: boolean
    movieDetails: boolean
    imdbFetch: boolean
  }

  // Filter state
  filters: UnifiedFilterState

  // Database composable
  db: ReturnType<typeof useDatabase>
}
```

## Computed Properties

### Data Views (No Duplication)

```typescript
/**
 * Filtered and sorted movies based on current filters
 * This is the primary computed property that applies all filters
 */
const filteredAndSortedMovies: ComputedRef<ExtendedMovieEntry[]>

/**
 * Paginated movies for display (subset of filteredAndSortedMovies)
 * Includes movies up to currentPage * ITEMS_PER_PAGE
 */
const paginatedMovies: ComputedRef<ExtendedMovieEntry[]>

/**
 * Lightweight movies for virtual scrolling
 * Only includes essential fields (imdbId, title, year)
 */
const lightweightMovies: ComputedRef<LightweightMovieEntry[]>

/**
 * Liked movies sorted by likedAt timestamp (newest first)
 */
const likedMovies: ComputedRef<ExtendedMovieEntry[]>

/**
 * Watchlist movies sorted by addedToWatchlistAt timestamp (newest first)
 */
const watchlistMovies: ComputedRef<ExtendedMovieEntry[]>
```

### Statistics

```typescript
/**
 * Total number of movies in the database
 */
const totalMovies: ComputedRef<number>

/**
 * Number of movies after applying filters
 */
const totalFiltered: ComputedRef<number>

/**
 * Number of liked movies
 */
const likedCount: ComputedRef<number>

/**
 * Number of watchlist movies
 */
const watchlistCount: ComputedRef<number>

/**
 * Whether more movies can be loaded (pagination)
 */
const hasMore: ComputedRef<boolean>

/**
 * Number of active filters (excluding sort)
 */
const activeFiltersCount: ComputedRef<number>

/**
 * Whether any filters are active
 */
const hasActiveFilters: ComputedRef<boolean>

/**
 * Current sort option (reconstructed from stored state)
 */
const currentSortOption: ComputedRef<SortOption>
```

## Actions

### Data Loading

```typescript
/**
 * Initialize database and load persisted user data (likes/watchlist)
 * Called once on app initialization
 */
async function loadFromFile(): Promise<void>

/**
 * Load movies from JSON API (fallback or admin interface)
 */
async function loadFromApi(): Promise<void>

/**
 * Fetch movies with filtering and pagination from SQLite
 * @param options - Query options (where, params, orderBy, limit, offset, etc.)
 * @returns Object with result array and totalCount
 */
async function fetchMovies(options: {
  where?: string
  params?: any[]
  orderBy?: string
  limit?: number
  offset?: number
  includeCount?: boolean
  searchQuery?: string
}): Promise<{ result: ExtendedMovieEntry[]; totalCount: number }>

/**
 * Fetch full movie details for specific IDs (with caching)
 * @param imdbIds - Array of IMDB IDs to fetch
 * @returns Array of movie entries
 */
async function fetchMoviesByIds(imdbIds: string[]): Promise<ExtendedMovieEntry[]>

/**
 * Get a single movie by ID (from cache or database)
 * @param imdbId - IMDB ID or temporary ID
 * @returns Movie entry or undefined
 */
async function getMovieById(imdbId: string): Promise<ExtendedMovieEntry | undefined>

/**
 * Get related movies for a given movie ID
 * @param movieId - IMDB ID of the movie
 * @param limit - Maximum number of related movies to return
 * @returns Array of related movie entries
 */
async function getRelatedMovies(movieId: string, limit?: number): Promise<ExtendedMovieEntry[]>

/**
 * Search movies using FTS5 full-text search
 * @param searchQuery - Search query string
 * @returns Array of matching movies
 */
async function searchMovies(searchQuery: string): Promise<ExtendedMovieEntry[]>
```

### Filtering & Sorting

```typescript
/**
 * Set a filter value
 * @param filterType - Type of filter to set
 * @param value - Filter value
 */
function setFilter(filterType: keyof UnifiedFilterState, value: any): void

/**
 * Set minimum rating filter
 * @param rating - Minimum rating (0-10)
 */
function setMinRating(rating: number): void

/**
 * Set minimum year filter
 * @param year - Minimum year (1910-2025)
 */
function setMinYear(year: number): void

/**
 * Set minimum votes filter
 * @param votes - Minimum number of votes
 */
function setMinVotes(votes: number): void

/**
 * Toggle genre filter
 * @param genre - Genre name to toggle
 */
function toggleGenre(genre: string): void

/**
 * Toggle country filter
 * @param country - Country name to toggle
 */
function toggleCountry(country: string): void

/**
 * Toggle source filter (archive.org or YouTube channel)
 * @param source - Source identifier to toggle
 */
function toggleSource(source: string): void

/**
 * Toggle missing metadata filter (localhost only)
 */
function toggleMissingMetadata(): void

/**
 * Set search query
 * @param query - Search query string
 */
function setSearchQuery(query: string): void

/**
 * Set sort option
 * @param option - Sort option (field, direction, label)
 */
function setSort(option: SortOption): void

/**
 * Reset all filters to defaults
 */
function resetFilters(): void

/**
 * Apply filters to a custom array of movies
 * Used by liked.vue to filter liked movies
 * @param movies - Array of movies to filter
 * @returns Filtered and sorted array
 */
function applyFilters(movies: ExtendedMovieEntry[]): ExtendedMovieEntry[]
```

### Pagination

```typescript
/**
 * Set current page for pagination
 * @param page - Page number (1-based)
 */
function setCurrentPage(page: number): void

/**
 * Load more movies (increment page)
 */
function loadMoreMovies(): void

/**
 * Set last scroll position
 * @param y - Scroll Y position
 */
function setScrollY(y: number): void
```

### Likes & Watchlist

```typescript
/**
 * Toggle like status for a movie
 * @param movieId - IMDB ID of the movie
 */
function toggleLike(movieId: string): void

/**
 * Add a movie to likes
 * @param movieId - IMDB ID of the movie
 */
function like(movieId: string): void

/**
 * Remove a movie from likes
 * @param movieId - IMDB ID of the movie
 */
function unlike(movieId: string): void

/**
 * Check if a movie is liked
 * @param movieId - IMDB ID of the movie
 * @returns Boolean indicating if movie is liked
 */
function isLiked(movieId: string): boolean

/**
 * Toggle watchlist status for a movie
 * @param movieId - IMDB ID of the movie
 */
function toggleWatchlist(movieId: string): void

/**
 * Add a movie to watchlist
 * @param movieId - IMDB ID of the movie
 */
function addToWatchlist(movieId: string): void

/**
 * Remove a movie from watchlist
 * @param movieId - IMDB ID of the movie
 */
function removeFromWatchlist(movieId: string): void

/**
 * Check if a movie is in watchlist
 * @param movieId - IMDB ID of the movie
 * @returns Boolean indicating if movie is in watchlist
 */
function inWatchlist(movieId: string): boolean

/**
 * Clear all liked movies
 */
function clearLikes(): void

/**
 * Clear all watchlist movies
 */
function clearWatchlist(): void
```

### Utility Functions

```typescript
/**
 * Filter movies by source type
 * @param sourceType - Type of source ('archive.org' or 'youtube')
 * @returns Filtered array of movies
 */
function filterBySource(sourceType: MovieSourceType): ExtendedMovieEntry[]

/**
 * Get movies that have OMDB metadata
 * @returns Array of enriched movies
 */
function getEnrichedMovies(): ExtendedMovieEntry[]

/**
 * Get movies without OMDB metadata
 * @returns Array of unenriched movies
 */
function getUnenrichedMovies(): ExtendedMovieEntry[]

/**
 * Get all sources for a movie grouped by type
 * @param movie - Movie entry
 * @returns Object with sources grouped by type
 */
function getSourcesByType(movie: ExtendedMovieEntry): Record<MovieSourceType, MovieSource[]>

/**
 * Get the primary source for a movie
 * @param movie - Movie entry
 * @returns Primary movie source
 */
function getPrimarySource(movie: ExtendedMovieEntry): MovieSource | undefined

/**
 * Check if a local poster exists for the given imdbId
 * @param imdbId - IMDB ID to check
 * @returns Promise<boolean> indicating whether the poster exists
 */
async function posterExists(imdbId: string): Promise<boolean>

/**
 * Get the best available poster URL with fallback logic
 * @param movie - Movie entry
 * @returns Promise<string> - URL to the poster image
 */
async function getPosterUrl(movie: ExtendedMovieEntry): Promise<string>

/**
 * Get poster URL synchronously (for SSR or when status is known)
 * @param movie - Movie entry
 * @param preferLocal - Whether to prefer local path
 * @returns string - URL to the poster image
 */
function getPosterUrlSync(movie: ExtendedMovieEntry, preferLocal?: boolean): string

/**
 * Preload posters for multiple movies (batch check)
 * @param imdbIds - Array of IMDB IDs to check
 * @returns Promise<Map<string, boolean>> - Map of imdbId to existence status
 */
async function preloadPosters(imdbIds: string[]): Promise<Map<string, boolean>>

/**
 * Runtime OMDB enrichment (optional, for movies without metadata)
 * @param movie - Movie entry to enrich
 * @returns Updated movie metadata or null if failed
 */
async function enrichMovieMetadata(movie: ExtendedMovieEntry): Promise<MovieMetadata | null>

/**
 * Get all unique genres from movies
 * @param movies - Array of movies
 * @returns Sorted array of genre names
 */
function getAvailableGenres(movies: ExtendedMovieEntry[]): string[]

/**
 * Get all unique countries from movies
 * @param movies - Array of movies
 * @returns Sorted array of country names
 */
function getAvailableCountries(movies: ExtendedMovieEntry[]): string[]

/**
 * Map SQL row to MovieEntry
 * @param row - Raw SQL row
 * @returns Mapped movie entry
 */
function mapRowToMovie(row: any): ExtendedMovieEntry
```

### Persistence (Internal)

```typescript
/**
 * Persist likes to localStorage
 * Called automatically when likes change
 */
function persistLikes(): void

/**
 * Load persisted likes from localStorage
 * Called during initialization
 */
function loadPersistedLikes(): void

/**
 * Persist watchlist to localStorage
 * Called automatically when watchlist changes
 */
function persistWatchlist(): void

/**
 * Load persisted watchlist from localStorage
 * Called during initialization
 */
function loadPersistedWatchlist(): void

/**
 * Persist filters to localStorage
 * Called automatically when filters change
 */
function persistFilters(): void
```

## Store Return Object

```typescript
export const useMovieStore = defineStore('movies', () => {
  // ... implementation ...

  return {
    // ============================================
    // STATE (Read-only refs)
    // ============================================
    allMovies: readonly(allMovies),
    movieDetailsCache: readonly(movieDetailsCache),
    filters: readonly(filters),
    isInitialLoading: readonly(isInitialLoading),
    isFiltering: readonly(isFiltering),
    isLoading: readonly(isLoading),

    // ============================================
    // COMPUTED PROPERTIES
    // ============================================

    // Data views
    filteredAndSortedMovies,
    paginatedMovies,
    lightweightMovies,
    likedMovies,
    watchlistMovies,

    // Statistics
    totalMovies,
    totalFiltered,
    likedCount,
    watchlistCount,
    hasMore,
    activeFiltersCount,
    hasActiveFilters,
    currentSortOption,

    // ============================================
    // ACTIONS - Data Loading
    // ============================================
    loadFromFile,
    loadFromApi,
    fetchMovies,
    fetchMoviesByIds,
    getMovieById,
    getRelatedMovies,
    searchMovies,

    // ============================================
    // ACTIONS - Filtering & Sorting
    // ============================================
    setFilter,
    setMinRating,
    setMinYear,
    setMinVotes,
    toggleGenre,
    toggleCountry,
    toggleSource,
    toggleMissingMetadata,
    setSearchQuery,
    setSort,
    resetFilters,
    applyFilters,

    // ============================================
    // ACTIONS - Pagination
    // ============================================
    setCurrentPage,
    loadMoreMovies,
    setScrollY,

    // ============================================
    // ACTIONS - Likes & Watchlist
    // ============================================
    toggleLike,
    like,
    unlike,
    isLiked,
    toggleWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    inWatchlist,
    clearLikes,
    clearWatchlist,

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    filterBySource,
    getEnrichedMovies,
    getUnenrichedMovies,
    getSourcesByType,
    getPrimarySource,
    posterExists,
    getPosterUrl,
    getPosterUrlSync,
    preloadPosters,
    enrichMovieMetadata,
    getAvailableGenres,
    getAvailableCountries,
    mapRowToMovie,
  }
})
```

## Migration Mapping

### From useMovieStore

| Old API                 | New API                 | Notes                                      |
| ----------------------- | ----------------------- | ------------------------------------------ |
| `movies`                | `allMovies` (Map)       | Changed from array to Map for O(1) lookups |
| `movieDetailsCache`     | `movieDetailsCache`     | Same                                       |
| `isLoading`             | `isLoading`             | Same                                       |
| `isInitialLoading`      | `isInitialLoading`      | Same                                       |
| `loadFromFile()`        | `loadFromFile()`        | Same, but also loads likes/watchlist       |
| `loadFromApi()`         | `loadFromApi()`         | Same                                       |
| `fetchMovies()`         | `fetchMovies()`         | Same                                       |
| `fetchMoviesByIds()`    | `fetchMoviesByIds()`    | Same                                       |
| `getMovieDetails()`     | `getMovieById()`        | Renamed for consistency                    |
| `getMovieById()`        | `getMovieById()`        | Same                                       |
| `getRelatedMovies()`    | `getRelatedMovies()`    | Same                                       |
| `searchMovies()`        | `searchMovies()`        | Same                                       |
| `filterBySource()`      | `filterBySource()`      | Same                                       |
| `getEnrichedMovies()`   | `getEnrichedMovies()`   | Same                                       |
| `getUnenrichedMovies()` | `getUnenrichedMovies()` | Same                                       |
| `getSourcesByType()`    | `getSourcesByType()`    | Same                                       |
| `getPrimarySource()`    | `getPrimarySource()`    | Same                                       |
| `posterExists()`        | `posterExists()`        | Same                                       |
| `getPosterUrl()`        | `getPosterUrl()`        | Same                                       |
| `getPosterUrlSync()`    | `getPosterUrlSync()`    | Same                                       |
| `preloadPosters()`      | `preloadPosters()`      | Same                                       |
| `enrichMovieMetadata()` | `enrichMovieMetadata()` | Same                                       |
| `mapRowToMovie()`       | `mapRowToMovie()`       | Same                                       |

### From useFilterStore

| Old API                    | New API                   | Notes                             |
| -------------------------- | ------------------------- | --------------------------------- |
| `filters`                  | `filters`                 | Same                              |
| `filteredMovies`           | `filteredAndSortedMovies` | Renamed, now computed             |
| `lightweightMovies`        | `lightweightMovies`       | Same, now computed                |
| `totalMovies`              | `totalFiltered`           | Renamed for clarity               |
| `isFiltering`              | `isFiltering`             | Same                              |
| `hasActiveFilters`         | `hasActiveFilters`        | Same                              |
| `activeFiltersCount`       | `activeFiltersCount`      | Same                              |
| `currentSortOption`        | `currentSortOption`       | Same                              |
| `filteredAndSortedMovies`  | `filteredAndSortedMovies` | Same                              |
| `setSort()`                | `setSort()`               | Same                              |
| `setSearchQuery()`         | `setSearchQuery()`        | Same                              |
| `toggleSource()`           | `toggleSource()`          | Same                              |
| `setMinRating()`           | `setMinRating()`          | Same                              |
| `setMinYear()`             | `setMinYear()`            | Same                              |
| `setMinVotes()`            | `setMinVotes()`           | Same                              |
| `toggleGenre()`            | `toggleGenre()`           | Same                              |
| `toggleCountry()`          | `toggleCountry()`         | Same                              |
| `toggleMissingMetadata()`  | `toggleMissingMetadata()` | Same                              |
| `setCurrentPage()`         | `setCurrentPage()`        | Same                              |
| `setScrollY()`             | `setScrollY()`            | Same                              |
| `resetFilters()`           | `resetFilters()`          | Same                              |
| `applyFilters()`           | `applyFilters()`          | Same                              |
| `getAvailableGenres()`     | `getAvailableGenres()`    | Same                              |
| `getAvailableCountries()`  | `getAvailableCountries()` | Same                              |
| `fetchFilteredMovies()`    | ❌ Removed                | Internal, use computed properties |
| `fetchLightweightMovies()` | ❌ Removed                | Internal, use computed properties |

### From useLikedMoviesStore

| Old API                      | New API                                  | Notes                          |
| ---------------------------- | ---------------------------------------- | ------------------------------ |
| `likedMovies` (array of IDs) | `likedMovies` (computed array of movies) | Now returns full movie objects |
| `count`                      | `likedCount`                             | Renamed                        |
| `isLiked()`                  | `isLiked()`                              | Same                           |
| `like()`                     | `like()`                                 | Same                           |
| `unlike()`                   | `unlike()`                               | Same                           |
| `toggle()`                   | `toggleLike()`                           | Renamed for clarity            |
| `clear()`                    | `clearLikes()`                           | Renamed for clarity            |

### From useWatchlistStore

| Old API                          | New API                                      | Notes                          |
| -------------------------------- | -------------------------------------------- | ------------------------------ |
| `watchlistMovies` (array of IDs) | `watchlistMovies` (computed array of movies) | Now returns full movie objects |
| `count`                          | `watchlistCount`                             | Renamed                        |
| `inWatchlist()`                  | `inWatchlist()`                              | Same                           |
| `add()`                          | `addToWatchlist()`                           | Renamed for clarity            |
| `remove()`                       | `removeFromWatchlist()`                      | Renamed for clarity            |
| `toggle()`                       | `toggleWatchlist()`                          | Renamed for clarity            |
| `clear()`                        | `clearWatchlist()`                           | Renamed for clarity            |

## Breaking Changes

### 1. `allMovies` is now a Map instead of Array

**Before:**

```typescript
const movieStore = useMovieStore()
const movie = movieStore.movies.find(m => m.imdbId === 'tt1234567')
```

**After:**

```typescript
const movieStore = useMovieStore()
const movie = movieStore.allMovies.get('tt1234567')
```

**Migration:** Use `allMovies.get(id)` instead of `movies.find()`. If you need an array, use `Array.from(allMovies.values())`.

### 2. `likedMovies` and `watchlistMovies` return full movie objects

**Before:**

```typescript
const likedStore = useLikedMoviesStore()
const likedIds = likedStore.likedMovies // string[]
```

**After:**

```typescript
const movieStore = useMovieStore()
const likedMovies = movieStore.likedMovies // ExtendedMovieEntry[]
const likedIds = likedMovies.map(m => m.imdbId)
```

**Migration:** Use computed property that returns full movies. Extract IDs if needed.

### 3. `totalMovies` renamed to `totalFiltered`

**Before:**

```typescript
const filterStore = useFilterStore()
const total = filterStore.totalMovies // Total filtered count
```

**After:**

```typescript
const movieStore = useMovieStore()
const total = movieStore.totalFiltered // Total filtered count
const allTotal = movieStore.totalMovies // Total movies in database
```

**Migration:** Use `totalFiltered` for filtered count, `totalMovies` for total count.

### 4. `getMovieDetails()` renamed to `getMovieById()`

**Before:**

```typescript
const movie = await movieStore.getMovieDetails('tt1234567')
```

**After:**

```typescript
const movie = await movieStore.getMovieById('tt1234567')
```

**Migration:** Simple rename.

### 5. Multiple stores consolidated into one

**Before:**

```typescript
const movieStore = useMovieStore()
const filterStore = useFilterStore()
const likedStore = useLikedMoviesStore()
const watchlistStore = useWatchlistStore()
```

**After:**

```typescript
const movieStore = useMovieStore()
// All functionality in one store
```

**Migration:** Import only `useMovieStore`.

## Backward Compatibility Layer (Phase 4)

During migration, we'll provide deprecated wrapper stores that delegate to the new unified store:

```typescript
// app/stores/useFilterStore.ts (DEPRECATED)
export const useFilterStore = defineStore('filter', () => {
  const movieStore = useMovieStore()

  // Delegate all methods to unified store
  return {
    filters: computed(() => movieStore.filters),
    filteredMovies: computed(() => movieStore.filteredAndSortedMovies),
    lightweightMovies: computed(() => movieStore.lightweightMovies),
    totalMovies: computed(() => movieStore.totalFiltered),
    // ... other delegating methods ...
  }
})
```

This allows gradual migration without breaking existing components.

## Performance Considerations

### 1. Computed Property Caching

Vue's computed properties automatically cache results and only recompute when dependencies change. This means:

- `filteredAndSortedMovies` only recomputes when filters or allMovies change
- `lightweightMovies` only recomputes when filteredAndSortedMovies changes
- No manual caching needed

### 2. Map vs Array Performance

Using `Map<string, Movie>` instead of `Movie[]` provides:

- O(1) lookups instead of O(n)
- O(1) updates instead of O(n)
- Faster for large datasets (30,000+ movies)

### 3. Lazy Loading

Movies are loaded on-demand:

- Initial load only fetches lightweight data (IDs, titles, years)
- Full movie data fetched when visible in viewport
- Cached after first fetch

### 4. Pagination

Only compute and render movies up to current page:

- `paginatedMovies` slices `filteredAndSortedMovies`
- Virtual scrolling renders only visible items
- Load more on scroll

## Testing Strategy

### Unit Tests

```typescript
describe('useMovieStore', () => {
  it('should filter movies by genre', () => {
    const store = useMovieStore()
    store.toggleGenre('Action')
    expect(store.filteredAndSortedMovies.every(m => m.metadata?.Genre?.includes('Action'))).toBe(
      true
    )
  })

  it('should toggle like status', () => {
    const store = useMovieStore()
    const movieId = 'tt1234567'

    expect(store.isLiked(movieId)).toBe(false)
    store.toggleLike(movieId)
    expect(store.isLiked(movieId)).toBe(true)
    store.toggleLike(movieId)
    expect(store.isLiked(movieId)).toBe(false)
  })

  it('should persist likes to localStorage', () => {
    const store = useMovieStore()
    store.like('tt1234567')

    const stored = JSON.parse(localStorage.getItem('likedMovies')!)
    expect(stored).toContainEqual({ id: 'tt1234567', likedAt: expect.any(Number) })
  })
})
```

### Integration Tests

```typescript
describe('useMovieStore integration', () => {
  it('should update all views when movie is liked', async () => {
    const store = useMovieStore()
    await store.loadFromFile()

    const movieId = store.filteredAndSortedMovies[0].imdbId
    const initialLikedCount = store.likedCount

    store.toggleLike(movieId)

    expect(store.likedCount).toBe(initialLikedCount + 1)
    expect(store.likedMovies.some(m => m.imdbId === movieId)).toBe(true)
    expect(store.isLiked(movieId)).toBe(true)
  })

  it('should apply multiple filters correctly', async () => {
    const store = useMovieStore()
    await store.loadFromFile()

    store.toggleGenre('Action')
    store.setMinRating(7.0)
    store.setMinYear(2000)

    const filtered = store.filteredAndSortedMovies

    expect(
      filtered.every(
        m =>
          m.metadata?.Genre?.includes('Action') &&
          parseFloat(m.metadata?.imdbRating || '0') >= 7.0 &&
          (m.year || 0) >= 2000
      )
    ).toBe(true)
  })
})
```

## Next Steps

1. ✅ API design complete
2. ⬜ Update `app/types/index.ts` with `ExtendedMovieEntry`
3. ⬜ Implement unified store in `app/stores/useMovieStore.ts`
4. ⬜ Add persistence logic for likes/watchlist
5. ⬜ Create backward compatibility layer
6. ⬜ Migrate components one by one
7. ⬜ Remove old stores
8. ⬜ Add tests
