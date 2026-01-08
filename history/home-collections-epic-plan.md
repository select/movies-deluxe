# Home Page Collections Epic - Implementation Plan

## Overview

Transform the home page from a searchable movie grid into a Netflix-style collections showcase with daily-rotating curated content. The current search functionality will move to a dedicated `/search` route.

## Current State Analysis

### Existing Components

- **`app/pages/index.vue`**: Currently shows filterable movie grid with MovieVirtualGrid
- **`app/components/SearchHeader.vue`**: Sliding search overlay (only shows on home page)
- **`app/components/MovieCard.vue`**: Movie card component with poster, badges, metadata
- **`app/stores/useCollectionsStore.ts`**: Manages collections from `/data/collections.json`
- **`app/stores/useMovieStore.ts`**: Manages movies with SQLite WASM database
- **`app/pages/admin/index.vue`**: Admin dashboard with various data management buttons

### Data Structure

- Collections stored in `/public/data/collections.json` with structure:
  ```json
  {
    "collection-id": {
      "id": "collection-id",
      "name": "Collection Name",
      "description": "...",
      "movieIds": ["tt0108052", "tt0050083", ...],
      "tags": ["tag1", "tag2"]
    }
  }
  ```
- Movies accessible via SQLite database with IMDB IDs

## Architecture Design

### Daily Home Page JSON Structure

Location: `/public/data/home/{01-31}.json`

```typescript
interface DailyHomePage {
  date: string // ISO date for reference
  dayOfMonth: number // 1-31
  collections: HomeCollection[]
}

interface HomeCollection {
  id: string // Collection ID from collections.json
  name: string
  description: string
  movies: HomeMovie[] // 10 movies (9 movies + 1 "explore more" slot)
}

interface HomeMovie {
  imdbId: string
  title: string
  year?: number
  posterPath?: string // Pre-computed poster path
}
```

### Component Architecture

```
app/pages/
  ├── index.vue (NEW: Collections showcase)
  └── search.vue (NEW: Migrated search functionality)

app/components/
  ├── HomeCollectionRow.vue (NEW: Horizontal scrolling row)
  ├── HomeCollectionCard.vue (NEW: Movie card for collections)
  ├── HomeExploreMoreCard.vue (NEW: "Explore more" link card)
  └── SearchHeader.vue (MODIFIED: Route to /search)
```

## Implementation Steps

### Phase 1: Backend - Daily Home Page Generation

**Goal**: Create API endpoint and script to generate daily home page JSON files

1. **Create generation script** (`scripts/generate-home-pages.ts`)
   - Load all collections from `collections.json`
   - Filter collections with sufficient movies (>= 10 movies with IMDB IDs)
   - For each day (1-31):
     - Select 10 random collections (seeded by day number for consistency)
     - For each collection, select 10 random movies with IMDB IDs
     - Generate JSON file at `/public/data/home/{day}.json`
   - Add validation to ensure movies exist in database

2. **Create admin API endpoint** (`server/api/admin/home/generate.post.ts`)
   - Endpoint: `POST /api/admin/home/generate`
   - Calls the generation script
   - Returns success/failure status
   - Supports progress tracking via existing progress system

3. **Add admin UI button** (modify `app/pages/admin/index.vue`)
   - Add "Generate Home Pages" button in Data Enrichment section
   - Show progress indicator during generation
   - Display success/error toast

### Phase 2: Frontend - New Home Page with Collections

**Goal**: Build Netflix-style collections showcase

4. **Create HomeCollectionCard component**
   - Similar to MovieCard but optimized for horizontal scrolling
   - Smaller size, essential info only
   - Poster, title, year
   - Click navigates to `/movie/{imdbId}`

5. **Create HomeExploreMoreCard component**
   - Same size as HomeCollectionCard
   - Shows collection icon and "Explore more [Collection Name]"
   - Click navigates to `/collections/{collectionId}`

6. **Create HomeCollectionRow component**
   - Horizontal scrolling container with snap points
   - Collection title and description header
   - 10 items: 9 movies + 1 explore more card
   - CSS: `overflow-x-auto`, `scroll-snap-type: x mandatory`
   - Touch-friendly scrolling

7. **Create new home page** (`app/pages/index.vue`)
   - Load daily JSON based on current day of month
   - Render multiple HomeCollectionRow components vertically
   - Loading states with skeletons
   - Error handling for missing daily files

### Phase 3: Search Page Migration

**Goal**: Move search functionality to dedicated route

8. **Create search page** (`app/pages/search.vue`)
   - Copy current `index.vue` content (MovieVirtualGrid, filters, etc.)
   - Keep all existing search/filter functionality
   - Update page title/meta to "Search Movies"

9. **Update SearchHeader component**
   - Modify search behavior to navigate to `/search` route
   - Update visibility logic to show on `/search` page
   - Keep keyboard shortcuts working

10. **Update Sidebar component**
    - Change search icon to navigate to `/search` route
    - Update filter icon behavior for search page

### Phase 4: Data Generation & Testing

**Goal**: Generate initial data and verify functionality

11. **Generate initial home page data**
    - Run generation script via admin interface
    - Verify all 31 JSON files created
    - Check file sizes and data quality

12. **Frontend verification with chrome-devtools**
    - Navigate to home page
    - Verify collections render correctly
    - Test horizontal scrolling
    - Test "explore more" links
    - Navigate to `/search` and verify search works
    - Test search icon navigation

## Technical Considerations

### Performance

- Pre-compute poster paths in daily JSON to avoid runtime lookups
- Use lazy loading for images in horizontal scrollers
- Implement intersection observer for loading rows as user scrolls
- Keep JSON files small (< 50KB each)

### Randomization Strategy

- Use seeded random (day number as seed) for consistency
- Same day = same collections and movies
- Changes daily automatically based on system date

### Edge Cases

- Handle months with < 31 days (use modulo: day 32 → day 1)
- Fallback to day 1 if current day file missing
- Handle collections with < 10 movies (skip or pad with available movies)
- Filter out movies without IMDB IDs during generation

### Data Validation

- Ensure all movie IDs in daily JSON exist in database
- Validate collection IDs exist in collections.json
- Check poster paths are valid
- Log warnings for missing data

## Dependencies & Blockers

### Prerequisites

- Collections must have sufficient movies (>= 10 with IMDB IDs)
- SQLite database must be up-to-date
- Admin interface must be accessible

### External Dependencies

- None (all data is local)

## Testing Checklist

### Backend

- [ ] Generation script creates 31 files
- [ ] Each file has 10 collections
- [ ] Each collection has 10 movies
- [ ] All movie IDs are valid IMDB IDs
- [ ] Randomization is consistent (same day = same data)
- [ ] API endpoint works from admin interface

### Frontend

- [ ] Home page loads daily JSON correctly
- [ ] Collections render in vertical layout
- [ ] Horizontal scrolling works smoothly
- [ ] Snap points work correctly
- [ ] "Explore more" cards navigate to collection pages
- [ ] Movie cards navigate to detail pages
- [ ] Search page has all original functionality
- [ ] Search icon navigates to `/search`
- [ ] SearchHeader works on search page
- [ ] Mobile responsive (touch scrolling)

## Rollout Plan

1. **Development**: Implement all phases in feature branch
2. **Testing**: Use chrome-devtools to verify all functionality
3. **Data Generation**: Generate initial 31 daily files
4. **Deployment**: Merge to main, deploy to production
5. **Monitoring**: Check for errors, user feedback

## Future Enhancements (Out of Scope)

- Admin UI to customize daily collections manually
- Analytics to track which collections are most viewed
- Personalized collections based on user likes
- Seasonal/holiday themed collections
- Auto-refresh collections weekly instead of daily
