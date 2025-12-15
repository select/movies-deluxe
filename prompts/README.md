# Prompts Directory

This directory contains AI prompts used by the movies-deluxe system.

## Available Prompts

### extract-movie-title.md

Extracts clean movie titles from promotional YouTube/Archive.org titles.

**Usage**: Replace `{title}` placeholder with the promotional title.

**Input**: `"A Christmas Karen | Free Full Holiday Movie | FilmRise Movies"`
**Output**: `"A Christmas Karen"`

**Used by**: `scripts/extract-titles-ai.ts`
