import { createError, defineEventHandler, readBody } from 'h3'
import {
  runAutoAuditFalseHits,
  runAutoCleanArchivePreviews,
  runAutoMatchUnmatched,
  runAutoResolveFalseHitQueue,
} from '#server/utils/autoPipeline'

type AutoTask =
  | 'clean_previews'
  | 'audit_false_hits'
  | 'resolve_false_hit_queue'
  | 'match_unmatched'

interface AutoRunBody {
  task?: string
  dryRun?: boolean
  limit?: number
  minConfidence?: number
  rematch?: boolean
  removeRedundant?: boolean
  allowGoogle?: boolean
  channel?: string
  model?: string
}

const VALID_TASKS: AutoTask[] = [
  'clean_previews',
  'audit_false_hits',
  'resolve_false_hit_queue',
  'match_unmatched',
]

export default defineEventHandler(async event => {
  const body = (await readBody<AutoRunBody>(event).catch(() => ({}) as AutoRunBody)) || {}

  if (!body.task || !VALID_TASKS.includes(body.task as AutoTask)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid task. Expected one of: ${VALID_TASKS.join(', ')}`,
    })
  }

  const task = body.task as AutoTask

  if (task === 'clean_previews') {
    return runAutoCleanArchivePreviews({
      dryRun: body.dryRun,
      limit: body.limit,
      removeRedundant: body.removeRedundant,
    })
  }

  if (task === 'audit_false_hits') {
    return runAutoAuditFalseHits({
      dryRun: body.dryRun,
      limit: body.limit,
      minConfidence: body.minConfidence,
      rematch: body.rematch,
      allowGoogle: body.allowGoogle,
      model: body.model,
    })
  }

  if (task === 'resolve_false_hit_queue') {
    return runAutoResolveFalseHitQueue({
      dryRun: body.dryRun,
      limit: body.limit,
      minConfidence: body.minConfidence,
      rematch: body.rematch,
      allowGoogle: body.allowGoogle,
      model: body.model,
    })
  }

  return runAutoMatchUnmatched({
    dryRun: body.dryRun,
    limit: body.limit,
    channel: body.channel,
    minConfidence: body.minConfidence,
    allowGoogle: body.allowGoogle,
    model: body.model,
  })
})
