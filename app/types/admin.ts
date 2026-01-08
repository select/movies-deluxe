export interface ScrapeStats {
  database: {
    total: number
    matched: number
    unmatched: number
    archiveOrgSources: number
    youtubeSources: number
    curatedCount: number
    collections: Record<string, number>
    qualityMarkedCount: number
    qualityBreakdown: Record<string, number>
  }
  external: {
    archiveOrg: {
      total: number
      scraped: number
      percent: number
      failed: number
      failureRate: number
    }
    youtube: {
      totalScraped: number
      totalAvailable: number
      totalFailed: number
      failureRate: number
      percent: number
      channels: Array<{
        id: string
        name: string
        language?: string
        enabled: boolean
        scraped: number
        total: number
        failed: number
        failureRate: number
      }>
    }
  }
  curation: {
    total: number
    curated: number
    percent: number
  }
  omdb: {
    total: number
    matched: number
    unmatched: number
    percent: number
    failed: number
    failureRate: number
  }
  posters: {
    totalMovies: number
    withPosterUrl: number
    downloaded: number
    missing: number
    failed: number
    failureRate: number
    percentOfMoviesWithUrl: number
    percentOfAllMovies: number
    filesInDirectory: number
    matchedPosters: number
  }
  ai: {
    totalUnmatched: number
    withAiData: number
    withoutAiData: number
    percent: number
  }
  quality: {
    totalMarked: number
    breakdown: Record<string, number>
    percent: number
  }
  lastUpdated: string
}

export interface ScrapeResults {
  processed: number
  added: number
  updated: number
  failed?: number
  skipped?: number
  failureReasons?: Record<string, number>
  errors: string[]
  debug?: string[]
  channels?: Array<{
    id: string
    processed: number
    added: number
    updated: number
    failed?: number
    skipped?: number
  }>
}

export interface YouTubeChannelConfig {
  id: string
  name: string
  enabled: boolean
  language?: string
}

export interface PosterResults {
  processed: number
  successful: number
  failed: number
  errors: string[]
}

export interface ArchiveOptions {
  collections: string[]
}

export interface YouTubeOptions {
  limit: number
  allPages: boolean
  channels: string[]
}

export interface PosterOptions {
  limit: number
  force: boolean
}

export interface OMDBOptions {
  limit: number
  onlyUnmatched: boolean
  forceRetryFailed: boolean
}

export interface DeduplicationResult {
  totalSources: number
  sourcesWithDescriptions: number
  boilerplateRemoved: number
  sourcesProcessed: number
  descriptionsRemoved: number
  patterns: Array<{
    pattern: string
    count: number
    description: string
  }>
}

export interface CollectionCleanupResult {
  success: boolean
  stats: {
    collectionsProcessed: number
    moviesRemoved: number
    moviesUpdated: number
    collectionsModified: number
  }
  details: Array<{
    collectionId: string
    collectionName: string
    removedMovies: string[]
    updatedMovies: Array<{ oldId: string; newId: string }>
  }>
}
