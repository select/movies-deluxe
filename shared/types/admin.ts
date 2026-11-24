import type { SourceUnavailableReason } from './movie'

export interface GenerateDatabaseRequest {
  skipJsonGeneration?: boolean
}

export interface GenerateDatabaseResponse {
  success: boolean
  message: string
}

export type ChannelSyncRunStatus = 'running' | 'completed' | 'failed'

export type ChannelSyncEventType = 'added' | 'removed' | 'restored' | 'status_changed'

export interface ChannelSyncRun {
  id: number
  channelId: string
  channelName?: string
  startedAt: number
  completedAt: number | null
  status: ChannelSyncRunStatus
  totalRemote: number
  addedCount: number
  removedCount: number
  restoredCount: number
  skippedFailedCount: number
  probedCount: number
  error: string | null
}

export interface ChannelSyncEvent {
  id: number
  runId: number
  channelId: string
  channelName?: string
  sourceId: string
  movieId: string | null
  movieTitle?: string | null
  eventType: ChannelSyncEventType
  reason: SourceUnavailableReason | string | null
  detail: string | null
  createdAt: number
}

export interface SyncChannelsRequest {
  platform?: 'youtube' | 'archive' | 'all'
  channels?: string[]
  dryRun?: boolean
  retryFailed?: boolean
  probeActive?: boolean
}

export interface SyncChannelSummary {
  channelId: string
  channelName: string
  platform: 'youtube' | 'archive.org'
  runId?: number
  totalRemote: number
  existingInDb: number
  added: number
  removed: number
  restored: number
  skippedFailed: number
  probed: number
  removalReasons: Record<string, number>
  error?: string
}

export interface SyncChannelsResponse {
  success: boolean
  dryRun: boolean
  startedAt: number
  completedAt: number
  channels: SyncChannelSummary[]
  totals: {
    totalRemote: number
    added: number
    removed: number
    restored: number
    skippedFailed: number
    probed: number
    errors: number
  }
}

export interface ChannelStatusCounts {
  channelId: string
  channelName: string
  platform: 'youtube' | 'archive.org'
  active: number
  unlisted: number
  unavailable: number
  removed_from_channel: number
  total: number
  reasonCounts: Record<string, number>
}

export interface SyncHistoryResponse {
  runs: ChannelSyncRun[]
  events: ChannelSyncEvent[]
  channelCounts: ChannelStatusCounts[]
  isRunning?: boolean
}

export type ProgressType =
  | 'archive'
  | 'youtube'
  | 'posters'
  | 'sqlite'
  | 'ai'
  | 'posterArchive'
  | 'databaseArchive'
  | 'stats'
  | 'home'
  | 'embeddings'
  | 'similar'
  | 'channelSync'
  | 'audit'

export interface ProgressUpdate {
  type: ProgressType
  status: 'starting' | 'in_progress' | 'completed' | 'error'
  current: number
  total: number
  message: string
  successCurrent?: number
  successPrevious?: number
  failedCurrent?: number
  failedPrevious?: number
  embeddingsPerSecond?: number
  itemsPerSecond?: number
  estimatedTimeRemaining?: number
  channelCurrent?: number
  channelTotal?: number
  channelName?: string
  channelSyncResult?: SyncChannelsResponse
  lastError?: string
}
