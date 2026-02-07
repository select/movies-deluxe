# Movie Metadata Extraction

Extract clean movie title and release year from raw source data.

## Task

Extract: (1) Clean movie title without promotional text, (2) Original theatrical release year (NOT upload year)

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

## Examples

**Basic cleaning:**
`"Nosferatu (1922) - Classic Horror [HD]"` → `{"title": "Nosferatu", "year": 1922}`
`"Charlie Chaplin's \"The Pawnshop\" [1916]"` → `{"title": "The Pawnshop", "year": 1916}`
`"HeartsOfHumanity"` + desc: "Hearts of Humanity is a 1936 American drama..." → `{"title": "Hearts of Humanity", "year": 1936}`

**Version suffixes:**
`"Dr. Jekyll And Mr. Hyde Colorized"` → `{"title": "Dr. Jekyll And Mr. Hyde"}`
`"Metropolis (1927) | Fritz Lang | Silent Sci-Fi [Restored]"` → `{"title": "Metropolis", "year": 1927}`
`"Night of the Living Dead - CLIP"` → `{"title": "Night of the Living Dead"}`
`"Casablanca - A Golden Classic"` → `{"title": "Casablanca"}`

**Actor names after dash:**
`"Snowfire - Molly McGowan, Melody McGowan"` → `{"title": "Snowfire"}`
`"Public Domain Movie - The Great Train Robbery"` + desc: "...1903 is a landmark Western..." → `{"title": "The Great Train Robbery", "year": 1903}`

**Promotional hook pattern:**
`"Her Student Wants Her To Himself | The Wrong Teacher | HD Crime Thriller"` → `{"title": "The Wrong Teacher"}`
`"Trusting Him Was Her Biggest Mistake | The Wrong Friend | Full 2025 Thriller Movie"` → `{"title": "The Wrong Friend", "year": 2025}`
`"A Christmas Karen | Free Full Holiday Movie | FilmRise"` + desc: "...2022 holiday comedy..." → `{"title": "A Christmas Karen", "year": 2022}`
`"The Santa Trap | Free Full Movie"` + desc: "A family comedy..." → `{"title": "The Santa Trap"}`

## Response Format

**IMPORTANT:** Respond ONLY with valid JSON. No text, explanations, or markdown.
`{"title": "extracted title", "year": 1234}` or `{"title": "extracted title"}` if no year found.

**Title:** {title}
**Description:** {description}

Respond with JSON only.
