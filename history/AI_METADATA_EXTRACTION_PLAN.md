# AI-Powered Movie Metadata Extraction: Implementation Plan

**Epic ID:** TBD (will be created)  
**Created:** 2025-12-30  
**Status:** Planning Complete - Ready for Implementation

## Overview

This epic adds AI-powered movie title and year extraction using Ollama to improve the OMDB matching workflow. The AI will parse raw source titles and descriptions to extract clean movie titles and release years, which are then used to pre-populate OMDB search fields.

### Key Features

1. **AI Metadata Extraction** - Use Ollama (gemma3:4b) to extract clean title and year from source data
2. **Admin Panel Integration** - Add "AI Extract" button below existing OMDB search
3. **Persistent Storage** - Store AI results in `movies.json` under `ai: { title, year }` key
4. **Smart Redirect Removal** - Remove redirect flag when AI extraction succeeds or metadata is removed
5. **No Navigation** - Keep user on current page, no automatic redirects

## Architecture Overview

### Backend Components

```
server/api/admin/
├── ai/
│   └── extract-metadata.post.ts   # New: Ollama extraction endpoint
└── movie/
    └── update.post.ts              # Modified: Handle ai field updates

server/utils/
└── ollama.ts                       # New: Ollama client utilities

prompts/
└── extract-movie-metadata.md       # New: AI prompt template
```

### Frontend Components

```
app/components/
└── AdminCurationPanel.vue          # Modified: Add AI extraction UI
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

**File:** `server/utils/ollama.ts`

**Implementation:**

````typescript
import { readFile } from 'fs/promises'
import { join } from 'path'

export interface OllamaConfig {
  host: string
  model: string
}

export interface OllamaResponse {
  message: {
    content: string
  }
}

export interface ExtractedMetadata {
  title?: string
  year?: number
}

const DEFAULT_CONFIG: OllamaConfig = {
  host: 'http://localhost:11434',
  model: 'gemma3:4b',
}

/**
 * Check if Ollama model is available
 */
export async function isOllamaModelAvailable(
  model: string = DEFAULT_CONFIG.model,
  host: string = DEFAULT_CONFIG.host
): Promise<boolean> {
  try {
    const response = await fetch(`${host}/api/tags`)
    if (!response.ok) return false

    const data = await response.json()
    return data.models?.some((m: any) => m.name.includes(model)) ?? false
  } catch {
    return false
  }
}

/**
 * Make Ollama chat request
 */
export async function ollamaChat(
  model: string,
  messages: Array<{ role: string; content: string }>,
  host: string = DEFAULT_CONFIG.host
): Promise<OllamaResponse> {
  const response = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      format: 'json',
    }),
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  return await response.json()
}

/**
 * Load prompt template and replace placeholders
 */
export async function loadPrompt(
  templateName: string,
  variables: Record<string, string>
): Promise<string> {
  const promptPath = join(process.cwd(), 'prompts', `${templateName}.md`)
  let template = await readFile(promptPath, 'utf-8')

  // Replace {variable} placeholders
  for (const [key, value] of Object.entries(variables)) {
    template = template.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '')
  }

  return template
}

/**
 * Extract JSON from response (handles markdown code blocks)
 */
export function extractJsonFromResponse(content: string): string | null {
  // Try to find JSON in markdown code block first
  const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1]
  }

  // Try to find raw JSON
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  return jsonMatch?.[0] ?? null
}

/**
 * Parse metadata extraction response
 */
export function parseMetadataResponse(content: string): ExtractedMetadata | null {
  const jsonString = extractJsonFromResponse(content.trim())
  if (!jsonString) {
    console.warn('No JSON found in Ollama response')
    return null
  }

  try {
    const extracted = JSON.parse(jsonString)

    // Validate structure
    if (!extracted?.title) {
      console.warn('Invalid metadata structure - missing title')
      return null
    }

    // Validate year if present
    if (extracted.year !== undefined) {
      const year = parseInt(extracted.year)
      if (isNaN(year) || year < 1800 || year > new Date().getFullYear() + 5) {
        console.warn(`Invalid year: ${extracted.year}`)
        delete extracted.year
      } else {
        extracted.year = year
      }
    }

    return {
      title: extracted.title.trim(),
      year: extracted.year,
    }
  } catch (error) {
    console.error('Error parsing JSON from Ollama:', error)
    return null
  }
}

/**
 * Extract movie metadata using Ollama
 */
export async function extractMovieMetadata(
  title: string,
  description?: string,
  config: Partial<OllamaConfig> = {}
): Promise<ExtractedMetadata | null> {
  const { host, model } = { ...DEFAULT_CONFIG, ...config }

  try {
    // Check if model is available
    const modelAvailable = await isOllamaModelAvailable(model, host)
    if (!modelAvailable) {
      throw new Error(`Ollama model ${model} not available`)
    }

    // Load and populate prompt template
    const prompt = await loadPrompt('extract-movie-metadata', {
      title,
      description: description || 'No description available',
    })

    // Make Ollama request
    const response = await ollamaChat(model, [{ role: 'user', content: prompt }], host)

    // Parse response
    const extracted = parseMetadataResponse(response.message.content)
    if (!extracted) {
      throw new Error('Failed to parse Ollama response')
    }

    return extracted
  } catch (error) {
    console.error('Error extracting metadata with Ollama:', error)
    throw error
  }
}
````

---

#### Task 2: Create AI Extraction API Endpoint

**File:** `server/api/admin/ai/extract-metadata.post.ts`

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
Epic: AI Metadata Extraction
├── Backend: Ollama Utility Module (ready)
│   └── blocks: AI Extraction API
│
├── Backend: AI Extraction API (blocked by Ollama utils)
│   └── blocks: Frontend UI
│
├── Backend: Update Movie Endpoint (ready)
│   └── blocks: Frontend UI
│
├── Prompt: extract-movie-metadata.md (ready)
│   └── blocks: AI Extraction API
│
├── Frontend: AI Extraction UI (blocked by API)
│   └── blocks: Testing
│
└── Testing: AI Extraction Tests (blocked by Frontend)
```

---

## Implementation Order

1. **Prompt Template** - Create `prompts/extract-movie-metadata.md` ✅ (DONE)
2. **Ollama Utilities** - Create `server/utils/ollama.ts`
3. **AI API Endpoint** - Create `server/api/admin/ai/extract-metadata.post.ts`
4. **Update Movie Endpoint** - Modify `server/api/admin/movie/update.post.ts`
5. **Frontend UI** - Modify `app/components/AdminCurationPanel.vue`
6. **Testing** - Manual testing with various movie sources

**Estimated Timeline:** 2-3 days

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
