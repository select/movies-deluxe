# Google Custom Search API Setup

To use the official Google Search integration for IMDb curation, you need to set up a Google Custom Search Engine (CSE) and obtain a Search Engine ID (CX).

## 1. Get an API Key

You can use the same API key you use for the YouTube Data API.

- Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
- Ensure the **Custom Search API** is enabled for your project.

## 2. Create a Custom Search Engine

- Go to the [Programmable Search Engine control panel](https://programmablesearchengine.google.com/controlpanel/all).
- Click **Add** to create a new search engine.
- Name it (e.g., "Movies Deluxe IMDb Search").
- Under **What to search?**, you can leave it broad or restrict it to `imdb.com` (though the app adds `site:imdb.com` to queries automatically).
- Click **Create**.

## 3. Get your Search Engine ID (CX)

- In the control panel for your new search engine, find the **Search engine ID**.
- It looks like a string of characters followed by a colon and more characters (e.g., `0123456789abcdefg:hijklmnop`).

## 4. Update your .env file

Add the following variables to your `.env` file:

```env
# Use the same key as YOUTUBE_API_KEY
GOOGLE_API_KEY=your_google_api_key_here
GOOGLE_SEARCH_CX=your_search_engine_id_here
```

## 5. Restart the application

Restart your development server for the changes to take effect.
