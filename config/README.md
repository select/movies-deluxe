# YouTube Channels Configuration

This directory contains configuration for YouTube channels to scrape for movies.

## Adding New Channels

To add a new YouTube channel to the scraper:

1. **Find the channel handle or ID**
   - Visit the channel on YouTube
   - The handle is in the URL: `youtube.com/@ChannelHandle`
   - Or use the channel ID: `youtube.com/channel/UCxxxxxxxxx`

2. **Add to `youtube-channels.json`**

   ```json
   {
     "id": "@ChannelHandle",
     "name": "Channel Display Name",
     "language": "en",
     "enabled": true,
     "notes": "Brief description of the channel's content"
   }
   ```

3. **Field descriptions:**
   - `id` (required): Channel handle (e.g., `@FilmRiseMovies`) or channel ID (e.g., `UCxxxxxxxxx`)
   - `name` (required): Human-readable channel name
   - `language` (required): ISO 639-1 language code (e.g., `en`, `es`, `fr`)
   - `enabled` (required): Set to `true` to scrape, `false` to skip
   - `notes` (optional): Description of the channel's content

4. **Run the scraper**
   ```bash
   pnpm scrape:youtube
   ```

## Disabling Channels

To temporarily disable a channel without removing it:

```json
{
  "id": "@ChannelHandle",
  "name": "Channel Name",
  "language": "en",
  "enabled": false, // Set to false
  "notes": "Temporarily disabled - reason here"
}
```

## Command Line Override

You can override the config and scrape specific channels:

```bash
# Scrape only specific channels
pnpm scrape:youtube -- --channels "@Channel1,@Channel2"

# Scrape with custom limit
pnpm scrape:youtube -- --limit 100
```

## Finding Good Channels

Look for channels that:

- Provide full-length movies legally
- Have clear titles (movie name + year)
- Upload regularly
- Have good video quality
- Provide proper metadata

## Recommended Channels

Current configured channels:

- **FilmRise Movies** (`@FilmRiseMovies`) - Classic and independent films
- **Popcornflix** (`@Popcornflix`) - Wide variety of genres
- **Movie Central** (`@MovieCentral`) - Curated movie collection

Other potential channels to consider:

- Maverick Movies
- Timeless Classic Movies
- Cult Cinema Classics
- Public Domain Movies

## Title Cleaning Rules

YouTube channels often add promotional text to video titles. The scraper uses channel-specific regex patterns to extract clean movie titles for better OMDB matching.

### How It Works

1. When scraping a video, the raw title is cleaned using channel-specific rules
2. The cleaned title is then parsed to extract the movie name and year
3. The cleaned title is used for OMDB matching to improve accuracy

### Supported Channels

- **Netzkino** (`@Netzkino`) - Removes "(full movie...)" patterns
  - Example: `Golden Winter 2 (Christmas comedy full movie...)` → `Golden Winter 2`

- **FilmRise Movies** (`@FilmRiseMovies`) - Removes "| Free Full ... | FilmRise" suffixes
  - Example: `A Christmas Karen | Free Full Holiday Movie | FilmRise Movies` → `A Christmas Karen`

- **Popcornflix** (`@Popcornflix`) - Removes "| FULL MOVIE | Genre" patterns
  - Example: `Banger (2018) | FULL MOVIE | Action, Crime | Omar Gooding` → `Banger`

- **Movie Central** (`@MovieCentral`) - Extracts alternate title from "Original | Alternate" format
  - Example: `Surviving The Club Underworld | Young Lion of the West` → `Young Lion of the West`

- **Timeless Classic Movies** (`@TimelessClassicMovies`) - Removes [Genre] tags
  - Example: `Johnny O'Clock [Film Noir] [Drama] [Crime]` → `Johnny O'Clock`

- **Mosfilm** (`@Mosfilm`) - Removes "| GENRE | Subtítulos" patterns
  - Example: `Operacion "Y" | COMEDIA | Subtítulos en español` → `Operacion "Y"`

- **Moviedome** (`@Moviedome`) - Extracts title from "Description: Title (Ganzer Film)" format
  - Example: `So ein toller Liebesfilm...: Testament of Youth (Ganzer Film)` → `Testament of Youth`

### Adding New Channels

When adding a new channel with promotional titles:

1. Add dirty/clean examples to `config/dirty-clean-examples.txt`
2. Add cleaning rule to `scripts/utils/titleCleaner.ts`
3. Run `pnpm tsx scripts/test-title-cleaning.ts` to verify
4. Update this documentation

### Testing

Test all cleaning rules:

```bash
pnpm tsx scripts/test-title-cleaning.ts
```

Test scraper with dry-run:

```bash
pnpm tsx scripts/scrape-youtube.ts --channel=Netzkino --limit=5 --dry-run
```
