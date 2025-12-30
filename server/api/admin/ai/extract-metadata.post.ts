import { defineEventHandler, readBody, createError } from 'h3'
import { extractMovieMetadata } from '../../../utils/ollama'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const { title, description } = body

  if (!title) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Title is required',
    })
  }

  try {
    const extracted = await extractMovieMetadata(title, description)

    if (!extracted) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to extract metadata from Ollama',
      })
    }

    return {
      success: true,
      data: extracted,
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `AI extraction failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
