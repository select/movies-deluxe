# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## Movie Poster Management

This project implements a local poster caching system for improved performance and reliability.

### Why Local Poster Caching?

- **Performance**: Serving posters from local storage is faster than fetching from external CDNs
- **Offline Support**: Cached posters remain available even when the OMDB CDN is unreachable
- **CDN Reliability**: Reduces dependency on external services that may have rate limits or downtime
- **Bandwidth**: Reduces repeated requests to external CDN for the same images

### Poster Storage

Posters are stored locally in the `/public/posters/` directory with the following naming convention:

```
/public/posters/[imdbId].jpg
```

**Example**: A movie with IMDB ID `tt0147467` will have its poster at `/public/posters/tt0147467.jpg`

### Downloading Posters

Use the provided CLI commands to download movie posters from OMDB metadata:

```bash
# Preview what will be downloaded (dry run)
pnpm download-posters:dry-run

# Download all posters
pnpm download-posters
```

**Features**:

- ✅ Automatic retry logic (3 attempts with exponential backoff)
- ✅ Rate limiting (100ms delay between downloads)
- ✅ Skips already downloaded posters
- ✅ Progress reporting with statistics
- ✅ Validates downloaded images
- ✅ Handles movies without OMDB metadata gracefully

### Poster Fallback System

The movie store implements a three-tier fallback system (priority order):

1. **Local Cache**: `/posters/[imdbId].jpg` (fastest, served from public directory)
2. **OMDB CDN**: `metadata.Poster` URL (fallback when local file doesn't exist)
3. **Placeholder**: `/images/poster-placeholder.jpg` (final fallback)

**Usage in Components**:

```typescript
import { useMovieStore } from '~/stores/useMovieStore'

const movieStore = useMovieStore()

// Async version (checks if local file exists)
const posterUrl = await movieStore.getPosterUrl(imdbId, metadata)

// Sync version (assumes local exists, browser handles 404 gracefully)
const posterUrl = movieStore.getPosterUrlSync(imdbId, metadata, true)

// Check if local poster exists
const hasLocal = await movieStore.posterExists(imdbId)

// Batch preload multiple posters (optimized)
const results = await movieStore.preloadPosters([imdbId1, imdbId2, imdbId3])
```

### Updating Posters

When movie metadata changes (new OMDB enrichment):

1. Delete the old poster file: `rm public/posters/[imdbId].jpg`
2. Run the download command: `pnpm download-posters`
3. The script will re-download only missing posters

**Tip**: The download script automatically skips existing posters, so it's safe to run repeatedly.

### Technical Details

**Download Script**: `/server/scripts/downloadPosters.ts`

- Reads movie data from `/data/movies.json`
- Downloads from `metadata.Poster` URLs
- Saves to `/public/posters/[imdbId].jpg`
- Built with Node.js built-in `fetch` and `fs/promises` (zero external dependencies)

**Store Methods**: `/app/stores/useMovieStore.ts`

- `posterExists(imdbId)` - Check if local poster exists (HEAD request)
- `getPosterUrl(imdbId, metadata)` - Get best available poster URL (async)
- `getPosterUrlSync(imdbId, metadata, preferLocal)` - Sync version for SSR
- `preloadPosters(imdbIds[])` - Batch check with rate limiting (10 concurrent)
