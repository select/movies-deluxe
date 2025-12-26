# Movies Deluxe

A Nuxt application for discovering and managing free legal movie streams.

## Setup

Install dependencies:

```bash
pnpm install
```

## Available Scripts

### Development

- `pnpm dev` - Start development server on http://localhost:3003
- `pnpm build` - Build application for production
- `pnpm generate` - Generate static site
- `pnpm preview` - Preview production build locally

### Database

- `pnpm db:generate` - Generate SQLite database from movies.json

### Code Quality

- `pnpm lint` - Run linters (oxlint + eslint)
- `pnpm lint:fix` - Fix linting issues automatically
- `pnpm format` - Format code with prettier
- `pnpm format:check` - Check code formatting without changes
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm typecheck:watch` - Run TypeScript type checking in watch mode

### Git Hooks

- `pnpm prepare` - Install git hooks (runs automatically after install)
- `pnpm commitlint` - Validate commit message format

## Environment Variables

Create a `.env` file in the project root:

```bash
# Required for OMDB metadata enrichment
OMDB_API_KEY=your-omdb-key-here

# Required for AI title extraction
# Option 1: AWS Bedrock (recommended)
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Option 2: OpenAI API
OPENAI_API_KEY=sk-your-api-key-here
```

## Configuration

### Project Structure

```
movies-deluxe/
├── app/                    # Frontend application (Nuxt 4)
│   ├── components/         # Vue components (auto-imported)
│   ├── composables/        # Composables (auto-imported)
│   ├── pages/              # File-based routing
│   ├── stores/             # Pinia stores (auto-imported)
│   ├── types/              # Frontend TypeScript types
│   └── utils/              # Utility functions (auto-imported)
├── config/                 # Configuration files
│   └── youtube-channels.json  # YouTube channel configuration
├── public/                 # Static assets (served at root)
│   ├── data/               # Movie database (movies.json)
│   └── posters/            # Downloaded poster images
├── scripts/                # Maintenance and migration scripts
├── server/                 # Backend API (Nuxt server)
│   ├── api/                # API endpoints
│   │   ├── admin/          # Admin API (scraping, enrichment, etc.)
│   │   └── movies.get.ts   # Public movie data API
│   └── utils/              # Server utilities
├── shared/                 # Shared code between frontend and backend
│   └── types/              # Shared TypeScript types
└── tests/                  # Test files
```

### YouTube Channels

Edit `config/youtube-channels.json` to configure which YouTube channels to scrape:

```json
{
  "channels": [
    {
      "id": "UCxKJ3RQQYlDmI8JLpt5HvWg",
      "name": "FilmRise Movies",
      "enabled": true,
      "language": "en"
    }
  ]
}
```

## Admin Dashboard

The application includes an admin dashboard at `/admin` for managing movie data:

### Data Collection

- **Archive.org Scraper**: Scrape movies from Archive.org's feature films collection
- **YouTube Scraper**: Scrape movies from configured YouTube channels
- **Scraping Stats**: View scraping progress and statistics

### Data Processing

- **OMDB Enrichment**: Enrich movie metadata with ratings, plot, cast, etc.
- **Poster Download**: Download and cache movie posters locally
- **Data Validation**: Validate movie data structure and fix common issues
- **Deduplication**: Remove duplicate movie entries and sources
- **Description Deduplication**: Remove duplicate descriptions from sources

### Database

- **SQLite Generation**: Generate SQLite database from movies.json for offline use

All operations include progress tracking and detailed logging.

## Maintenance Scripts

The `scripts/` directory contains maintenance and migration scripts:

- `remove-duplicate-sources.ts` - Remove duplicate sources from movie entries
- `fix-duplicate-archive-sources.ts` - Fix duplicate archive.org sources
- `migrate-archive-source-titles.ts` - Migrate archive source titles
- `migrate-failed-omdb.ts` - Migrate failed OMDB entries
- `analyze-failed-omdb.ts` - Analyze failed OMDB matches
- `generate-sqlite.ts` - Generate SQLite database
- `lookup-youtube-channels.ts` - Lookup YouTube channel information
- `test-*.ts` - Various test scripts

Run scripts with: `pnpm tsx scripts/<script-name>.ts`

## Features

### Frontend Application

- **Movie Catalog**: Browse 250+ free legal movies from Archive.org and YouTube
- **Advanced Filtering**: Filter by source (Archive.org or individual YouTube channels), genre, country, rating, year, and vote count
- **Sidebar Navigation**: Quick access to filters and statistics
- **Dark Mode**: Toggle between light and dark themes
- **Infinite Scroll**: Automatically load more movies as you scroll
- **Search**: Find movies by title
- **Sort Options**: Sort by title, year, rating, or vote count
- **Responsive Design**: Works on desktop and mobile devices
- **Movie Cards**: Display poster, title, year, rating, and vote count

### Data Collection

- Scrapes movies from Archive.org and YouTube channels
- Configurable limits and pagination support
- Dry-run mode for testing before saving

### AI-Powered Title Extraction

- Cleans promotional text from movie titles
- Improves OMDB matching accuracy
- Supports AWS Bedrock (Claude) and OpenAI
- Confidence scoring (high/medium/low)

### OMDB Metadata Enrichment

- Fetches ratings, plot summaries, and cast information
- Automatic rate limiting to respect API limits
- Smart matching using cleaned titles

### Local Poster Caching

- Downloads and serves posters from local storage
- Three-tier fallback system (local → OMDB CDN → placeholder)
- Automatic retry logic with rate limiting

### Data Validation

- Validates movie data structure
- Checks for required fields
- Identifies duplicate entries
- Auto-fix common issues

## Documentation

- [Nuxt Documentation](https://nuxt.com/docs)
- [Deployment Guide](https://nuxt.com/docs/getting-started/deployment)
- [OpenAI API Keys](https://platform.openai.com/api-keys)
- [OMDB API](http://www.omdbapi.com/apikey.aspx)
