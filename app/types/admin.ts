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
    }
    youtube: {
      channels: Array<{
        id: string
        name: string
        enabled: boolean
        scraped: number
        total: number
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
  }
  posters: {
    totalMovies: number
    withPosterUrl: number
    downloaded: number
    missing: number
    percent: number
  }
  lastUpdated?: string
}

export interface ScrapeResults {
  processed: number
  added: number
  updated: number
  errors: string[]
  debug?: string[]
  channels?: Array<{ id: string; processed: number; added: number; updated: number }>
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
  rows: number
  pages: number
  autoDetect: boolean
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
