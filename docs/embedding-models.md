# Embedding Models & Semantic Search

Movies Deluxe uses vector embeddings to power semantic search, allowing users to find movies based on meaning and context rather than just keyword matching.

## Leaderboard

https://huggingface.co/spaces/mteb/leaderboard

The challenge is to find a good model that is small enough

- for storing/loading 30k embeddings (more dimensions, bigger size)
- for storing/loading the model itself
  in the browser. The browser has an additional limitation that the models must be able to run. With the help of [ONNX](https://onnx.ai/) and [Transformers.js](https://huggingface.co/docs/transformers.js), this is possible but requires some research in finding the right balance.

## Available Models

We support multiple embedding models with different trade-offs between search quality, database size, and generation speed. Each model contains approximately **30,600 movie embeddings**.

| Model                | ID               | Dimensions | DB File                          | File Size |
| -------------------- | ---------------- | ---------- | -------------------------------- | --------- |
| **Nomic Embed Text** | `nomic`          | 768        | `embeddings-nomic-movies.db`     | 122 MB    |
| **BGE Micro v2**     | `bge-micro`      | 384        | `embeddings-bge-micro-movies.db` | 62 MB     |
| **Potion Base 2M**   | `potion-base-2M` | 64         | `embeddings-potion-movies.db`    | 12 MB     |

### Model Details

- **Nomic Embed Text** (`nomic`): **Default.** Best search quality, but largest database size.
- **BGE Micro v2** (`bge-micro`): Good balance between size and quality. Faster generation. The results are usable.
- **Potion Base 2M** (`potion-base-2M`): Smallest and fastest. Ideal for low-bandwidth or low-resource environments. The results are not convincing at all.

## Database Generation

When generating the SQLite database for the frontend, you can select which model's embeddings to include.

### CLI Usage

Use the `--embedding-model` (or `-m`) flag with `pnpm db:generate`:

```bash
# Use default (nomic)
pnpm db:generate

# Use BGE Micro
pnpm db:generate -m bge-micro

# Use Potion
pnpm db:generate -m potion
```

You can also skip generating individual movie JSON files if they are already up-to-date:

```bash
pnpm db:generate -m bge-micro --skip-json
```

### Admin UI

The Admin Dashboard (`/admin`) provides a user-friendly interface for database generation:

1. Navigate to the **Database Management** section.
2. Select the desired **Embedding Model** from the dropdown.
3. (Optional) Check **Skip individual movie JSON generation**.
4. Click **Start SQLite Generation**.

Progress will be displayed in real-time.

## Generating Embeddings

Before a model can be used in the SQLite database, its embeddings must be generated and stored in the `data/` directory.

Each model has its own generation script:

- **Nomic**: `pnpm embeddings:generate` (runs `scripts/generate-embeddings.ts`)
- **BGE Micro**: `pnpm embeddings:generate-bge` (runs `scripts/generate-embeddings-bge.ts`)
- **Potion**: `pnpm embeddings:generate-potion` (runs `scripts/generate-embeddings-potion.ts`)

> **Note**: Generating embeddings requires an Ollama server running locally with the corresponding models installed.

## Troubleshooting

### Missing Embedding Database

If you see a warning like `Embeddings database not found: embeddings-*.db`, it means you haven't generated embeddings for that model yet. The SQLite database will still be generated, but semantic search will not return any results for that model.

To fix this, run the corresponding embedding generation script mentioned above.

### Dimension Mismatch

The SQLite database schema is automatically adjusted to match the dimensions of the selected model. If you switch models, you must regenerate the SQLite database to update the schema.

## Architecture

The embedding model configuration is centralized in `config/embedding-models.ts`. This file defines the metadata for all supported models and is used by both the CLI scripts and the Admin UI.

```typescript
export interface EmbeddingModelConfig {
  id: string
  name: string
  dimensions: number
  dbFileName: string
  description: string
  isDefault?: boolean
}
```
