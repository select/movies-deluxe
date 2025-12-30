# AI-Powered Movie Metadata Extraction: Implementation Plan

**Epic ID:** movies-deluxe-myr7  
**Created:** 2025-12-30  
**Updated:** 2025-12-30 (Admin Dashboard Module)  
**Status:** Planning Complete - Ready for Implementation

## Overview

This epic adds AI-powered movie title and year extraction using Ollama as a **module in the Admin Dashboard**. The AI will parse raw source titles and descriptions to extract clean movie titles and release years for unmatched movies, with progress tracking showing how many unmatched movies have AI data.

### Key Features

1. **Admin Dashboard Module** - Batch AI extraction module similar to OMDB Enrichment
2. **Progress Tracking** - Real-time progress display showing unmatched movies with AI data
3. **Stats Card** - Display AI extraction stats in dashboard overview
4. **Individual Extraction** - Single-movie AI extraction in AdminCurationPanel
5. **Persistent Storage** - Store AI results in `movies.json` under `ai: { title, year }` key
6. **Smart Redirect Removal** - Remove redirect flag when AI extraction succeeds or metadata is removed

## Architecture Overview

### Backend Components

```
server/api/admin/
├── ai/
│   ├── extract-metadata.post.ts   # New: Single movie extraction endpoint
│   └── extract-batch.post.ts      # New: Batch extraction with progress
├── movie/
│   └── update.post.ts              # Modified: Handle ai field updates
└── stats.get.ts                    # Modified: Add AI stats

server/utils/
└── ollama.ts                       # New: Ollama client utilities

prompts/
└── extract-movie-metadata.md       # New: AI prompt template (CREATED)
```

### Frontend Components

```
app/components/
├── AdminAIExtractor.vue            # New: Batch AI extraction module
├── AdminCurationPanel.vue          # Modified: Individual AI extraction
└── AdminStatsCard.vue              # Used: Display AI stats

app/pages/admin/
└── index.vue                       # Modified: Integrate AI module

app/stores/
└── useAdminStore.ts                # Modified: Add AI extraction actions
```

### Data Model Changes

```typescript
// shared/types/movie.ts
export interface MovieEntry {
  imdbId: string
  title: string
  year?: number
  sources: MovieSource[]
  metadata?: MovieMetadata
  verified?: boolean
  ai?: {
    // NEW: AI-extracted metadata
    title?: string
    year?: number
  }
  redirect?: boolean // Modified: Remove when AI succeeds
  lastUpdated: string
}
```

## Implementation Tasks

### Phase 1: Backend Foundation

#### Task 1: Create Ollama Utility Module

**ID:** `movies-deluxe-qea5`  
**Status:** Ready to start  
**Priority:** P2

[... existing content ...]

---

#### Task 2: Create Single Movie AI Extraction API Endpoint

**ID:** `movies-deluxe-kigd`  
**Status:** Blocked by `movies-deluxe-qea5`  
**Priority:** P2

[... existing content ...]

---

#### Task 3: Create Batch AI Extraction API Endpoint

**ID:** `movies-deluxe-6di0`  
**Status:** Blocked by `movies-deluxe-qea5`  
**Priority:** P2

**Implementation Details:**

**File:** `server/api/admin/ai/extract-batch.post.ts`

```typescript
import { defineEventHandler, readBody, createError } from 'h3'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { extractMovieMetadata } from '../../../utils/ollama'
import { emitProgress } from '../../../utils/progress'
import type { MovieEntry } from '~/shared/types/movie'

interface BatchOptions {
  limit?: number
  onlyUnmatched?: boolean
  forceReExtract?: boolean
}

export default defineEventHandler(async event => {
  const body = await readBody<BatchOptions>(event)
  const { limit = 100, onlyUnmatched = true, forceReExtract = false } = body

  try {
    const filePath = join(process.cwd(), 'public/data/movies.json')
    const content = await readFile(filePath, 'utf-8')
    const db = JSON.parse(content)

    // Get unmatched movies (no metadata)
    const movies = Object.entries(db)
      .filter(([id, movie]: [string, any]) => {
        if (id.startsWith('_')) return false
        if (onlyUnmatched && movie.metadata) return false
        if (!forceReExtract && movie.ai?.title) return false
        return true
      })
      .slice(0, limit)

    const total = movies.length
    let current = 0
    let successCount = 0
    let failedCount = 0

    emitProgress(event, 'ai', {
      status: 'starting',
      message: 'Starting AI extraction...',
      current: 0,
      total,
      successCurrent: 0,
      failedCurrent: 0,
    })

    for (const [id, movie] of movies) {
      current++

      try {
        // Get first source for extraction
        const source = (movie as MovieEntry).sources[0]
        if (!source) {
          failedCount++
          continue
        }

        const title = source.title || (movie as MovieEntry).title
        const description = source.description || ''

        emitProgress(event, 'ai', {
          status: 'in_progress',
          message: `Extracting: ${title.substring(0, 50)}...`,
          current,
          total,
          successCurrent: successCount,
          failedCurrent: failedCount,
        })

        const extracted = await extractMovieMetadata(title, description)

        if (extracted?.title) {
          ;(movie as MovieEntry).ai = extracted
          delete (movie as MovieEntry).redirect
          successCount++
        } else {
          failedCount++
        }
      } catch (error) {
        console.error(`AI extraction failed for ${id}:`, error)
        failedCount++
      }

      // Save periodically (every 10 movies)
      if (current % 10 === 0) {
        await writeFile(filePath, JSON.stringify(db, null, 2), 'utf-8')
      }
    }

    // Final save
    db._schema.lastUpdated = new Date().toISOString()
    await writeFile(filePath, JSON.stringify(db, null, 2), 'utf-8')

    emitProgress(event, 'ai', {
      status: 'completed',
      message: `Completed: ${successCount} successful, ${failedCount} failed`,
      current: total,
      total,
      successCurrent: successCount,
      failedCurrent: failedCount,
    })

    return {
      success: true,
      processed: total,
      successful: successCount,
      failed: failedCount,
    }
  } catch (error) {
    emitProgress(event, 'ai', {
      status: 'error',
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      current: 0,
      total: 0,
    })

    throw createError({
      statusCode: 500,
      statusMessage: `Batch AI extraction failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
```

**Features:**

- Process unmatched movies in batches
- Real-time progress via EventSource
- Success/failed tracking
- Periodic saves (every 10 movies)
- Remove redirect flag on success

---

#### Task 4: Add AI Stats to Stats Endpoint

**ID:** `movies-deluxe-qkhy`  
**Status:** Ready to start  
**Priority:** P2

**Implementation Details:**

**File:** `server/api/admin/stats.get.ts` (modify existing)

**Add to stats calculation:**

```typescript
// Count AI extraction stats (unmatched movies with AI data)
const unmatchedMovies = Object.values(db).filter(
  (movie: any) => !movie.metadata && !movie.imdbId?.startsWith('_')
)
const unmatchedWithAI = unmatchedMovies.filter((movie: any) => movie.ai?.title)

const aiStats = {
  withAiData: unmatchedWithAI.length,
  withoutAiData: unmatchedMovies.length - unmatchedWithAI.length,
  total: unmatchedMovies.length,
  percent: unmatchedMovies.length > 0 ? (unmatchedWithAI.length / unmatchedMovies.length) * 100 : 0,
}

// Add to return object
return {
  // ... existing stats
  ai: aiStats,
}
```

---

#### Task 5: Update Movie Endpoint to Handle AI Field

**ID:** `movies-deluxe-9fto`  
**Status:** Ready to start  
**Priority:** P2

[... existing content ...]

---

### Phase 2: Frontend Implementation

#### Task 6: Add AI Field to MovieEntry Interface

**ID:** `movies-deluxe-5ue9`  
**Status:** Ready to start  
**Priority:** P2

[... existing content ...]

---

#### Task 7: Create AdminAIExtractor Component

**ID:** `movies-deluxe-sosi`  
**Status:** Blocked by `movies-deluxe-6di0`  
**Priority:** P2

**Implementation Details:**

**File:** `app/components/AdminAIExtractor.vue`

```vue
<template>
  <div class="p-8 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
    <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
      <div class="i-mdi-robot text-purple-600" />
      AI Metadata Extraction
    </h2>

    <div class="space-y-6">
      <AppInputNumber
        v-model="options.limit"
        label="Extraction limit"
      />

      <div class="flex flex-col gap-3">
        <AppInputSwitch
          :checked="options.onlyUnmatched"
          label="Only unmatched movies"
          @change="options.onlyUnmatched = $event"
        />
        <AppInputSwitch
          :checked="options.forceReExtract"
          label="Force re-extract existing AI data"
          @change="options.forceReExtract = $event"
        />
      </div>

      <button
        class="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-2xl shadow-lg shadow-purple-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        :disabled="loading"
        @click="$emit('start')"
      >
        <div
          v-if="loading"
          class="i-mdi-loading animate-spin"
        />
        <div
          v-else
          class="i-mdi-robot"
        />
        {{ loading ? 'Extracting...' : 'Extract with AI' }}
      </button>

      <!-- Progress -->
      <div
        v-if="progress.ai && (progress.ai.status === 'in_progress' || progress.ai.status === 'starting')"
        class="mt-4 space-y-3"
      >
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-500 truncate mr-2">{{ progress.ai.message }}</span>
          <span class="font-mono text-nowrap">{{ progress.ai.current }} / {{ progress.ai.total || '?' }}</span>
        </div>

        <!-- Dual Progress Bar -->
        <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
          <div
            v-if="progress.ai.total"
            class="h-full bg-purple-500 transition-all duration-300"
            :style="{ width: `${((progress.ai.successCurrent || 0) / progress.ai.total) * 100}%` }"
            title="Success"
          />
          <div
            v-if="progress.ai.total"
            class="h-full bg-orange-500 transition-all duration-300"
            :style="{ width: `${((progress.ai.failedCurrent || 0) / progress.ai.total) * 100}%` }"
            title="Failed"
          />
        </div>

        <!-- Stats Breakdown -->
        <div class="grid grid-cols-2 gap-2 text-[10px] font-medium">
          <div class="flex items-center gap-1 text-purple-600 dark:text-purple-400">
            <div class="i-mdi-check-circle" />
            Success: {{ progress.ai.successCurrent || 0 }}
          </div>
          <div class="flex items-center gap-1 text-orange-600 dark:text-orange-400">
            <div class="i-mdi-alert-circle" />
            Failed: {{ progress.ai.failedCurrent || 0 }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface AIOptions {
  limit: number
  onlyUnmatched: boolean
  forceReExtract: boolean
}

const options = defineModel<AIOptions>({ required: true })

defineProps<{
  loading: boolean
}>()

defineEmits<{
  start: []
}>()

const { progress } = storeToRefs(useAdminStore())
</script>
```

---

#### Task 8: Add AI Stats Card to Admin Dashboard

**ID:** `movies-deluxe-8gig`  
**Status:** Blocked by `movies-deluxe-qkhy`  
**Priority:** P2

**Implementation Details:**

**File:** `app/pages/admin/index.vue` (modify existing)

**Add after OMDB stats card (around line 152):**

```vue
<AdminStatsCard
  title="AI Extracted"
  :value="stats.ai.withAiData"
  icon="i-mdi-robot"
  icon-color="text-purple-500"
  show-progress
  :percent="stats.ai.percent"
  progress-color="bg-purple-500"
  :subtitle="`${stats.ai.withAiData} / ${stats.ai.total} unmatched`"
/>
```

---

#### Task 9: Add AI Extraction to Admin Store

**ID:** `movies-deluxe-3ikb`  
**Status:** Blocked by `movies-deluxe-6di0`  
**Priority:** P2

**Implementation Details:**

**File:** `app/stores/useAdminStore.ts` (modify existing)

**Add state:**

```typescript
const aiOptions = ref({
  limit: 100,
  onlyUnmatched: true,
  forceReExtract: false,
})
```

**Add action:**

```typescript
const startAIExtraction = async () => {
  try {
    scraping.value = true
    const response = await $fetch('/api/admin/ai/extract-batch', {
      method: 'POST',
      body: aiOptions.value,
    })

    if (response.success) {
      await refreshStats()
    }
  } catch (error) {
    console.error('AI extraction failed:', error)
  } finally {
    scraping.value = false
  }
}
```

**Export:**

```typescript
return {
  // ... existing exports
  aiOptions,
  startAIExtraction,
}
```

---

#### Task 10: Integrate AdminAIExtractor into Admin Dashboard

**ID:** `movies-deluxe-nlbd`  
**Status:** Blocked by `movies-deluxe-sosi`, `movies-deluxe-3ikb`, `movies-deluxe-8gig`  
**Priority:** P2

**Implementation Details:**

**File:** `app/pages/admin/index.vue` (modify existing)

**Add to Data Enrichment section (around line 210):**

```vue
<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
  <AdminOMDBEnrichment
    v-model="omdbOptions"
    :loading="scraping"
    @start="adminStore.startOMDBEnrichment"
  />

  <AdminAIExtractor
    v-model="aiOptions"
    :loading="scraping"
    @start="adminStore.startAIExtraction"
  />

  <AdminPosterDownloader
    v-model="posterOptions"
    :loading="scraping"
    @start="adminStore.startPosterDownload"
  />
</div>
```

**Add to imports:**

```typescript
const { aiOptions } = storeToRefs(adminStore)
```

---

#### Task 11: Add Individual AI Extraction to AdminCurationPanel

**ID:** `movies-deluxe-rpvy`  
**Status:** Blocked by `movies-deluxe-kigd`, `movies-deluxe-9fto`, `movies-deluxe-5ue9`  
**Priority:** P2

[... existing content for individual extraction ...]

---

### Phase 3: Testing & Validation

#### Task 12: Test AI Extraction with Various Sources

**ID:** `movies-deluxe-edtq`  
**Status:** Blocked by `movies-deluxe-rpvy`  
**Priority:** P2

**Test Cases:**

**Batch Extraction:**

1. Run batch extraction on 10 unmatched movies
2. Verify progress tracking works correctly
3. Verify success/failed counts are accurate
4. Verify AI data saved to movies.json
5. Verify redirect flag removed
6. Verify stats card updates after extraction

**Individual Extraction:**
[... existing test cases ...]

**Progress Display:** 7. Verify stats card shows correct percentage 8. Verify "X / Y unmatched movies" subtitle 9. Verify progress bar updates in real-time 10. Verify EventSource connection works

---

**Implementation:**

```typescript
import { defineEventHandler, readBody, createError } from 'h3'
import { extractMovieMetadata } from '../../../utils/ollama'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { title, description } = body

  if (!title) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Title is required',
    })
  }

  try {
    const extracted = await extractMovieMetadata(title, description)

    if (!extracted) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to extract metadata from Ollama',
      })
    }

    return {
      success: true,
      data: extracted,
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `AI extraction failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
```

---

#### Task 3: Update Movie Update Endpoint to Handle AI Field

**File:** `server/api/admin/movie/update.post.ts` (modify existing)

**Changes:**

```typescript
// Add to readBody destructuring (line 8)
const { movieId, newImdbId, metadata, removeMetadata, verified, ai } = body

// Add after verified update (around line 99)
if (ai !== undefined) {
  movie.ai = ai

  // Remove redirect flag when AI extraction succeeds
  if (ai?.title) {
    delete movie.redirect
  }
}

// Add to removeMetadata section (around line 35)
if (removeMetadata) {
  delete movie.metadata
  delete movie.ai // Also remove AI data
  delete movie.redirect // Remove redirect flag
  movie.verified = false
  // ... rest of existing code
}
```

---

### Phase 2: Frontend Implementation

#### Task 4: Add AI Extraction UI to Admin Curation Panel

**File:** `app/components/AdminCurationPanel.vue` (modify existing)

**Add state variables:**

```typescript
const isAiExtracting = ref(false)
const aiError = ref('')
const aiExtracted = ref<{ title?: string; year?: number } | null>(null)
```

**Add AI extraction method:**

```typescript
const extractWithAI = async () => {
  isAiExtracting.value = true
  aiError.value = ''
  aiExtracted.value = null

  try {
    // Combine all source titles and descriptions
    const titles = props.movie.sources.map(s => s.title).filter(Boolean)
    const descriptions = props.movie.sources.map(s => s.description).filter(Boolean)

    // Use first source for extraction (or combine if needed)
    const title = titles[0] || props.movie.title
    const description = descriptions[0] || ''

    const response = await $fetch('/api/admin/ai/extract-metadata', {
      method: 'POST',
      body: {
        title,
        description,
      },
    })

    if (response.success && response.data) {
      aiExtracted.value = response.data

      // Save AI data to movie
      const updateRes = await $fetch('/api/admin/movie/update', {
        method: 'POST',
        body: {
          movieId: props.movie.imdbId,
          ai: response.data,
        },
      })

      if (updateRes.success) {
        // Pre-fill OMDB search fields
        searchTitle.value = response.data.title || ''
        searchYear.value = response.data.year?.toString() || ''

        emit('updated', updateRes.movieId)
      }
    }
  } catch (err) {
    console.error('AI extraction error:', err)
    aiError.value = 'Failed to extract metadata with AI'
  } finally {
    isAiExtracting.value = false
  }
}
```

**Add UI section (insert after Direct IMDB ID section, before "Mark as Verified" buttons):**

```vue
<!-- AI Metadata Extraction -->
<div class="pt-4 border-t border-yellow-200 dark:border-gray-700">
  <div class="flex items-center gap-2 mb-2">
    <h3 class="text-sm font-semibold uppercase tracking-wider text-yellow-700 dark:text-gray-300">
      AI Extract
    </h3>
    <div
      v-if="movie.ai?.title"
      class="flex items-center gap-1 text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-2 py-1 rounded"
    >
      <div class="i-mdi-robot" />
      AI Data Available
    </div>
  </div>

  <!-- Show existing AI data if available -->
  <div
    v-if="movie.ai?.title"
    class="mb-3 p-3 bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800 rounded"
  >
    <div class="flex items-start gap-2">
      <div class="i-mdi-robot text-purple-600 dark:text-purple-400 text-lg mt-0.5" />
      <div class="flex-1">
        <p class="text-sm font-medium text-purple-800 dark:text-purple-300">
          AI Extracted: "{{ movie.ai.title }}"{{ movie.ai.year ? ` (${movie.ai.year})` : '' }}
        </p>
        <p class="text-xs text-purple-700 dark:text-purple-400 mt-1">
          Click "Extract with AI" to re-extract or use "Search OMDB" above with these values
        </p>
      </div>
    </div>
  </div>

  <button
    class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold transition-colors disabled:opacity-50"
    :disabled="isAiExtracting || isSearching"
    @click="extractWithAI"
  >
    <div
      v-if="isAiExtracting"
      class="i-mdi-loading animate-spin"
    />
    <div
      v-else
      class="i-mdi-robot"
    />
    <span>{{ movie.ai?.title ? 'Re-extract with AI' : 'Extract with AI' }}</span>
  </button>

  <div
    v-if="aiError"
    class="text-red-500 text-sm mt-2"
  >
    {{ aiError }}
  </div>

  <p class="text-xs text-gray-600 dark:text-gray-400 mt-2">
    Uses Ollama AI to extract clean movie title and year from source data
  </p>
</div>
```

---

### Phase 3: Testing & Validation

#### Task 5: Test AI Extraction with Various Sources

**Test Cases:**

1. **YouTube promotional titles**
   - Input: "A Christmas Karen | Free Full Holiday Movie | FilmRise Movies"
   - Expected: `{ title: "A Christmas Karen", year: 2022 }`

2. **Archive.org identifier-style titles**
   - Input: "HeartsOfHumanity" + description
   - Expected: `{ title: "Hearts of Humanity", year: 1936 }`

3. **Classic films with year in title**
   - Input: "Nosferatu (1922) - Classic Horror Film [HD]"
   - Expected: `{ title: "Nosferatu", year: 1922 }`

4. **Charlie Chaplin format**
   - Input: "Charlie Chaplin's \"The Pawnshop\" (1916)"
   - Expected: `{ title: "The Pawnshop", year: 1916 }`

5. **No year available**
   - Input: "The Santa Trap | Free Full Movie | FilmRise"
   - Expected: `{ title: "The Santa Trap" }`

6. **Multiple sources**
   - Test with movie having both YouTube and Archive.org sources
   - Verify first source is used

7. **Redirect flag removal**
   - Verify `redirect: true` is removed after successful AI extraction
   - Verify redirect is removed when metadata is removed

8. **OMDB search pre-fill**
   - Verify AI results populate OMDB search fields
   - Verify user can immediately search OMDB with AI values

**Documentation:**

- Test AI extraction accuracy across different source types
- Document failure cases and edge cases
- Measure extraction time (should be < 5 seconds)
- Verify Ollama availability handling

---

## Data Model Changes

### MovieEntry Interface Update

```typescript
// shared/types/movie.ts

export interface MovieEntry {
  imdbId: string
  title: string
  year?: number
  sources: MovieSource[]
  metadata?: MovieMetadata
  verified?: boolean
  ai?: {
    // NEW: AI-extracted metadata
    title?: string // Clean movie title extracted by AI
    year?: number // Release year extracted by AI
  }
  redirect?: boolean // Modified: Remove when AI succeeds or metadata removed
  lastUpdated: string
}
```

---

## Dependency Graph

```
Epic: movies-deluxe-myr7 (AI Metadata Extraction)

Backend Foundation (Ready to Start):
├── movies-deluxe-qea5: Ollama Utility Module [READY]
│   ├── blocks → movies-deluxe-kigd (Single Movie API)
│   └── blocks → movies-deluxe-6di0 (Batch API)
│
├── movies-deluxe-9fto: Movie Endpoint Update [READY]
│   └── blocks → movies-deluxe-rpvy (Individual Extraction UI)
│
├── movies-deluxe-5ue9: Types Update [READY]
│   └── blocks → movies-deluxe-rpvy (Individual Extraction UI)
│
└── movies-deluxe-qkhy: Stats Endpoint Update [READY]
    └── blocks → movies-deluxe-8gig (Stats Card)

Backend APIs (Blocked):
├── movies-deluxe-kigd: Single Movie AI API [BLOCKED by qea5]
│   └── blocks → movies-deluxe-rpvy (Individual Extraction UI)
│
└── movies-deluxe-6di0: Batch AI API [BLOCKED by qea5]
    ├── blocks → movies-deluxe-sosi (AdminAIExtractor Component)
    └── blocks → movies-deluxe-3ikb (Admin Store)

Frontend Components (Blocked):
├── movies-deluxe-sosi: AdminAIExtractor Component [BLOCKED by 6di0]
│   └── blocks → movies-deluxe-nlbd (Dashboard Integration)
│
├── movies-deluxe-8gig: AI Stats Card [BLOCKED by qkhy]
│   └── blocks → movies-deluxe-nlbd (Dashboard Integration)
│
├── movies-deluxe-3ikb: Admin Store Update [BLOCKED by 6di0]
│   └── blocks → movies-deluxe-nlbd (Dashboard Integration)
│
├── movies-deluxe-rpvy: Individual Extraction UI [BLOCKED by kigd, 9fto, 5ue9]
│   └── blocks → movies-deluxe-edtq (Testing)
│
└── movies-deluxe-nlbd: Dashboard Integration [BLOCKED by sosi, 3ikb, 8gig]
    └── blocks → movies-deluxe-edtq (Testing)

Testing:
└── movies-deluxe-edtq: Testing [BLOCKED by rpvy, nlbd]
```

---

## Implementation Order

### Parallel Track 1: Backend Foundation (Start Immediately)

1. `movies-deluxe-qea5` - Ollama utility module
2. `movies-deluxe-9fto` - Movie endpoint update
3. `movies-deluxe-5ue9` - Types update
4. `movies-deluxe-qkhy` - Stats endpoint update

### Sequential Track 2: Backend APIs (After Ollama Utils)

5. `movies-deluxe-kigd` - Single movie AI API
6. `movies-deluxe-6di0` - Batch AI API

### Sequential Track 3: Frontend Components (After APIs)

7. `movies-deluxe-sosi` - AdminAIExtractor component
8. `movies-deluxe-8gig` - AI stats card
9. `movies-deluxe-3ikb` - Admin store update
10. `movies-deluxe-rpvy` - Individual extraction UI

### Final Track: Integration & Testing

11. `movies-deluxe-nlbd` - Dashboard integration
12. `movies-deluxe-edtq` - Testing

**Estimated Timeline:** 3-4 days

---

## Technical Considerations

### Ollama Integration

- **Model:** gemma3:4b (already available locally)
- **Response Time:** ~2-5 seconds per extraction
- **Availability:** Check model availability before extraction
- **Error Handling:** Graceful fallback if Ollama unavailable

### Prompt Engineering

- Detailed examples in prompt template
- JSON-only response format
- Clear cleaning rules
- Year validation (1800 - current year + 5)

### UI/UX Design

- **Placement:** Below Direct IMDB ID, above action buttons
- **Visual Indicator:** Purple theme to distinguish from OMDB (yellow)
- **Feedback:** Show existing AI data if available
- **Integration:** Pre-fill OMDB search fields after extraction
- **No Navigation:** Keep user on current page

### Data Persistence

- Store AI results in `ai` field of MovieEntry
- Persist across sessions
- Allow re-extraction (overwrite existing)
- Remove when metadata is removed

### Redirect Flag Management

- Remove `redirect: true` when AI extraction succeeds
- Remove when metadata is removed
- Prevents automatic redirects after curation

---

## Success Criteria

1. ✅ AI extracts clean titles from promotional YouTube titles
2. ✅ AI extracts years from titles and descriptions
3. ✅ AI data persists in movies.json under `ai` field
4. ✅ OMDB search fields pre-filled with AI results
5. ✅ Redirect flag removed after successful extraction
6. ✅ Redirect flag removed when metadata removed
7. ✅ No automatic navigation - user stays on page
8. ✅ UI clearly shows AI data availability
9. ✅ Graceful error handling when Ollama unavailable
10. ✅ Extraction completes in < 5 seconds

---

## Future Enhancements

- Batch AI extraction for multiple movies
- AI confidence scoring
- Fallback to multiple AI models
- Cache AI results to avoid re-extraction
- AI-powered genre/director extraction
- Automatic OMDB search after AI extraction (optional)
- AI extraction progress indicator for slow responses

---

## Notes

- Reuses Ollama integration pattern from `scripts/ollama-augment.ts`
- Uses same model (gemma3:4b) for consistency
- Prompt template follows existing pattern in `prompts/` directory
- No automatic navigation - curator stays in control
- AI data supplements OMDB search, doesn't replace it
- Redirect flag management prevents unwanted navigation
