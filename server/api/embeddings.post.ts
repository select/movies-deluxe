import { generateEmbedding } from '../utils/ollama'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { text, model } = body

  if (!text) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Text is required',
    })
  }

  const config = useRuntimeConfig()
  const host = config.ollamaHost as string

  try {
    const embedding = await generateEmbedding(text, model || 'nomic-embed-text', host)
    return { embedding }
  } catch (error) {
    console.error('Failed to generate embedding:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to generate embedding',
    })
  }
})
