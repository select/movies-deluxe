/**
 * Tests for upsertMovie()
 *
 * Validates insert, update, source merging, and transaction behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { upsertMovie } from './upsertMovie'
import { getAdminDatabase } from './adminDb'
import type { MovieEntry } from '../../shared/types/movie'
import type Database from 'better-sqlite3'

describe('upsertMovie', () => {
  let db: Database.Database
  const testMovieId = 'test-upsert-001'

  beforeEach(() => {
    db = getAdminDatabase()
    // Clean up test data before each test
    db.prepare('DELETE FROM movies WHERE movieId LIKE ?').run('test-upsert-%')
  })

  afterEach(() => {
    // Clean up test data after each test
    db.prepare('DELETE FROM movies WHERE movieId LIKE ?').run('test-upsert-%')
  })

  describe('Insert Operations', () => {
    it('should insert a new movie', async () => {
      const now = new Date().toISOString()
      const entry: MovieEntry = {
        movieId: testMovieId,
        title: 'Test Insert Movie',
        year: 2023,
        verified: false,
        sources: [
          {
            type: 'youtube',
            url: 'https://youtube.com/watch?v=test1',
            id: 'test1',
            title: 'Test Video',
            addedAt: now,
          },
        ],
        lastUpdated: now,
      }

      const result = await upsertMovie(testMovieId, entry)

      expect(result).toBeUndefined() // Should return undefined for new insert

      // Verify movie was inserted
      const movie = db.prepare('SELECT * FROM movies WHERE movieId = ?').get(testMovieId) as
        | { movieId: string; title: string; year: number; verified: number }
        | undefined

      expect(movie).toBeDefined()
      expect(movie?.title).toBe('Test Insert Movie')
      expect(movie?.year).toBe(2023)
      expect(movie?.verified).toBe(0)
    })

    it('should insert movie with sources', async () => {
      const now = new Date().toISOString()
      const entry: MovieEntry = {
        movieId: testMovieId,
        title: 'Test Movie with Sources',
        year: 2023,
        verified: false,
        sources: [
          {
            type: 'youtube',
            url: 'https://youtube.com/watch?v=src1',
            id: 'src1',
            title: 'Source 1',
            addedAt: now,
          },
          {
            type: 'archive.org',
            url: 'https://archive.org/details/src2',
            id: 'src2',
            title: 'Source 2',
            addedAt: now,
          },
        ],
        lastUpdated: now,
      }

      await upsertMovie(testMovieId, entry)

      // Verify sources were inserted
      const sources = db.prepare('SELECT * FROM sources WHERE movieId = ?').all(testMovieId)

      expect(sources.length).toBe(2)
    })

    it('should insert movie with metadata', async () => {
      const now = new Date().toISOString()
      const entry: MovieEntry = {
        movieId: testMovieId,
        title: 'Test Movie with Metadata',
        year: 2023,
        verified: false,
        sources: [],
        metadata: {
          Title: 'Test Movie',
          Year: '2023',
          Plot: 'Test plot',
          imdbRating: 8.5,
          imdbVotes: 1000,
          Ratings: [
            { Source: 'Internet Movie Database', Value: '8.5/10' },
            { Source: 'Rotten Tomatoes', Value: '85%' },
          ],
        },
        lastUpdated: now,
      }

      await upsertMovie(testMovieId, entry)

      // Verify metadata was inserted
      const metadata = db.prepare('SELECT * FROM metadata WHERE movieId = ?').get(testMovieId) as
        | { Title: string; Plot: string; imdbRating: number }
        | undefined

      expect(metadata).toBeDefined()
      expect(metadata?.Title).toBe('Test Movie')
      expect(metadata?.Plot).toBe('Test plot')
      expect(metadata?.imdbRating).toBe(8.5)

      // Verify ratings were inserted
      const ratings = db
        .prepare('SELECT * FROM ratings WHERE movieId = ?')
        .all(testMovieId) as Array<{ Source: string; Value: string }>

      expect(ratings.length).toBe(2)
      expect(ratings[0]?.Source).toBe('Internet Movie Database')
    })

    it('should insert movie with AI metadata', async () => {
      const now = new Date().toISOString()
      const entry: MovieEntry = {
        movieId: testMovieId,
        title: 'Test Movie with AI',
        year: 2023,
        verified: false,
        sources: [],
        ai: {
          title: 'Cleaned Title',
          year: 2023,
        },
        lastUpdated: now,
      }

      await upsertMovie(testMovieId, entry)

      // Verify AI metadata was inserted
      const aiMetadata = db
        .prepare('SELECT * FROM ai_metadata WHERE movieId = ?')
        .get(testMovieId) as { title: string; year: number } | undefined

      expect(aiMetadata).toBeDefined()
      expect(aiMetadata?.title).toBe('Cleaned Title')
      expect(aiMetadata?.year).toBe(2023)
    })

    it('should insert movie with quality marks', async () => {
      const now = new Date().toISOString()
      const entry: MovieEntry = {
        movieId: testMovieId,
        title: 'Test Movie with Quality Marks',
        year: 2023,
        verified: false,
        sources: [
          {
            type: 'youtube',
            url: 'https://youtube.com/watch?v=quality1',
            id: 'quality1',
            title: 'Quality Source',
            addedAt: now,
            qualityMarks: ['low-quality', 'cam-rip'],
          },
        ],
        lastUpdated: now,
      }

      await upsertMovie(testMovieId, entry)

      // Get source ID
      const source = db
        .prepare('SELECT id FROM sources WHERE movieId = ? AND sourceId = ?')
        .get(testMovieId, 'quality1') as { id: number } | undefined

      expect(source).toBeDefined()

      // Verify quality marks were inserted
      const marks = db
        .prepare('SELECT mark FROM source_quality_marks WHERE sourceId = ?')
        .all(source!.id) as Array<{ mark: string }>

      expect(marks.length).toBe(2)
      expect(marks.map(m => m.mark)).toContain('low-quality')
      expect(marks.map(m => m.mark)).toContain('cam-rip')
    })
  })

  describe('Update Operations', () => {
    it('should return existing movie on update', async () => {
      const now = new Date().toISOString()

      // Insert initial movie
      const initialEntry: MovieEntry = {
        movieId: testMovieId,
        title: 'Initial Title',
        year: 2023,
        verified: false,
        sources: [
          {
            type: 'youtube',
            url: 'https://youtube.com/watch?v=initial',
            id: 'initial',
            title: 'Initial Source',
            addedAt: now,
          },
        ],
        lastUpdated: now,
      }

      await upsertMovie(testMovieId, initialEntry)

      // Update movie
      const updatedEntry: MovieEntry = {
        movieId: testMovieId,
        title: 'Updated Title',
        year: 2024,
        verified: true,
        sources: [
          {
            type: 'youtube',
            url: 'https://youtube.com/watch?v=initial',
            id: 'initial',
            title: 'Initial Source',
            addedAt: now,
          },
        ],
        lastUpdated: now,
      }

      const result = await upsertMovie(testMovieId, updatedEntry)

      expect(result).toBeDefined()
      expect(result?.movieId).toBe(testMovieId)
      expect(result?.title).toBe('Initial Title') // Should return the original entry
    })

    it('should update movie fields on upsert', async () => {
      const now = new Date().toISOString()

      // Insert initial movie
      await upsertMovie(testMovieId, {
        movieId: testMovieId,
        title: 'Initial Title',
        year: 2023,
        verified: false,
        sources: [],
        lastUpdated: now,
      })

      // Update movie
      await upsertMovie(testMovieId, {
        movieId: testMovieId,
        title: 'Updated Title',
        year: 2024,
        verified: true,
        sources: [],
        lastUpdated: now,
      })

      // Verify update
      const movie = db.prepare('SELECT * FROM movies WHERE movieId = ?').get(testMovieId) as
        | { title: string; year: number; verified: number }
        | undefined

      expect(movie?.title).toBe('Updated Title')
      expect(movie?.year).toBe(2024)
      expect(movie?.verified).toBe(1)
    })

    it('should merge sources on update', async () => {
      const now = new Date().toISOString()

      // Insert initial movie with one source
      await upsertMovie(testMovieId, {
        movieId: testMovieId,
        title: 'Test Movie',
        year: 2023,
        verified: false,
        sources: [
          {
            type: 'youtube',
            url: 'https://youtube.com/watch?v=src1',
            id: 'src1',
            title: 'Source 1',
            addedAt: now,
          },
        ],
        lastUpdated: now,
      })

      // Update with additional source
      await upsertMovie(testMovieId, {
        movieId: testMovieId,
        title: 'Test Movie',
        year: 2023,
        verified: false,
        sources: [
          {
            type: 'youtube',
            url: 'https://youtube.com/watch?v=src1',
            id: 'src1',
            title: 'Source 1',
            addedAt: now,
          },
          {
            type: 'archive.org',
            url: 'https://archive.org/details/src2',
            id: 'src2',
            title: 'Source 2',
            addedAt: now,
          },
        ],
        lastUpdated: now,
      })

      // Verify both sources exist
      const sources = db.prepare('SELECT * FROM sources WHERE movieId = ?').all(testMovieId)

      expect(sources.length).toBe(2)
    })

    it('should update existing source fields', async () => {
      const now = new Date().toISOString()

      // Insert initial movie with source
      await upsertMovie(testMovieId, {
        movieId: testMovieId,
        title: 'Test Movie',
        year: 2023,
        verified: false,
        sources: [
          {
            type: 'youtube',
            url: 'https://youtube.com/watch?v=src1',
            id: 'src1',
            title: 'Initial Title',
            addedAt: now,
          },
        ],
        lastUpdated: now,
      })

      // Update source with new description
      await upsertMovie(testMovieId, {
        movieId: testMovieId,
        title: 'Test Movie',
        year: 2023,
        verified: false,
        sources: [
          {
            type: 'youtube',
            url: 'https://youtube.com/watch?v=src1',
            id: 'src1',
            title: 'Initial Title',
            description: 'New description',
            addedAt: now,
          },
        ],
        lastUpdated: now,
      })

      // Verify description was updated
      const source = db
        .prepare('SELECT description FROM sources WHERE movieId = ? AND sourceId = ?')
        .get(testMovieId, 'src1') as { description: string } | undefined

      expect(source?.description).toBe('New description')
    })

    it('should replace metadata on update', async () => {
      const now = new Date().toISOString()

      // Insert with initial metadata
      await upsertMovie(testMovieId, {
        movieId: testMovieId,
        title: 'Test Movie',
        year: 2023,
        verified: false,
        sources: [],
        metadata: {
          Title: 'Initial Title',
          Plot: 'Initial Plot',
        },
        lastUpdated: now,
      })

      // Update metadata
      await upsertMovie(testMovieId, {
        movieId: testMovieId,
        title: 'Test Movie',
        year: 2023,
        verified: false,
        sources: [],
        metadata: {
          Title: 'Updated Title',
          Plot: 'Updated Plot',
          imdbRating: 9.0,
        },
        lastUpdated: now,
      })

      // Verify metadata was replaced
      const metadata = db.prepare('SELECT * FROM metadata WHERE movieId = ?').get(testMovieId) as
        | { Title: string; Plot: string; imdbRating: number }
        | undefined

      expect(metadata?.Title).toBe('Updated Title')
      expect(metadata?.Plot).toBe('Updated Plot')
      expect(metadata?.imdbRating).toBe(9.0)
    })

    it('should replace ratings on metadata update', async () => {
      const now = new Date().toISOString()

      // Insert with initial ratings
      await upsertMovie(testMovieId, {
        movieId: testMovieId,
        title: 'Test Movie',
        year: 2023,
        verified: false,
        sources: [],
        metadata: {
          Ratings: [{ Source: 'IMDB', Value: '8.5/10' }],
        },
        lastUpdated: now,
      })

      // Update with new ratings
      await upsertMovie(testMovieId, {
        movieId: testMovieId,
        title: 'Test Movie',
        year: 2023,
        verified: false,
        sources: [],
        metadata: {
          Ratings: [
            { Source: 'IMDB', Value: '9.0/10' },
            { Source: 'Rotten Tomatoes', Value: '90%' },
          ],
        },
        lastUpdated: now,
      })

      // Verify ratings were replaced
      const ratings = db.prepare('SELECT * FROM ratings WHERE movieId = ?').all(testMovieId)

      expect(ratings.length).toBe(2)
    })
  })

  describe('Source Detection', () => {
    it('should detect existing movie by source ID', async () => {
      const now = new Date().toISOString()
      const originalId = 'test-original-id'
      const enrichedId = 'tt1234567'

      // Insert movie with temporary ID
      await upsertMovie(originalId, {
        movieId: originalId,
        title: 'Test Movie',
        year: 2023,
        verified: false,
        sources: [
          {
            type: 'youtube',
            url: 'https://youtube.com/watch?v=unique-source',
            id: 'unique-source',
            title: 'Unique Source',
            addedAt: now,
          },
        ],
        lastUpdated: now,
      })

      // Attempt to insert with new IMDb ID but same source
      const result = await upsertMovie(enrichedId, {
        movieId: enrichedId,
        title: 'Test Movie (Enriched)',
        year: 2023,
        verified: true,
        sources: [
          {
            type: 'youtube',
            url: 'https://youtube.com/watch?v=unique-source',
            id: 'unique-source',
            title: 'Unique Source',
            addedAt: now,
          },
        ],
        metadata: {
          Title: 'Test Movie',
          imdbRating: 8.5,
        },
        lastUpdated: now,
      })

      // Should return existing entry
      expect(result).toBeDefined()
      expect(result?.movieId).toBe(originalId)

      // Should update the original entry, not create a new one
      const _movies = db.prepare('SELECT COUNT(*) as count FROM movies').get() as { count: number }
      const originalMovie = db.prepare('SELECT * FROM movies WHERE movieId = ?').get(originalId) as
        | { verified: number }
        | undefined

      expect(originalMovie?.verified).toBe(1) // Should be updated to verified

      // Clean up
      db.prepare('DELETE FROM movies WHERE movieId = ?').run(originalId)
    })
  })

  describe('Transaction Behavior', () => {
    it('should rollback on error', async () => {
      const now = new Date().toISOString()

      // Attempt to insert with invalid data (this should fail)
      try {
        await upsertMovie(testMovieId, {
          movieId: testMovieId,
          title: 'Test Movie',
          year: 2023,
          verified: false,
          sources: [
            {
              type: 'invalid-type' as unknown as 'youtube', // Invalid type for testing
              url: 'https://test.com',
              id: 'test',
              title: 'Test',
              addedAt: now,
            },
          ],
          lastUpdated: now,
        })
      } catch {
        // Expected to fail
      }

      // Verify no data was inserted
      const movie = db.prepare('SELECT * FROM movies WHERE movieId = ?').get(testMovieId)
      expect(movie).toBeUndefined()
    })

    it('should commit all changes together', async () => {
      const now = new Date().toISOString()

      await upsertMovie(testMovieId, {
        movieId: testMovieId,
        title: 'Test Movie',
        year: 2023,
        verified: false,
        sources: [
          {
            type: 'youtube',
            url: 'https://youtube.com/watch?v=src1',
            id: 'src1',
            title: 'Source 1',
            addedAt: now,
            qualityMarks: ['low-quality'],
          },
        ],
        metadata: {
          Title: 'Test Movie',
          imdbRating: 8.5,
        },
        ai: {
          title: 'Cleaned Title',
          year: 2023,
        },
        lastUpdated: now,
      })

      // Verify all parts were committed
      const movie = db.prepare('SELECT * FROM movies WHERE movieId = ?').get(testMovieId)
      const sources = db.prepare('SELECT * FROM sources WHERE movieId = ?').all(testMovieId)
      const metadata = db.prepare('SELECT * FROM metadata WHERE movieId = ?').get(testMovieId)
      const aiMetadata = db.prepare('SELECT * FROM ai_metadata WHERE movieId = ?').get(testMovieId)

      expect(movie).toBeDefined()
      expect(sources.length).toBe(1)
      expect(metadata).toBeDefined()
      expect(aiMetadata).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty sources array', async () => {
      const now = new Date().toISOString()

      await upsertMovie(testMovieId, {
        movieId: testMovieId,
        title: 'Test Movie',
        year: 2023,
        verified: false,
        sources: [],
        lastUpdated: now,
      })

      const sources = db.prepare('SELECT * FROM sources WHERE movieId = ?').all(testMovieId)
      expect(sources.length).toBe(0)
    })

    it('should handle missing optional fields', async () => {
      const now = new Date().toISOString()

      await upsertMovie(testMovieId, {
        movieId: testMovieId,
        title: 'Test Movie',
        verified: false,
        sources: [],
        lastUpdated: now,
      })

      const movie = db.prepare('SELECT * FROM movies WHERE movieId = ?').get(testMovieId) as
        | { year: number | null }
        | undefined

      expect(movie).toBeDefined()
      expect(movie?.year).toBeNull()
    })

    it('should handle language as string', async () => {
      const now = new Date().toISOString()

      await upsertMovie(testMovieId, {
        movieId: testMovieId,
        title: 'Test Movie',
        verified: false,
        sources: [
          {
            type: 'youtube',
            url: 'https://youtube.com/watch?v=lang1',
            id: 'lang1',
            title: 'Language Test',
            language: 'en',
            addedAt: now,
          },
        ],
        lastUpdated: now,
      })

      const source = db.prepare('SELECT language FROM sources WHERE sourceId = ?').get('lang1') as
        | { language: string }
        | undefined

      expect(source?.language).toBe('en')
    })

    it('should handle language as array', async () => {
      const now = new Date().toISOString()

      await upsertMovie(testMovieId, {
        movieId: testMovieId,
        title: 'Test Movie',
        verified: false,
        sources: [
          {
            type: 'youtube',
            url: 'https://youtube.com/watch?v=lang2',
            id: 'lang2',
            title: 'Language Test',
            language: ['en', 'es'],
            addedAt: now,
          },
        ],
        lastUpdated: now,
      })

      const source = db.prepare('SELECT language FROM sources WHERE sourceId = ?').get('lang2') as
        | { language: string }
        | undefined

      // Should store first language only
      expect(source?.language).toBe('en')
    })

    it('should handle region restrictions', async () => {
      const now = new Date().toISOString()

      await upsertMovie(testMovieId, {
        movieId: testMovieId,
        title: 'Test Movie',
        verified: false,
        sources: [
          {
            type: 'youtube',
            url: 'https://youtube.com/watch?v=region1',
            id: 'region1',
            title: 'Region Test',
            regionRestriction: {
              allowed: ['US', 'CA'],
              blocked: ['CN'],
            },
            addedAt: now,
          },
        ],
        lastUpdated: now,
      })

      const source = db
        .prepare(
          'SELECT regionRestrictionAllowed, regionRestrictionBlocked FROM sources WHERE sourceId = ?'
        )
        .get('region1') as
        | { regionRestrictionAllowed: string; regionRestrictionBlocked: string }
        | undefined

      expect(source?.regionRestrictionAllowed).toBe('["US","CA"]')
      expect(source?.regionRestrictionBlocked).toBe('["CN"]')
    })

    it('should handle special characters in titles', async () => {
      const now = new Date().toISOString()
      const specialTitle = "Test Movie: The Return of O'Brien & Co. (2023)"

      await upsertMovie(testMovieId, {
        movieId: testMovieId,
        title: specialTitle,
        verified: false,
        sources: [],
        lastUpdated: now,
      })

      const movie = db.prepare('SELECT title FROM movies WHERE movieId = ?').get(testMovieId) as
        | { title: string }
        | undefined

      expect(movie?.title).toBe(specialTitle)
    })
  })

  describe('Data Integrity', () => {
    it('should maintain foreign key constraints', async () => {
      const now = new Date().toISOString()

      await upsertMovie(testMovieId, {
        movieId: testMovieId,
        title: 'Test Movie',
        verified: false,
        sources: [
          {
            type: 'youtube',
            url: 'https://youtube.com/watch?v=fk1',
            id: 'fk1',
            title: 'FK Test',
            addedAt: now,
          },
        ],
        lastUpdated: now,
      })

      // Delete movie (should cascade to sources)
      db.prepare('DELETE FROM movies WHERE movieId = ?').run(testMovieId)

      // Verify sources were also deleted
      const sources = db.prepare('SELECT * FROM sources WHERE movieId = ?').all(testMovieId)
      expect(sources.length).toBe(0)
    })

    it('should prevent duplicate sources', async () => {
      const now = new Date().toISOString()

      // Insert movie with source
      await upsertMovie(testMovieId, {
        movieId: testMovieId,
        title: 'Test Movie',
        verified: false,
        sources: [
          {
            type: 'youtube',
            url: 'https://youtube.com/watch?v=dup1',
            id: 'dup1',
            title: 'Duplicate Test',
            addedAt: now,
          },
        ],
        lastUpdated: now,
      })

      // Try to insert same source again
      await upsertMovie(testMovieId, {
        movieId: testMovieId,
        title: 'Test Movie',
        verified: false,
        sources: [
          {
            type: 'youtube',
            url: 'https://youtube.com/watch?v=dup1',
            id: 'dup1',
            title: 'Duplicate Test',
            addedAt: now,
          },
        ],
        lastUpdated: now,
      })

      // Verify only one source exists
      const sources = db.prepare('SELECT * FROM sources WHERE movieId = ?').all(testMovieId)
      expect(sources.length).toBe(1)
    })
  })
})
