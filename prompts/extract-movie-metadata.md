# Movie Metadata Extraction

Extract clean movie title and release year from raw source data.

## Task

Extract: (1) Clean movie title without promotional text, (2) Original theatrical release year (NOT upload year)

**Remove:** Channel names (FilmRise, Popcornflix), promotional text (Free Full Movie, HD, 720p, 1080p), genre labels, formatting (|, [], ""), quality indicators, video type labels
**Keep:** Original movie title, subtitle if official, original theatrical release year
**Year:** Use 4-digit years from title/description, prefer parentheses format "Title (1942)", choose earliest if multiple, omit if not found

## Examples

`"Nosferatu (1922) - Classic Horror [HD]"` → `{"title": "Nosferatu", "year": 1922}`
`"A Christmas Karen | Free Full Holiday Movie | FilmRise"` + desc: "...2022 holiday comedy..." → `{"title": "A Christmas Karen", "year": 2022}`
`"Charlie Chaplin's \"The Pawnshop\" [1916]"` → `{"title": "The Pawnshop", "year": 1916}`
`"HeartsOfHumanity"` + desc: "Hearts of Humanity is a 1936 American drama..." → `{"title": "Hearts of Humanity", "year": 1936}`
`"The Santa Trap | Free Full Movie"` + desc: "A family comedy..." → `{"title": "The Santa Trap"}`
`"Public Domain Movie - The Great Train Robbery"` + desc: "...1903 is a landmark Western..." → `{"title": "The Great Train Robbery", "year": 1903}`
`"Metropolis (1927) | Fritz Lang | Silent Sci-Fi [Restored]"` → `{"title": "Metropolis", "year": 1927}`

## Response Format

**IMPORTANT:** Respond ONLY with valid JSON. No text, explanations, or markdown.
`{"title": "extracted title", "year": 1234}` or `{"title": "extracted title"}` if no year found.

**Title:** {title}
**Description:** {description}

Respond with JSON only.
