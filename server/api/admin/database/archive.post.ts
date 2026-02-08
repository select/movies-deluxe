import { promises as fs } from 'node:fs'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import * as tar from 'tar'

const execAsync = promisify(exec)

interface DatabaseArchiveResult {
  success: boolean
  archivesCreated: number
  totalSize: string
  archives: Array<{
    filename: string
    size: string
  }>
  error?: string
}

const MAX_ARCHIVE_SIZE = 50 * 1024 * 1024 // 50MB in bytes

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

export default defineEventHandler(async (): Promise<DatabaseArchiveResult> => {
  try {
    const dataDir = path.join(process.cwd(), 'data')
    const dbFile = path.join(dataDir, 'movies.db')

    // Check if database file exists
    try {
      await fs.access(dbFile)
    } catch {
      return {
        success: false,
        archivesCreated: 0,
        totalSize: '0 B',
        archives: [],
        error: 'Database file not found',
      }
    }

    // Get database file size
    const dbStats = await fs.stat(dbFile)
    const dbSize = dbStats.size

    // Calculate how many archives we need
    const numArchives = Math.ceil(dbSize / MAX_ARCHIVE_SIZE)

    emitProgress({
      type: 'databaseArchive',
      status: 'in_progress',
      message: 'Creating database archives...',
      current: 0,
      total: numArchives,
    })

    const archives: Array<{ filename: string; size: string }> = []

    // If database fits in one archive, create a single archive
    if (numArchives === 1) {
      const archiveName = 'movies-db.tar.gz'
      const archivePath = path.join(dataDir, archiveName)

      await tar.create(
        {
          gzip: true,
          file: archivePath,
          cwd: dataDir,
        },
        ['movies.db']
      )

      const archiveStats = await fs.stat(archivePath)
      archives.push({
        filename: archiveName,
        size: formatBytes(archiveStats.size),
      })

      emitProgress({
        type: 'databaseArchive',
        status: 'in_progress',
        message: 'Database archive created',
        current: 1,
        total: 1,
      })
    } else {
      // Split database into multiple archives using split command
      // This creates movies-db-part01.tar.gz, movies-db-part02.tar.gz, etc.
      const chunkSize = Math.floor(MAX_ARCHIVE_SIZE / 1024 / 1024) // Convert to MB for split command

      // First, create a single tar.gz of the database
      const tempArchive = path.join(dataDir, 'movies-db-temp.tar.gz')
      await tar.create(
        {
          gzip: true,
          file: tempArchive,
          cwd: dataDir,
        },
        ['movies.db']
      )

      // Split the archive into chunks using split command
      await execAsync(
        `split -b ${chunkSize}M -d --additional-suffix=.tar.gz "${tempArchive}" "${path.join(dataDir, 'movies-db-part')}"`,
        { cwd: dataDir }
      )

      // Remove temp archive
      await fs.unlink(tempArchive)

      // Get all split files
      const files = await fs.readdir(dataDir)
      const splitFiles = files
        .filter(f => f.startsWith('movies-db-part') && f.endsWith('.tar.gz'))
        .sort()

      for (let i = 0; i < splitFiles.length; i++) {
        const file = splitFiles[i]
        if (!file) continue

        const filePath = path.join(dataDir, file)
        const stats = await fs.stat(filePath)

        archives.push({
          filename: file,
          size: formatBytes(stats.size),
        })

        emitProgress({
          type: 'databaseArchive',
          status: 'in_progress',
          message: `Created archive ${i + 1} of ${splitFiles.length}`,
          current: i + 1,
          total: splitFiles.length,
        })
      }
    }

    emitProgress({
      type: 'databaseArchive',
      status: 'completed',
      message: 'Database archiving completed',
      current: archives.length,
      total: archives.length,
    })

    const totalSize = archives.reduce((sum, archive) => {
      const sizeMatch = archive.size.match(/^([\d.]+)\s+(\w+)$/)
      if (sizeMatch && sizeMatch[1] && sizeMatch[2]) {
        const value = Number.parseFloat(sizeMatch[1])
        const unit = sizeMatch[2]
        const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }
        return sum + value * (multipliers[unit] || 1)
      }
      return sum
    }, 0)

    return {
      success: true,
      archivesCreated: archives.length,
      totalSize: formatBytes(totalSize),
      archives,
    }
  } catch (error) {
    console.error('Database archive error:', error)
    return {
      success: false,
      archivesCreated: 0,
      totalSize: '0 B',
      archives: [],
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
})
