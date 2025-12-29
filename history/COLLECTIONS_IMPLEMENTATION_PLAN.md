# Collections Feature - Implementation Plan

**Epic ID:** `movies-deluxe-4n69`  
**Status:** Planning Complete - Ready for Implementation  
**Created:** 2025-12-29

## Overview

Implement a collections feature that allows users to organize movies into named collections (e.g., "Charlie Chaplin", "Animation Shorts"). Collections will be stored in `/public/data/collections.json`, have overview and detail pages, show visual indicators on movie cards, and include admin UI for managing movie-to-collection assignments.

## Initial Collections

1. **Charlie Chaplin** - All Charlie Chaplin movies in the database
2. **Animation Shorts** - Popeye and similar animation shorts

## Architecture

### Data Storage

- **File:** `/public/data/collections.json`
- **Format:** JSON with schema metadata (similar to movies.json)
- **Structure:**
  ```json
  {
    "_schema": {
      "version": "1.0.0",
      "description": "Movie collections database",
      "lastUpdated": "2025-12-29T00:00:00.000Z"
    },
    "collection-id-1": {
      "id": "collection-id-1",
      "name": "Charlie Chaplin",
      "description": "Classic films featuring Charlie Chaplin",
      "movieIds": ["tt0000001", "tt0000002"],
      "createdAt": "2025-12-29T00:00:00.000Z",
      "updatedAt": "2025-12-29T00:00:00.000Z"
    }
  }
  ```

### Type Definitions

**Location:** `shared/types/collections.ts`

```typescript
export interface Collection {
  id: string
  name: string
  description: string
  movieIds: string[]
  createdAt: string
  updatedAt: string
}

export interface CollectionsDatabase {
  _schema: {
    version: string
    description: string
    lastUpdated: string
  }
  [collectionId: string]: Collection | typeof _schema
}
```

### API Endpoints

**Public Endpoints:**

- `GET /api/collections` - List all collections
- `GET /api/collections/[id]` - Get single collection with movie details

**Admin Endpoints (localhost only):**

- `POST /api/admin/collections/create` - Create new collection
- `POST /api/admin/collections/update` - Update collection metadata
- `POST /api/admin/collections/delete` - Delete collection
- `POST /api/admin/collections/add-movie` - Add movie to collection
- `POST /api/admin/collections/remove-movie` - Remove movie from collection

### Pinia Store

**Location:** `app/stores/useCollectionsStore.ts`

**State:**

- `collections: Map<string, Collection>` - All collections
- `isLoading: boolean` - Loading state
- `error: string | null` - Error state

**Actions:**

- `loadCollections()` - Load from API
- `getCollectionById(id: string)` - Get single collection
- `addMovieToCollection(movieId: string, collectionId: string)` - Add movie
- `removeMovieFromCollection(movieId: string, collectionId: string)` - Remove movie
- `isMovieInCollection(movieId: string, collectionId: string)` - Check membership
- `getCollectionsForMovie(movieId: string)` - Get all collections containing a movie

## Implementation Phases

### Phase 1: Backend Infrastructure (Ready to Start)

**Ready Tasks:**

1. ✅ `movies-deluxe-s88r` - Create collections type definitions
2. ✅ `movies-deluxe-vuu5` - Create collections.json data file

**Blocked Tasks:** 3. 🔒 `movies-deluxe-hrld` - Create collections API endpoints (depends on 1, 2) 4. 🔒 `movies-deluxe-358x` - Create collections store (depends on 3)

**Implementation Order:**

1. Create type definitions first
2. Create data file with initial structure
3. Implement all API endpoints
4. Create Pinia store

### Phase 2: Frontend Pages (Blocked by Phase 1)

**Tasks:** 5. 🔒 `movies-deluxe-d3l0` - Create CollectionCard component (depends on 4) 6. 🔒 `movies-deluxe-ynkf` - Create collections overview page (depends on 4, 5) 7. 🔒 `movies-deluxe-d8rz` - Create collection detail page (depends on 4) 8. 🔒 `movies-deluxe-uj9o` - Add collection indicator to MovieCard (depends on 4)

**Implementation Order:**

1. Create CollectionCard component with stacked poster preview
2. Create overview page using CollectionCard
3. Create detail page using MovieGrid
4. Add collection indicator to MovieCard

### Phase 3: Admin UI (Blocked by Phase 1)

**Tasks:** 9. 🔒 `movies-deluxe-c6re` - Create AdminCollectionManager component (depends on 4) 10. 🔒 `movies-deluxe-zbzc` - Add collection management to admin dashboard (depends on 4, 9) 11. 🔒 `movies-deluxe-5vji` - Add collection assignment to movie detail page (depends on 4)

**Implementation Order:**

1. Create AdminCollectionManager component
2. Integrate into admin dashboard
3. Add collection assignment UI to movie detail page

### Phase 4: Navigation & Integration (Blocked by Phase 2)

**Tasks:** 12. 🔒 `movies-deluxe-g742` - Add collections link to navigation (depends on 6, 7) 13. 🔒 `movies-deluxe-j3n3` - Populate initial collections with movies (depends on 2, 3) 14. 🔒 `movies-deluxe-o6st` - Add collections to database schema (depends on 1)

**Implementation Order:**

1. Add navigation links to sidebar and mobile menu
2. Research and populate initial collections
3. Update SQLite generation script

## UI/UX Design

### Collection Card (Overview Page)

**Visual Design:**

- 3 stacked movie posters
- Top poster: centered, z-index 3
- Bottom left poster: tilted -5deg, z-index 2
- Bottom right poster: tilted +5deg, z-index 1
- Hover effect: spread posters (left: -10deg, right: +10deg)
- Collection name and description below
- Movie count badge

**Component:** `app/components/CollectionCard.vue`

### Collection Indicator (Movie Card)

**Visual Design:**

- Small badge in top-left corner (opposite of like indicator)
- Folder/collection icon
- Show count if movie is in multiple collections
- Glass morphism effect (similar to source badge)

**Location:** Update `app/components/MovieCard.vue`

### Collections Overview Page

**Layout:**

- Grid of CollectionCard components
- Responsive: 1-4 columns based on screen size
- Page header with title and description
- Empty state if no collections

**Route:** `/collections`

### Collection Detail Page

**Layout:**

- Collection header (name, description, movie count)
- MovieGrid component (reuse existing)
- Support all existing filters and sorting
- Breadcrumb navigation

**Route:** `/collections/[id]`

### Admin UI

**Collection Management Section:**

- List all collections with movie counts
- Create/Edit/Delete buttons
- Inline editing for name/description
- View movies in collection

**Movie Detail Page:**

- "Collections" section (localhost only)
- Show current collections
- Dropdown to add to collections
- Remove buttons for each collection

## Database Integration

### SQLite Schema

**Collections Table:**

```sql
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
```

**Collection Movies Junction Table:**

```sql
CREATE TABLE collection_movies (
  collectionId TEXT NOT NULL,
  movieId TEXT NOT NULL,
  addedAt TEXT NOT NULL,
  PRIMARY KEY (collectionId, movieId),
  FOREIGN KEY (collectionId) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY (movieId) REFERENCES movies(imdbId) ON DELETE CASCADE
);
```

**Update:** `scripts/generate-sqlite.ts`

## Testing Strategy

### Manual Testing Checklist

**Backend:**

- [ ] Collections API returns all collections
- [ ] Single collection API returns correct data
- [ ] Admin APIs create/update/delete collections
- [ ] Add/remove movie APIs work correctly
- [ ] Error handling for invalid IDs

**Frontend:**

- [ ] Collections overview page displays all collections
- [ ] Collection cards show correct poster previews
- [ ] Hover animation works smoothly
- [ ] Collection detail page shows all movies
- [ ] Filters and sorting work on detail page
- [ ] Collection indicator appears on movie cards
- [ ] Navigation links work correctly

**Admin:**

- [ ] Collection management UI works
- [ ] Create new collection
- [ ] Edit collection name/description
- [ ] Delete collection
- [ ] Add movie to collection from movie detail page
- [ ] Remove movie from collection

**Integration:**

- [ ] SQLite database includes collections
- [ ] Initial collections populated with correct movies
- [ ] Data persists across page reloads
- [ ] No console errors

## Dependencies Graph

```
Epic: movies-deluxe-4n69
├── Phase 1: Backend Infrastructure
│   ├── movies-deluxe-s88r (Type Definitions) ✅ READY
│   ├── movies-deluxe-vuu5 (Data File) ✅ READY
│   ├── movies-deluxe-hrld (API Endpoints) 🔒 depends on s88r, vuu5
│   └── movies-deluxe-358x (Store) 🔒 depends on hrld
│
├── Phase 2: Frontend Pages
│   ├── movies-deluxe-d3l0 (CollectionCard) 🔒 depends on 358x
│   ├── movies-deluxe-ynkf (Overview Page) 🔒 depends on 358x, d3l0
│   ├── movies-deluxe-d8rz (Detail Page) 🔒 depends on 358x
│   └── movies-deluxe-uj9o (Card Indicator) 🔒 depends on 358x
│
├── Phase 3: Admin UI
│   ├── movies-deluxe-c6re (Admin Component) 🔒 depends on 358x
│   ├── movies-deluxe-zbzc (Admin Dashboard) 🔒 depends on 358x, c6re
│   └── movies-deluxe-5vji (Movie Detail Admin) 🔒 depends on 358x
│
└── Phase 4: Integration
    ├── movies-deluxe-g742 (Navigation) 🔒 depends on ynkf, d8rz
    ├── movies-deluxe-j3n3 (Populate Data) 🔒 depends on vuu5, hrld
    └── movies-deluxe-o6st (DB Schema) 🔒 depends on s88r
```

## Next Steps

1. **Start with Phase 1:** Begin with `movies-deluxe-s88r` and `movies-deluxe-vuu5` (both ready)
2. **Sequential Implementation:** Follow the dependency chain
3. **Test After Each Phase:** Ensure each phase works before moving to next
4. **Populate Data:** Research Charlie Chaplin and Popeye movies in database
5. **Frontend Verification:** Test all UI changes in browser

## Research Notes

### Finding Movies for Initial Collections

**Charlie Chaplin:**

- Search database for movies with "Charlie Chaplin" in actors/director
- Look for movies from 1914-1940 era
- Check for titles like "The Kid", "City Lights", "Modern Times", "The Great Dictator"

**Animation Shorts (Popeye):**

- Search for "Popeye" in title
- Look for Fleischer Studios productions
- Check for other animation shorts from 1930s-1940s
- Include Betty Boop, Felix the Cat if available

## Success Criteria

- ✅ Collections stored in `/public/data/collections.json`
- ✅ Two initial collections populated with correct movies
- ✅ Collections overview page displays all collections
- ✅ Collection detail page shows movies with filters
- ✅ Movie cards show collection indicator
- ✅ Admin UI allows managing collections
- ✅ Movie detail page allows adding/removing from collections
- ✅ Navigation includes collections link
- ✅ SQLite database includes collections
- ✅ No console errors or warnings
- ✅ All features work on localhost

## Notes

- Collections are stored in JSON for easy editing and version control
- SQLite integration is optional but recommended for performance
- Admin features are localhost-only for security
- Collection IDs should be URL-safe slugs (e.g., "charlie-chaplin")
- Movie IDs are IMDb IDs (e.g., "tt0000001")
- Use existing patterns from liked movies feature
- Reuse MovieGrid and MovieCard components where possible
