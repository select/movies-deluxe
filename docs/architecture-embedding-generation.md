# Embedding Generation and Vector Search Architecture

## Overview

Movies Deluxe provides **semantic search** capabilities using embedding models that run directly in the browser. Two models are supported: **BGE-micro-v2** (384 dimensions) and **Potion-base-2M** (64 dimensions).

For model comparisons, dimensions, and database generation options, see **[Embedding Models](./embedding-models.md)**.

## Key Components

### 1. Embedding Worker

Runs in a separate Web Worker thread to avoid blocking the UI during model loading and inference.

### 2. Embedding Providers

Two providers implement the same interface:

- **BGE Provider**: Uses HuggingFace Transformers.js
- **Potion Provider**: Uses ONNX Runtime Web

### 3. Vector Search

Powered by **sqlite-vec** extension in the browser-based SQLite database.

## Architecture Flow

```mermaid
flowchart TB
    subgraph Main["Main Thread"]
        UI["UI Components"]
        VS["useVectorSearch Composable"]
        BE["useBrowserEmbedding Composable"]
    end

    subgraph Worker["Embedding Worker"]
        Handler["Message Handler"]

        subgraph Providers["Embedding Providers"]
            BGE["BGE Provider<br/>(transformers.js)"]
            Potion["Potion Provider<br/>(onnxruntime-web)"]
        end
    end

    subgraph Models["Local Models"]
        BGEModel["BGE-micro-v2<br/>384d dimensions"]
        PotionModel["Potion-base-2M<br/>64d dimensions"]
    end

    subgraph DB["SQLite Database"]
        VecExt["sqlite-vec Extension"]
        VecTable["vec_movies Table<br/>(rowid, embedding)"]
    end

    UI -->|"search(query)"| VS
    VS -->|"init(provider)"| BE
    VS -->|"embed(text)"| BE
    BE -->|"postMessage()"| Handler

    Handler -->|"Init BGE"| BGE
    Handler -->|"Init Potion"| Potion

    BGE -->|"Load"| BGEModel
    Potion -->|"Load"| PotionModel

    Handler -->|"Generate Embedding"| Providers
    Providers -->|"Return embedding"| BE

    VS -->|"vectorSearch(embedding)"| VecExt
    VecExt -->|"Similarity Search"| VecTable
    VecTable -->|"Return results"| VS
    VS -->|"Display"| UI
```

## Embedding Provider Initialization

### BGE Provider (Transformers.js)

```mermaid
sequenceDiagram
    participant UI as UI Component
    participant BE as useBrowserEmbedding
    participant Worker as Embedding Worker
    participant BGE as BgeEmbeddingProvider
    participant HF as HuggingFace Transformers.js
    participant Model as BGE-micro-v2 Model

    UI->>BE: init('bge')
    BE->>Worker: postMessage({type: 'init', provider: 'bge'})
    Worker->>BGE: init(baseURL, onProgress)
    BGE->>HF: pipeline('feature-extraction', modelPath)

    loop Model Loading
        HF->>Model: Fetch model files
        Model-->>HF: Binary data
        HF->>HF: Load weights
        HF->>BGE: progress_callback()
        BGE->>Worker: postMessage({type: 'progress', progress})
        Worker->>BE: Update progress ref
    end

    HF-->>BGE: FeatureExtractionPipeline
    BGE->>Worker: postMessage({type: 'ready', provider: 'bge'})
    Worker->>BE: isReady = true
    BE-->>UI: Ready
```

### Potion Provider (ONNX Runtime)

```mermaid
sequenceDiagram
    participant UI as UI Component
    participant BE as useBrowserEmbedding
    participant Worker as Embedding Worker
    participant Potion as PotionEmbeddingProvider
    participant ORT as ONNX Runtime Web
    participant Model as Potion-base-2M Model

    UI->>BE: init('potion')
    BE->>Worker: postMessage({type: 'init', provider: 'potion'})
    Worker->>Potion: init(baseURL, onProgress)

    Potion->>Model: fetch('tokenizer.json')
    Model-->>Potion: Tokenizer data
    Potion->>Potion: parseTokenizer()
    Potion->>ORT: InferenceSession.create(model.onnx)

    loop Model Loading
        ORT->>Model: Fetch ONNX model
        Model-->>ORT: Binary data
        ORT->>ORT: Initialize WASM runtime
    end

    ORT-->>Potion: InferenceSession
    Potion->>Worker: postMessage({type: 'ready', provider: 'potion'})
    Worker->>BE: isReady = true
    BE-->>UI: Ready
```

## Text Preprocessing Pipeline

Both providers use the same text cleaning algorithm:

```mermaid
flowchart LR
    A["Input Text"] --> B["Remove URLs"]
    B --> C["Remove Emails"]
    C --> D["Normalize Accents"]
    D --> E["Remove Diacritics"]
    E --> F["ASCII Only"]
    F --> G["Collapse Spaces"]
    G --> H["Cleaned Text"]
```

```javascript
function cleanTextForEmbedding(text) {
  return text
    .replace(/https?:\/\/[^\s]+/gi, '') // Remove URLs
    .replace(/www\.[^\s]+/gi, '') // Remove www links
    .replace(/bit\.ly\/[^\s]+/gi, '') // Remove short links
    .replace(/[\w.-]+@[\w.-]+\.\w+/g, '') // Remove emails
    .normalize('NFD') // Unicode normalization
    .replace(/[\u0300-\u036f]/g, '') // Remove combining marks
    .replace(/[^\x20-\x7E]/g, ' ') // ASCII only
    .replace(/\s+/g, ' ') // Collapse spaces
    .trim()
}
```

## Embedding Generation Flow

### BGE Generation

```mermaid
sequenceDiagram
    participant UI as UI Component
    participant BE as useBrowserEmbedding
    participant Worker as Embedding Worker
    participant BGE as BgeEmbeddingProvider
    participant Pipeline as Transformers Pipeline

    UI->>BE: embed("sci-fi movies about time travel")
    BE->>Worker: postMessage({type: 'embed', text, id})
    Worker->>BGE: generateEmbedding(text)
    BGE->>BGE: cleanTextForEmbedding()
    Note right of BGE: Removes URLs, normalizes accents, ASCII only
    BGE->>Pipeline: pipeline(cleanedText, {pooling: 'mean', normalize: true})
    Pipeline->>Pipeline: Tokenize -> Model Inference -> Pool
    Pipeline-->>BGE: Tensor output
    BGE->>BGE: Convert to Float32Array
    BGE-->>Worker: Float32Array[384]
    Worker->>Worker: postMessage({type: 'embedding', embedding}, [transfer])
    Note right of Worker: Transfer buffer for performance
    Worker-->>BE: Resolve promise
    BE-->>UI: Return embedding
```

### Potion Generation

```mermaid
sequenceDiagram
    participant UI as UI Component
    participant BE as useBrowserEmbedding
    participant Worker as Embedding Worker
    participant Potion as PotionEmbeddingProvider
    participant Tokenizer as WordPiece Tokenizer
    participant ONNX as ONNX Runtime

    UI->>BE: embed("sci-fi movies about time travel")
    BE->>Worker: postMessage({type: 'embed', text, id})
    Worker->>Potion: generateEmbedding(text)
    Potion->>Potion: cleanTextForEmbedding()
    Potion->>Tokenizer: tokenize(cleanedText)

    loop WordPiece Tokenization
        Tokenizer->>Tokenizer: Check vocabulary
        alt Known word
            Tokenizer->>Tokenizer: Add token ID
        else Unknown word
            Tokenizer->>Tokenizer: Split into subwords (##prefix)
        end
    end

    Tokenizer-->>Potion: Token IDs [CLS, tokens..., SEP]
    Potion->>ONNX: Create tensors (input_ids, offsets)
    ONNX->>ONNX: Run inference session
    ONNX-->>Potion: Raw embeddings
    Potion->>Potion: L2 Normalize
    Potion-->>Worker: Float32Array[64]
    Worker->>Worker: postMessage({type: 'embedding', embedding}, [transfer])
    Worker-->>BE: Resolve promise
    BE-->>UI: Return embedding
```

## Semantic Search End-to-End

```mermaid
sequenceDiagram
    participant User as User
    participant Search as SearchHeader
    participant VS as useVectorSearch
    participant BE as useBrowserEmbedding
    participant DB as useDatabase
    participant Worker as Database Worker
    participant VecExt as sqlite-vec

    User->>Search: Type "movies about time travel"
    Search->>VS: search(query)

    rect rgb(230, 245, 255)
        Note over VS: Step 1: Ensure Embeddings
        VS->>VS: ensureEmbeddingsLoaded()
        alt Not loaded
            VS->>DB: attachEmbeddings('bge-micro')
            DB->>Worker: Load embeddings DB
        end
    end

    rect rgb(255, 245, 230)
        Note over VS,BE: Step 2: Generate Query Embedding
        VS->>BE: init('bge')
        alt Not ready
            BE->>Worker: Load model
        end
        VS->>BE: embed(query)
        BE->>Worker: Process text
        Worker->>Worker: Clean & tokenize
        Worker->>Worker: Run inference
        Worker-->>BE: embedding[384]
        BE-->>VS: embedding
    end

    rect rgb(230, 255, 230)
        Note over VS,VecExt: Step 3: Vector Search
        VS->>DB: vectorSearch(embedding, limit=20)
        DB->>Worker: Execute search
        Worker->>VecExt: vec_top_k(embedding, k=20)
        VecExt->>VecExt: Calculate cosine similarity
        VecExt-->>Worker: Top movie IDs with distances
        Worker->>Worker: JOIN with movies table
        Worker-->>DB: Movie results with metadata
        DB-->>VS: results[]
    end

    VS->>Search: Return results
    Search->>User: Display similar movies
```

## Find Similar Movies Flow

```mermaid
sequenceDiagram
    participant User as User
    participant Detail as MovieDetail.vue
    participant VS as useVectorSearch
    participant DB as useDatabase
    participant Worker as Database Worker
    participant VecExt as sqlite-vec

    User->>Detail: Click "Find Similar"
    Detail->>VS: findSimilar(movieId, limit=10)

    rect rgb(230, 245, 255)
        Note over VS: Step 1: Get Movie Embedding
        VS->>VS: ensureEmbeddingsLoaded()
        VS->>DB: query('SELECT embedding FROM vec_movies WHERE movieId = ?', [movieId])
        DB->>Worker: Execute query
        Worker->>VecExt: Fetch embedding blob
        VecExt-->>Worker: Uint8Array
        Worker-->>DB: embedding data
        DB-->>VS: embedding
        VS->>VS: Convert Uint8Array → Float32Array
    end

    rect rgb(230, 255, 230)
        Note over VS,VecExt: Step 2: Search Similar
        VS->>DB: vectorSearch(embedding, limit=11)
        Note right of VS: +1 to exclude the movie itself
        DB->>Worker: Execute vector search
        Worker->>VecExt: vec_top_k(embedding, k=11)
        VecExt->>VecExt: Find nearest neighbors
        VecExt-->>Worker: Results with distances
        Worker->>Worker: Filter out current movie
        Worker-->>DB: Similar movies
        DB-->>VS: results[]
    end

    VS->>Detail: Return similar movies
    Detail->>User: Display "More Like This"
```

## Provider Comparison

```mermaid
flowchart TB
    subgraph BGE["BGE-micro-v2"]
        B1["Library: transformers.js"]
        B2["Dimensions: 384"]
        B3["Size: ~30MB"]
        B4["Quality: High"]
        B5["Speed: Fast"]
        B6["Tokenization: Auto"]
    end

    subgraph Potion["Potion-base-2M"]
        P1["Library: onnxruntime-web"]
        P2["Dimensions: 64"]
        P3["Size: ~20MB"]
        P4["Quality: Good"]
        P5["Speed: Very Fast"]
        P6["Tokenization: WordPiece"]
    end

    B1 --- P1
    B2 --- P2
    B3 --- P3
    B4 --- P4
    B5 --- P5
    B6 --- P6
```

| Feature             | BGE-micro-v2    | Potion-base-2M     |
| ------------------- | --------------- | ------------------ |
| **Dimensions**      | 384             | 64                 |
| **Model Size**      | ~30MB           | ~20MB              |
| **Library**         | transformers.js | onnxruntime-web    |
| **Quality**         | High            | Good               |
| **Inference Speed** | Fast            | Very Fast          |
| **Use Case**        | General search  | Fast mobile search |

## Message Protocol

```mermaid
sequenceDiagram
    participant Main as Main Thread
    participant Worker as Embedding Worker

    Note over Main,Worker: Initialization
    Main->>Worker: {type: 'init', provider: 'bge\|potion', baseURL}
    Worker-->>Main: {type: 'progress', progress: 0.3}
    Worker-->>Main: {type: 'ready', provider}

    Note over Main,Worker: Embedding Generation
    Main->>Worker: {type: 'embed', text, id}
    Worker-->>Main: {type: 'embedding', id, embedding}
    Note right of Worker: Buffer is transferred, not copied

    Note over Main,Worker: Cleanup
    Main->>Worker: {type: 'dispose'}
    Worker-->>Main: {type: 'disposed'}

    Note over Main,Worker: Error Handling
    Worker-->>Main: {type: 'error', message, id}
```

## Performance Characteristics

| Operation            | BGE-micro-v2 | Potion-base-2M |
| -------------------- | ------------ | -------------- |
| Model Load           | 5-10 seconds | 3-5 seconds    |
| Embedding Generation | ~100ms       | ~50ms          |
| Vector Search        | ~20-50ms     | ~20-50ms       |
| Memory Usage         | ~50MB        | ~35MB          |

## File Structure

```
public/
├── models/
│   ├── bge-micro-v2/
│   │   ├── config.json
│   │   ├── model.safetensors
│   │   ├── tokenizer.json
│   │   └── tokenizer_config.json
│   └── potion-base-2M/
│       ├── config.json
│       ├── model.onnx
│       └── tokenizer.json
app/
├── workers/
│   └── embedding.worker.ts
├── composables/
│   ├── useBrowserEmbedding.ts
│   └── useVectorSearch.ts
├── utils/
│   └── embedding/
│       ├── bgeEmbedding.ts
│       └── potionEmbedding.ts
└── types/
    └── embedding.ts
```
