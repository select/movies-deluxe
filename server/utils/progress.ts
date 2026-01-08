import { EventEmitter } from 'events'

export const progressEmitter = new EventEmitter()

export interface ProgressUpdate {
  type:
    | 'archive'
    | 'youtube'
    | 'omdb'
    | 'posters'
    | 'sqlite'
    | 'ai'
    | 'posterArchive'
    | 'stats'
    | 'home'
  status: 'starting' | 'in_progress' | 'completed' | 'error'
  current: number
  total: number
  message: string
  successCurrent?: number
  successPrevious?: number
  failedCurrent?: number
  failedPrevious?: number
}

export const emitProgress = (update: ProgressUpdate) => {
  progressEmitter.emit('progress', update)
}
