import { defineEventHandler, readBody, createError, setResponseStatus } from 'h3'
import type { SyncChannelsRequest } from '../../../../shared/types/admin'
import { isChannelSyncRunning, syncChannels } from '../../../utils/channelSync'
import { emitProgress } from '../../../utils/progress'

export default defineEventHandler(async event => {
  if (isChannelSyncRunning()) {
    throw createError({
      statusCode: 409,
      message: 'Channel sync is already running',
    })
  }

  const body: SyncChannelsRequest =
    (await readBody<SyncChannelsRequest>(event).catch(() => ({}))) || {}

  emitProgress({
    type: 'channelSync',
    status: 'starting',
    current: 0,
    total: 0,
    message: 'Starting channel sync...',
  })

  void syncChannels({
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
        itemsPerSecond: progress.rate,
        estimatedTimeRemaining: progress.estimatedTimeRemaining,
        channelCurrent: progress.channelCurrent,
        channelTotal: progress.channelTotal,
        channelName: progress.channelName,
      })
    },
  })
    .then(result => {
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
        channelSyncResult: result,
      })
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      emitProgress({
        type: 'channelSync',
        status: 'error',
        current: 0,
        total: 0,
        message: `Channel sync failed: ${message}`,
        lastError: message,
      })
    })

  setResponseStatus(event, 202)
  return { started: true }
})
