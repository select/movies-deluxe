#!/usr/bin/env node
/**
 * YouTube Blocked Video Detection Script
 *
 * Checks YouTube videos in data/movies.db for availability issues using
 * server/utils/sourceProbe.ts (Stage 1 Data API v3 + Stage 2 youtubei.js)
 * and updates sources.status, sources.unavailableReason, sources.unavailableDetail,
 * sources.lastCheckedAt, sources.statusChangedAt, and sources.regionRestriction.
 *
 * Run with: pnpm youtube:detect-blocked
 * Options:
 *   --unchecked  Only probe YouTube sources where lastCheckedAt IS NULL
 */

import { config } from 'dotenv'
import { createLogger } from '../server/utils/logger'
import { getAdminDatabase } from '../server/utils/adminDb'
import { probeYouTubeSources } from '../server/utils/sourceProbe'

config()

const logger = createLogger('BlockedYouTubeDetector')

async function main() {
  const apiKey = process.env.YOUTUBE_API_KEY

  if (!apiKey || apiKey === 'your_youtube_api_key_here') {
    logger.error('YouTube API key not found!')
    logger.error('Please set YOUTUBE_API_KEY in your .env file')
    logger.error('Get an API key from: https://console.cloud.google.com/apis/credentials')
    process.exit(1)
  }

  const uncheckedOnly = process.argv.slice(2).includes('--unchecked')

  try {
    logger.info(
      uncheckedOnly
        ? 'Loading unchecked YouTube sources from admin database...'
        : 'Loading YouTube sources from admin database...'
    )
    const db = getAdminDatabase()

    const sources = db
      .prepare(
        `
        SELECT s.id, s.sourceId, s.movieId, s.status, s.unavailableReason, s.regionRestriction
        FROM sources s
        JOIN channels c ON s.channelId = c.id
        WHERE c.platform = 'youtube'${uncheckedOnly ? '\n          AND s.lastCheckedAt IS NULL' : ''}
      `
      )
      .all() as Array<{
      id: number
      sourceId: string
      movieId: string
      status: string
      unavailableReason: string | null
      regionRestriction: string | null
    }>

    const uniqueVideoIds = [...new Set(sources.map(s => s.sourceId))]
    logger.info(`Found ${uniqueVideoIds.length} unique YouTube videos to check`)

    if (uniqueVideoIds.length === 0) {
      logger.info(
        uncheckedOnly
          ? 'No unchecked YouTube videos found in database'
          : 'No YouTube videos found in database'
      )
      return
    }

    const probeResults = await probeYouTubeSources(uniqueVideoIds, { apiKey })

    const updateStmt = db.prepare(`
      UPDATE sources
      SET
        status = ?,
        unavailableReason = ?,
        unavailableDetail = ?,
        regionRestriction = ?,
        lastCheckedAt = ?,
        statusChangedAt = CASE WHEN status != ? OR COALESCE(unavailableReason, '') != COALESCE(?, '') THEN ? ELSE statusChangedAt END
      WHERE id = ?
    `)

    let statusUpdated = 0
    let regionUpdated = 0
    const reasonCounts = new Map<string, number>()

    const applyUpdates = db.transaction(() => {
      for (const source of sources) {
        const result = probeResults.get(source.sourceId)
        if (!result) continue

        const newReason = result.unavailableReason ?? null
        const newDetail = result.unavailableDetail ?? null
        const newRegionJson = result.regionRestriction
          ? JSON.stringify(result.regionRestriction)
          : null

        if (source.status !== result.status || (source.unavailableReason ?? null) !== newReason) {
          statusUpdated++
        }

        if ((source.regionRestriction ?? null) !== newRegionJson) {
          regionUpdated++
        }

        if (result.status !== 'active') {
          const key = `${result.status}:${newReason || 'unknown'}`
          reasonCounts.set(key, (reasonCounts.get(key) || 0) + 1)
        }

        updateStmt.run(
          result.status,
          newReason,
          newDetail,
          newRegionJson,
          result.checkedAt,
          result.status,
          newReason,
          result.checkedAt,
          source.id
        )
      }
    })

    applyUpdates()

    logger.success(
      `Checked ${uniqueVideoIds.length} YouTube videos: ${statusUpdated} status change(s), ${regionUpdated} region restriction update(s)`
    )

    if (reasonCounts.size > 0) {
      logger.info('Non-active source breakdown:')
      for (const [key, count] of reasonCounts.entries()) {
        logger.info(`  ${key}: ${count}`)
      }
    }
  } catch (error) {
    logger.error('Script failed:', error)
    process.exit(1)
  }
}

main().catch(console.error)
