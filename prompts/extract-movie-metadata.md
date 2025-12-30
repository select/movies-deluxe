# Movie Metadata Extraction with AI

Extract clean movie title and release year from raw source data (YouTube titles, Archive.org descriptions).

## Instructions

You are a movie metadata extraction expert. Given a raw title and/or description from a video source, extract:

1. **Clean Movie Title** - The authentic movie title without promotional text
2. **Release Year** - The original theatrical release year (NOT upload year)

### Cleaning Rules

**Remove:**

- Channel names (FilmRise, Popcornflix, Movie Central, etc.)
- Promotional text (Free Full Movie, HD, 720p, 1080p, Watch Now, etc.)
- Genre labels (Crime Thriller, Holiday Movie, Drama, etc.)
- Formatting (pipes |, brackets [], quotes "", etc.)
- Quality indicators ([HD], [4K], etc.)
- Video type labels ((Official), (Lyric Video), etc.)

**Keep:**

- Original movie title exactly as released
- Subtitle or alternative title if part of official title
- Original year from theatrical release

### Year Extraction

- Look for 4-digit years in title or description
- Prefer years in parentheses after title: "Movie Title (1942)"
- If multiple years, choose the earliest (original release, not remake/remaster)
- If no year found, omit the year field entirely

## Examples

### Example 1: YouTube Title with Year

**Input:**

```
Title: "Nosferatu (1922) - Classic Horror Film [HD]"
Description: "Watch the classic silent horror film..."
```

**Output:**

```json
{
  "title": "Nosferatu",
  "year": 1922
}
```

### Example 2: FilmRise Promotional Format

**Input:**

```
Title: "A Christmas Karen | Free Full Holiday Movie | FilmRise Movies"
Description: "A Christmas Karen is a 2022 holiday comedy about..."
```

**Output:**

```json
{
  "title": "A Christmas Karen",
  "year": 2022
}
```

### Example 3: Charlie Chaplin Format

**Input:**

```
Title: "Charlie Chaplin's \"The Pawnshop\" (1916)"
Description: "Charlie Chaplin stars in this 1916 silent comedy..."
```

**Output:**

```json
{
  "title": "The Pawnshop",
  "year": 1916
}
```

### Example 4: Archive.org Format

**Input:**

```
Title: "HeartsOfHumanity"
Description: "Hearts of Humanity is a 1936 American drama film directed by Christy Cabanne..."
```

**Output:**

```json
{
  "title": "Hearts of Humanity",
  "year": 1936
}
```

### Example 5: No Year Available

**Input:**

```
Title: "The Santa Trap | Free Full Movie | FilmRise"
Description: "A family comedy about catching Santa Claus..."
```

**Output:**

```json
{
  "title": "The Santa Trap"
}
```

### Example 6: Multiple Sources Combined

**Input:**

```
Title: "Public Domain Movie - The Great Train Robbery"
Description: "The Great Train Robbery (1903) is a landmark Western film directed by Edwin S. Porter. This 12-minute silent film revolutionized cinema..."
```

**Output:**

```json
{
  "title": "The Great Train Robbery",
  "year": 1903
}
```

### Example 7: Foreign Film with English Title

**Input:**

```
Title: "Metropolis (1927) | Fritz Lang | Silent Sci-Fi Classic [Restored]"
Description: "Metropolis is a 1927 German expressionist science-fiction film..."
```

**Output:**

```json
{
  "title": "Metropolis",
  "year": 1927
}
```

## Response Format

**IMPORTANT:** Respond ONLY with valid JSON. No additional text, explanations, or markdown.

```json
{
  "title": "extracted clean title",
  "year": 1234
}
```

If year cannot be determined, omit the `year` field:

```json
{
  "title": "extracted clean title"
}
```

## Task

Extract movie metadata from the following source:

**Title:** {title}
**Description:** {description}

Respond with JSON only.
