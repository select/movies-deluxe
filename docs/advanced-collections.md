# Advanced Collection Manager

The Advanced Collection Manager allows for dynamic and categorized movie collections using saved queries and tags.

## Features

### 1. Saved Queries (Dynamic Collections)

Collections can now store multiple search and filter combinations. This allows for "Dynamic Collections" that can be easily updated as new movies are added to the library.

- **Capture Filter State**: Use the "Filters" button in the Collection Editor to set up complex filters (genres, year range, rating, votes, sources).
- **Save Query**: Click "Save Current Search" to add the current search term and all active filters to the collection.
- **Apply Query**: Click the filter icon on a saved query to quickly restore its search and filter settings.
- **Refresh Collection**: Click "Refresh Collection from Queries" to automatically update the collection's movie list based on the union of all its saved queries.

### 2. Collection Tags

Collections can be categorized using tags for better organization and discovery.

- **Manage Tags**: Use the "Collection Metadata" section in the Collection Editor to add or remove tags.
- **Autocomplete**: The tag editor suggests existing tags from other collections.
- **Public Display**: Tags are displayed on collection cards and detail pages.

### 3. Year and Votes Range Filters

Filtering has been enhanced to support ranges for year and votes, allowing for more precise queries.

- **Year Range**: Filter movies from a specific era (e.g., 1940 - 1960).
- **Votes Range**: Filter movies based on popularity (e.g., 1000 - 5000 votes).

## Technical Implementation

### Data Model

The `Collection` interface in `shared/types/collections.ts` has been extended:

```typescript
export interface SavedQuery {
  searchQuery: string
  filterState: FilterState
}

export interface Collection {
  // ... existing fields
  savedQueries?: SavedQuery[]
  tags?: string[]
}
```

### API Endpoints

- `POST /api/admin/collections/add-query`: Adds a saved query.
- `POST /api/admin/collections/remove-query`: Removes a saved query.
- `POST /api/admin/collections/update-tags`: Updates collection tags.
- `POST /api/admin/collections/refresh-from-query`: Executes saved queries and updates the collection's `movieIds`.

### Server-side Query Execution

The `server/utils/queryRefresh.ts` utility translates `FilterState` into optimized SQL queries for the SQLite database to find matching movies.
