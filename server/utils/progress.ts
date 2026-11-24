import { EventEmitter } from 'events'

export const progressEmitter = new EventEmitter()

export interface ProgressUpdate {
  type:
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
  status: 'starting' | 'in_progress' | 'completed' | 'error'
  current: number
  total: number
  message: string
  successCurrent?: number
  successPrevious?: number
  failedCurrent?: number
  failedPrevious?: number
  embeddingsPerSecond?: number
  estimatedTimeRemaining?: number
  channelCurrent?: number
  channelTotal?: number
  channelName?: string
  lastError?: string
}

export const emitProgress = (update: ProgressUpdate): void => {
  progressEmitter.emit('progress', update)
}
