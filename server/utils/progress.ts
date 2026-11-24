import { EventEmitter } from 'events'
import type { ProgressUpdate } from '../../shared/types/admin'

export const progressEmitter = new EventEmitter()

export const emitProgress = (update: ProgressUpdate): void => {
  progressEmitter.emit('progress', update)
}
