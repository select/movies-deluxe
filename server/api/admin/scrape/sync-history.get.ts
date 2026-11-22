import { defineEventHandler } from 'h3'
import type {
  ChannelStatusCounts,
  ChannelSyncEvent,
  ChannelSyncRun,
  SyncHistoryResponse,
} from '../../../../shared/types/admin'
import { getAdminDatabase } from '../../../utils/adminDb'

export default defineEventHandler((): SyncHistoryResponse => {
  const db = getAdminDatabase()

  const runs = db
    .prepare(
      `
      SELECT
        r.id,
        r.channelId,
        c.name as channelName,
        r.startedAt,
        r.completedAt,
        r.status,
        r.totalRemote,
        r.addedCount,
        r.removedCount,
        r.restoredCount,
        r.skippedFailedCount,
        r.probedCount,
        r.error
      FROM channel_sync_runs r
      LEFT JOIN channels c ON r.channelId = c.id
      ORDER BY r.startedAt DESC, r.id DESC
      LIMIT 50
    `
    )
    .all() as ChannelSyncRun[]

  const events = db
    .prepare(
      `
      SELECT
        e.id,
        e.runId,
        e.channelId,
        c.name as channelName,
        e.sourceId,
        e.movieId,
        m.title as movieTitle,
        e.eventType,
        e.reason,
        e.detail,
        e.createdAt
      FROM channel_sync_events e
      LEFT JOIN channels c ON e.channelId = c.id
      LEFT JOIN movies m ON e.movieId = m.movieId
      ORDER BY e.createdAt DESC, e.id DESC
      LIMIT 100
    `
    )
    .all() as ChannelSyncEvent[]

  const countRows = db
    .prepare(
      `
      SELECT
        c.id as channelId,
        c.name as channelName,
        c.platform as platform,
        s.status as status,
        s.unavailableReason as unavailableReason,
        COUNT(*) as count
      FROM sources s
      JOIN channels c ON s.channelId = c.id
      GROUP BY c.id, c.name, c.platform, s.status, s.unavailableReason
      ORDER BY c.platform, c.name
    `
    )
    .all() as Array<{
    channelId: string
    channelName: string
    platform: 'youtube' | 'archive.org'
    status: string
    unavailableReason: string | null
    count: number
  }>

  const channelMap = new Map<string, ChannelStatusCounts>()
  for (const row of countRows) {
    let entry = channelMap.get(row.channelId)
    if (!entry) {
      entry = {
        channelId: row.channelId,
        channelName: row.channelName,
        platform: row.platform,
        active: 0,
        unlisted: 0,
        unavailable: 0,
        removed_from_channel: 0,
        total: 0,
        reasonCounts: {},
      }
      channelMap.set(row.channelId, entry)
    }

    if (row.status === 'active') entry.active += row.count
    else if (row.status === 'unlisted') entry.unlisted += row.count
    else if (row.status === 'unavailable') entry.unavailable += row.count
    else if (row.status === 'removed_from_channel') entry.removed_from_channel += row.count

    entry.total += row.count

    if (row.unavailableReason) {
      entry.reasonCounts[row.unavailableReason] =
        (entry.reasonCounts[row.unavailableReason] || 0) + row.count
    }
  }

  return {
    runs,
    events,
    channelCounts: Array.from(channelMap.values()),
  }
})
