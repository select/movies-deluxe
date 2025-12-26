export interface ScrapeStats {
  database: {
    total: number
    matched: number
    unmatched: number
    archiveOrgSources: number
    youtubeSources: number
    curatedCount: number
  }
  external: {
    archiveOrg: {
      total: number
      scraped: number
      percent: number
      failed?: number
      failureRate?: number
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
        enabled: boolean
        scraped: number
        total: number
        failed?: number
        failureRate?: number
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
    failed?: number
    failureRate?: number
  }
  posters: {
    totalMovies: number
    withPosterUrl: number
    downloaded: number
    missing: number
    failed: number
    failureRate: number
    percent: number
    percentOfMoviesWithUrl: number
    percentOfAllMovies: number
    filesInDirectory: number
    matchedPosters: number
  }
  lastUpdated?: string
}

export interface ScrapeResults {
  processed: number
  added: number
  updated: number
  failed?: number
  failureReasons?: Record<string, number>
  errors: string[]
  debug?: string[]
  channels?: Array<{
    id: string
    processed: number
    added: number
    updated: number
    failed?: number
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
