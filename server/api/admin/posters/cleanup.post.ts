import { createError, defineEventHandler, readBody } from 'h3'
import {
  cleanupUnlistedPosters,
  type CleanupUnlistedPostersResult,
  type PosterCleanupScope,
} from '#server/utils/posterCleanup'

interface CleanupPostersBody {
  dryRun?: unknown
  scope?: unknown
}

export default defineEventHandler(async (event): Promise<CleanupUnlistedPostersResult> => {
  const body = ((await readBody(event)) ?? {}) as CleanupPostersBody

  let dryRun = false
  if (body.dryRun !== undefined) {
    if (typeof body.dryRun !== 'boolean') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid "dryRun" parameter. Must be a boolean.',
      })
    }
    dryRun = body.dryRun
  }

  let scope: PosterCleanupScope = 'listed'
  if (body.scope !== undefined) {
    if (body.scope !== 'listed' && body.scope !== 'admin') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid "scope" parameter. Must be "listed" or "admin".',
      })
    }
    scope = body.scope
  }

  return cleanupUnlistedPosters({ dryRun, scope })
})
