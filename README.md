# Movies Deluxe

A Nuxt application for discovering and managing free legal movie streams.

Visit [Movies Deluxe](https://select.github.io/movies/)

<img src="https://github.com/select/movies-deluxe/blob/main/docs/screenshots/movies-deluxe-collections.png?raw=true" alt="Curated Collections" width="60%" /> <img src="https://github.com/select/movies-deluxe/blob/main/docs/screenshots/movies-deluxe-liked.png?raw=true" alt="Liked Movies" width="16%" /> <img src="https://github.com/select/movies-deluxe/blob/main/docs/screenshots/movies-deluxe-movie.png?raw=true" alt="Movie View" width="18%" />

Filter, Sort, and Theme

<img src="https://github.com/select/movies-deluxe/blob/main/docs/screenshots/movies-deluxe-filters.png?raw=true" alt="Advanced Filters" width="25%" /> <img src="https://github.com/select/movies-deluxe/blob/main/docs/screenshots/movies-deluxe-themes.png?raw=true" alt="Theme Options" width="25%" />

## About

I dreamt about his project for while, but it flet too big to start. Finally this Christmas break 2025 I took the curage and started. I heavily relied on agentic development (as an additional learning goal) and created the project in under 2 weeks (check the git history) using [OpenCode](https://opencode.ai/) (with [Sonnet 4.5](https://aws.amazon.com/bedrock/anthropic/) and [Gemini 3 Flash](https://deepmind.google/models/gemini/flash/) and the [beads tracker](https://github.com/steveyegge/beads)). With this huge [amount of data](./public/data/stats.json) (31,477 movies) the curation and linking to the correct metadata is not easy and there are many wrong matches and "bad" entries like trailers and clips. Over time I will implement more data curation strategies, so please be patient.

## Tech Stack

This project is built with

- [Nuxt 4](https://nuxt.com/),
- [UnoCSS](https://unocss.dev/),
- [VueUse](https://vueuse.org/), and
- [Pinia](https://pinia.vuejs.org/).

The server API is exclusively used for local administration tasks for data collection, while the production build runs entirely client-side without a backend server. In production, movie data is queried using an [in-browser SQLite database](https://github.com/sql-js/sql.js) via WebAssembly, enabling offline-capable search functionality directly in the user's browser, next to static files.

Data is collected via multiple APIs

- [Archive.org](https://archive.org/),
- [YouTube](https://www.youtube.com/),
- [OMDB](https://www.omdbapi.com/)

as well as with the help of a local LLM (using [Ollama](https://ollama.com/)). The curation of the data is done with various regexes, small algorithms and manually via the admin UI of this project.

## Setup

Install dependencies and set up data.

```bash
pnpm install
pnpm db:generate
pnpm posters:extract
```

## API Keys

The admin features require API keys for various services. See the [API Keys Setup Guide](./docs/api-keys.md) for detailed configuration instructions.

## Project Structure

```
movies-deluxe/
├── app/                    # Frontend application (Nuxt 4)
│   ├── assets/             # Processed assets (images, SVGs)
│   ├── components/         # Vue components (auto-imported)
│   ├── composables/        # Composables (auto-imported)
│   ├── constants/          # Application constants
│   ├── layouts/            # Layout components
│   ├── pages/              # File-based routing
│   ├── plugins/            # Nuxt plugins (dark mode, splash screen)
│   ├── stores/             # Pinia stores (auto-imported)
│   ├── types/              # Frontend TypeScript types
│   ├── utils/              # Utility functions (auto-imported)
│   └── workers/            # Web Workers (database worker)
├── config/                 # Configuration files
│   └── youtube-channels.json  # YouTube channel configuration
├── data/                   # Raw data files
│   ├── movies.json         # Source movie database
│   ├── failed-*.json       # Failed operation tracking
│   └── posters-*.tar.gz    # Archived poster images
├── docs/                   # Project documentation
├── prompts/                # AI prompts for data extraction
├── public/                 # Static assets (served at root)
│   ├── data/               # Generated data files
│   │   ├── collections.json   # Curated movie collections (top-movies, etc.)
│   │   └── stats.json         # Database statistics and metrics
│   ├── posters/            # Downloaded poster images (13,000+ files)
│   └── sqlite-wasm/        # SQLite WebAssembly files (sql.js)
├── scripts/                # Maintenance and migration scripts
├── server/                 # Backend API (Nuxt server, localhost only)
│   ├── api/                # API endpoints
│   │   ├── admin/          # Admin API (scraping, enrichment, etc.)
│   │   └── movies.get.ts   # Public movie data API
│   ├── plugins/            # Server plugins
│   └── utils/              # Server utilities
└── shared/                 # Shared code between frontend and backend
    ├── types/              # Shared TypeScript types
    └── utils/              # Shared utility functions
```

## Admin Dashboard

The admin dashboard started of as individual scripts that were migrated to server API endpoints. Progress is reported via [SSE](https://en.wikipedia.org/wiki/Server-sent_events) in real time since the actions can take from minutes to multiple days.

The dashboard can only be reached on `localhost` at `/admin`.

<img src="https://github.com/select/movies-deluxe/blob/main/docs/screenshots/movies-deluxe-admin-stats.png?raw=true" alt="Admin Statistics" width="20%" /> <img src="https://github.com/select/movies-deluxe/blob/main/docs/screenshots/movies-deluxe-admin-scrape.png?raw=true" alt="Admin Scrape" width="20%" /> <img src="https://github.com/select/movies-deluxe/blob/main/docs/screenshots/movies-deluxe-admin-collection.png?raw=true" alt="Admin Collection Manager" width="20%" />
