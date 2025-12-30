# Enhanced Admin Curation: Implementation Plan

**Epic ID:** `movies-deluxe-ovmn`  
**Created:** 2025-12-30  
**Status:** Planning Complete - Ready for Implementation

## Overview

This epic enhances the Admin Curation Panel with advanced source management and Google search integration to improve IMDB matching workflow. The implementation addresses three key pain points:

1. **Individual Source Removal** - Allow curators to remove specific sources without affecting the entire movie entry
2. **Temporary ID Regeneration** - Prevent rejected movies from grouping together by regenerating unique temporary IDs
3. **Google Search Integration** - Add alternative search method using Google to find IMDB matches when OMDB search fails

## Architecture Overview

### Backend Components

```
server/api/admin/
├── google/
│   └── search.get.ts          # New: Google search endpoint
└── movie/
    ├── update.post.ts          # Modified: Enhanced temp ID logic
    └── remove-source.post.ts   # New: Source removal endpoint
```

### Frontend Components

```
app/components/
└── AdminCurationPanel.vue      # Modified: Add source removal + Google search UI
```

### Dependencies

```
package.json
└── google-it                   # New: Google search library
```

## Implementation Tasks

### Phase 1: Research & Backend Foundation

#### Task 1: Research google-it Library

**ID:** `movies-deluxe-mtor`  
**Status:** Ready to start  
**Priority:** P2

**Objectives:**

- Understand google-it API and capabilities
- Identify rate limiting concerns
- Document result structure
- Determine IMDB link extraction strategy

**Key Questions:**

- How to filter results to only IMDB links?
- What's the result format?
- Are there rate limits or IP blocking concerns?
- Can we specify site:imdb.com in queries?

**Deliverables:**

- Research document with findings
- Code examples for IMDB extraction
- Recommendations for implementation

---

#### Task 2: Create Google Search API Endpoint

**ID:** `movies-deluxe-mfke`  
**Status:** Blocked by `movies-deluxe-mtor`  
**Priority:** P2  
**Depends on:** Research task

**Implementation Details:**

**File:** `server/api/admin/google/search.get.ts`

```typescript
import { defineEventHandler, getQuery, createError } from 'h3'
import googleIt from 'google-it'

interface GoogleSearchResult {
  title: string
  link: string
  snippet: string
}

interface IMDBResult {
  Title: string
  Year: string
  imdbID: string
  Type: string
  Poster: string
}

export default defineEventHandler(async event => {
  const query = getQuery(event)
  const searchQuery = query.q as string

  if (!searchQuery) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Query parameter "q" is required',
    })
  }

  try {
    // Search Google with site:imdb.com filter
    const results = await googleIt({
      query: `${searchQuery} site:imdb.com/title`,
      limit: 10,
      disableConsole: true,
    })

    // Extract IMDB IDs and fetch metadata
    const imdbResults: IMDBResult[] = []

    for (const result of results) {
      const imdbMatch = result.link.match(/imdb\.com\/title\/(tt\d+)/)
      if (imdbMatch) {
        const imdbId = imdbMatch[1]
        // Fetch OMDB details for this IMDB ID
        // (reuse existing OMDB details endpoint logic)
        const details = await fetchOMDBDetails(imdbId)
        if (details) {
          imdbResults.push(details)
        }
      }
    }

    return {
      Response: 'True',
      Search: imdbResults,
      totalResults: imdbResults.length.toString(),
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Google search failed: ${error.message}`,
    })
  }
})
```

**Testing:**

- Test with various movie titles
- Test with descriptions containing special characters
- Verify IMDB ID extraction accuracy
- Check rate limiting behavior

---

#### Task 3: Create Source Removal API Endpoint

**ID:** `movies-deluxe-ftxd`  
**Status:** Ready to start  
**Priority:** P2

**Implementation Details:**

**File:** `server/api/admin/movie/remove-source.post.ts`

```typescript
import { defineEventHandler, readBody, createError } from 'h3'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { MovieEntry, MovieSource } from '~/shared/types/movie'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { movieId, sourceIndex } = body

  if (!movieId || sourceIndex === undefined) {
    throw createError({
      statusCode: 400,
      statusMessage: 'movieId and sourceIndex are required',
    })
  }

  try {
    const filePath = join(process.cwd(), 'public/data/movies.json')
    const content = await readFile(filePath, 'utf-8')
    const db = JSON.parse(content)

    const movie = db[movieId] as MovieEntry
    if (!movie) {
      throw createError({
        statusCode: 404,
        statusMessage: `Movie ${movieId} not found`,
      })
    }

    // Remove the source at the specified index
    if (sourceIndex < 0 || sourceIndex >= movie.sources.length) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid sourceIndex',
      })
    }

    movie.sources.splice(sourceIndex, 1)

    // If no sources left, delete the movie
    if (movie.sources.length === 0) {
      delete db[movieId]
      await writeFile(filePath, JSON.stringify(db, null, 2), 'utf-8')
      return { success: true, deleted: true, movieId }
    }

    // If movie had IMDB ID and now only has one source, regenerate temp ID
    if (movieId.startsWith('tt') && movie.sources.length === 1) {
      const source = movie.sources[0]
      let newId: string

      if (source.type === 'youtube') {
        newId = `youtube-${source.id}`
      } else if (source.type === 'archive.org') {
        newId = `archive-${source.id}`
      } else {
        newId = movieId // Keep existing ID if unknown type
      }

      if (newId !== movieId) {
        // Check if new ID already exists
        if (db[newId]) {
          // Merge sources
          db[newId].sources = [...db[newId].sources, ...movie.sources]
          db[newId].lastUpdated = new Date().toISOString()
        } else {
          // Move to new ID
          movie.imdbId = newId
          db[newId] = movie
        }
        delete db[movieId]
        movieId = newId
      }
    }

    movie.lastUpdated = new Date().toISOString()
    db._schema.lastUpdated = new Date().toISOString()

    await writeFile(filePath, JSON.stringify(db, null, 2), 'utf-8')
    return { success: true, movieId }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to remove source: ${error.message}`,
    })
  }
})
```

**Edge Cases:**

- Removing last source → delete movie
- Removing source from multi-source movie → keep movie
- Removing source when movie has IMDB ID → consider temp ID regeneration
- Source index out of bounds → error

---

#### Task 4: Update Temp ID Regeneration Logic

**ID:** `movies-deluxe-m87x`  
**Status:** Ready to start  
**Priority:** P2

**Implementation Details:**

**File:** `server/api/admin/movie/update.post.ts` (modify existing)

**Current Issue:**
When metadata is removed, the code migrates back to a temp ID like `archive-xyz` or `youtube-abc`, but multiple rejected movies might end up with the same temp ID if they share the same source identifier.

**Solution:**
Ensure each source gets a unique temp ID by using the actual source ID from the source object:

```typescript
// In removeMetadata section (around line 32-70)
if (removeMetadata) {
  delete movie.metadata
  movie.verified = false

  // If it was matched to an IMDB ID, migrate it back to a temporary ID
  if (currentId.startsWith('tt') && movie.sources && movie.sources.length > 0) {
    const source = movie.sources[0]
    let tempId = currentId

    if (source.type === 'youtube') {
      // Use the actual YouTube video ID from the source
      tempId = `youtube-${source.id}`
    } else if (source.type === 'archive.org') {
      // Use the actual Archive.org identifier from the source
      tempId = `archive-${source.id}`
    }

    if (tempId !== currentId) {
      const existing = db[tempId]
      if (existing) {
        // Merge sources (avoid duplicates)
        const existingSources = existing.sources || []
        const newSources = movie.sources.filter(
          s => !existingSources.some(es => es.type === s.type && es.id === s.id)
        )
        existing.sources = [...existingSources, ...newSources]
        existing.lastUpdated = new Date().toISOString()
        delete db[currentId]
        currentId = tempId
        movie = existing
      } else {
        movie.imdbId = tempId
        db[tempId] = movie
        delete db[currentId]
        currentId = tempId
      }
    }
  }
}
```

**Testing:**

- Remove metadata from movie with single source → verify unique temp ID
- Remove metadata from movie with multiple sources → verify first source used
- Remove metadata multiple times → verify no duplicate temp IDs
- Check that rejected movies don't group together

---

### Phase 2: Frontend Implementation

#### Task 5: Add Source Removal UI

**ID:** `movies-deluxe-9a40`  
**Status:** Blocked by `movies-deluxe-ftxd`  
**Priority:** P2  
**Depends on:** Source removal API

**Implementation Details:**

**File:** `app/components/AdminCurationPanel.vue` (modify existing)

**Changes to Source Info Section (lines 28-64):**

```vue
<div
  v-for="(source, index) in movie.sources"
  :key="source.id"
  class="bg-white dark:bg-gray-800/50 p-3 rounded border border-yellow-100 dark:border-gray-700 mb-2 relative group"
>
  <!-- Remove button (top-right corner) -->
  <button
    class="absolute top-2 right-2 p-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-200 dark:hover:bg-red-900/50"
    title="Remove this source"
    @click="removeSource(index)"
  >
    <div class="i-mdi-close text-sm" />
  </button>

  <div class="flex items-center gap-2 mb-1">
    <div
      :class="source.type === 'youtube' ? 'i-mdi-youtube text-red-600' : 'i-mdi-bank text-blue-600'"
      class="text-lg"
    />
    <span class="font-medium text-gray-900 dark:text-gray-100">{{ source.type }}</span>
  </div>

  <!-- Rest of source display... -->
</div>
```

**Add method:**

```typescript
const removeSource = async (sourceIndex: number) => {
  if (!confirm('Are you sure you want to remove this source?')) return

  try {
    isSearching.value = true

    const res = await $fetch('/api/admin/movie/remove-source', {
      method: 'POST',
      body: {
        movieId: props.movie.imdbId,
        sourceIndex,
      },
    })

    if (res.success) {
      if (res.deleted) {
        // Movie was deleted, navigate away
        navigateTo('/admin')
      } else {
        // Movie still exists, refresh data
        emit('updated', res.movieId)
      }
    }
  } catch (err) {
    console.error('Failed to remove source:', err)
    alert('Failed to remove source')
  } finally {
    isSearching.value = false
  }
}
```

**UI/UX Considerations:**

- Show remove button only on hover
- Confirm before removing
- Show loading state during removal
- Handle movie deletion gracefully
- Update movie data after successful removal

---

#### Task 6: Add Google Search UI

**ID:** `movies-deluxe-dgug`  
**Status:** Blocked by `movies-deluxe-mfke`  
**Priority:** P2  
**Depends on:** Google search API

**Implementation Details:**

**File:** `app/components/AdminCurationPanel.vue` (modify existing)

**Add new section after OMDB search (after line 128):**

```vue
<!-- Google Search Section -->
<div class="pt-6 border-t border-yellow-200 dark:border-gray-700">
  <h3 class="text-sm font-semibold uppercase tracking-wider text-yellow-700 dark:text-gray-300 mb-3">
    Search Google for IMDB
  </h3>

  <div class="space-y-3">
    <div
      v-for="(source, index) in movie.sources"
      :key="`google-${source.id}`"
      class="bg-white dark:bg-gray-800/50 p-3 rounded border border-gray-200 dark:border-gray-700"
    >
      <div class="flex items-center gap-2 mb-2">
        <div
          :class="source.type === 'youtube' ? 'i-mdi-youtube text-red-600' : 'i-mdi-bank text-blue-600'"
          class="text-sm"
        />
        <span class="text-xs font-medium text-gray-700 dark:text-gray-300">
          Source {{ index + 1 }}
        </span>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-medium transition-colors disabled:opacity-50"
          :disabled="isGoogleSearching"
          @click="searchGoogle(source.title, 'title', index)"
        >
          <div v-if="isGoogleSearching" class="i-mdi-loading animate-spin inline-block mr-1" />
          Search Title
        </button>

        <button
          v-if="source.description"
          class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-medium transition-colors disabled:opacity-50"
          :disabled="isGoogleSearching"
          @click="searchGoogle(source.description, 'description', index)"
        >
          <div v-if="isGoogleSearching" class="i-mdi-loading animate-spin inline-block mr-1" />
          Search Description
        </button>

        <button
          v-if="source.description"
          class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-medium transition-colors disabled:opacity-50"
          :disabled="isGoogleSearching"
          @click="searchGoogle(`${source.title} ${source.description}`, 'both', index)"
        >
          <div v-if="isGoogleSearching" class="i-mdi-loading animate-spin inline-block mr-1" />
          Search Both
        </button>
      </div>
    </div>
  </div>

  <div
    v-if="googleSearchError"
    class="text-red-500 text-sm mt-2"
  >
    {{ googleSearchError }}
  </div>
</div>
```

**Add state and methods:**

```typescript
const isGoogleSearching = ref(false)
const googleSearchResults = ref<OMDBSearchResult[]>([])
const googleSearchError = ref('')

const searchGoogle = async (query: string, type: string, sourceIndex: number) => {
  isGoogleSearching.value = true
  googleSearchError.value = ''
  googleSearchResults.value = []

  try {
    const data = await $fetch('/api/admin/google/search', {
      query: { q: query },
    })

    if (data.Response === 'True') {
      googleSearchResults.value = data.Search || []
    } else {
      googleSearchError.value = data.Error || 'No results found'
    }
  } catch (err) {
    googleSearchError.value = 'Failed to search Google'
    console.error('Google search error:', err)
  } finally {
    isGoogleSearching.value = false
  }
}
```

---

#### Task 7: Display Google Search Results

**ID:** `movies-deluxe-74xz`  
**Status:** Blocked by `movies-deluxe-mfke`  
**Priority:** P2  
**Depends on:** Google search API

**Blocks:** `movies-deluxe-gguk` (Verification display)

**Implementation Details:**

**File:** `app/components/AdminCurationPanel.vue` (modify existing)

**Modify the right column (around line 214) to show both OMDB and Google results:**

```vue
<!-- Right: Search Results -->
<div>
  <div class="flex items-center gap-2 mb-2">
    <h3 class="text-sm font-semibold uppercase tracking-wider text-yellow-700 dark:text-gray-300">
      Search Results
    </h3>
    <div class="flex gap-1 ml-auto">
      <button
        class="px-2 py-1 text-xs rounded"
        :class="resultView === 'omdb' ? 'bg-yellow-600 text-white' : 'bg-gray-200 dark:bg-gray-700'"
        @click="resultView = 'omdb'"
      >
        OMDB
      </button>
      <button
        class="px-2 py-1 text-xs rounded"
        :class="resultView === 'google' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'"
        @click="resultView = 'google'"
      >
        Google
      </button>
    </div>
  </div>

  <!-- OMDB Results -->
  <div v-if="resultView === 'omdb'" class="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
    <!-- Existing OMDB results display -->
  </div>

  <!-- Google Results -->
  <div v-else-if="resultView === 'google'" class="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
    <div
      v-if="googleSearchResults.length > 0"
      class="space-y-2"
    >
      <div
        v-for="result in googleSearchResults"
        :key="result.imdbID"
        class="flex gap-3 p-2 bg-white dark:bg-gray-800/50 rounded border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-gray-500 transition-colors group"
      >
        <img
          :src="result.Poster !== 'N/A' ? result.Poster : '/favicon.ico'"
          class="w-12 h-18 object-cover rounded"
          alt="Poster"
        >
        <div class="flex-1 min-w-0">
          <h4 class="font-bold text-sm truncate text-gray-900 dark:text-gray-100">
            {{ result.Title }}
          </h4>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {{ result.Year }} • {{ result.Type }}
          </p>
          <p class="text-[10px] font-mono text-gray-400">
            {{ result.imdbID }}
          </p>
          <p class="text-[10px] text-blue-600 dark:text-blue-400">
            via Google
          </p>
        </div>
        <button
          class="self-center px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-bold opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
          :disabled="isSearching"
          @click="selectMovie(result.imdbID)"
        >
          Select
        </button>
      </div>
    </div>
    <div
      v-else-if="!isGoogleSearching"
      class="h-[200px] flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg"
    >
      <div class="i-mdi-google text-4xl mb-2" />
      <p class="text-sm">
        Google search results will appear here
      </p>
    </div>
  </div>
</div>
```

**Add state:**

```typescript
const resultView = ref<'omdb' | 'google'>('omdb')
```

**Reuse existing `selectMovie` method** - it already handles IMDB ID selection and OMDB details fetching.

---

#### Task 8: Display Verification Status and Auto-Verify on Selection

**ID:** `movies-deluxe-gguk`  
**Status:** Blocked by `movies-deluxe-74xz`  
**Priority:** P2  
**Depends on:** Google search results display

**Implementation Details:**

**File:** `app/components/AdminCurationPanel.vue` (modify existing)

**Part 1: Add Verification Badge to Source Info Section**

Currently, the verification badge only appears in the header (lines 11-17). Add a more prominent display in the curation panel itself:

```vue
<!-- Add after the "Admin Curation" title (around line 10) -->
<div class="flex items-center gap-2 mb-4 text-yellow-800 dark:text-gray-100">
  <div class="i-mdi-shield-edit text-2xl" />
  <h2 class="text-xl font-bold">
    Admin Curation
  </h2>
  <div
    v-if="movie.verified"
    class="flex items-center gap-1 text-xs font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded"
  >
    <div class="i-mdi-check-decagram" />
    Verified
  </div>
  <div
    v-else
    class="flex items-center gap-1 text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded"
  >
    <div class="i-mdi-help-circle-outline" />
    Unverified
  </div>
  <span class="ml-auto text-xs font-mono bg-yellow-200 dark:bg-gray-700 px-2 py-1 rounded">
    localhost only
  </span>
</div>
```

**Part 2: Add Verification Info Box**

Add an informational section explaining verification status:

```vue
<!-- Add after Source Info section, before OMDB search -->
<div class="mb-4 p-3 rounded border" :class="{
  'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800': movie.verified,
  'bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700': !movie.verified
}">
  <div class="flex items-start gap-2">
    <div
      class="text-lg mt-0.5"
      :class="{
        'i-mdi-check-circle text-green-600 dark:text-green-400': movie.verified,
        'i-mdi-alert-circle-outline text-gray-500 dark:text-gray-400': !movie.verified
      }"
    />
    <div class="flex-1">
      <p class="text-sm font-medium" :class="{
        'text-green-800 dark:text-green-300': movie.verified,
        'text-gray-700 dark:text-gray-300': !movie.verified
      }">
        {{ movie.verified ? 'This movie has been verified' : 'This movie needs verification' }}
      </p>
      <p class="text-xs mt-1" :class="{
        'text-green-700 dark:text-green-400': movie.verified,
        'text-gray-600 dark:text-gray-400': !movie.verified
      }">
        {{ movie.verified
          ? 'The metadata has been manually confirmed as accurate.'
          : 'Select a match from OMDB or Google search to verify this movie.'
        }}
      </p>
    </div>
  </div>
</div>
```

**Part 3: Auto-Verify on Human Interaction**

Modify the `selectMovie` method (around line 399) to automatically set `verified: true`:

```typescript
const selectMovie = async (imdbId: string) => {
  try {
    isSearching.value = true
    // Get full details first
    const details = await $fetch<MovieMetadata & { Response: string; Error?: string }>(
      '/api/admin/omdb/details',
      {
        query: { i: imdbId },
      }
    )

    if (details.Response === 'True') {
      const res = await $fetch<UpdateResponse>('/api/admin/movie/update', {
        method: 'POST',
        body: {
          movieId: props.movie.imdbId,
          metadata: details,
          verified: true, // ✅ Auto-verify when user manually selects a match
        },
      })

      if (res.success) {
        emit('updated', res.movieId)
      }
    } else {
      console.error('Failed to get movie details:', details.Error)
    }
  } catch (err) {
    console.error('Failed to update movie:', err)
  } finally {
    isSearching.value = false
  }
}
```

**Part 4: Auto-Verify on Manual IMDB ID Paste**

Also update the IMDB ID input field to auto-verify when user manually pastes/enters an IMDB ID. Modify the metadata update watcher or add a blur handler:

```typescript
// Watch for IMDB ID changes and auto-verify
const handleImdbIdChange = async () => {
  if (editedMetadata.value.imdbID && editedMetadata.value.imdbID.startsWith('tt')) {
    // User manually entered/pasted an IMDB ID - this is human verification
    const res = await $fetch<UpdateResponse>('/api/admin/movie/update', {
      method: 'POST',
      body: {
        movieId: props.movie.imdbId,
        metadata: editedMetadata.value,
        verified: true, // ✅ Auto-verify when user manually enters IMDB ID
      },
    })

    if (res.success) {
      emit('updated', res.movieId)
    }
  }
}
```

Or add to the existing save metadata function to include `verified: true` when IMDB ID is present.

**Part 5: Update "Mark as Verified" Button Logic**

The existing "Mark as Verified" button (line 131-139) should be hidden when the movie is already verified:

```vue
<button
  v-if="!movie.verified"
  class="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded transition-colors text-sm font-bold disabled:opacity-50"
  :disabled="isSearching"
  @click="verifyMovie"
>
  <div class="i-mdi-check-decagram text-lg" />
  Mark as Verified
</button>
```

**Rationale:**

When a curator performs ANY of these actions, they are implicitly verifying the movie:

1. **Selects from OMDB search** - Curator confirms the match is correct
2. **Selects from Google search** - Curator confirms the match is correct
3. **Manually pastes IMDB ID** - Curator has independently verified the correct IMDB ID

All three actions indicate human verification and should auto-mark the movie as verified, eliminating redundant manual steps and streamlining the curation workflow.

**UI/UX Benefits:**

- Clear visual indication of verification status
- Automatic verification reduces manual steps
- Consistent with user intent (selection = verification)
- Informational text guides curators

---

### Phase 3: Testing & Validation

#### Task 9: Test Source Removal

**ID:** `movies-deluxe-samg`  
**Status:** Blocked by UI + backend tasks  
**Priority:** P2  
**Depends on:** `movies-deluxe-9a40`, `movies-deluxe-m87x`

**Test Cases:**

1. **Remove single source from multi-source movie**
   - Expected: Movie remains, source removed, movie data updated

2. **Remove all sources from movie**
   - Expected: Movie deleted, redirect to admin page

3. **Remove metadata from matched movie**
   - Expected: Movie migrates to temp ID (archive-X or youtube-X)

4. **Remove metadata from multiple movies with same source**
   - Expected: Each gets unique temp ID, no grouping

5. **Remove source then remove metadata**
   - Expected: Temp ID based on remaining sources

**Documentation:**

- Create test report with screenshots
- Document any edge cases found
- Note any UI/UX improvements needed

---

#### Task 10: Test Google Search Integration

**ID:** `movies-deluxe-iapl`  
**Status:** Blocked by UI tasks  
**Priority:** P2  
**Depends on:** `movies-deluxe-dgug`, `movies-deluxe-74xz`, `movies-deluxe-gguk`

**Test Cases:**

1. **Search using title**
   - Test with clear movie titles
   - Test with ambiguous titles
   - Verify only IMDB results shown

2. **Search using description**
   - Test with detailed descriptions
   - Test with short descriptions
   - Check relevance of results

3. **Search using both title + description**
   - Verify combined query works
   - Check if results are better than title-only

4. **Select result and update movie**
   - Verify OMDB details fetched correctly
   - Verify movie updated with correct metadata
   - Check poster download triggered

5. **Verify auto-verification**
   - Select movie from OMDB search → verify it's marked as verified
   - Select movie from Google search → verify it's marked as verified
   - Check that verification badge appears immediately
   - Verify "Mark as Verified" button disappears after selection

6. **Edge cases**
   - No IMDB results found
   - Multiple exact matches
   - Rate limiting behavior

**Documentation:**

- Compare Google vs OMDB search quality
- Document success rate for difficult matches
- Note any rate limiting issues
- Suggest improvements

---

## Dependency Graph

```
Epic: movies-deluxe-ovmn
├── Research: movies-deluxe-mtor (ready)
│   └── blocks: movies-deluxe-mfke
│
├── Backend: movies-deluxe-ftxd (ready)
│   └── blocks: movies-deluxe-9a40
│
├── Backend: movies-deluxe-m87x (ready)
│   └── blocks: movies-deluxe-samg
│
├── Backend: movies-deluxe-mfke (blocked by mtor)
│   ├── blocks: movies-deluxe-dgug
│   └── blocks: movies-deluxe-74xz
│
├── Frontend: movies-deluxe-9a40 (blocked by ftxd)
│   └── blocks: movies-deluxe-samg
│
├── Frontend: movies-deluxe-dgug (blocked by mfke)
│   └── blocks: movies-deluxe-iapl
│
├── Frontend: movies-deluxe-74xz (blocked by mfke)
│   ├── blocks: movies-deluxe-gguk
│   └── blocks: movies-deluxe-iapl
│
├── Frontend: movies-deluxe-gguk (blocked by 74xz)
│   └── blocks: movies-deluxe-iapl
│
├── Testing: movies-deluxe-samg (blocked by 9a40, m87x)
│
└── Testing: movies-deluxe-iapl (blocked by dgug, 74xz)
```

## Implementation Order

### Parallel Track 1: Source Removal

1. `movies-deluxe-ftxd` - Backend API
2. `movies-deluxe-m87x` - Temp ID logic
3. `movies-deluxe-9a40` - Frontend UI
4. `movies-deluxe-samg` - Testing

### Parallel Track 2: Google Search

1. `movies-deluxe-mtor` - Research
2. `movies-deluxe-mfke` - Backend API
3. `movies-deluxe-dgug` + `movies-deluxe-74xz` - Frontend (parallel)
4. `movies-deluxe-gguk` - Verification display
5. `movies-deluxe-iapl` - Testing

**Estimated Timeline:**

- Track 1: 2-3 days
- Track 2: 3-4 days
- Total: 5-7 days (with parallel work)

## Technical Considerations

### google-it Library

- **Pros:** Simple API, no API key required
- **Cons:** Web scraping (may break), rate limiting concerns
- **Alternative:** Consider Google Custom Search API for production

### Rate Limiting

- Implement request throttling
- Add retry logic with exponential backoff
- Consider caching results

### Error Handling

- Handle network failures gracefully
- Show user-friendly error messages
- Log errors for debugging

### Performance

- Google search may be slower than OMDB
- Consider adding loading indicators
- Implement request cancellation

## Success Criteria

1. ✅ Curators can remove individual sources from movies
2. ✅ Rejected movies get unique temporary IDs
3. ✅ Google search finds IMDB matches for difficult titles
4. ✅ UI is intuitive and matches existing OMDB search
5. ✅ Verification status is clearly displayed
6. ✅ Movies are auto-verified when selected from search
7. ✅ All edge cases handled gracefully
8. ✅ No regressions in existing functionality

## Future Enhancements

- Add bulk source removal
- Implement Google search result caching
- Add confidence scoring for Google results
- Support other search engines (Bing, DuckDuckGo)
- Add search history/suggestions
- Implement automatic fallback (OMDB → Google)

## Notes

- All tasks are P2 priority (medium)
- Epic is ready for implementation
- No blockers for starting Track 1
- Track 2 requires research completion first
- Testing tasks ensure quality before deployment
