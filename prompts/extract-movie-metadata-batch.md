# Batch Movie Metadata Extraction

Extract clean movie titles and release years from multiple raw source entries.

## Task

For EACH movie in the input array, extract: (1) Clean movie title without promotional text, (2) Original theatrical release year (NOT upload year)

**Remove:**

- Channel names (FilmRise, Popcornflix, Movie Central, Netzkino)
- Promotional text (Free Full Movie, HD, 720p, 1080p, 4K)
- Version suffixes (Colorized, Restored, Remastered, Director's Cut, Extended Edition, CLIP, Rare Classic, A Golden Classic, Full Movie)
- Actor/cast names after dash separator
- Genre labels and quality indicators
- Video type labels
- Formatting characters (|, [], "")
- Promotional hooks/taglines (e.g., "Her Student Wants Her To Himself")

**Keep:** Original movie title, subtitle if official, original theatrical release year

**Year:** Use 4-digit years from title/description, prefer parentheses format "Title (1942)", choose earliest if multiple, omit if not found

**Pattern Recognition:** Many titles follow "Promotional Hook | Actual Movie Title | Genre/Quality Info" - extract the actual movie title from the middle section

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
  { "id": "a2", "title": "Dr. Jekyll And Mr. Hyde Colorized", "description": "" },
  { "id": "a3", "title": "Snowfire - Molly McGowan, Melody McGowan", "description": "" },
  {
    "id": "a4",
    "title": "Her Student Wants Her To Himself | The Wrong Teacher | HD Crime Thriller",
    "description": ""
  },
  {
    "id": "b1",
    "title": "A Christmas Karen | Free Full Holiday Movie | FilmRise",
    "description": "...2022 holiday comedy..."
  },
  {
    "id": "b2",
    "title": "Trusting Him Was Her Biggest Mistake | The Wrong Friend | Full 2025 Thriller Movie",
    "description": ""
  },
  { "id": "c1", "title": "The Santa Trap | Free Full Movie", "description": "A family comedy..." },
  { "id": "c2", "title": "Night of the Living Dead - CLIP", "description": "" }
]
```

Output:

```json
[
  { "id": "a1", "title": "Nosferatu", "year": 1922 },
  { "id": "a2", "title": "Dr. Jekyll And Mr. Hyde" },
  { "id": "a3", "title": "Snowfire" },
  { "id": "a4", "title": "The Wrong Teacher" },
  { "id": "b1", "title": "A Christmas Karen", "year": 2022 },
  { "id": "b2", "title": "The Wrong Friend", "year": 2025 },
  { "id": "c1", "title": "The Santa Trap" },
  { "id": "c2", "title": "Night of the Living Dead" }
]
```

## Movies to Process

{movies}

Respond with JSON array only.
