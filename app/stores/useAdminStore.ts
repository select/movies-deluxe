import { defineStore } from 'pinia'

export interface ProgressUpdate {
  type: 'archive' | 'youtube' | 'omdb' | 'posters' | 'sqlite'
  status: 'starting' | 'in_progress' | 'completed' | 'error'
  current: number
  total: number
  message: string
}

export const useAdminStore = defineStore('admin', () => {
  const progress = ref<Record<string, ProgressUpdate>>({})

  const updateProgress = (update: ProgressUpdate) => {
    progress.value[update.type] = update
  }

  const clearProgress = (type: string) => {
    delete progress.value[type]
  }

  return {
    progress,
    updateProgress,
    clearProgress,
  }
})
