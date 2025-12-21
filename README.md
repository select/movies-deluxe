# Movies Deluxe

A Nuxt application for discovering and managing free legal movie streams.

## Setup

Install dependencies:

```bash
pnpm install
```

## Available Scripts

### Development

- `pnpm dev` - Start development server on http://localhost:3000
- `pnpm build` - Build application for production
- `pnpm generate` - Generate static site
- `pnpm preview` - Preview production build locally

### Data Collection

#### Archive.org Scraper

`pnpm scrape:archive` - Scrape movies from Archive.org's feature films collection

Available flags:

- `--limit <number>` - Maximum number of movies to scrape (default: 50)
- `--offset <number>` - Skip first N results (for pagination)
- `--dry-run` - Preview results without saving to database
- `--verbose` - Show detailed progress and debug information

Example: `pnpm scrape:archive --limit 100 --verbose`

#### YouTube Scraper

`pnpm scrape:youtube` - Scrape movies from configured YouTube channels

Available flags:

- `--limit <number>` - Maximum videos per channel (default: 50)
- `--dry-run` - Preview results without saving to database
- `--verbose` - Show detailed progress and API responses
- `--channel <id>` - Scrape specific channel only (by channel ID)

Configuration: Edit `config/youtube-channels.json` to add/remove channels

Example: `pnpm scrape:youtube --limit 25 --channel UCxKJ3RQQYlDmI8JLpt5HvWg`

#### Batch Collection

`pnpm scrape:all` - Run both archive and YouTube scrapers sequentially

### Data Processing

#### AI Title Extraction

`pnpm extract-titles` - Extract clean movie titles using AI (requires AWS Bedrock or OpenAI)

Available flags:

- `--dry-run` - Preview extractions without saving
- `--limit <number>` - Process only N movies
- `--stats` - Show statistics only, no processing
- `--verbose` - Show detailed extraction progress
- `--min-confidence <level>` - Filter by confidence: high, medium, or low (default: high)
- `--filter <source>` - Process specific source: archive, youtube, or all (default: all)

Example: `pnpm extract-titles --limit 10 --min-confidence high --verbose`

#### OMDB Enrichment

`pnpm enrich:omdb` - Enrich movie metadata from OMDB API (requires OMDB_API_KEY)

Available flags:

- `--dry-run` - Preview matches without saving
- `--limit <number>` - Process only N movies
- `--force` - Re-enrich movies that already have OMDB data
- `--verbose` - Show detailed matching progress
- `--delay <ms>` - Delay between API requests (default: 200ms)

Example: `pnpm enrich:omdb --limit 20 --force --verbose`

#### Poster Download

`pnpm download-posters` - Download movie posters to local cache

Available flags:

- `--dry-run` - Preview downloads without saving files
- `--limit <number>` - Download only N posters
- `--force` - Re-download existing posters
- `--verbose` - Show detailed download progress
- `--delay <ms>` - Delay between downloads (default: 100ms)

Example: `pnpm download-posters --limit 50 --verbose`

#### Deduplication

`pnpm deduplicate` - Remove duplicate movie entries

Available flags:

- `--dry-run` - Preview duplicates without removing
- `--verbose` - Show detailed duplicate analysis
- `--strategy <method>` - Deduplication strategy: imdb, title, or url (default: imdb)

Example: `pnpm deduplicate --strategy title --verbose`

#### Data Validation

`pnpm validate:data` - Validate movie data structure

Available flags:

- `--verbose` - Show detailed validation results
- `--fix` - Automatically fix common issues
- `--strict` - Enable strict validation rules

Example: `pnpm validate:data --verbose --fix`

### Code Quality

- `pnpm lint` - Run linters (oxlint + eslint)
- `pnpm lint:fix` - Fix linting issues automatically
- `pnpm format` - Format code with prettier
- `pnpm format:check` - Check code formatting without changes

### Git Hooks

- `pnpm prepare` - Install git hooks (runs automatically after install)
- `pnpm commitlint` - Validate commit message format

## Environment Variables

Create a `.env` file in the project root:

```bash
# Required for OMDB metadata enrichment (pnpm enrich:omdb)
OMDB_API_KEY=your-omdb-key-here

# Required for AI title extraction (pnpm extract-titles)
# Option 1: AWS Bedrock (recommended)
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Option 2: OpenAI API
OPENAI_API_KEY=sk-your-api-key-here
```

## Configuration

### YouTube Channels

Edit `config/youtube-channels.json` to configure which YouTube channels to scrape:

```json
{
  "channels": [
    {
      "id": "UCxKJ3RQQYlDmI8JLpt5HvWg",
      "name": "FilmRise Movies",
      "enabled": true
    }
  ]
}
```

## Production Workflow

Recommended workflow for collecting and processing movies:

1. **Scrape movies from sources**

   ```bash
   pnpm scrape:archive --limit 100 --verbose
   pnpm scrape:youtube --limit 50 --verbose
   ```

2. **Extract clean titles using AI** (optional, improves OMDB matching)

   ```bash
   pnpm extract-titles --min-confidence high --verbose
   ```

3. **Enrich with OMDB metadata**

   ```bash
   pnpm enrich:omdb --verbose --delay 200
   ```

4. **Download poster images**

   ```bash
   pnpm download-posters --verbose
   ```

5. **Validate data structure**

   ```bash
   pnpm validate:data --verbose --fix
   ```

6. **Remove duplicates** (if needed)
   ```bash
   pnpm deduplicate --strategy imdb --verbose
   ```

## Features

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
