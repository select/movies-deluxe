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

## AI-Powered Title Extraction

This project uses AI to extract clean movie titles from promotional YouTube/Archive.org titles for improved OMDB matching.

### Why AI Title Extraction?

- **Better OMDB Matching**: Clean titles improve metadata enrichment success rate
- **Handles Promotional Text**: Removes channel names, "Free Full Movie", quality indicators, etc.
- **Consistent Format**: Standardizes titles across different sources
- **Historical Knowledge**: Uses AI trained on 100+ years of cinema

### Setup

1. Get an OpenAI API key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Add it to your `.env` file:

```bash
OPENAI_API_KEY=sk-your-api-key-here
```

### Usage

```bash
# Extract titles for all movies without AI metadata
pnpm extract-titles

# Preview without saving (dry run)
pnpm extract-titles --dry-run

# Process only 10 movies (for testing)
pnpm extract-titles --limit 10

# Reprocess all movies (even those with existing AI metadata)
pnpm extract-titles --force
```

### Examples

| Original Title                                                    | Extracted Title     |
| ----------------------------------------------------------------- | ------------------- |
| `A Christmas Karen \| Free Full Holiday Movie \| FilmRise Movies` | `A Christmas Karen` |
| `Charlie Chaplin's " The Pawnshop"`                               | `The Pawnshop`      |
| `Nosferatu (1922) - Classic Horror Film [HD]`                     | `Nosferatu`         |
| `The Santa Trap \| Free Full Movie \| FilmRise`                   | `The Santa Trap`    |

### AI Metadata Structure

Extracted data is stored in the `ai` field of each movie entry:

```typescript
{
  "imdbId": "tt0012345",
  "title": "A Christmas Karen | Free Full Holiday Movie | FilmRise Movies",
  "ai": {
    "extractedTitle": "A Christmas Karen",
    "confidence": 0.9,
    "timestamp": "2025-12-16T00:00:00.000Z",
    "model": "gpt-4o-mini",
    "prompt": "extract-movie-title.md"
  }
}
```

### Workflow Integration

The recommended workflow for processing movies:

1. **Scrape**: `pnpm scrape:archive` or `pnpm scrape:youtube`
2. **Extract Titles**: `pnpm extract-titles` (uses AI to clean titles)
3. **Enrich**: `pnpm enrich:omdb` (uses AI-extracted titles for better matching)
4. **Download Posters**: `pnpm download-posters`
5. **Validate**: `pnpm validate:data`

### Cost Considerations

- **Model**: Uses `gpt-4o-mini` (fast and cost-effective)
- **Rate Limiting**: 100ms delay between requests (36 requests/minute)
- **Typical Cost**: ~$0.001 per 100 titles (very affordable)
- **Caching**: Results are stored, so titles are only extracted once

### Customizing the Prompt

Edit `/prompts/extract-movie-title.md` to customize the extraction behavior. The prompt includes:

- Instructions for removing promotional text
- Examples of input/output pairs
- Movie enthusiast persona for better context

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
