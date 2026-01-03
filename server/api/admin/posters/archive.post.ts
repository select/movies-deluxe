import { existsSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as tar from 'tar'

const MAX_ARCHIVE_SIZE = 50 * 1024 * 1024 // 50MB in bytes

interface ArchiveResult {
  success: boolean
  archivesCreated: number
  totalPosters: number
  totalSize: string
  archives: Array<{
    filename: string
    posterCount: number
    size: string
  }>
  error?: string
}

export default defineEventHandler(async (): Promise<ArchiveResult> => {
  try {
    const postersDir = join(process.cwd(), 'public/posters')
    const dataDir = join(process.cwd(), 'data')

    // Ensure directories exist
    if (!existsSync(postersDir)) {
      return {
        success: false,
        archivesCreated: 0,
        totalPosters: 0,
        totalSize: '0 B',
        archives: [],
        error: 'Posters directory does not exist',
      }
    }

    // Get all poster files
    const posterFiles = readdirSync(postersDir)
      .filter(file => file.endsWith('.jpg') && file !== '.gitkeep')
      .map(file => ({
        name: file,
        path: join(postersDir, file),
        size: statSync(join(postersDir, file)).size,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    if (posterFiles.length === 0) {
      return {
        success: true,
        archivesCreated: 0,
        totalPosters: 0,
        totalSize: '0 B',
        archives: [],
      }
    }

    // Group posters into archives of <50MB
    const archives: Array<{ files: typeof posterFiles; totalSize: number }> = []
    let currentArchive: typeof posterFiles = []
    let currentSize = 0

    for (const poster of posterFiles) {
      // If adding this poster would exceed the limit, start a new archive
      if (currentSize + poster.size > MAX_ARCHIVE_SIZE && currentArchive.length > 0) {
        archives.push({ files: currentArchive, totalSize: currentSize })
        currentArchive = []
        currentSize = 0
      }

      currentArchive.push(poster)
      currentSize += poster.size
    }

    // Add the last archive if it has files
    if (currentArchive.length > 0) {
      archives.push({ files: currentArchive, totalSize: currentSize })
    }

    // Create tar.gz archives
    const archiveResults: ArchiveResult['archives'] = []

    let archiveIndex = 1
    for (const archive of archives) {
      const archiveFilename = `posters-part${archiveIndex.toString().padStart(2, '0')}.tar.gz`
      const archivePath = join(dataDir, archiveFilename)

      emitProgress({
        type: 'posterArchive',
        status: 'in_progress',
        message: `Creating archive ${archiveIndex}/${archives.length}`,
        current: archiveIndex - 1,
        total: archives.length,
      })

      // Create tar.gz archive
      await tar.create(
        {
          gzip: true,
          file: archivePath,
          cwd: postersDir,
        },
        archive.files.map(f => f.name)
      )

      const archiveSize = statSync(archivePath).size

      archiveResults.push({
        filename: archiveFilename,
        posterCount: archive.files.length,
        size: formatBytes(archiveSize),
      })

      archiveIndex++
    }

    emitProgress({
      type: 'posterArchive',
      status: 'completed',
      message: 'Archive creation completed',
      current: archives.length,
      total: archives.length,
    })

    const totalSize = posterFiles.reduce((sum, file) => sum + file.size, 0)

    return {
      success: true,
      archivesCreated: archiveResults.length,
      totalPosters: posterFiles.length,
      totalSize: formatBytes(totalSize),
      archives: archiveResults,
    }
  } catch (error) {
    console.error('Error creating poster archives:', error)
    return {
      success: false,
      archivesCreated: 0,
      totalPosters: 0,
      totalSize: '0 B',
      archives: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
})

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}
