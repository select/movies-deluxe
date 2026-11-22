export type ReviewItemKind = 'new_match' | 'false_hit' | 'archive_preview'

export type ReviewItemStatus = 'pending' | 'approved' | 'rejected' | 'resolved'

export type LlmVerdict = 'match' | 'mismatch' | 'uncertain'

export type MatchReviewActionType =
  | 'keep_verified'
  | 'approve_match'
  | 'unmatch'
  | 'detach_source'
  | 'mark_preview'
  | 'remove_source'
  | 'reject'

export interface MatchReviewSourceInfo {
  id: number
  sourceId: string
  channelId: string
  channelName: string
  platform: 'youtube' | 'archive.org'
  title: string | null
  duration: number | null
  size: number | null
  mbPerMin: number | null
  description: string | null
  qualityMarks: string[]
}

export interface MatchReviewMovieInfo {
  movieId: string
  title: string
  year: number | null
  verified: boolean
  aiTitle?: string | null
  aiYear?: number | null
}

export interface MatchReviewMetadataInfo {
  Title: string | null
  Year: string | null
  Runtime: string | null
  Director: string | null
  Actors: string | null
  Type: string | null
  imdbRating: number | null
  imdbID: string | null
}

export interface MatchReviewQueueItem {
  id: number
  movieId: string
  kind: ReviewItemKind
  sourceId: string | null
  currentImdbId: string | null
  proposedImdbId: string | null
  score: number | null
  llmVerdict: LlmVerdict | null
  llmConfidence: number | null
  llmReason: string | null
  flags: string[]
  candidate: Record<string, unknown> | null
  status: ReviewItemStatus
  createdAt: string
  resolvedAt: string | null
  movie: MatchReviewMovieInfo | null
  metadata: MatchReviewMetadataInfo | null
  sources: MatchReviewSourceInfo[]
}

export interface MatchReviewCounts {
  byStatus: {
    pending: number
    approved: number
    rejected: number
    resolved: number
  }
  byKind: {
    all: number
    new_match: number
    false_hit: number
    archive_preview: number
  }
}

export interface MatchReviewListResponse {
  items: MatchReviewQueueItem[]
  total: number
  limit: number
  offset: number
  counts: MatchReviewCounts
}

export interface MatchReviewActionRequest {
  id: number
  action: MatchReviewActionType
  customImdbId?: string
}

export interface MatchReviewActionResponse {
  success: boolean
  id: number
  action: MatchReviewActionType
  status: ReviewItemStatus
  movieId: string
  message?: string
}

export interface MatchReviewBulkActionRequest {
  action: 'mark_all_previews' | 'keep_all_llm_matches' | 'mark_low_ratio_trailers'
  kind?: 'archive_preview' | 'false_hit'
  minConfidence?: number
  maxMbPerMin?: number
}

export interface MatchReviewBulkActionResponse {
  success: boolean
  processedItems: number
  markedSources: number
  message: string
}

export interface AuditMatchesRequest {
  dryRun?: boolean
  useLlm?: boolean
  limit?: number
  kinds?: ReviewItemKind[]
}

export interface AuditMatchesResponse {
  success?: boolean
  dryRun?: boolean
  scanned?: number
  flagged?: number
  enqueued?: number
  byKind?: Partial<Record<ReviewItemKind, number>>
  message?: string
  [key: string]: unknown
}
