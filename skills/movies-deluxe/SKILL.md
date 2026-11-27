---
name: movies-deluxe
description: Query free and public-domain movies on mdlx.org (Movies Deluxe) via static JSON endpoints, the compressed SQLite catalog (movies.db.gz), and /search URLs. Use when searching for classic/public-domain films, inspecting movie metadata or Archive.org/YouTube sources, or browsing curated collections on mdlx.org.
---

# Movies Deluxe (`https://mdlx.org`)

`mdlx.org` is a pure static GitHub Pages site. There is no server-side REST search API; instead, all catalog data is served as static JSON files and a gzip-compressed SQLite database.

> **Important:** `/search` is a client-side SPA (`ssr: false`). Fetching `https://mdlx.org/search?q=...` with `curl` only returns the HTML shell. For CLI/coding agents, query the static JSON endpoints or download `/data/movies.db.gz`.

## 1. Static JSON Endpoints

### Catalog Statistics (`/data/stats.json`)

```bash
curl -sL https://mdlx.org/data/stats.json | jq '.database'
```

Contains `database` totals (`total`, `matched`, `unmatched`, `archiveOrgSources`, `youtubeSources`, `curatedCount`) and `external` breakdowns for `archiveOrg` and `youtube` channels.

### Curated Collections (`/data/collections.json`)

Keyed by collection ID (plus a `_schema` metadata key):

```bash
# List enabled collection IDs, names, categories, and movie counts
curl -sL https://mdlx.org/data/collections.json | jq '
  to_entries
  | map(select(.key != "_schema" and .value.enabled != false))
  | map({id: .value.id, name: .value.name, category: .value.category, count: (.value.movieIds | length)})
'

# Get movie IDs in a specific collection (e.g. film-noir, top-movies)
curl -sL https://mdlx.org/data/collections.json | jq '.["film-noir"].movieIds[:10]'
```

### Movie Details (`/movies/<id>.json`)

Every movie has a static JSON file at `https://mdlx.org/movies/<movieId>.json`.

Movie ID prefixes:

- `tt<digits>` — IMDb-matched movies (e.g. `tt0082096`)
- `archive-<slug>` — Unmatched Archive.org items (e.g. `archive-01-is-there-a-crisis`)
- `youtube-<id>` — Unmatched YouTube items

```bash
curl -sL https://mdlx.org/movies/tt0082096.json | jq '{
  movieId,
  title,
  year,
  rating: .metadata.imdbRating,
  director: .metadata.Director,
  actors: .metadata.Actors,
  genre: .metadata.Genre,
  plot: .metadata.Plot,
  sources: [.sources[] | {type, channelName, id, title}],
  collections: [.collections[].id],
  webUrl: ("https://mdlx.org/movie/" + .movieId)
}'
```

Constructing source watch URLs from `sources[]`:

- `type == "archive.org"`: `https://archive.org/details/<source.id>`
- `type == "youtube"`: `https://www.youtube.com/watch?v=<source.id>`

## 2. Querying the SQLite Database (`/data/movies.db.gz`)

For searching, filtering, and sorting across all ~31,000 movies, download and decompress `movies.db.gz` once:

```bash
curl -sL https://mdlx.org/data/movies.db.gz | gunzip > /tmp/movies.db
```

### Schema

- `movies(id, movieId, title, year, imdbRating, imdbVotes, language, genre, country, primarySourceType, primaryChannelName, verified, lastUpdated)`
- `fts_search` (FTS5 virtual table): columns `title`, `actors`, `directors`, `writers` (aligned by `rowid` with `movies.rowid`)
- `genres(id, name, movie_count, created_at)`
- `countries(id, name, movie_count, created_at)`

### Example `sqlite3` Queries

```bash
# Full-text search by director and year filter
sqlite3 -json /tmp/movies.db "
  SELECT m.movieId, m.title, m.year, m.imdbRating, m.genre, m.primarySourceType
  FROM movies m
  WHERE m.rowid IN (
    SELECT rowid FROM fts_search WHERE fts_search MATCH 'directors:\"Hitchcock\"'
  )
  AND m.imdbRating >= 7.0
  ORDER BY m.imdbRating DESC
  LIMIT 15;
"

# Search by actor and title keyword
sqlite3 -json /tmp/movies.db "
  SELECT m.movieId, m.title, m.year, m.imdbRating
  FROM movies m
  WHERE m.rowid IN (
    SELECT rowid FROM fts_search WHERE fts_search MATCH 'actors:\"Buster Keaton\"'
  )
  ORDER BY m.year ASC
  LIMIT 10;
"

# Filter by genre, decade, and minimum votes
sqlite3 -json /tmp/movies.db "
  SELECT movieId, title, year, imdbRating, imdbVotes, primaryChannelName
  FROM movies
  WHERE genre LIKE '%Film-Noir%'
    AND year BETWEEN 1940 AND 1959
    AND imdbVotes >= 3000
  ORDER BY imdbRating DESC
  LIMIT 20;
"
```

After finding `movieId` values in SQLite, fetch `https://mdlx.org/movies/<movieId>.json` for full plot, cast, and streaming source IDs.

## 3. `/search` URLs & Query Syntax

To construct shareable browser links to the web UI:

```text
https://mdlx.org/search?q=<url-encoded-query>&mode=<exact|semantic>&genres=<list>&countries=<list>&source=<list>&year=<range>&rating=<min>&votes=<range>&sort=<order>
```

Supported URL query parameters:

- `q` — Search query (parsed by `parseSearchQuery`): supports `actor:<name>`, `director:<name>`, `writer:<name>`, `title:<title>` (quote multi-word values) plus general keywords
- `mode` — `exact` (default) or `semantic` (browser vector search via `leaf-ir`)
- `genres` — Comma-separated genres (e.g. `Film-Noir,Drama`)
- `countries` — Comma-separated countries (e.g. `USA,Germany`)
- `source` — Comma-separated sources (`archive.org` or YouTube channel names; `sources` alias also accepted)
- `year` — Single year (`1955`) or range (`1940-1959`, `1980-`, `-1960`)
- `rating` — Minimum IMDb rating (`0`–`10`, e.g. `7.5`)
- `votes` — Minimum votes (`5000`) or range (`1000-50000`, `5000-`, `-10000`)
- `sort` — `relevance`, `year-desc`, `year-asc`, `rating-desc`, `rating-asc`, `title-asc`, `title-desc`, `votes-desc`

Examples:

- `https://mdlx.org/search?q=actor%3A%22Charlie%20Chaplin%22%20title%3AKid`
- `https://mdlx.org/search?genres=Film-Noir&year=1940-1959&rating=7&sort=rating-desc`
- `https://mdlx.org/search?q=melancholic+sci-fi+about+memory&mode=semantic`

## 4. Browser Agents (WebMCP)

When operating inside a WebMCP-capable browser on `https://mdlx.org`, use the registered `navigator.modelContext` tools instead of manual DOM scraping:

- `search_movies`
- `semantic_search_movies`
- `get_movie_details`
- `list_collections`
