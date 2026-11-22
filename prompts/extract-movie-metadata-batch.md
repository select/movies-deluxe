# Batch Movie Metadata Extraction

Extract structured movie metadata from multiple raw source entries.

## Task

For EACH movie in the input array, extract a JSON object preserving `id` plus:

- `title` (string, required): Clean movie title without promotional text, channel names, quality tags, or hooks.
- `originalTitle` (string, optional): Original or English theatrical title if `title` is localized/translated (e.g. German, Korean, Russian, Spanish) or vice versa.
- `altTitles` (string[], optional): Other known alternative/localized titles mentioned in the text.
- `year` (number, optional): Original theatrical release year (4-digit integer, NOT upload year).
- `director` (string, optional): Director's full name if clearly stated.
- `cast` (string[], optional): Up to 5 main cast/actor names if clearly stated.
- `language` (string, optional): 2-letter ISO 639-1 language code (e.g. `"en"`, `"de"`, `"ko"`, `"ru"`, `"es"`).
- `contentType` (string, optional): One of `"movie"`, `"double_feature"`, `"part"`, `"tv_episode"`, `"clip"`.

**Omit any optional field if unknown or not present.** Do not use `null` or empty strings/arrays.

## Cleaning & Classification Rules

- Remove channel names (FilmRise, Popcornflix, Movie Central, Netzkino), promotional text (Free Full Movie, Ganzer Film, Película Completa, HD, 1080p, 4K), version suffixes (Colorized, Restored, Remastered), genre labels, and formatting (`|`, `[]`, `""`).
- Strip promotional clickbait hooks (`"Hook | Real Title | Genre"` → `title: "Real Title"`).
- Move actor/director names after dashes or pipes into `cast` / `director`.
- Handle German, Korean, Russian, Spanish, French, Italian, and Japanese localized titles cleanly, populating `originalTitle` / `altTitles` and `language` when present.
- Classify `contentType`:
  - `"double_feature"`: Two films in one upload (`A + B`, `Double Feature`).
  - `"part"`: Multi-part upload (`Part 2 of 4`, `Pt. 1`, `Teil 2`).
  - `"tv_episode"`: TV episode (`s1e01`, `S02E04`, `STUDIO ONE`, `Episode 3`).
  - `"clip"`: Trailer, teaser, preview, clip, or review.
  - `"movie"`: Standard full movie or short film.

## Input Format

```json
[{ "id": "movie-123", "title": "Raw Title Here", "description": "Optional description..." }]
```

## Output Format

**IMPORTANT:** Respond ONLY with a valid JSON array. No text, explanations, or markdown.

## Examples

Input:

```json
[
  { "id": "a1", "title": "Nosferatu (1922) - Classic Horror [HD]", "description": "" },
  {
    "id": "a2",
    "title": "Her Student Wants Her To Himself | The Wrong Teacher | HD Crime Thriller",
    "description": ""
  },
  {
    "id": "a3",
    "title": "Der müde Tod (Destiny) 1921 - Fritz Lang - Ganzer Film Deutsch",
    "description": ""
  },
  {
    "id": "a4",
    "title": "Snowfire - Molly McGowan, Melody McGowan",
    "description": ""
  },
  {
    "id": "b1",
    "title": "Night of the Living Dead + Carnival of Souls Double Feature",
    "description": ""
  },
  { "id": "b2", "title": "The Phantom of the Opera (1925) - Part 2 of 4", "description": "" },
  { "id": "c1", "title": "STUDIO ONE: Twelve Angry Men (1954) s1e01", "description": "" },
  { "id": "c2", "title": "Night of the Living Dead - CLIP", "description": "" }
]
```

Output:

```json
[
  { "id": "a1", "title": "Nosferatu", "year": 1922, "language": "en", "contentType": "movie" },
  { "id": "a2", "title": "The Wrong Teacher", "language": "en", "contentType": "movie" },
  {
    "id": "a3",
    "title": "Der müde Tod",
    "originalTitle": "Destiny",
    "year": 1921,
    "director": "Fritz Lang",
    "language": "de",
    "contentType": "movie"
  },
  {
    "id": "a4",
    "title": "Snowfire",
    "cast": ["Molly McGowan", "Melody McGowan"],
    "language": "en",
    "contentType": "movie"
  },
  {
    "id": "b1",
    "title": "Night of the Living Dead",
    "altTitles": ["Carnival of Souls"],
    "language": "en",
    "contentType": "double_feature"
  },
  {
    "id": "b2",
    "title": "The Phantom of the Opera",
    "year": 1925,
    "language": "en",
    "contentType": "part"
  },
  {
    "id": "c1",
    "title": "Twelve Angry Men",
    "year": 1954,
    "language": "en",
    "contentType": "tv_episode"
  },
  { "id": "c2", "title": "Night of the Living Dead", "language": "en", "contentType": "clip" }
]
```

## Movies to Process

{movies}

Respond with JSON array only.
