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
