# Batch Movie Metadata Extraction

Extract clean movie titles and release years from multiple raw source entries.

## Task

For EACH movie in the input array, extract: (1) Clean movie title without promotional text, (2) Original theatrical release year (NOT upload year)

**Remove:** Channel names (FilmRise, Popcornflix), promotional text (Free Full Movie, HD, 720p, 1080p), genre labels, formatting (|, [], ""), quality indicators, video type labels
**Keep:** Original movie title, subtitle if official, original theatrical release year
**Year:** Use 4-digit years from title/description, prefer parentheses format "Title (1942)", choose earliest if multiple, omit if not found

## Input Format

JSON array of movies:

```json
[
  { "id": "movie-123", "title": "Raw Title Here", "description": "Optional description..." },
  { "id": "movie-456", "title": "Another Raw Title", "description": "Another description..." }
]
```

## Output Format

**IMPORTANT:** Respond ONLY with valid JSON array. No text, explanations, or markdown.

Return a JSON array with the same `id` for each input, plus extracted `title` and optional `year`:

```json
[
  { "id": "movie-123", "title": "Clean Title", "year": 1942 },
  { "id": "movie-456", "title": "Another Clean Title" }
]
```

## Examples

Input:

```json
[
  { "id": "a1", "title": "Nosferatu (1922) - Classic Horror [HD]", "description": "" },
  {
    "id": "b2",
    "title": "A Christmas Karen | Free Full Holiday Movie | FilmRise",
    "description": "...2022 holiday comedy..."
  },
  { "id": "c3", "title": "The Santa Trap | Free Full Movie", "description": "A family comedy..." }
]
```

Output:

```json
[
  { "id": "a1", "title": "Nosferatu", "year": 1922 },
  { "id": "b2", "title": "A Christmas Karen", "year": 2022 },
  { "id": "c3", "title": "The Santa Trap" }
]
```

## Movies to Process

{movies}

Respond with JSON array only.
