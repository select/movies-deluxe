import { EventEmitter } from 'events'

export const progressEmitter = new EventEmitter()

export interface ProgressUpdate {
  type: 'archive' | 'youtube' | 'omdb' | 'posters' | 'sqlite'
  status: 'starting' | 'in_progress' | 'completed' | 'error'
  current: number
  total: number
  message: string
}

export const emitProgress = (update: ProgressUpdate) => {
  progressEmitter.emit('progress', update)
}
