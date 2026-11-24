import { defineEventHandler, readBody, createError } from 'h3'
import type { SyncChannelsRequest } from '../../../../shared/types/admin'
import { syncChannels } from '../../../utils/channelSync'
import { emitProgress } from '../../../utils/progress'

export default defineEventHandler(async event => {
  const body: SyncChannelsRequest =
    (await readBody<SyncChannelsRequest>(event).catch(() => ({}))) || {}

  emitProgress({
    type: 'channelSync',
    status: 'starting',
    current: 0,
    total: 0,
    message: body.dryRun ? 'Starting channel sync (dry run)...' : 'Starting channel sync...',
  })

  try {
    const result = await syncChannels({
      platform: body.platform ?? 'all',
      channels: body.channels,
      dryRun: body.dryRun ?? false,
      retryFailed: body.retryFailed ?? false,
      probeActive: body.probeActive ?? false,
      onProgress: progress => {
        emitProgress({
          type: 'channelSync',
          status: 'in_progress',
          current: progress.current,
          total: progress.total,
          message: progress.message,
          successCurrent: progress.successCurrent,
          failedCurrent: progress.failedCurrent,
          embeddingsPerSecond: progress.rate,
          estimatedTimeRemaining: progress.estimatedTimeRemaining,
          channelCurrent: progress.channelCurrent,
          channelTotal: progress.channelTotal,
          channelName: progress.channelName,
        })
      },
    })

    emitProgress({
      type: 'channelSync',
      status: result.success ? 'completed' : 'error',
      current: result.channels.length,
      total: result.channels.length,
      message: result.success
        ? `Sync completed: +${result.totals.added} / -${result.totals.removed} / ↺${result.totals.restored}`
        : `Sync completed with ${result.totals.errors} channel error(s)`,
      successCurrent: result.totals.added + result.totals.restored,
      failedCurrent: result.totals.errors,
    })

    return result
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    emitProgress({
      type: 'channelSync',
      status: 'error',
      current: 0,
      total: 0,
      message: `Channel sync failed: ${message}`,
      lastError: message,
    })

    throw createError({
      statusCode: 500,
      message: `Channel sync failed: ${message}`,
    })
  }
})
