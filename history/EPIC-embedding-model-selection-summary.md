# Epic Summary: Embedding Model Selection & Database Generation

**Epic ID**: `movies-deluxe-wxzz`  
**Status**: Open  
**Priority**: Medium (2)  
**Created**: 2026-01-20

---

## 📋 Overview

This epic enables users to select which embedding model to use (nomic, bge-micro, potion) and generate SQLite database with embeddings from the selected model. It also provides control over whether to generate only SQL database or SQL + individual movie JSON files through both CLI flags and Admin UI.

**Planning Document**: `history/PLAN-embedding-model-selection.md`  
**Research Document**: `history/embedding-models-research.md`

---

## 🎯 Goals

- **Flexibility**: Support multiple embedding models without hardcoding
- **Efficiency**: Allow skipping JSON generation when not needed
- **User Experience**: Provide clear UI controls in admin panel
- **Maintainability**: Clean architecture for adding new models in the future

---

## 📊 Project Statistics

- **Total Issues**: 343
- **Open Issues**: 10 (including this epic + 9 tasks)
- **Ready to Work**: 3 tasks
- **Blocked Issues**: 7 tasks
- **Closed Issues**: 333

---

## 🗂️ Task Breakdown

### Phase 1: Configuration & Core Logic (3 tasks)

| ID                   | Title                                                      | Priority | Status | Blockers               |
| -------------------- | ---------------------------------------------------------- | -------- | ------ | ---------------------- |
| `movies-deluxe-kbsf` | Create embedding models configuration system               | 2        | Open   | **Ready**              |
| `movies-deluxe-jtze` | Update generateSQLite function for dynamic model selection | 2        | Open   | Blocked by: kbsf       |
| `movies-deluxe-4uhu` | Add CLI argument parsing for model selection               | 2        | Open   | Blocked by: kbsf, jtze |

### Phase 2: API & Backend (2 tasks)

| ID                   | Title                                                    | Priority | Status | Blockers                     |
| -------------------- | -------------------------------------------------------- | -------- | ------ | ---------------------------- |
| `movies-deluxe-eozn` | Add shared types for admin database generation API       | 1        | Open   | **Ready**                    |
| `movies-deluxe-b8kd` | Update API endpoint to accept model selection parameters | 2        | Open   | Blocked by: kbsf, jtze, eozn |

### Phase 3: Admin UI (2 tasks)

| ID                   | Title                                                          | Priority | Status | Blockers                     |
| -------------------- | -------------------------------------------------------------- | -------- | ------ | ---------------------------- |
| `movies-deluxe-945r` | Create AdminDatabaseGenerator component with model selection   | 2        | Open   | Blocked by: kbsf, eozn, b8kd |
| `movies-deluxe-7g49` | Update admin dashboard to use AdminDatabaseGenerator component | 1        | Open   | Blocked by: 945r             |

### Phase 4: Testing & Documentation (2 tasks)

| ID                   | Title                                                      | Priority | Status | Blockers               |
| -------------------- | ---------------------------------------------------------- | -------- | ------ | ---------------------- |
| `movies-deluxe-x7y0` | Test embedding model selection across CLI and Admin UI     | 2        | Open   | Blocked by: 4uhu, 7g49 |
| `movies-deluxe-iw5v` | Update documentation for embedding model selection feature | 1        | Open   | Blocked by: 4uhu, 7g49 |

---

## 🚀 Ready to Start

**3 tasks are ready to work on now:**

1. **`movies-deluxe-kbsf`** - Create embedding models configuration system

   - Foundation for entire feature
   - No dependencies
   - Priority: 2

2. **`movies-deluxe-eozn`** - Add shared types for admin database generation API

   - Type safety foundation
   - No dependencies
   - Priority: 1 (higher)

3. **`movies-deluxe-wxzz`** - The epic itself (tracking/planning)

---

## 🔄 Dependency Flow

```
Phase 1: Configuration & Core Logic
┌─────────────────────────────────────────┐
│ kbsf: Create config system (READY)      │
└────────────┬────────────────────────────┘
             │
             ├─────────────────────────────┐
             │                             │
             ▼                             ▼
┌────────────────────────┐    ┌───────────────────────┐
│ jtze: Update           │    │ 4uhu: Add CLI         │
│ generateSQLite()       │───▶│ argument parsing      │
└────────────┬───────────┘    └───────────┬───────────┘
             │                            │
             │                            │
Phase 2: API & Backend                   │
             │                            │
┌────────────┴───────────┐               │
│ eozn: Add shared       │               │
│ types (READY)          │               │
└────────────┬───────────┘               │
             │                            │
             ├────────────────────────────┘
             │
             ▼
┌────────────────────────┐
│ b8kd: Update API       │
│ endpoint               │
└────────────┬───────────┘
             │
             │
Phase 3: Admin UI        │
             │
             ▼
┌────────────────────────┐
│ 945r: Create           │
│ AdminDatabaseGenerator │
└────────────┬───────────┘
             │
             ▼
┌────────────────────────┐
│ 7g49: Update admin     │
│ dashboard              │
└────────────┬───────────┘
             │
             │
Phase 4: Testing & Docs  │
             │
             ├─────────────────────────────┐
             │                             │
             ▼                             ▼
┌────────────────────────┐    ┌───────────────────────┐
│ x7y0: Test feature     │    │ iw5v: Update docs     │
└────────────────────────┘    └───────────────────────┘
```

---

## 🏗️ Architecture Overview

### New Files to Create

1. **`config/embedding-models.ts`**

   - `EmbeddingModelConfig` interface
   - `EMBEDDING_MODELS` array (nomic, bge-micro, potion)
   - Helper functions: `getModelConfig()`, `getDefaultModel()`

2. **`app/components/AdminDatabaseGenerator.vue`**

   - Model selection dropdown
   - Skip JSON checkbox
   - Generate button with progress
   - Help text and descriptions

3. **`shared/types/admin.ts`** (if doesn't exist)
   - `GenerateDatabaseRequest` interface
   - `GenerateDatabaseResponse` interface

### Files to Modify

1. **`server/utils/generateSQLite.ts`**

   - Accept `GenerateSQLiteOptions` parameter
   - Dynamic embedding DB path
   - Dynamic vector table dimensions
   - Optional JSON generation

2. **`scripts/generate-sqlite.ts`**

   - CLI argument parsing (`--embedding-model`, `--skip-json`, `--help`)
   - Model validation
   - Pass options to `generateSQLite()`

3. **`server/api/admin/sqlite/generate.post.ts`**

   - Accept model selection in request body
   - Validate model
   - Pass options to `generateSQLite()`

4. **`app/pages/admin/index.vue`**

   - Replace old generate button with `AdminDatabaseGenerator` component

5. **Documentation** (README.md, AGENTS.md)
   - Feature overview
   - CLI usage examples
   - Admin UI instructions

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

## 📝 Implementation Notes

### Current State

**Embedding Models Available:**

- **nomic-embed-text**: 768 dimensions (current production)
- **bge-micro-v2**: 384 dimensions (available)
- **potion-base-2M**: 64 dimensions (available)

**Current Hardcoded Behavior:**

- Always uses `data/embeddings-nomic-movies.db`
- Always generates individual movie JSON files
- Vector table always uses `FLOAT[768]`

**After Implementation:**

- User can select any available model
- User can skip JSON generation for faster updates
- Vector table dimensions match selected model
- Clean architecture for adding new models

### Backward Compatibility

- Default to `nomic` model if not specified
- Default to generating JSON files if not specified
- Existing command `pnpm db:generate` continues to work unchanged

### Error Handling

- Validate model selection against available models
- Check if embedding DB file exists
- Provide helpful error messages with generation instructions
- Gracefully handle missing embeddings (empty vector table)

---

## 🔍 Research Findings

**Comprehensive research completed on embedding models:**

- **Best Overall**: `mixedbread-ai/mxbai-embed-large-v1` (1024D, MTEB: 54.39)
- **Current Production**: `nomic-ai/nomic-embed-text-v1.5` (768D, MTEB: 53.01)
- **Maximum Performance**: `Cohere embed-english-v3.0` (MTEB: 55.0)

**Cost Savings with Quantization:**

- Binary quantization: 97% cost savings, 96.45% performance retention
- Int8 quantization: 75% cost savings, 97% performance retention

**See**: `history/embedding-models-research.md` for full details

---

## 📚 Related Documentation

- **Planning**: `history/PLAN-embedding-model-selection.md`
- **Research**: `history/embedding-models-research.md`
- **Current Implementation**: `server/utils/generateSQLite.ts`
- **Embedding Scripts**: `scripts/generate-embeddings*.ts`

---

## 🚦 Next Steps

1. **Start with foundation tasks** (both ready):

   - `movies-deluxe-kbsf`: Create config system
   - `movies-deluxe-eozn`: Add shared types

2. **Then proceed sequentially through phases**:

   - Phase 1 → Phase 2 → Phase 3 → Phase 4

3. **Test thoroughly** before closing epic

4. **Update documentation** for users

---

## 📊 Progress Tracking

Use these commands to track progress:

```bash
# Show ready tasks
bd ready

# Show epic details with all sub-tasks
bd show movies-deluxe-wxzz

# Show blocked tasks
bd blocked

# Show project statistics
bd stats
```

---

**Epic Created**: 2026-01-20  
**Last Updated**: 2026-01-20  
**Status**: Research complete, ready for implementation
