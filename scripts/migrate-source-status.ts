#!/usr/bin/env node
/**
 * Idempotent migration script to add source status, removal-reason tracking,
 * and channel sync history tables to data/movies.db.
 *
 * Run with: pnpm tsx scripts/migrate-source-status.ts
 */

import Database from 'better-sqlite3'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { createLogger } from '../server/utils/logger'

const logger = createLogger('MigrateSourceStatus')

interface TableColumn {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

export function migrateSourceStatus(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(sources)').all() as TableColumn[]
  const existingCols = new Set(columns.map(c => c.name))

  const columnsToAdd: Array<{ name: string; sql: string }> = [
    {
      name: 'status',
      sql: `ALTER TABLE sources ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unlisted', 'unavailable', 'removed_from_channel'))`,
    },
    {
      name: 'unavailableReason',
      sql: `ALTER TABLE sources ADD COLUMN unavailableReason TEXT CHECK (unavailableReason IS NULL OR unavailableReason IN ('deleted', 'private', 'unlisted', 'copyright_takedown', 'tos_violation', 'channel_terminated', 'members_only', 'age_restricted', 'not_embeddable', 'geo_blocked_all', 'archive_dark', 'delisted_from_collection', 'unavailable_unknown'))`,
    },
    {
      name: 'unavailableDetail',
      sql: `ALTER TABLE sources ADD COLUMN unavailableDetail TEXT`,
    },
    {
      name: 'lastSeenAt',
      sql: `ALTER TABLE sources ADD COLUMN lastSeenAt INTEGER`,
    },
    {
      name: 'lastCheckedAt',
      sql: `ALTER TABLE sources ADD COLUMN lastCheckedAt INTEGER`,
    },
    {
      name: 'statusChangedAt',
      sql: `ALTER TABLE sources ADD COLUMN statusChangedAt INTEGER`,
    },
  ]

  let addedCols = 0
  for (const col of columnsToAdd) {
    if (!existingCols.has(col.name)) {
      db.exec(col.sql)
      logger.info(`Added column sources.${col.name}`)
      addedCols++
    } else {
      logger.debug(`Column sources.${col.name} already exists`)
    }
  }

  // Indexes on sources
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);
    CREATE INDEX IF NOT EXISTS idx_sources_channelId_status ON sources(channelId, status);
  `)

  // Channel sync tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channelId TEXT NOT NULL,
      startedAt INTEGER NOT NULL,
      completedAt INTEGER,
      status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
      totalRemote INTEGER DEFAULT 0,
      addedCount INTEGER DEFAULT 0,
      removedCount INTEGER DEFAULT 0,
      restoredCount INTEGER DEFAULT 0,
      skippedFailedCount INTEGER DEFAULT 0,
      probedCount INTEGER DEFAULT 0,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_channel_sync_runs_channelId ON channel_sync_runs(channelId);
    CREATE INDEX IF NOT EXISTS idx_channel_sync_runs_startedAt ON channel_sync_runs(startedAt DESC);

    CREATE TABLE IF NOT EXISTS channel_sync_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      runId INTEGER NOT NULL,
      channelId TEXT NOT NULL,
      sourceId TEXT NOT NULL,
      movieId TEXT,
      eventType TEXT NOT NULL CHECK (eventType IN ('added', 'removed', 'restored', 'status_changed')),
      reason TEXT,
      detail TEXT,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (runId) REFERENCES channel_sync_runs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_channel_sync_events_runId ON channel_sync_events(runId);
    CREATE INDEX IF NOT EXISTS idx_channel_sync_events_channelId ON channel_sync_events(channelId);
    CREATE INDEX IF NOT EXISTS idx_channel_sync_events_sourceId ON channel_sync_events(sourceId);
    CREATE INDEX IF NOT EXISTS idx_channel_sync_events_eventType ON channel_sync_events(eventType);
  `)

  // Clean up stray channels rows where id IS NULL or empty
  const strayCount = (
    db.prepare(`SELECT COUNT(*) as count FROM channels WHERE id IS NULL OR id = ''`).get() as {
      count: number
    }
  ).count

  if (strayCount > 0) {
    // Only delete stray rows not referenced by any sources
    const result = db
      .prepare(
        `DELETE FROM channels WHERE (id IS NULL OR id = '') AND NOT EXISTS (SELECT 1 FROM sources WHERE sources.channelId = channels.id)`
      )
      .run()
    logger.info(`Cleaned up ${result.changes} stray channels row(s) with NULL/empty id`)
  }

  // Update schema last_updated
  db.prepare(
    `INSERT OR REPLACE INTO _schema (key, value) VALUES ('last_updated', datetime('now'))`
  ).run()

  logger.success(
    `Migration complete (${addedCols} new column(s) added, indexes & sync tables ensured)`
  )
}

function main() {
  const dbPath = join(process.cwd(), 'data/movies.db')
  if (!existsSync(dbPath)) {
    logger.error(`Database not found at ${dbPath}`)
    process.exit(1)
  }

  const db = new Database(dbPath, { timeout: 10000 })
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  try {
    migrateSourceStatus(db)
  } finally {
    db.close()
  }
}

// Run if executed directly
const isDirectRun =
  process.argv[1]?.endsWith('migrate-source-status.ts') ||
  process.argv[1]?.endsWith('migrate-source-status.js')

if (isDirectRun) {
  main()
}
