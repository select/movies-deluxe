# Movie Title Extraction

Extract the authentic movie title from promotional text.

## Instructions

1. Remove channel names (FilmRise, Popcornflix, Movie Central, etc.)
2. Remove promotional text (Free Full Movie, HD, 720p, 1080p, etc.)
3. Remove metadata (Crime Thriller, Holiday Movie, Drama, etc.)
4. Remove formatting (pipes |, brackets [], quotes "", etc.)
5. Return ONLY the clean movie title

## Examples

Input: "A Christmas Karen | Free Full Holiday Movie | FilmRise Movies"
Output: A Christmas Karen

Input: "Charlie Chaplin's \" The Pawnshop\""
Output: The Pawnshop

Input: "The Santa Trap | Free Full Movie | FilmRise"
Output: The Santa Trap

Input: "Nosferatu (1922) - Classic Horror Film [HD]"
Output: Nosferatu

## Task

Extract the clean movie title from: {title}
