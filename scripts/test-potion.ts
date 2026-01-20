import {
  getModelInfo,
  generatePotionEmbedding,
  initPotionPipeline,
  POTION_EMBEDDING_DIM,
} from './utils/potionEmbeddings'
import { createLogger } from '../server/utils/logger'

const logger = createLogger('Potion-Test')

async function main() {
  logger.info('Testing potion-base-2M embedding model...')
  logger.info(`Expected embedding dimension: ${POTION_EMBEDDING_DIM}`)

  // Initialize and get model info
  logger.info('Loading model...')
  await initPotionPipeline()
  logger.success('Model loaded!')

  const info = await getModelInfo()
  logger.info('Model inputs:', info.inputs)
  logger.info('Model outputs:', info.outputs)

  // Test embedding generation
  const testTexts = [
    'Hello world',
    'The quick brown fox jumps over the lazy dog',
    'Inception is a 2010 science fiction action film written and directed by Christopher Nolan',
  ]

  for (const text of testTexts) {
    logger.info(`\nGenerating embedding for: "${text.slice(0, 50)}..."`)

    try {
      const embedding = await generatePotionEmbedding(text)
      logger.success(`Embedding generated: ${embedding.length} dimensions`)
      logger.info(
        `First 5 values: [${embedding
          .slice(0, 5)
          .map(v => v.toFixed(4))
          .join(', ')}]`
      )

      // Verify normalization
      let norm = 0
      for (let i = 0; i < embedding.length; i++) {
        norm += embedding[i] * embedding[i]
      }
      norm = Math.sqrt(norm)
      logger.info(`L2 norm: ${norm.toFixed(6)} (should be ~1.0)`)
    } catch (err) {
      logger.error('Failed to generate embedding:', err)
    }
  }

  logger.success('\nTest complete!')
}

main().catch(err => {
  logger.error('Fatal error:', err)
  process.exit(1)
})
