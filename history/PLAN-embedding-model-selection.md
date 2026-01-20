# Implementation Plan: Embedding Model Selection & Database Generation

**Epic**: Allow selection of embedding model and use corresponding embedding DB for vectors in movie.db

**Date**: 2026-01-20

---

## 📋 Epic Overview

Enable users to:

1. Select which embedding model to use (nomic, bge-micro, potion, or future models)
2. Generate SQLite database with embeddings from the selected model
3. Control whether to generate only SQL database or SQL + individual movie JSON files
4. Manage this through both CLI flags and Admin UI

---

## 🎯 Goals

- **Flexibility**: Support multiple embedding models without hardcoding
- **Efficiency**: Allow skipping JSON generation when not needed
- **User Experience**: Provide clear UI controls in admin panel
- **Maintainability**: Clean architecture for adding new models in the future

---

## 🔍 Current State Analysis

### Embedding Models Currently Supported

| Model            | Dimensions | DB File                          | Generation Script                       | Status         |
| ---------------- | ---------- | -------------------------------- | --------------------------------------- | -------------- |
| nomic-embed-text | 768        | `embeddings-nomic-movies.db`     | `scripts/generate-embeddings.ts`        | **Production** |
| bge-micro-v2     | 384        | `embeddings-bge-micro-movies.db` | `scripts/generate-embeddings-bge.ts`    | Available      |
| potion-base-2M   | 64         | `embeddings-potion-movies.db`    | `scripts/generate-embeddings-potion.ts` | Available      |

### Current Database Generation Flow

```
pnpm db:generate
  ↓
scripts/generate-sqlite.ts
  ↓
server/utils/generateSQLite.ts
  ↓
1. Calls generateMovieJSON() - generates individual JSON files
2. Loads data/movies.json
3. Loads data/embeddings-nomic-movies.db (HARDCODED)
4. Creates public/data/movies.db with vec_movies table (FLOAT[768] HARDCODED)
```

### Current Admin UI

**Location**: `app/pages/admin/index.vue`

**Current Controls**:

- "Generate SQLite" button → calls `/api/admin/sqlite/generate`
- No model selection
- No option to skip JSON generation

---

## 🏗️ Architecture Design

### 1. Configuration Layer

**Create**: `config/embedding-models.ts`

```typescript
export interface EmbeddingModelConfig {
  id: string // 'nomic', 'bge-micro', 'potion'
  name: string // Display name
  dimensions: number // 768, 384, 64
  dbFileName: string // 'embeddings-nomic-movies.db'
  description: string // User-facing description
  isDefault?: boolean // Default selection
}

export const EMBEDDING_MODELS: EmbeddingModelConfig[] = [
  {
    id: 'nomic',
    name: 'Nomic Embed Text',
    dimensions: 768,
    dbFileName: 'embeddings-nomic-movies.db',
    description: 'Best quality, 768 dimensions (current production)',
    isDefault: true,
  },
  {
    id: 'bge-micro',
    name: 'BGE Micro v2',
    dimensions: 384,
    dbFileName: 'embeddings-bge-micro-movies.db',
    description: 'Faster, smaller, 384 dimensions',
  },
  {
    id: 'potion',
    name: 'Potion Base 2M',
    dimensions: 64,
    dbFileName: 'embeddings-potion-movies.db',
    description: 'Smallest/fastest, 64 dimensions',
  },
]

export function getModelConfig(modelId: string): EmbeddingModelConfig | undefined {
  return EMBEDDING_MODELS.find(m => m.id === modelId)
}

export function getDefaultModel(): EmbeddingModelConfig {
  return EMBEDDING_MODELS.find(m => m.isDefault) || EMBEDDING_MODELS[0]
}
```

### 2. CLI Interface

**Modify**: `scripts/generate-sqlite.ts`

```typescript
import { parseArgs } from 'node:util'
import { getModelConfig, getDefaultModel } from '../config/embedding-models'

const { values } = parseArgs({
  options: {
    'embedding-model': { type: 'string', short: 'm' },
    'skip-json': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log(`
Usage: pnpm db:generate [options]

Options:
  -m, --embedding-model <model>  Embedding model to use (nomic, bge-micro, potion)
  --skip-json                    Skip generating individual movie JSON files
  -h, --help                     Show this help message

Examples:
  pnpm db:generate                           # Use default model (nomic)
  pnpm db:generate -m bge-micro              # Use BGE model
  pnpm db:generate --skip-json               # Skip JSON generation
  pnpm db:generate -m potion --skip-json     # Use Potion, skip JSON
  `)
  process.exit(0)
}

const modelId = values['embedding-model'] || getDefaultModel().id
const modelConfig = getModelConfig(modelId)

if (!modelConfig) {
  console.error(`Error: Unknown embedding model '${modelId}'`)
  console.error(`Available models: ${EMBEDDING_MODELS.map(m => m.id).join(', ')}`)
  process.exit(1)
}

const skipJson = values['skip-json'] || false

await generateSQLite({
  embeddingModel: modelConfig,
  skipJsonGeneration: skipJson,
  onProgress: progress => {
    console.log(`[${progress.current}/${progress.total}] ${progress.message}`)
  },
})
```

### 3. Core Generation Function

**Modify**: `server/utils/generateSQLite.ts`

```typescript
import type { EmbeddingModelConfig } from '../../config/embedding-models'

export interface GenerateSQLiteOptions {
  embeddingModel: EmbeddingModelConfig
  skipJsonGeneration?: boolean
  onProgress?: (progress: { current: number; total: number; message: string }) => void
}

export async function generateSQLite(options: GenerateSQLiteOptions) {
  const { embeddingModel, skipJsonGeneration = false, onProgress } = options

  logger.info(`Using embedding model: ${embeddingModel.name} (${embeddingModel.dimensions}D)`)

  // 1. Generate individual movie JSON files (optional)
  if (!skipJsonGeneration) {
    logger.info('Generating individual movie JSON files...')
    await generateMovieJSON()
  } else {
    logger.info('Skipping individual movie JSON generation')
  }

  // 2. Load JSON data
  const db = await loadMoviesDatabase()
  const collectionsDb = await loadCollectionsDatabase()

  // 3. Load embeddings from selected model's database
  const EMBEDDINGS_DB_PATH = join(process.cwd(), 'data', embeddingModel.dbFileName)
  const embeddings: Record<string, Float32Array> = {}

  if (existsSync(EMBEDDINGS_DB_PATH)) {
    logger.info(`Loading embeddings from ${embeddingModel.dbFileName}...`)
    // ... existing loading logic ...
  } else {
    logger.warn(`Embeddings database not found: ${embeddingModel.dbFileName}`)
    logger.warn('Vector search will be empty. Run embedding generation first:')
    logger.warn(`  pnpm embeddings:generate-${embeddingModel.id}`)
  }

  // 4. Create schema with dynamic dimensions
  sqlite.exec(`
    CREATE VIRTUAL TABLE vec_movies USING vec0(
      movieId TEXT PRIMARY KEY,
      embedding FLOAT[${embeddingModel.dimensions}]
    );
  `)

  // ... rest of the function remains the same ...
}
```

### 4. API Layer

**Modify**: `server/api/admin/sqlite/generate.post.ts`

```typescript
import { getModelConfig, getDefaultModel } from '~/config/embedding-models'

export default defineEventHandler(async event => {
  // Only allow from localhost
  const host = getRequestHeader(event, 'host')
  if (!host?.startsWith('localhost') && !host?.startsWith('127.0.0.1')) {
    throw createError({ statusCode: 403, message: 'Access denied' })
  }

  const body = await readBody(event)
  const modelId = body?.embeddingModel || getDefaultModel().id
  const skipJson = body?.skipJsonGeneration || false

  const modelConfig = getModelConfig(modelId)
  if (!modelConfig) {
    throw createError({
      statusCode: 400,
      message: `Unknown embedding model: ${modelId}`,
    })
  }

  // Start generation in background
  generateSQLite({
    embeddingModel: modelConfig,
    skipJsonGeneration: skipJson,
    onProgress: progress => {
      emitProgress({
        type: 'sqlite',
        status: 'in_progress',
        current: progress.current,
        total: progress.total,
        message: progress.message,
      })
    },
  })
    .then(() => {
      emitProgress({
        type: 'sqlite',
        status: 'completed',
        message: 'SQLite database generated successfully',
      })
    })
    .catch(error => {
      emitProgress({
        type: 'sqlite',
        status: 'error',
        message: error.message,
      })
    })

  return { success: true, message: 'Generation started' }
})
```

### 5. Admin UI Components

**Create**: `app/components/AdminDatabaseGenerator.vue`

```vue
<script setup lang="ts">
import { EMBEDDING_MODELS } from '~/config/embedding-models'

const adminStore = useAdminStore()

const selectedModel = ref(EMBEDDING_MODELS.find(m => m.isDefault)?.id || 'nomic')
const skipJsonGeneration = ref(false)
const generating = ref(false)

const selectedModelConfig = computed(() => EMBEDDING_MODELS.find(m => m.id === selectedModel.value))

async function generateDatabase() {
  generating.value = true
  try {
    await $fetch('/api/admin/sqlite/generate', {
      method: 'POST',
      body: {
        embeddingModel: selectedModel.value,
        skipJsonGeneration: skipJsonGeneration.value,
      },
    })
  } catch (error) {
    console.error('Failed to generate database:', error)
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="admin-database-generator">
    <h3>Generate SQLite Database</h3>

    <!-- Model Selection -->
    <div class="form-group">
      <label>Embedding Model</label>
      <select v-model="selectedModel" :disabled="generating">
        <option v-for="model in EMBEDDING_MODELS" :key="model.id" :value="model.id">
          {{ model.name }} ({{ model.dimensions }}D)
        </option>
      </select>
      <p class="help-text">{{ selectedModelConfig?.description }}</p>
    </div>

    <!-- Options -->
    <div class="form-group">
      <label>
        <input type="checkbox" v-model="skipJsonGeneration" :disabled="generating" />
        Skip individual movie JSON generation
      </label>
      <p class="help-text">Faster if you only need to update the SQLite database</p>
    </div>

    <!-- Generate Button -->
    <button @click="generateDatabase" :disabled="generating" class="btn-primary">
      <div class="i-mdi-database-export" :class="{ 'animate-spin': generating }"></div>
      {{ generating ? 'Generating...' : 'Generate Database' }}
    </button>

    <!-- Progress Display -->
    <div v-if="adminStore.progress.sqlite?.status === 'in_progress'" class="progress">
      <div class="progress-bar" :style="progressStyle"></div>
      <p>{{ adminStore.progress.sqlite.message }}</p>
    </div>
  </div>
</template>
```

**Update**: `app/pages/admin/index.vue`

```vue
<template>
  <div class="admin-dashboard">
    <!-- ... existing stats cards ... -->

    <!-- Replace old "Generate SQLite" button with new component -->
    <AdminDatabaseGenerator />

    <!-- ... rest of admin UI ... -->
  </div>
</template>
```

---

## 📦 Implementation Tasks Breakdown

### Phase 1: Configuration & Core Logic

1. **Create embedding models configuration**

   - Create `config/embedding-models.ts`
   - Define `EmbeddingModelConfig` interface
   - Export model configurations array
   - Add helper functions

2. **Update generateSQLite function**

   - Add `GenerateSQLiteOptions` interface
   - Accept `embeddingModel` parameter
   - Make JSON generation optional via `skipJsonGeneration`
   - Use dynamic embedding DB path
   - Use dynamic vector table dimensions
   - Add validation and error handling

3. **Update CLI script**
   - Add argument parsing for `--embedding-model` and `--skip-json`
   - Add help text
   - Validate model selection
   - Pass options to `generateSQLite()`

### Phase 2: API & Backend

4. **Update API endpoint**

   - Accept `embeddingModel` and `skipJsonGeneration` in request body
   - Validate model selection
   - Pass options to `generateSQLite()`
   - Update progress emission

5. **Add API types**
   - Create shared types for request/response
   - Update admin store types

### Phase 3: Admin UI

6. **Create AdminDatabaseGenerator component**

   - Model selection dropdown
   - Skip JSON checkbox
   - Generate button with loading state
   - Progress display
   - Help text and descriptions

7. **Update admin dashboard**
   - Replace old generate button with new component
   - Update layout/styling
   - Test progress monitoring

### Phase 4: Testing & Documentation

8. **Testing**

   - Test CLI with different models
   - Test CLI with `--skip-json` flag
   - Test Admin UI model selection
   - Test Admin UI skip JSON option
   - Verify generated databases have correct dimensions
   - Test error handling (missing embedding DB)

9. **Documentation**
   - Update README with new CLI flags
   - Document embedding model configuration
   - Add examples for different use cases
   - Update admin UI documentation

---

## 🔧 Technical Considerations

### Database Schema Compatibility

**Challenge**: Different models have different dimensions (768, 384, 64)

**Solution**:

- Dynamic schema creation based on selected model
- Vector table uses `FLOAT[${dimensions}]` syntax
- Frontend vector search doesn't need changes (dimension-agnostic)

### Missing Embeddings Handling

**Challenge**: User selects a model but hasn't generated embeddings yet

**Solution**:

- Check if embedding DB file exists
- Log warning if missing
- Continue with empty vector table
- Provide clear instructions on how to generate embeddings

### Backward Compatibility

**Challenge**: Existing scripts and workflows expect default behavior

**Solution**:

- Default to `nomic` model if not specified
- Default to generating JSON files if not specified
- No breaking changes to existing commands

### Admin UI State Management

**Challenge**: Need to track selected model and options across page reloads

**Solution**:

- Use localStorage to persist selections
- Provide sensible defaults
- Clear state after successful generation

---

## 🎯 Success Criteria

- ✅ CLI accepts `--embedding-model` flag with validation
- ✅ CLI accepts `--skip-json` flag
- ✅ `generateSQLite()` uses selected model's embeddings
- ✅ Vector table dimensions match selected model
- ✅ Admin UI shows model selection dropdown
- ✅ Admin UI shows skip JSON checkbox
- ✅ Progress monitoring works with new options
- ✅ Error handling for missing embedding databases
- ✅ Documentation updated
- ✅ All existing functionality still works (backward compatible)

---

## 📚 Related Files

### Files to Create

- `config/embedding-models.ts`
- `app/components/AdminDatabaseGenerator.vue`
- `shared/types/admin.ts` (if needed)

### Files to Modify

- `server/utils/generateSQLite.ts`
- `scripts/generate-sqlite.ts`
- `server/api/admin/sqlite/generate.post.ts`
- `app/pages/admin/index.vue`
- `app/stores/useAdminStore.ts` (if needed)
- `package.json` (update script if needed)

### Files to Reference

- `server/utils/generateMovieJSON.ts`
- `server/utils/movieData.ts`
- `app/utils/embedding/*.ts`
- `scripts/generate-embeddings*.ts`

---

## 🚀 Future Enhancements

1. **Model Comparison Tool**

   - Generate databases with multiple models
   - Compare search quality side-by-side
   - Performance benchmarking

2. **Quantization Support**

   - Add binary/int8 quantization options
   - Reduce database size significantly
   - Maintain search quality with rescoring

3. **Automatic Model Detection**

   - Scan `data/` directory for available embedding DBs
   - Auto-populate model selection dropdown
   - Show which models are ready to use

4. **Embedding Generation Integration**

   - Trigger embedding generation from Admin UI
   - Show progress for embedding generation
   - Chain: generate embeddings → generate database

5. **Model Metadata**
   - Store which model was used in database
   - Display in admin UI
   - Warn if trying to use wrong model

---

## 📝 Notes

- This implementation maintains backward compatibility
- No changes needed to frontend vector search logic
- Embedding generation scripts remain unchanged
- Focus is on database generation flexibility
- Clean architecture allows easy addition of new models in the future
