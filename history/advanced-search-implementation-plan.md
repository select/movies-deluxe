# Advanced Search Implementation Plan

## Epic Overview

Implement advanced search functionality with field-specific keyword search (actor:, director:, writer:, title:) and restore actor/director/writer indexing in the SQLite database for exact search capabilities.

## Current State Analysis

### Database Structure (generateSQLite.ts)

- **Current FTS5 Index**: Only indexes `title` field
- **Missing Indexes**: No dedicated tables/indexes for actors, directors, writers
- **Metadata Storage**: Actor/Director/Writer data exists in `MovieMetadata` but not indexed
- **Search Mode**: Currently supports "exact" (FTS5) and "semantic" (vector) search

### Frontend Search (useMovieStore.ts)

- **Search Query Building**: `buildFilterQuery()` uses FTS5 for exact search
- **Current FTS5 Query**: Only searches title field
- **Search Modes**: "exact" and "semantic"
- **No Keyword Parsing**: No support for field-specific keywords like `actor:`, `director:`

### Backend Search (server/api/admin/movies/search.get.ts)

- **Simple String Matching**: Uses `.toLowerCase().includes()` on multiple fields
- **Fields Searched**: title, Director, Writer, Actors, Plot, imdbId
- **No Keyword Support**: Searches all fields equally, no field-specific targeting

## Implementation Strategy

### Phase 1: Database Schema Enhancement

1. **Create People Tables**

   - `actors` table: id, name, movie_count
   - `directors` table: id, name, movie_count
   - `writers` table: id, name, movie_count

2. **Create Junction Tables**

   - `movie_actors`: movieId, actorId, character (optional)
   - `movie_directors`: movieId, directorId
   - `movie_writers`: movieId, writerId

3. **Create FTS5 Indexes**

   - `fts_actors`: Full-text search on actor names
   - `fts_directors`: Full-text search on director names
   - `fts_writers`: Full-text search on writer names

4. **Populate Tables**
   - Parse comma-separated values from `metadata.Actors`, `metadata.Director`, `metadata.Writer`
   - Normalize names (trim, handle "N/A")
   - Create relationships in junction tables

### Phase 2: Query Parser Implementation

1. **Create Query Parser Utility**

   - Parse search queries for keywords: `actor:`, `director:`, `writer:`, `title:`
   - Support multiple keywords in one query: `actor:Roy Rogers director:Dave Fleischer`
   - Handle quoted strings: `actor:"Roy Rogers" title:"Saving Private Ryan"`
   - Default behavior: search all fields when no keyword present

2. **Query Structure**
   ```typescript
   interface ParsedQuery {
     actors?: string[]
     directors?: string[]
     writers?: string[]
     title?: string
     general?: string // When no keyword specified
   }
   ```

### Phase 3: Frontend Search Enhancement

1. **Update buildFilterQuery()**

   - Add query parsing logic
   - Build appropriate SQL JOINs based on parsed keywords
   - Combine FTS5 searches across multiple tables

2. **SQL Query Examples**

   ```sql
   -- Search by actor
   SELECT DISTINCT m.imdbId
   FROM fts_actors fa
   JOIN movie_actors ma ON fa.actorId = ma.actorId
   JOIN movies m ON ma.movieId = m.imdbId
   WHERE fts_actors MATCH ?

   -- Search by director
   SELECT DISTINCT m.imdbId
   FROM fts_directors fd
   JOIN movie_directors md ON fd.directorId = md.directorId
   JOIN movies m ON md.movieId = m.imdbId
   WHERE fts_directors MATCH ?

   -- Combined search (actor AND director)
   SELECT DISTINCT m.imdbId
   FROM movies m
   JOIN movie_actors ma ON m.imdbId = ma.movieId
   JOIN fts_actors fa ON ma.actorId = fa.actorId
   JOIN movie_directors md ON m.imdbId = md.movieId
   JOIN fts_directors fd ON md.directorId = fd.directorId
   WHERE fts_actors MATCH ? AND fts_directors MATCH ?

   -- General search (all fields)
   SELECT DISTINCT m.imdbId
   FROM movies m
   LEFT JOIN movie_actors ma ON m.imdbId = ma.movieId
   LEFT JOIN fts_actors fa ON ma.actorId = fa.actorId
   LEFT JOIN movie_directors md ON m.imdbId = md.movieId
   LEFT JOIN fts_directors fd ON md.directorId = fd.directorId
   LEFT JOIN movie_writers mw ON m.imdbId = mw.movieId
   LEFT JOIN fts_writers fw ON mw.writerId = fw.writerId
   LEFT JOIN fts_movies fm ON m.imdbId = fm.imdbId
   WHERE fts_movies MATCH ? OR fts_actors MATCH ? OR fts_directors MATCH ? OR fts_writers MATCH ?
   ```

### Phase 4: UI/UX Enhancements

1. **Search Input Hints**

   - Add placeholder text showing keyword examples
   - Add tooltip/help icon explaining keyword syntax

2. **Search Suggestions** (Optional)

   - Autocomplete for actor/director/writer names
   - Show keyword suggestions as user types

3. **Search Results Display**
   - Highlight matched fields in results
   - Show which field matched (actor, director, writer, title)

### Phase 5: Database Worker Updates

1. **Add New Query Types**

   - `query-by-actor`
   - `query-by-director`
   - `query-by-writer`
   - `query-parsed` (for combined keyword queries)

2. **Update Worker Message Types**
   - Add new message types to handle parsed queries

## Technical Considerations

### Performance

- **Indexes**: Ensure all FTS5 tables and junction tables have proper indexes
- **Query Optimization**: Use EXPLAIN QUERY PLAN to optimize complex JOINs
- **Caching**: Consider caching popular actor/director/writer searches

### Data Quality

- **Name Normalization**: Handle variations (e.g., "Steven Spielberg" vs "S. Spielberg")
- **Multiple Names**: Handle comma-separated lists properly
- **Character Encoding**: Handle international characters correctly

### Backward Compatibility

- **Default Behavior**: When no keywords present, search all fields (current behavior)
- **Migration**: Ensure existing searches continue to work

## Testing Strategy

1. **Unit Tests**: Query parser logic
2. **Integration Tests**: Database queries with various keyword combinations
3. **E2E Tests**: Full search flow from UI to results
4. **Performance Tests**: Query performance with large datasets

## Rollout Plan

1. Deploy database schema changes
2. Regenerate SQLite database with new indexes
3. Deploy frontend query parser
4. Deploy UI enhancements
5. Monitor performance and user feedback

## Success Metrics

- Search accuracy improved (measured by user engagement)
- Search performance maintained (< 300ms for typical queries)
- User adoption of keyword search features
- Reduced "no results" searches
