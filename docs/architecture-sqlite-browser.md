# SQLite Browser Architecture

## Overview

The Movies Deluxe application uses **SQLite WebAssembly** to run a full SQLite database directly in the browser. This provides fast, local-first querying without requiring a backend server.

## Key Components

### 1. SQLite WASM Module

The database is powered by `sqlite-wasm-vec`, a WebAssembly build of SQLite with the **sqlite-vec** extension for vector similarity search.

### 2. Database Worker

The `database.worker.ts` runs in a separate Web Worker thread to avoid blocking the main UI thread during heavy operations.

### 3. Attach/Detach Pattern

Embeddings are stored in a separate database file that can be dynamically attached and detached from the main database.

## Architecture Flow

```mermaid
flowchart TB
    subgraph Main["Main Thread"]
        Composable["useDatabase Composable"]
        UI["UI Components"]
    end

    subgraph Worker["Web Worker (database.worker.ts)"]
        Queue["Message Queue"]
        Handler["handleMessage()"]

        subgraph Core["SQLite Core"]
            SQLite["SQLite WASM"]
            MainDB["Main Database<br/>:memory:"]
            EmbeddingsDB["Embeddings DB<br/>embeddings_db"]
            VecExt["sqlite-vec<br/>Extension"]
        end

        Cache["Movie Cache<br/>Map<string, LightweightMovie>"]
    end

    subgraph Storage["Storage"]
        WASM["sqlite-wasm/"]
        MoviesDB["movies.db"]
        EmbDB["embeddings-{model}.db"]
    end

    UI -->|"init(url)"| Composable
    UI -->|"query(sql)"| Composable
    UI -->|"attachEmbeddings(modelId)"| Composable

    Composable -->|"postMessage()"| Queue
    Queue -->|"FIFO"| Handler

    Handler -->|"Initialize"| SQLite
    Handler -->|"Load"| MoviesDB
    Handler -->|"sqlite3_deserialize"| MainDB

    Handler -->|"Attach"| EmbDB
    Handler -->|"ATTACH DATABASE"| EmbeddingsDB

    SQLite -->|"Extension"| VecExt
    VecExt -->|"Vector Search"| EmbeddingsDB

    MainDB <-->|"JOIN Queries"| EmbeddingsDB
    Handler -->|"Cache Results"| Cache
    Handler -->|"Return"| Composable
```

## Initialization Flow

```mermaid
sequenceDiagram
    participant UI as UI Component
    participant Comp as useDatabase
    participant Worker as Database Worker
    participant SQLite as SQLite WASM
    participant DB as movies.db

    UI->>Comp: init(url, baseURL)
    Comp->>Worker: postMessage({type: 'init', ...})
    Worker->>SQLite: sqlite3InitModule()
    Note over SQLite: locateFile() resolves WASM path
    Worker->>DB: fetch(url)
    DB-->>Worker: ArrayBuffer
    Worker->>Worker: sqlite3_malloc()
    Worker->>Worker: Copy to WASM heap
    Worker->>SQLite: sqlite3_deserialize()
    Note over Worker: SQLITE_DESERIALIZE_FREEONCLOSE | READONLY
    Worker->>SQLite: SELECT COUNT(*) FROM movies
    SQLite-->>Worker: movie count
    Worker->>Worker: Fetch embedding_dimensions from config
    Worker-->>Comp: {type: 'init-success', totalMovies}
    Comp-->>UI: isReady = true
```

## Embeddings Attach/Detach Flow

```mermaid
sequenceDiagram
    participant UI as UI Component
    participant Comp as useDatabase
    participant Worker as Database Worker
    participant SQLite as SQLite WASM
    participant EmbDB as embeddings-{model}.db

    UI->>Comp: attachEmbeddings(modelId)
    Comp->>Worker: postMessage({type: 'attach-embeddings', ...})

    alt Already has embeddings
        Worker->>SQLite: DETACH DATABASE embeddings_db
    end

    Worker->>SQLite: ATTACH DATABASE ':memory:' AS embeddings_db
    Worker->>EmbDB: fetch(url)
    EmbDB-->>Worker: ArrayBuffer
    Worker->>SQLite: sqlite3_malloc()
    Worker->>SQLite: Copy to WASM heap
    Worker->>SQLite: sqlite3_deserialize(embeddings_db)
    SQLite-->>Worker: Success
    Worker->>SQLite: SELECT COUNT(*) FROM embeddings_db.vec_movies
    Worker-->>Comp: {type: 'attach-success', embeddingsCount}
    Comp-->>UI: embeddingsLoaded = true
```

## Query Execution Flow

```mermaid
sequenceDiagram
    participant UI as UI Component
    participant Comp as useDatabase
    participant Worker as Database Worker
    participant Cache as Movie Cache
    participant DB as In-Memory DB

    UI->>Comp: queryByIds(movieIds)
    Comp->>Comp: Build query with SQL builder
    Comp->>Worker: postMessage({type: 'query-by-ids', sql, params})

    Worker->>Worker: Check cache for each ID

    loop For cached movies
        Worker->>Cache: Get(movieId)
        Cache-->>Worker: LightweightMovie
    end

    alt Has uncached IDs
        Worker->>DB: EXEC(prebuiltSql, params)
        DB-->>Worker: Results
        Worker->>Worker: Transform rows
        Worker->>Cache: Set(movieId, movie)
    end

    Worker->>Worker: Sort by original ID order
    Worker-->>Comp: {result: movies[]}
    Comp-->>UI: Return movies
```

## Vector Search Flow

```mermaid
sequenceDiagram
    participant UI as UI Component
    participant VS as useVectorSearch
    participant BE as useBrowserEmbedding
    participant Comp as useDatabase
    participant Worker as Database Worker
    participant VecExt as sqlite-vec
    participant EmbDB as Embeddings DB

    UI->>VS: search(query)
    VS->>VS: ensureEmbeddingsLoaded()
    VS->>BE: init(provider)
    BE->>BE: Load embedding model
    BE-->>VS: Ready

    VS->>BE: embed(query)
    BE->>BE: Clean text & tokenize
    BE->>BE: Generate embedding
    BE-->>VS: Float32Array

    VS->>Comp: vectorSearch(embedding, limit)
    Comp->>Worker: postMessage({type: 'vector-search', ...})

    Worker->>VecExt: vec_movies_rowid(rowid, embedding)
    VecExt->>EmbDB: SELECT ... ORDER BY distance
    EmbDB-->>VecExt: Results with distance
    VecExt-->>Worker: Row IDs with distances

    Worker->>DB: JOIN with movies table
    DB-->>Worker: Complete movie data
    Worker->>Worker: Transform & cache
    Worker-->>Comp: {result: movies[]}
    Comp-->>VS: Return results
    VS-->>UI: Display similar movies
```

## Caching Strategy

Three-level caching provides optimal performance:

```mermaid
flowchart LR
    subgraph L1["L1: Worker Cache"]
        WC["Map<string, LightweightMovie>"]
    end

    subgraph L2["L2: Store Cache"]
        SC["useMovieStore<br/>lightweightMovieCache"]
    end

    subgraph L3["L3: Config Cache"]
        CC["useDatabase<br/>configCache"]
    end

    WC -->|"Fallback"| SC
    SC -->|"Fallback"| DB[("Database")]
    CC -->|"Metadata"| SQLite[("SQLite")]
```

| Cache Level | Location            | Purpose                       | Lifetime        |
| ----------- | ------------------- | ----------------------------- | --------------- |
| L1          | Database Worker     | Avoid re-querying same movies | Worker lifetime |
| L2          | Movie Store         | Reactive movie objects        | Page session    |
| L3          | Database Composable | Config/metadata               | Singleton       |

## Message Queue Pattern

```mermaid
flowchart LR
    A[UI Action] -->|"postMessage()"| B[Message Queue]
    B -->|"FIFO"| C{Processing?}
    C -->|"No"| D[Process Message]
    C -->|"Yes"| E[Wait]
    D -->|"handleMessage()"| F[Execute SQL]
    F -->|"postMessage()"| G[UI Callback]
    D -->|"Done"| C
```

The message queue ensures that database operations are processed sequentially, avoiding race conditions and maintaining data consistency.

## Performance Characteristics

- **Database Load**: ~1-2 seconds for main database (~200MB)
- **Embeddings Load**: ~0.5-1 seconds (~50-100MB)
- **Query Time**: <10ms for most queries
- **Vector Search**: ~20-50ms for similarity search
- **Cache Hit**: <1ms for cached movies

## File Structure

```
public/
├── sqlite-wasm/
│   ├── sqlite3.wasm          # SQLite WebAssembly binary
│   └── ...
├── data/
│   ├── movies.db             # Main movie database
│   ├── embeddings-bge-micro-movies.db
│   └── embeddings-potion-movies.db
app/
├── workers/
│   └── database.worker.ts    # Database Web Worker
├── composables/
│   └── useDatabase.ts        # Database composable
└── types/
    └── sqlite-wasm.ts        # TypeScript definitions
```
