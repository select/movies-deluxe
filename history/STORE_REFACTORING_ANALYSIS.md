# Store Refactoring Analysis

## Current Architecture Overview

### Store Files

1. **`app/stores/useMovieStore.ts`** (~500 lines)
2. **`app/stores/useFilterStore.ts`** (~600 lines)
3. **`app/stores/useLikedMoviesStore.ts`** (~150 lines)
4. **`app/stores/useWatchlistStore.ts`** (~150 lines)

## Component Usage Audit

### useMovieStore Usage

**Files using useMovieStore:**

- `app/pages/movie/[id].vue`
- `app/pages/index.vue`
- `app/pages/liked.vue`
- `app/components/MovieVirtualGrid.vue`

**Methods/Properties Accessed:**

1. **MovieVirtualGrid.vue** (line 58)
   - `movieStore.fetchMoviesByIds(idsToLoad)` - Loads full movie data for visible items

2. **index.vue** (line 93)
   - `movieStore.loadFromFile()` - Initial data loading
   - `movieStore.isInitialLoading` - Loading state

3. **liked.vue** (line 118)
   - `movieStore.loadFromFile()` - Initial data loading
   - `movieStore.fetchMoviesByIds(likedMovies.value)` - Load liked movies data
   - `movieStore.isInitialLoading` - Loading state

4. **movie/[id].vue** (line 567)
   - `movieStore.movies.length` - Check if movies loaded
   - `movieStore.loadFromFile()` - Load movies
   - `movieStore.getMovieById(movieId)` - Get single movie
   - `movieStore.getRelatedMovies(movieId, 8)` - Get related movies

**Summary:**

- Primary purpose: Data loading and fetching
- Key methods: `loadFromFile()`, `fetchMoviesByIds()`, `getMovieById()`, `getRelatedMovies()`
- Key state: `isInitialLoading`, `movies`

### useFilterStore Usage

**Files using useFilterStore:**

- `app/pages/movie/[id].vue`
- `app/pages/liked.vue`
- `app/components/Sidebar.vue`
- `app/pages/index.vue`
- `app/components/FilterMenu.vue`
- `app/components/MovieHeader.vue`
- `app/components/AppSearchBar.vue`

**Methods/Properties Accessed:**

1. **FilterMenu.vue** (line 318)
   - `filters` (ref) - All filter state
   - `currentSortOption` (ref) - Current sort
   - `hasActiveFilters` (ref) - Check if filters active
   - `setMinRating()`, `setMinYear()`, `setMinVotes()` - Range filters
   - `toggleSource()`, `toggleMissingMetadata()`, `toggleGenre()`, `toggleCountry()` - Toggle filters
   - `setSort()` - Change sort
   - `resetFilters()` - Clear all filters

2. **index.vue** (line 94)
   - `lightweightMovies` (ref) - Filtered movie list for display
   - `totalMovies` (ref) - Total filtered count
   - `setCurrentPage()` - Pagination

3. **liked.vue** (line 119)
   - `isFiltering` (ref) - Loading state
   - `applyFilters(likedMoviesData.value)` - Apply filters to liked movies
   - `resetFilters()` - Clear filters

4. **movie/[id].vue** (line 568)
   - `filteredAndSortedMovies` - For prev/next navigation

5. **Sidebar.vue** (line 58)
   - `activeFiltersCount` (ref) - Badge count

6. **MovieHeader.vue** (line 63)
   - `filters` (ref) - Search query
   - `setSearchQuery()` - Update search
   - `setSort()` - Change to relevance sort

7. **AppSearchBar.vue** (line 26)
   - `filters` (ref) - Search query
   - `setSearchQuery()` - Update search
   - `setSort()` - Change to relevance sort

**Summary:**

- Primary purpose: Filtering, sorting, searching, pagination
- Key methods: `setMinRating()`, `toggleGenre()`, `setSort()`, `setSearchQuery()`, `applyFilters()`, `resetFilters()`
- Key state: `filters`, `lightweightMovies`, `totalMovies`, `currentSortOption`, `hasActiveFilters`, `activeFiltersCount`, `isFiltering`

### useLikedMoviesStore Usage

**Files using useLikedMoviesStore:**

- `app/pages/movie/[id].vue`
- `app/components/Sidebar.vue`
- `app/pages/liked.vue`

**Methods/Properties Accessed:**

1. **Sidebar.vue** (line 57)
   - `count` (ref) - Number of liked movies for badge

2. **liked.vue** (line 121)
   - `likedMovies` (ref) - Array of liked movie IDs
   - `count` (ref) - Number of liked movies

3. **movie/[id].vue** (line 569)
   - `isLiked(movie.imdbId)` - Check if movie is liked
   - `toggle(movie.imdbId)` - Toggle like status

**Summary:**

- Primary purpose: Track liked movies
- Key methods: `isLiked()`, `toggle()`
- Key state: `likedMovies` (array of IDs), `count`

### useWatchlistStore Usage

**Files using useWatchlistStore:**

- None found! (No components currently use watchlist)

**Summary:**

- Store exists but is not used
- Can be safely integrated or removed

## Data Flow Analysis

### Current Flow (Problematic)

```
1. Initial Load:
   movieStore.loadFromFile()
   → Loads all movies into movieStore.allMovies
   → filterStore watches movieStore
   → filterStore creates its own copy in filteredMovies

2. Filtering:
   User changes filter
   → filterStore.setGenre()
   → filterStore recomputes filteredMovies from movieStore.allMovies
   → Creates lightweight copies for display

3. Liking:
   User clicks like
   → likedMoviesStore.toggle(id)
   → Stores ID in Map + localStorage
   → Movie object in movieStore unchanged
   → No automatic UI update for like status

4. Display:
   MovieVirtualGrid receives lightweightMovies
   → Fetches full movie data via movieStore.fetchMoviesByIds()
   → Displays MovieCard
   → MovieCard checks likedMoviesStore.isLiked() separately
```

### Problems Identified

1. **Data Duplication**
   - `movieStore.allMovies` (full objects)
   - `filterStore.filteredMovies` (full objects, subset)
   - `filterStore.lightweightMovies` (lightweight copies)
   - Memory: ~30KB × movies × 2-3 copies

2. **Sync Complexity**
   - Like status stored separately from movie objects
   - Components must check multiple stores
   - No single source of truth

3. **Inefficient Filtering**
   - filterStore creates new arrays on every filter change
   - No caching or indexing
   - Recomputes from scratch each time

4. **Tight Coupling**
   - filterStore depends on movieStore
   - Components must import multiple stores
   - Hard to test in isolation

## Proposed New Architecture

### Single Unified Store Structure

```typescript
// app/stores/useMovieStore.ts (NEW unified structure)

interface Movie {
  id: string
  title: string
  year: number
  // ... existing fields ...

  // NEW: Embedded user metadata
  isLiked: boolean
  likedAt?: number
  inWatchlist: boolean
  addedToWatchlistAt?: number
}

export const useMovieStore = defineStore('movies', () => {
  // ============================================
  // SINGLE SOURCE OF TRUTH
  // ============================================
  const allMovies = ref<Map<string, Movie>>(new Map())

  // ============================================
  // FILTER STATE (moved from useFilterStore)
  // ============================================
  const filters = ref({
    genres: [] as string[],
    countries: [] as string[],
    sources: [] as string[],
    minRating: 0,
    minYear: 1910,
    minVotes: 0,
    searchQuery: '',
    showMissingMetadataOnly: false,
  })

  const sort = ref({
    field: 'year' as 'year' | 'rating' | 'votes' | 'title' | 'relevance',
    direction: 'desc' as 'asc' | 'desc',
    label: 'Year (Newest)',
  })

  const currentPage = ref(1)
  const ITEMS_PER_PAGE = 60

  // ============================================
  // COMPUTED VIEWS (no duplication)
  // ============================================

  // Apply all filters and sorting
  const filteredAndSortedMovies = computed(() => {
    let movies = Array.from(allMovies.value.values())

    // Apply filters
    if (filters.value.genres.length > 0) {
      movies = movies.filter(m => filters.value.genres.some(g => m.metadata?.Genre?.includes(g)))
    }

    if (filters.value.countries.length > 0) {
      movies = movies.filter(m =>
        filters.value.countries.some(c => m.metadata?.Country?.includes(c))
      )
    }

    if (filters.value.sources.length > 0) {
      movies = movies.filter(m =>
        m.sources.some(s =>
          filters.value.sources.includes(s.type === 'youtube' ? s.channelName : 'archive.org')
        )
      )
    }

    if (filters.value.minRating > 0) {
      movies = movies.filter(m => (m.metadata?.imdbRating || 0) >= filters.value.minRating)
    }

    if (filters.value.minYear > 1910) {
      movies = movies.filter(m => (m.year || 0) >= filters.value.minYear)
    }

    if (filters.value.minVotes > 0) {
      movies = movies.filter(m => {
        const votes = parseInt(m.metadata?.imdbVotes?.replace(/,/g, '') || '0')
        return votes >= filters.value.minVotes
      })
    }

    if (filters.value.searchQuery) {
      const query = filters.value.searchQuery.toLowerCase()
      movies = movies.filter(
        m =>
          m.title.toLowerCase().includes(query) ||
          m.metadata?.Actors?.toLowerCase().includes(query) ||
          m.metadata?.Director?.toLowerCase().includes(query) ||
          m.metadata?.Plot?.toLowerCase().includes(query)
      )
    }

    if (filters.value.showMissingMetadataOnly) {
      movies = movies.filter(m => !m.metadata || !m.metadata.imdbRating)
    }

    // Apply sorting
    movies.sort((a, b) => {
      let comparison = 0

      switch (sort.value.field) {
        case 'year':
          comparison = (a.year || 0) - (b.year || 0)
          break
        case 'rating':
          comparison = (a.metadata?.imdbRating || 0) - (b.metadata?.imdbRating || 0)
          break
        case 'votes':
          const aVotes = parseInt(a.metadata?.imdbVotes?.replace(/,/g, '') || '0')
          const bVotes = parseInt(b.metadata?.imdbVotes?.replace(/,/g, '') || '0')
          comparison = aVotes - bVotes
          break
        case 'title':
          comparison = a.title.localeCompare(b.title)
          break
        case 'relevance':
          // TODO: Implement relevance scoring based on search query
          comparison = 0
          break
      }

      return sort.value.direction === 'asc' ? comparison : -comparison
    })

    return movies
  })

  // Paginated movies for display
  const paginatedMovies = computed(() => {
    const endIndex = currentPage.value * ITEMS_PER_PAGE
    return filteredAndSortedMovies.value.slice(0, endIndex)
  })

  // Lightweight movies for virtual grid
  const lightweightMovies = computed(() =>
    paginatedMovies.value.map(m => ({
      imdbId: m.imdbId,
      title: m.title,
      year: m.year,
      poster: m.metadata?.Poster,
    }))
  )

  // Liked movies view
  const likedMovies = computed(() =>
    Array.from(allMovies.value.values())
      .filter(m => m.isLiked)
      .sort((a, b) => (b.likedAt || 0) - (a.likedAt || 0))
  )

  // Watchlist movies view
  const watchlistMovies = computed(() =>
    Array.from(allMovies.value.values())
      .filter(m => m.inWatchlist)
      .sort((a, b) => (b.addedToWatchlistAt || 0) - (a.addedToWatchlistAt || 0))
  )

  // Stats
  const totalMovies = computed(() => allMovies.value.size)
  const totalFiltered = computed(() => filteredAndSortedMovies.value.length)
  const likedCount = computed(() => likedMovies.value.length)
  const watchlistCount = computed(() => watchlistMovies.value.length)
  const hasMore = computed(
    () => paginatedMovies.value.length < filteredAndSortedMovies.value.length
  )

  const activeFiltersCount = computed(() => {
    let count = 0
    if (filters.value.genres.length > 0) count++
    if (filters.value.countries.length > 0) count++
    if (filters.value.sources.length > 0) count++
    if (filters.value.minRating > 0) count++
    if (filters.value.minYear > 1910) count++
    if (filters.value.minVotes > 0) count++
    return count
  })

  const hasActiveFilters = computed(() => activeFiltersCount.value > 0)

  // ============================================
  // ACTIONS - Data Loading
  // ============================================

  async function loadFromFile() {
    // ... existing load logic ...
    // After loading, merge with persisted likes/watchlist
    loadPersistedLikes()
    loadPersistedWatchlist()
  }

  async function fetchMoviesByIds(ids: string[]) {
    // Return movies from allMovies Map
    return ids.map(id => allMovies.value.get(id)).filter(Boolean) as Movie[]
  }

  async function getMovieById(id: string) {
    return allMovies.value.get(id) || null
  }

  async function getRelatedMovies(id: string, limit: number) {
    const movie = allMovies.value.get(id)
    if (!movie) return []

    // Find movies with similar genres
    const genres = movie.metadata?.Genre?.split(', ') || []
    const related = Array.from(allMovies.value.values())
      .filter(m => m.imdbId !== id)
      .filter(m => {
        const mGenres = m.metadata?.Genre?.split(', ') || []
        return genres.some(g => mGenres.includes(g))
      })
      .slice(0, limit)

    return related
  }

  // ============================================
  // ACTIONS - Filtering
  // ============================================

  function setFilter(filterType: keyof typeof filters.value, value: any) {
    filters.value[filterType] = value
    currentPage.value = 1 // Reset pagination
  }

  function setMinRating(value: number) {
    filters.value.minRating = value
    currentPage.value = 1
  }

  function setMinYear(value: number) {
    filters.value.minYear = value
    currentPage.value = 1
  }

  function setMinVotes(value: number) {
    filters.value.minVotes = value
    currentPage.value = 1
  }

  function toggleGenre(genre: string) {
    const index = filters.value.genres.indexOf(genre)
    if (index > -1) {
      filters.value.genres.splice(index, 1)
    } else {
      filters.value.genres.push(genre)
    }
    currentPage.value = 1
  }

  function toggleCountry(country: string) {
    const index = filters.value.countries.indexOf(country)
    if (index > -1) {
      filters.value.countries.splice(index, 1)
    } else {
      filters.value.countries.push(country)
    }
    currentPage.value = 1
  }

  function toggleSource(source: string) {
    const index = filters.value.sources.indexOf(source)
    if (index > -1) {
      filters.value.sources.splice(index, 1)
    } else {
      filters.value.sources.push(source)
    }
    currentPage.value = 1
  }

  function toggleMissingMetadata() {
    filters.value.showMissingMetadataOnly = !filters.value.showMissingMetadataOnly
    currentPage.value = 1
  }

  function setSearchQuery(query: string) {
    filters.value.searchQuery = query
    currentPage.value = 1
  }

  function setSort(option: SortOption) {
    sort.value = option
    currentPage.value = 1
  }

  function resetFilters() {
    filters.value = {
      genres: [],
      countries: [],
      sources: [],
      minRating: 0,
      minYear: 1910,
      minVotes: 0,
      searchQuery: '',
      showMissingMetadataOnly: false,
    }
    currentPage.value = 1
  }

  function setCurrentPage(page: number) {
    currentPage.value = page
  }

  function loadMoreMovies() {
    currentPage.value++
  }

  // ============================================
  // ACTIONS - Likes & Watchlist
  // ============================================

  function toggleLike(movieId: string) {
    const movie = allMovies.value.get(movieId)
    if (movie) {
      movie.isLiked = !movie.isLiked
      movie.likedAt = movie.isLiked ? Date.now() : undefined
      persistLikes()
    }
  }

  function toggleWatchlist(movieId: string) {
    const movie = allMovies.value.get(movieId)
    if (movie) {
      movie.inWatchlist = !movie.inWatchlist
      movie.addedToWatchlistAt = movie.inWatchlist ? Date.now() : undefined
      persistWatchlist()
    }
  }

  function isLiked(movieId: string): boolean {
    return allMovies.value.get(movieId)?.isLiked ?? false
  }

  function inWatchlist(movieId: string): boolean {
    return allMovies.value.get(movieId)?.inWatchlist ?? false
  }

  // ============================================
  // PERSISTENCE
  // ============================================

  function persistLikes() {
    const likes = Array.from(allMovies.value.values())
      .filter(m => m.isLiked)
      .map(m => ({ id: m.imdbId, likedAt: m.likedAt }))
    localStorage.setItem('likedMovies', JSON.stringify(likes))
  }

  function loadPersistedLikes() {
    try {
      const stored = localStorage.getItem('likedMovies')
      if (stored) {
        const likes = JSON.parse(stored) as Array<{ id: string; likedAt: number }>
        likes.forEach(({ id, likedAt }) => {
          const movie = allMovies.value.get(id)
          if (movie) {
            movie.isLiked = true
            movie.likedAt = likedAt
          }
        })
      }
    } catch (err) {
      console.error('Failed to load liked movies:', err)
    }
  }

  function persistWatchlist() {
    const watchlist = Array.from(allMovies.value.values())
      .filter(m => m.inWatchlist)
      .map(m => ({ id: m.imdbId, addedAt: m.addedToWatchlistAt }))
    localStorage.setItem('watchlistMovies', JSON.stringify(watchlist))
  }

  function loadPersistedWatchlist() {
    try {
      const stored = localStorage.getItem('watchlistMovies')
      if (stored) {
        const watchlist = JSON.parse(stored) as Array<{ id: string; addedAt: number }>
        watchlist.forEach(({ id, addedAt }) => {
          const movie = allMovies.value.get(id)
          if (movie) {
            movie.inWatchlist = true
            movie.addedToWatchlistAt = addedAt
          }
        })
      }
    } catch (err) {
      console.error('Failed to load watchlist:', err)
    }
  }

  // ============================================
  // HELPER - Apply filters to custom array
  // ============================================

  function applyFilters(movies: Movie[]): Movie[] {
    // Same filter logic as filteredAndSortedMovies but on custom array
    // Used by liked.vue to filter liked movies
    // ... (same implementation as above)
  }

  return {
    // State
    allMovies,
    filters,
    sort,
    currentPage,

    // Computed
    filteredAndSortedMovies,
    paginatedMovies,
    lightweightMovies,
    likedMovies,
    watchlistMovies,
    totalMovies,
    totalFiltered,
    likedCount,
    watchlistCount,
    hasMore,
    activeFiltersCount,
    hasActiveFilters,

    // Actions - Data
    loadFromFile,
    fetchMoviesByIds,
    getMovieById,
    getRelatedMovies,

    // Actions - Filters
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
    setCurrentPage,
    loadMoreMovies,
    applyFilters,

    // Actions - Likes & Watchlist
    toggleLike,
    toggleWatchlist,
    isLiked,
    inWatchlist,

    // Backward compatibility (Phase 4 - remove after migration)
    currentSortOption: computed(() => sort.value),
  }
})
```

## Migration Strategy

### Phase 1: Preparation

- ✅ Audit component usage (DONE)
- ⬜ Design new unified store API (IN PROGRESS)
- ⬜ Create migration subtasks in beads
- ⬜ Set up feature branch

### Phase 2: Implementation

- ⬜ Create new unified store with backward compatibility
- ⬜ Add Movie interface with like/watchlist fields
- ⬜ Implement filter logic in unified store
- ⬜ Implement persistence logic
- ⬜ Add tests for new store

### Phase 3: Component Migration

- ⬜ Update index.vue to use new store
- ⬜ Update liked.vue to use new store
- ⬜ Update movie/[id].vue to use new store
- ⬜ Update FilterMenu.vue to use new store
- ⬜ Update Sidebar.vue to use new store
- ⬜ Update MovieHeader.vue to use new store
- ⬜ Update AppSearchBar.vue to use new store
- ⬜ Update MovieVirtualGrid.vue to use new store

### Phase 4: Cleanup

- ⬜ Remove useFilterStore.ts
- ⬜ Remove useLikedMoviesStore.ts
- ⬜ Remove useWatchlistStore.ts (if not used)
- ⬜ Remove backward compatibility layer
- ⬜ Update documentation

## Expected Benefits

### Performance

- **Memory**: 50% reduction (no duplicate movie objects)
- **Filtering**: Faster with computed properties and caching
- **Reactivity**: Automatic UI updates when movie data changes

### Maintainability

- **Single Source**: One place to update movie data
- **Simpler Logic**: No sync between stores
- **Easier Testing**: Test one store instead of four
- **Better DX**: Import one store instead of multiple

### Features

- **Real-time Updates**: Like status updates everywhere automatically
- **Consistency**: No stale data between stores
- **Extensibility**: Easy to add new filters or user metadata

## Risks & Mitigation

### Risk 1: Breaking Changes

**Mitigation**: Use backward compatibility layer during migration

### Risk 2: Performance Regression

**Mitigation**: Benchmark before/after, add caching if needed

### Risk 3: localStorage Migration

**Mitigation**: Import old format on first load, keep old keys

### Risk 4: Complex Computed Properties

**Mitigation**: Break into smaller computed properties, add memoization

## Testing Checklist

- [ ] All filters work correctly
- [ ] Sorting works with all options
- [ ] Search works with filters
- [ ] Pagination works correctly
- [ ] Like/unlike updates all views
- [ ] Watchlist add/remove updates all views
- [ ] localStorage persistence works
- [ ] No memory leaks
- [ ] Performance is same or better
- [ ] All existing features still work

## Timeline Estimate

- Phase 1 (Preparation): 2-3 hours
- Phase 2 (Implementation): 4-6 hours
- Phase 3 (Migration): 6-8 hours
- Phase 4 (Cleanup): 2-3 hours

**Total**: 14-20 hours (2-3 days of focused work)
