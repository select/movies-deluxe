# API Keys Setup

This guide covers all API keys needed for the Movies Deluxe admin features.

## Environment Variables

Create a `.env` file in the project root with the following variables:

```bash

# Required for OMDB metadata enrichment
OMDB_API_KEY=your_omdb_api_key_here
# Required for YouTube scraping
YOUTUBE_API_KEY=your_youtube_api_key_here
# Required for Google Search scraping IMDb ids
GOOGLE_SEARCH_CX=your_search_engine_id_here
```

## YouTube Data API v3

Required for scraping movies from YouTube channels.

### Setup Steps

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select existing
3. Enable "YouTube Data API v3"
4. Create credentials → API Key
5. Copy the key to `.env` as `YOUTUBE_API_KEY`

See [YouTube Data API Integration Guide](./youtube-data-api-integration.md) for detailed setup.

## OMDB API

Used for enriching movie metadata with ratings, plot summaries, cast information, and posters.

### Setup Steps

1. Go to [OMDb API](http://www.omdbapi.com/apikey.aspx)
2. Request a free API key (1,000 requests/day)
3. Copy the key to `.env` as `OMDB_API_KEY`

### Features

- Fetch IMDb ratings, Rotten Tomatoes scores, and Metacritic ratings
- Get plot summaries, cast, and crew information
- Download high-quality movie posters
- Automatic rate limiting to respect API limits

## Google Custom Search API

Used for IMDb curation and movie search functionality.

### Setup Steps

See [Google Custom Search API Setup](./google-search-setup.md) for detailed configuration.
