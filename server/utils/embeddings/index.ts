// Only export database utilities at the top level.
// Model-specific utilities (_nomic.ts, _bge.ts) are prefixed with underscore
// to prevent Nitro auto-import and should be dynamically imported.
//
// Usage:
//   const nomicModule = await import('./_nomic')
//   const bgeModule = await import('./_bge')
//
// NOTE: Potion model is not available from the server due to onnxruntime-node
// compatibility issues. Use CLI script: pnpm tsx scripts/generate-embeddings-potion.ts

export * from './database'
