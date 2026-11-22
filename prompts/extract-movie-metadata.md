# Movie Metadata Extraction

Extract structured movie metadata from raw source data (YouTube / Archive.org title and description).

## Task

Extract a JSON object with:

- `title` (string, required): Clean movie title without promotional text, channel names, quality tags, or hooks.
- `originalTitle` (string, optional): Original or English theatrical title if the main `title` is localized/translated (e.g. German, Korean, Russian, Spanish) or vice versa.
- `altTitles` (string[], optional): Other known alternative/localized titles mentioned in the text.
- `year` (number, optional): Original theatrical release year (4-digit integer, NOT upload year).
- `director` (string, optional): Director's full name if clearly stated.
- `cast` (string[], optional): Up to 5 main cast/actor names if clearly stated.
- `language` (string, optional): 2-letter ISO 639-1 language code of the video/title (e.g. `"en"`, `"de"`, `"ko"`, `"ru"`, `"es"`, `"fr"`, `"it"`, `"ja"`).
- `contentType` (string, optional): One of `"movie"`, `"double_feature"`, `"part"`, `"tv_episode"`, `"clip"`.

**Omit any optional field if unknown or not present.** Do not use `null` or empty strings/arrays.

## Cleaning & Classification Rules

**Remove from `title`:**

- Channel names (FilmRise, Popcornflix, Movie Central, Netzkino, Alter, Dust, etc.)
- Promotional text (Free Full Movie, Full Movie, Ganzer Film, Pelicula Completa, HD, 720p, 1080p, 4K, BluRay)
- Version suffixes (Colorized, Restored, Remastered, Director's Cut, Extended Edition, Rare Classic, A Golden Classic)
- Actor/cast names or director names appended after a dash/pipe (extract them into `cast` / `director` instead)
- Genre labels and quality indicators
- Formatting characters (`|`, `[]`, `""`)
- Promotional clickbait hooks/taglines (e.g. `"Her Student Wants Her To Himself | The Wrong Teacher | HD Crime Thriller"` → `title: "The Wrong Teacher"`)

**Content Type Classification (`contentType`):**

- `"double_feature"`: Two movies bundled in one upload (e.g. `"A + B"`, `"Double Feature: A / B"`).
- `"part"`: Multi-part upload of a movie (e.g. `"Part 2 of 4"`, `"Pt. 1"`, `"Teil 2"`).
- `"tv_episode"`: TV series episode (e.g. `"s1e01"`, `"S02E04"`, `"STUDIO ONE"`, `"Episode 3"`, `"Folge 5"`).
- `"clip"`: Trailer, teaser, preview, scene clip, or review (e.g. `"TRAILER"`, `"CLIP"`, `"PREVIEW"`, `"TEASER"`).
- `"movie"`: Standard full movie or short film.

**Localized Titles:**

- Handle German, Korean, Russian, Spanish, French, Italian, and Japanese titles cleanly.
- If both a localized title and an original/English title appear (e.g. `"Der Mann mit dem goldenen Arm (The Man with the Golden Arm, 1955)"`), put the primary title in `title` and the other in `originalTitle` or `altTitles`, and set `language` (e.g. `"de"`).

**Year:** Use 4-digit theatrical release year from title/description, prefer parentheses format `"Title (1942)"`, choose earliest plausible theatrical year if multiple, omit if not found.

## Examples

`Nosferatu (1922) - Classic Horror [HD]`
→ `{"title": "Nosferatu", "year": 1922, "language": "en", "contentType": "movie"}`

`Her Student Wants Her To Himself | The Wrong Teacher | HD Crime Thriller`
→ `{"title": "The Wrong Teacher", "language": "en", "contentType": "movie"}`

`Metropolis (1927) | Fritz Lang | Stummfilm Klassiker [Restored]`
→ `{"title": "Metropolis", "year": 1927, "director": "Fritz Lang", "language": "de", "contentType": "movie"}`

`Snowfire - Molly McGowan, Melody McGowan`
→ `{"title": "Snowfire", "cast": ["Molly McGowan", "Melody McGowan"], "language": "en", "contentType": "movie"}`

`Der müde Tod (Destiny) 1921 - Ganzer Film Deutsch`
→ `{"title": "Der müde Tod", "originalTitle": "Destiny", "year": 1921, "language": "de", "contentType": "movie"}`

`El Ángel Exterminador (1962) | Luis Buñuel | Película Completa`
→ `{"title": "El Ángel Exterminador", "year": 1962, "director": "Luis Buñuel", "language": "es", "contentType": "movie"}`

`Night of the Living Dead (1968) + Carnival of Souls (1962) Double Feature`
→ `{"title": "Night of the Living Dead", "altTitles": ["Carnival of Souls"], "year": 1968, "language": "en", "contentType": "double_feature"}`

`The Phantom of the Opera (1925) - Part 2 of 4`
→ `{"title": "The Phantom of the Opera", "year": 1925, "language": "en", "contentType": "part"}`

`STUDIO ONE: Twelve Angry Men (1954) s1e01`
→ `{"title": "Twelve Angry Men", "year": 1954, "language": "en", "contentType": "tv_episode"}`

`Night of the Living Dead - Official Trailer / CLIP`
→ `{"title": "Night of the Living Dead", "language": "en", "contentType": "clip"}`

## Response Format

**IMPORTANT:** Respond ONLY with valid JSON. No text, explanations, or markdown.

**Title:** {title}
**Description:** {description}

Respond with JSON only.
