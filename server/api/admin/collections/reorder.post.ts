import { defineEventHandler, readBody, createError } from 'h3'

interface ReorderPayload {
  collectionIds: string[]
}

export default defineEventHandler(async event => {
  const body = (await readBody(event)) as ReorderPayload
  const { collectionIds } = body

  if (!collectionIds || !Array.isArray(collectionIds)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'collectionIds array is required',
    })
  }

  try {
    const db = await loadCollectionsDatabase()
    const newDb: CollectionsDatabase = {
      _schema: db._schema,
    }

    // Add collections in the new order
    collectionIds.forEach(id => {
      if (db[id]) {
        newDb[id] = db[id]
      }
    })

    // Add any collections that were missing from the reorder list (safety)
    Object.keys(db).forEach(id => {
      if (!id.startsWith('_') && !newDb[id]) {
        newDb[id] = db[id]
      }
    })

    await saveCollectionsDatabase(newDb)

    return { success: true }
  } catch (error: unknown) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to reorder collections: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
})
