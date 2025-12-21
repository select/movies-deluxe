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

**IMPORTANT:** Always use the `@` symbol when specifying channel handles in the `--channels` parameter. Without it, the scraper won't find the channel configuration and title cleaning will be skipped.

```bash
# ✅ CORRECT - includes @ symbol
pnpm tsx scripts/scrape-youtube.ts --channels=@Netzkino

# ❌ WRONG - missing @ symbol (title cleaning won't work!)
pnpm tsx scripts/scrape-youtube.ts --channels=Netzkino
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

## Troubleshooting

### Titles Not Being Cleaned

**Symptom:** Movie titles in database still have promotional clutter like "(FULL MOVIE...)" or "[Genre]"

**Cause:** Channel ID mismatch - the scraper couldn't find the channel configuration

**Solution:** Ensure you're using the `@` symbol when specifying channels:

```bash
# Check if title cleaning is working - look for "Title cleaned:" debug messages
pnpm tsx scripts/scrape-youtube.ts --channels=@Netzkino --limit=5

# If you see "Title cleaned:" messages, it's working!
# If not, check:
# 1. Channel ID in config matches what you're passing (including @ symbol)
# 2. Channel has a cleaning rule in scripts/utils/titleCleaner.ts
```

**Test title cleaning directly:**

```bash
# Create a test script
cat > scripts/test-my-title.ts << 'EOF'
import { cleanTitle } from './utils/titleCleaner.ts'

const title = "Your YouTube Title Here (FULL MOVIE...)"
const result = cleanTitle(title, '@Netzkino')
console.log('Original:', title)
console.log('Cleaned:', result)
EOF

pnpm tsx scripts/test-my-title.ts
```

### No Videos Found

**Symptom:** Scraper reports "No videos found in channel"

**Possible causes:**

1. Channel handle is incorrect
2. Channel has no public videos
3. YouTube API rate limit reached

**Solution:**

- Verify channel handle by visiting `youtube.com/@ChannelHandle`
- Check if channel has public videos
- Wait a few minutes if rate limited

### OMDB Matching Fails

**Symptom:** Movies added but no OMDB metadata

**Possible causes:**

1. OMDB API key not configured
2. Title cleaning not working (see above)
3. Movie not in OMDB database
4. OMDB API quota exceeded (1000 requests/day)

**Solution:**

- Set `NUXT_PUBLIC_OMDB_API_KEY` environment variable
- Verify title cleaning is working
- Run OMDB enrichment separately: `pnpm tsx scripts/enrich-omdb.ts`
