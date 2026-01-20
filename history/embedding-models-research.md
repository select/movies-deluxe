# Embedding Models Research for Movie Semantic Search

**Date**: January 20, 2026  
**Purpose**: Evaluate embedding models for implementing semantic search in the movies-deluxe application

---

## Executive Summary

This document provides a comprehensive analysis of embedding models suitable for movie semantic search, including performance characteristics, cost considerations, and implementation recommendations. The research covers both proprietary and open-source models, with a focus on practical deployment scenarios.

### Key Findings

- **Best Overall Performance**: OpenAI text-embedding-3-large (3072d) and Cohere embed-english-v3.0 (1024d)
- **Best Open-Source**: mixedbread-ai/mxbai-embed-large-v1 (1024d, MTEB: 54.39)
- **Best Speed/Performance Balance**: sentence-transformers/all-mpnet-base-v2 (768d)
- **Current Model**: nomic-ai/nomic-embed-text-v1 (768d, MTEB: 53.01)

---

## 1. Popular Embedding Models

### 1.1 Current Model: Nomic Embed

**Model**: nomic-ai/nomic-embed-text-v1 / nomic-embed-text-v1.5

| Specification    | Details                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Dimensions       | 768                                                                                                                               |
| Context Length   | 8192 tokens                                                                                                                       |
| MTEB Score       | 53.01 (Retrieval)                                                                                                                 |
| License          | Apache-2                                                                                                                          |
| Open Source      | Yes (weights, training data, code)                                                                                                |
| Special Features | - First fully reproducible embedding model<br>- Open training data<br>- Matryoshka support (v1.5)<br>- Outperforms OpenAI ada-002 |

**Performance**:

- Better than OpenAI ada-002 on 2/3 benchmarks
- Strong on long-context tasks (LoCo benchmark)
- 87.7% performance retention with binary quantization

**Cost** (250M embeddings):

- Float32: 715.26GB RAM, $2,717/mo
- Binary: 22.35GB RAM, $85/mo (87.7% performance)

### 1.2 OpenAI Models

#### text-embedding-3-small

| Specification    | Details                            |
| ---------------- | ---------------------------------- |
| Dimensions       | 1536 (adjustable)                  |
| Context Length   | 8192 tokens                        |
| MTEB Score       | 62.3%                              |
| Pricing          | $0.02 / 1M tokens                  |
| Special Features | Native dimension reduction support |

**Cost** (250M embeddings):

- Float32: 1430.51GB RAM, $5,435/mo

#### text-embedding-3-large

| Specification  | Details           |
| -------------- | ----------------- |
| Dimensions     | 3072 (adjustable) |
| Context Length | 8192 tokens       |
| MTEB Score     | 64.6%             |
| Pricing        | $0.13 / 1M tokens |

**Cost** (250M embeddings):

- Float32: 2861.02GB RAM, $10,871/mo

#### text-embedding-ada-002 (Legacy)

| Specification | Details                 |
| ------------- | ----------------------- |
| Dimensions    | 1536                    |
| MTEB Score    | 61.0%                   |
| Pricing       | $0.10 / 1M tokens       |
| Status        | Superseded by v3 models |

**Cost** (250M embeddings):

- Float32: 1430.51GB RAM, $5,435/mo

### 1.3 Top Open-Source Models

#### mixedbread-ai/mxbai-embed-large-v1

| Specification | Details                                       |
| ------------- | --------------------------------------------- |
| Dimensions    | 1024                                          |
| MTEB Score    | 54.39 (best open-source)                      |
| License       | Apache-2                                      |
| Quantization  | Excellent (96.45% with binary, 97% with int8) |

**Cost** (250M embeddings):

- Float32: 953.67GB, $3,623/mo
- Int8: 238.41GB, $905/mo (97% performance)
- Binary: 29.80GB, $113.25/mo (96.45% performance)

**Best for**: Production deployments requiring excellent performance with cost optimization

#### sentence-transformers/all-mpnet-base-v2

| Specification | Details                                     |
| ------------- | ------------------------------------------- |
| Dimensions    | 768                                         |
| License       | Apache-2                                    |
| Use Case      | General purpose, balanced speed/performance |

**Cost** (250M embeddings):

- Float32: 715.26GB, $2,717/mo

**Best for**: Speed/performance tradeoff scenarios

#### BAAI/bge-large-en-v1.5

| Specification | Details                   |
| ------------- | ------------------------- |
| Dimensions    | 1024                      |
| License       | MIT                       |
| Performance   | Strong on retrieval tasks |

**Cost** (250M embeddings):

- Float32: 953.67GB, $3,623/mo

#### intfloat/e5-base-v2

| Specification | Details                                  |
| ------------- | ---------------------------------------- |
| Dimensions    | 768                                      |
| MTEB Score    | 50.77                                    |
| Quantization  | Good int8 (94.68%), poor binary (74.77%) |

**Note**: Shows dimension collapse issues with binary quantization

### 1.4 Sentence Transformers Models

Popular models from the sentence-transformers library:

1. **all-MiniLM-L6-v2** (384d) - Fast, lightweight, decent performance
2. **all-mpnet-base-v2** (768d) - Recommended balanced model
3. **all-distilroberta-v1** (768d) - Fast distilled model
4. **paraphrase-multilingual-mpnet-base-v2** (768d) - Multilingual support

### 1.5 Specialized Models

#### Cohere embed-english-v3.0

| Specification | Details                                       |
| ------------- | --------------------------------------------- |
| Dimensions    | 1024                                          |
| MTEB Score    | 55.0 (best overall)                           |
| Pricing       | API-based                                     |
| Quantization  | Excellent (100% with int8, 94.6% with binary) |

**Best for**: Maximum performance with proprietary API

---

## 2. Quantization Techniques

Quantization reduces memory usage and improves retrieval speed at the cost of minor accuracy degradation.

### 2.1 Binary Quantization

**Compression**: 32x (float32 → 1 bit per dimension)

**How it works**:

- Threshold normalized embeddings at 0
- Values > 0 → 1, values ≤ 0 → 0
- Use Hamming Distance for fast comparison
- Optional rescoring with float32 query embeddings

**Performance Impact**:

| Model                 | Original MTEB | Binary MTEB | Retention | Memory Savings |
| --------------------- | ------------- | ----------- | --------- | -------------- |
| mxbai-embed-large-v1  | 54.39         | 52.46       | 96.45%    | 32x            |
| nomic-embed-text-v1.5 | 53.01         | 46.49       | 87.7%     | 32x            |
| Cohere-v3.0           | 55.0          | 52.3        | 94.6%     | 32x            |
| all-MiniLM-L6-v2      | 41.66         | 39.07       | 93.79%    | 32x            |

**Speed Benefits**:

- Up to 45x faster retrieval
- Hamming Distance computes in ~2 CPU cycles

**When NOT to use**:

- Embeddings < 1024 dimensions (insufficient information)
- High precision requirements (> 99% accuracy needed)

### 2.2 Scalar (int8) Quantization

**Compression**: 4x (float32 → int8)

**How it works**:

- Map float32 range to 256 discrete int8 levels (-128 to 127)
- Requires calibration dataset to determine buckets
- Optional rescoring for better accuracy

**Performance Impact**:

| Model                | Original MTEB | Int8 MTEB | Retention | Memory Savings |
| -------------------- | ------------- | --------- | --------- | -------------- |
| mxbai-embed-large-v1 | 54.39         | 52.79     | 97%       | 4x             |
| Cohere-v3.0          | 55.0          | 55.0      | 100%      | 4x             |
| e5-base-v2           | 50.77         | 47.54     | 94.68%    | 4x             |
| all-MiniLM-L6-v2     | 41.66         | 37.82     | 90.79%    | 4x             |

**Speed Benefits**:

- Up to 4.8x faster retrieval (average 3.66x)

### 2.3 Combined Approach (Binary + Scalar)

**Best Practice Pipeline**:

1. Store binary embeddings in RAM (5.2GB for 41M vectors)
2. Store int8 embeddings on disk (47.5GB for 41M vectors)
3. Search with binary index (fast, approximate)
4. Rescore top-k with int8 embeddings (accurate)

**Results**:

- 5GB RAM instead of 200GB
- 52GB disk instead of 200GB
- Maintains high accuracy
- Very fast retrieval

### 2.4 Matryoshka Embeddings

**Models Supporting MRL**:

- nomic-ai/nomic-embed-text-v1.5
- mixedbread-ai/mxbai-embed-2d-large-v1
- OpenAI text-embedding-3-\*

**Benefits**:

- Reduce dimensions without retraining
- Use only first n dimensions
- Example: nomic 768d → 256d retains 95.8% performance (3x compression)

**Can combine with quantization** for extreme compression:

- 768d → 128d (MRL) → binary = 256x effective compression

---

## 3. Implementation Recommendations

### 3.1 For Movie Semantic Search

**Recommended Model**: **mixedbread-ai/mxbai-embed-large-v1**

**Rationale**:

- Best open-source performance (MTEB: 54.39)
- Excellent quantization support
- Apache-2 license
- 1024 dimensions (good information density)
- Strong on retrieval tasks

**Configuration**:

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("mixedbread-ai/mxbai-embed-large-v1")
```

**Alternative Options**:

1. **Stay with Nomic** (nomic-ai/nomic-embed-text-v1.5)

   - Current model, minimal migration
   - Good performance (MTEB: 53.01)
   - Open source and reproducible
   - Matryoshka support

2. **Cost-Optimized** (sentence-transformers/all-MiniLM-L6-v2)

   - 384 dimensions
   - Very fast
   - Lower memory footprint
   - Acceptable performance

3. **Maximum Performance** (API-based)
   - Cohere embed-english-v3.0 (best overall)
   - OpenAI text-embedding-3-large
   - Requires API costs

### 3.2 Vector Database Strategy

#### Current Setup

- Model: nomic-embed-text-v1
- Dimensions: 768
- Database: Likely named after model

#### Migration Strategy

**Option A: Keep Multiple Models (Recommended)**

```
databases/
  ├── embeddings_nomic_768.db      # Existing
  ├── embeddings_mxbai_1024.db     # New, better performance
  └── embeddings_minilm_384.db     # Optional, for speed tests
```

**Benefits**:

- Compare performance side-by-side
- Gradual migration
- A/B testing capability
- Rollback option

**Database Naming Convention**:

```
embeddings_{model-name}_{dimensions}.db
embeddings_{model-name}_{dimensions}_quantized.db
```

Examples:

- `embeddings_nomic_768.db`
- `embeddings_mxbai_1024.db`
- `embeddings_mxbai_1024_binary.db`
- `embeddings_openai_1536.db`

**Option B: Replace Existing**

- Drop old database
- Re-embed all content
- Single model deployment
- Simpler maintenance

### 3.3 Quantization Strategy

**For Production (>10K movies)**:

```python
from sentence_transformers import SentenceTransformer
from sentence_transformers.quantization import quantize_embeddings

model = SentenceTransformer("mixedbread-ai/mxbai-embed-large-v1")

# Get embeddings
embeddings = model.encode(texts)

# Quantize to binary
binary_embeddings = quantize_embeddings(
    embeddings,
    precision="binary"  # or "ubinary" for unsigned
)

# Or int8 with calibration
int8_embeddings = quantize_embeddings(
    embeddings,
    precision="int8",
    calibration_embeddings=calibration_embeddings
)
```

**Recommended Setup**:

1. **Binary index** in RAM for fast initial retrieval
2. **Int8 index** on disk for rescoring
3. **Oversampling**: 2.0-3.0x
4. **Enable rescoring**: Yes

**Expected Results**:

- 96-97% accuracy retention
- 20-40x speed improvement
- 32x memory reduction

### 3.4 Cost-Benefit Analysis

**Scenario: 100K movies with metadata**

| Setup             | Storage | RAM   | Performance | Cost/mo            |
| ----------------- | ------- | ----- | ----------- | ------------------ |
| Nomic float32     | 286GB   | 286GB | 100%        | $1,087             |
| Nomic binary      | 22GB    | 22GB  | 87.7%       | $85                |
| mxbai float32     | 381GB   | 381GB | 100%        | $1,449             |
| mxbai int8        | 95GB    | 95GB  | 97%         | $362               |
| mxbai binary      | 30GB    | 30GB  | 96.45%      | $114               |
| mxbai binary+int8 | 125GB   | 30GB  | 96.45%      | $114 RAM + storage |

**Recommendation**: **mxbai with binary+int8 quantization**

- Best performance/cost ratio
- 96.45% accuracy (acceptable for search)
- Dramatic cost savings
- Fast retrieval

---

## 4. Best Practices

### 4.1 Managing Multiple Embedding Models

**Configuration File Approach**:

```javascript
// config/embedding-models.js
export const embeddingModels = {
  nomic: {
    name: 'nomic-ai/nomic-embed-text-v1.5',
    dimensions: 768,
    dbPath: 'embeddings_nomic_768.db',
    contextLength: 8192,
  },
  mxbai: {
    name: 'mixedbread-ai/mxbai-embed-large-v1',
    dimensions: 1024,
    dbPath: 'embeddings_mxbai_1024.db',
    contextLength: 512,
    quantized: {
      binary: 'embeddings_mxbai_1024_binary.db',
      int8: 'embeddings_mxbai_1024_int8.db',
    },
  },
}
```

**Selection Logic**:

```javascript
// Choose model based on query type
function selectModel(queryType) {
  switch (queryType) {
    case 'semantic':
      return models.mxbai // Best accuracy
    case 'fast':
      return models.minilm // Fastest
    case 'balanced':
      return models.nomic // Current default
  }
}
```

### 4.2 Database Naming Conventions

**Standard Format**:

```
{purpose}_{model}_{dimensions}_{variant}.{ext}

Examples:
- embeddings_mxbai_1024.db
- embeddings_mxbai_1024_binary.db
- embeddings_nomic_768_quantized.db
- embeddings_openai_3072.db
```

**Benefits**:

- Clear identification
- Easy management
- Support for variants
- Future-proof

### 4.3 Migration Process

1. **Prepare**:

   - Choose new model
   - Set up new database
   - Create embedding script

2. **Parallel Phase**:

   - Keep old model active
   - Generate new embeddings
   - Test side-by-side

3. **Switch**:

   - Update configuration
   - Point queries to new model
   - Monitor performance

4. **Cleanup**:
   - Verify new model works
   - Keep old database as backup (1-2 weeks)
   - Delete old database

### 4.4 Performance Testing

**Key Metrics**:

- **Latency**: Query response time
- **Recall@10**: Top 10 accuracy
- **Throughput**: Queries per second
- **Memory**: RAM usage
- **Cost**: Monthly hosting costs

**Test Process**:

1. Create test query set (50-100 movie searches)
2. Run against each model
3. Measure metrics
4. Compare results
5. Choose winner

---

## 5. Advanced Considerations

### 5.1 Hybrid Search

Combine embeddings with keyword search:

```
Final Score = α × Vector Score + (1-α) × BM25 Score
```

**Benefits**:

- Better handling of exact matches
- Improved rare term handling
- More robust retrieval

### 5.2 Re-ranking

**Pipeline**:

1. Fast retrieval with binary embeddings (top 100)
2. Rescore with int8 (top 40)
3. Re-rank with cross-encoder (top 10)

**Cross-Encoder Models**:

- `cross-encoder/ms-marco-MiniLM-L-12-v2`
- `cross-encoder/ms-marco-TinyBERT-L-6-v2`

### 5.3 Monitoring and Evaluation

**Track**:

- Query latency percentiles (p50, p95, p99)
- Cache hit rates
- Failed queries
- User feedback (clicks, dwell time)

**Tools**:

- MTEB benchmark for offline evaluation
- A/B testing for online evaluation
- User satisfaction surveys

---

## 6. Vector Database Support

### 6.1 Binary Quantization Support

| Database | Binary Support | Notes                       |
| -------- | -------------- | --------------------------- |
| Faiss    | Yes            | Native binary indexes       |
| USearch  | Yes            | Fast binary support         |
| Qdrant   | Yes            | Through binary quantization |
| Weaviate | Yes            | BQ compression              |
| Milvus   | Yes            | Binary indexes              |
| Chroma   | Partial        | Limited support             |

### 6.2 Scalar (int8) Support

| Database      | Int8 Support | Notes               |
| ------------- | ------------ | ------------------- |
| Faiss         | Yes          | IndexHNSWSQ         |
| USearch       | Yes          | Native support      |
| Qdrant        | Yes          | Scalar quantization |
| Weaviate      | Yes          | Compression         |
| Milvus        | Yes          | IVF_SQ8             |
| OpenSearch    | Yes          | Native support      |
| Elasticsearch | Yes          | Byte-sized vectors  |

### 6.3 Current Project Database

**Unknown** - Need to check:

```bash
# Check for vector database setup
grep -r "vector" app/server/
grep -r "embedding" app/server/
grep -r "faiss\|qdrant\|chroma" package.json
```

---

## 7. Implementation Checklist

### Phase 1: Research & Planning ✅

- [x] Research embedding models
- [x] Document options
- [x] Compare performance
- [x] Analyze costs

### Phase 2: Model Selection

- [ ] Choose primary model
- [ ] Choose fallback model
- [ ] Define database naming convention
- [ ] Plan migration strategy

### Phase 3: Implementation

- [ ] Set up new embedding model
- [ ] Create new vector database
- [ ] Implement quantization (if using)
- [ ] Create embedding generation script

### Phase 4: Migration

- [ ] Generate embeddings for existing content
- [ ] Populate new database
- [ ] Test search quality
- [ ] Compare with old model

### Phase 5: Deployment

- [ ] Update search API
- [ ] Configure database connection
- [ ] Set up monitoring
- [ ] Deploy to production

### Phase 6: Validation

- [ ] Monitor performance metrics
- [ ] Collect user feedback
- [ ] A/B test if possible
- [ ] Optimize parameters

---

## 8. Recommended Next Steps

1. **Immediate**:

   - Choose between staying with Nomic or upgrading to mxbai
   - Decision factors: performance needs vs migration effort

2. **Short-term** (1-2 weeks):

   - Set up test with new model
   - Generate embeddings for sample dataset
   - Compare search quality

3. **Medium-term** (1 month):

   - Implement quantization for cost savings
   - Full migration if new model chosen
   - Performance tuning

4. **Long-term**:
   - Monitor for newer models
   - Consider hybrid search
   - Implement re-ranking if needed

---

## 9. References

### Documentation

- [Nomic Embed Technical Report](https://static.nomic.ai/reports/2024_Nomic_Embed_Text_Technical_Report.pdf)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [Sentence Transformers Docs](https://www.sbert.net/)
- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard)

### Key Papers

- [Matryoshka Representation Learning](https://arxiv.org/abs/2205.13147)
- [Binary Quantization (Yamada et al.)](https://arxiv.org/abs/2106.00882)
- [Text Embeddings by Weakly-Supervised Contrastive Pre-training](https://arxiv.org/abs/2212.03533)

### Tutorials & Guides

- [HuggingFace: Binary and Scalar Quantization](https://huggingface.co/blog/embedding-quantization)
- [Qdrant: Binary Quantization Guide](https://qdrant.tech/articles/binary-quantization/)
- [Qdrant: Scalar Quantization](https://qdrant.tech/articles/scalar-quantization/)

---

## 10. Conclusion

**For the movies-deluxe project, we recommend**:

1. **Model**: mixedbread-ai/mxbai-embed-large-v1

   - Best open-source performance
   - Excellent quantization support
   - Good balance of speed/accuracy/cost

2. **Quantization**: Binary + int8 combined approach

   - Binary in RAM for fast retrieval
   - int8 on disk for accurate rescoring
   - 96.45% accuracy retention
   - 30x memory reduction

3. **Database Naming**: `embeddings_mxbai_1024_binary.db`

   - Clear, descriptive
   - Includes key specs
   - Easy to manage

4. **Migration**: Gradual parallel approach
   - Keep current nomic model active
   - Test new model in parallel
   - Switch when confident
   - Minimal risk

**Expected Benefits**:

- Better search quality (+1-2 MTEB points)
- Lower hosting costs (30x memory reduction)
- Faster queries (20-40x speedup)
- Future-proof architecture

**Estimated Effort**: 2-3 days for full implementation and testing
