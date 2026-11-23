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

| Model                | Base Technology | Dimensions | DB File                          | File Size |
| -------------------- | --------------- | ---------- | -------------------------------- | --------- |
| **Nomic Embed Text** | Ollama          | 768        | `embeddings-nomic-movies.db`     | 122 MB    |
| **BGE Micro v2**     | Transformers.js | 384        | `embeddings-bge-micro-movies.db` | 62 MB     |
| **Potion Base 2M**   | ONNX            | 64         | `embeddings-potion-movies.db`    | 12 MB     |

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

## Model Research & Candidate Upgrades (2025–2026)

In a November 2026 review of browser-capable ONNX / Transformers.js embedding models, several 2025–2026 releases offer major retrieval quality gains over `bge-micro-v2` (16.6 MB `q8` ONNX, 384d, ~54 MB embeddings DB) and `potion-base-2M` (7.3 MB ONNX, 64d, ~8.6 MB embeddings DB).

### Sub-50M & Browser-Friendly Candidates

| Model                                                                                                                                         | Params        | Browser ONNX (`q8`)                                 | Dimensions (MRL?)                         | BEIR Avg (nDCG@10)          | Notes                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------- | ----------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| **`TaylorAI/bge-micro-v2`** _(current)_                                                                                                       | 17M           | 16.6 MB                                             | 384 (No)                                  | ~42                         | Current baseline                                                                             |
| **[`MongoDB/mdbr-leaf-ir`](https://huggingface.co/MongoDB/mdbr-leaf-ir)** _(Aug 2025)_                                                        | 23M           | **22.1 MB**                                         | 768 → **256 / 128** (MRL + `int8`/binary) | **53.55** (**54.03** asym.) | **Top pick.** #1 on BEIR for ≤100M; official `transformers.js`                               |
| **[`Snowflake/snowflake-arctic-embed-xs`](https://huggingface.co/Snowflake/snowflake-arctic-embed-xs)**                                       | 23M           | 21.9 MB                                             | 384 (No)                                  | 50.15                       | Solid runner-up; single `.onnx` file; official `transformers.js`                             |
| **[`onnx-community/granite-embedding-30m-english-ONNX`](https://huggingface.co/onnx-community/granite-embedding-30m-english-ONNX)**           | 30M           | 29.0 MB                                             | 384 (No)                                  | ~49                         | Apache 2.0                                                                                   |
| **[`onnx-community/granite-embedding-small-english-r2-ONNX`](https://huggingface.co/onnx-community/granite-embedding-small-english-r2-ONNX)** | 47M           | 50.1 MB                                             | 384 (No)                                  | 50.87                       | ModernBERT, 8192-token context (heavier than needed for short queries)                       |
| **[`minishlab/blink-8M`](https://huggingface.co/minishlab/blink-8M)** _(Nov 2026)_                                                            | 7.7M (static) | ~29 MB fp32 (no prebuilt ONNX yet; ~8 MB if `int8`) | 256                                       | ~38.9 (MTEB Ret.)           | Successor to `potion`; +7.6 pts retrieval over `potion-base-8M` with zero transformer layers |

### Larger 2026 Models (Heavier Browser Downloads)

Most 2026 MTEB leaderboard movement has occurred at **150M–600M+ parameters**, which are generally too heavy for a lightweight browser download compared to `bge-micro-v2`:

- **`UltraBERT-Embed-150M`** (Oct 2026, Apache 2.0, 151M, 768d, #52 MTEB Eng v2)
- **`onnx-community/embeddinggemma-300m-ONNX`** (300M, 168 MB WebGPU `q4f16` / 295 MB WASM `q8`, MRL 768→128d, 100+ languages)
- **`onnx-community/embeddinggemma-2-ONNX`** (Oct 2026, 270M text encoder + optional vision/audio, ~150 MB `q4f16`, MRL 768→128d; trades slight English-only score for native multimodality)
- **`MongoDB/voyage-4-nano`** (346M, 201 MB WebGPU `q4f16` / 402 MB WASM `q8`)
- **`harrier-oss-v1-0.6b`** & **`Qwen3-Embedding-0.6B`** (~540+ MB in browser)

### Why `MongoDB/mdbr-leaf-ir` Fits Movies Deluxe Best

1. **Huge quality jump for +5.5 MB:** 53.55 BEIR nDCG@10 (outperforming `bge-small-en-v1.5` at 51.65 and OpenAI `text-embedding-3-small` at 51.08) at **22.1 MB** `q8` ONNX.
2. **Smaller embeddings DB via MRL + quantization:** Native output is 768d, but Matryoshka Representation Learning (MRL) lets us truncate to **256d** (or **128d**) and optionally quantize vectors to **`int8`** or **binary**, shrinking the downloaded `sqlite-vec` DB by 33%–80%+ compared to `bge-micro-v2`'s 384d float32 DB.
3. **Asymmetric retrieval (54.03 BEIR):** `mdbr-leaf-ir` is distilled and vector-space-aligned to [`Snowflake/snowflake-arctic-embed-m-v1.5`](https://huggingface.co/Snowflake/snowflake-arctic-embed-m-v1.5) (109M). Movie documents can be embedded offline with the stronger 109M Snowflake model while user queries are embedded in the browser with the 22 MB `mdbr-leaf-ir` model.
4. **Implementation notes:**
   - Queries must be prefixed with `"Represent this sentence for searching relevant passages: "` (documents take no prefix).
   - Uses ONNX external data format (`model_quantized.onnx` + `model_quantized.onnx_data`).
   - Compatible with `@huggingface/transformers` v4 (`dtype: 'q8'`).

### Browser Runtime Note (WASM vs. WebGPU)

For small (<50M parameter) single-query embedding models, **WASM (`q8`/`uint8`)** remains faster and more practical than WebGPU (~8–12 ms per query, no 1–5 s shader compilation cold start, smaller quantized downloads, and universal browser support). WebGPU mainly pays off for >100M models or batched inference.

### Summary Recommendations

- **Primary upgrade (`bge-micro-v2` → `MongoDB/mdbr-leaf-ir`):** Best quality-to-size ratio for browser semantic search, especially paired with MRL 256d truncation and optional asymmetric offline indexing.
- **Static fallback (`potion-base-2M` → `minishlab/blink-8M`):** Worth revisiting once an official quantized ONNX export is available (or exported/quantized locally from its `model.safetensors`).

## Architecture

For detailed technical documentation on how embeddings are generated and used for vector search, see **[Embedding Generation & Vector Search Architecture](./architecture-embedding-generation.md)**.

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
