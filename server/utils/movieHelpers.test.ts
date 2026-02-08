/**
 * Tests for movieHelpers.ts
 *
 * Validates all helper functions for common movie operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getMovieById,
  getMoviesByIds,
  searchMovies,
  getMovieCount,
  addSource,
  removeSource,
  getSourcesByMovieId,
  updateSourceQualityMarks,
  updateMetadata,
  updateAIMetadata,
  hasMetadata,
  addQualityLabel,
  removeQualityLabel,
  getQualityLabels,
} from './movieHelpers'
import { getAdminDatabase } from './adminDb'
import type Database from 'better-sqlite3'

describe('movieHelpers', () => {
  let db: Database.Database

  beforeEach(() => {
    db = getAdminDatabase()
    // Clean up test data
    db.prepare('DELETE FROM movies WHERE movieId LIKE ?').run('test-helper-%')
    db.prepare('DELETE FROM collections WHERE id LIKE ?').run('test-helper-%')
  })

  afterEach(() => {
    // Clean up test data
    db.prepare('DELETE FROM movies WHERE movieId LIKE ?').run('test-helper-%')
    db.prepare('DELETE FROM collections WHERE id LIKE ?').run('test-helper-%')
  })

  describe('getMovieById', () => {
    it('should return movie by ID', async () => {
      const movieId = 'test-helper-001'
      const now = new Date().toISOString()

      db.prepare(
        'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
      ).run(movieId, 'Test Movie', 2023, 1, now)

      const movie = await getMovieById(movieId)

      expect(movie).toBeDefined()
      expect(movie?.movieId).toBe(movieId)
      expect(movie?.title).toBe('Test Movie')
      expect(movie?.year).toBe(2023)
      expect(movie?.verified).toBe(true)
    })

    it('should return null for non-existent movie', async () => {
      const movie = await getMovieById('nonexistent-movie')
      expect(movie).toBeNull()
    })

    it('should include sources in returned movie', async () => {
      const movieId = 'test-helper-002'
      const now = new Date().toISOString()

      db.prepare(
        'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
      ).run(movieId, 'Test Movie', 2023, 0, now)

      db.prepare(
        'INSERT INTO sources (movieId, type, url, sourceId, title, addedAt) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(movieId, 'youtube', 'https://youtube.com/watch?v=test', 'test', 'Test Video', now)

      const movie = await getMovieById(movieId)

      expect(movie?.sources).toBeDefined()
      expect(movie?.sources.length).toBe(1)
      expect(movie?.sources[0]?.id).toBe('test')
    })

    it('should include metadata in returned movie', async () => {
      const movieId = 'test-helper-003'
      const now = new Date().toISOString()

      db.prepare(
        'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
      ).run(movieId, 'Test Movie', 2023, 0, now)

      db.prepare('INSERT INTO metadata (movieId, Title, Plot) VALUES (?, ?, ?)').run(
        movieId,
        'Test Movie',
        'Test plot'
      )

      const movie = await getMovieById(movieId)

      expect(movie?.metadata).toBeDefined()
      expect(movie?.metadata?.Title).toBe('Test Movie')
      expect(movie?.metadata?.Plot).toBe('Test plot')
    })
  })

  describe('getMoviesByIds', () => {
    it('should return multiple movies by IDs', async () => {
      const now = new Date().toISOString()
      const ids = ['test-helper-batch-1', 'test-helper-batch-2', 'test-helper-batch-3']

      for (const id of ids) {
        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(id, `Movie ${id}`, 2023, 0, now)
      }

      const movies = await getMoviesByIds(ids)

      expect(movies.length).toBe(3)
      expect(movies.map(m => m.movieId)).toEqual(expect.arrayContaining(ids))
    })

    it('should return empty array for empty input', async () => {
      const movies = await getMoviesByIds([])
      expect(movies).toEqual([])
    })

    it('should skip non-existent movies', async () => {
      const now = new Date().toISOString()

      db.prepare(
        'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
      ).run('test-helper-batch-4', 'Existing Movie', 2023, 0, now)

      const movies = await getMoviesByIds(['test-helper-batch-4', 'nonexistent-1', 'nonexistent-2'])

      expect(movies.length).toBe(1)
      expect(movies[0]?.movieId).toBe('test-helper-batch-4')
    })
  })

  describe('searchMovies', () => {
    beforeEach(() => {
      const now = new Date().toISOString()

      // Insert test movies with various attributes
      db.prepare(
        'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
      ).run('test-helper-search-1', 'Action Movie', 2020, 1, now)
      db.prepare(
        'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
      ).run('test-helper-search-2', 'Drama Film', 2021, 0, now)
      db.prepare(
        'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
      ).run('test-helper-search-3', 'Comedy Show', 2022, 1, now)

      // Add metadata
      db.prepare('INSERT INTO metadata (movieId, Genre, imdbRating) VALUES (?, ?, ?)').run(
        'test-helper-search-1',
        'Action',
        8.5
      )
      db.prepare('INSERT INTO metadata (movieId, Genre, imdbRating) VALUES (?, ?, ?)').run(
        'test-helper-search-2',
        'Drama',
        7.0
      )

      // Add FTS entries
      db.prepare('INSERT INTO fts_movies (movieId, title) VALUES (?, ?)').run(
        'test-helper-search-1',
        'Action Movie'
      )
      db.prepare('INSERT INTO fts_movies (movieId, title) VALUES (?, ?)').run(
        'test-helper-search-2',
        'Drama Film'
      )
      db.prepare('INSERT INTO fts_movies (movieId, title) VALUES (?, ?)').run(
        'test-helper-search-3',
        'Comedy Show'
      )
    })

    afterEach(() => {
      // Clean up FTS entries
      db.prepare('DELETE FROM fts_movies WHERE movieId LIKE ?').run('test-helper-search-%')
    })

    it('should search by title', async () => {
      const results = await searchMovies('Action')

      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.some(m => m.movieId === 'test-helper-search-1')).toBe(true)
    })

    it('should filter by year', async () => {
      const results = await searchMovies('', { year: 2021 })

      expect(results.some(m => m.movieId === 'test-helper-search-2')).toBe(true)
    })

    it('should filter by year range', async () => {
      const results = await searchMovies('', { yearFrom: 2020, yearTo: 2021 })

      expect(results.length).toBeGreaterThanOrEqual(2)
    })

    it('should filter by verified status', async () => {
      const results = await searchMovies('', { verified: true })

      expect(results.every(m => m.verified === true)).toBe(true)
    })

    it('should filter by genre', async () => {
      const results = await searchMovies('', { genre: 'Action' })

      expect(results.some(m => m.movieId === 'test-helper-search-1')).toBe(true)
    })

    it('should filter by minimum rating', async () => {
      const results = await searchMovies('', { minRating: 8.0 })

      expect(results.some(m => m.movieId === 'test-helper-search-1')).toBe(true)
      expect(results.every(m => m.movieId !== 'test-helper-search-2')).toBe(true)
    })

    it('should support pagination', async () => {
      const page1 = await searchMovies('', { limit: 2, offset: 0 })
      const page2 = await searchMovies('', { limit: 2, offset: 2 })

      expect(page1.length).toBeLessThanOrEqual(2)
      expect(page2.length).toBeLessThanOrEqual(2)
    })
  })

  describe('getMovieCount', () => {
    it('should return total movie count', async () => {
      const initialCount = await getMovieCount()

      // Add test movies
      const now = new Date().toISOString()
      db.prepare(
        'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
      ).run('test-helper-count-1', 'Count Test 1', 2023, 0, now)
      db.prepare(
        'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
      ).run('test-helper-count-2', 'Count Test 2', 2023, 0, now)

      const newCount = await getMovieCount()

      expect(newCount).toBe(initialCount + 2)
    })
  })

  describe('Source Operations', () => {
    describe('addSource', () => {
      it('should add source to movie', async () => {
        const movieId = 'test-helper-source-1'
        const now = new Date().toISOString()

        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(movieId, 'Test Movie', 2023, 0, now)

        const source: MovieSource = {
          type: 'youtube',
          url: 'https://youtube.com/watch?v=newsrc',
          id: 'newsrc',
          title: 'New Source',
          addedAt: now,
        }

        await addSource(movieId, source)

        const sources = db.prepare('SELECT * FROM sources WHERE movieId = ?').all(movieId)
        expect(sources.length).toBe(1)
      })

      it('should throw error if movie does not exist', async () => {
        const source: MovieSource = {
          type: 'youtube',
          url: 'https://youtube.com/watch?v=test',
          id: 'test',
          title: 'Test',
          addedAt: new Date().toISOString(),
        }

        await expect(addSource('nonexistent', source)).rejects.toThrow('not found')
      })

      it('should throw error if source already exists', async () => {
        const movieId = 'test-helper-source-2'
        const now = new Date().toISOString()

        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(movieId, 'Test Movie', 2023, 0, now)

        const source: MovieSource = {
          type: 'youtube',
          url: 'https://youtube.com/watch?v=dup',
          id: 'dup',
          title: 'Duplicate',
          addedAt: now,
        }

        await addSource(movieId, source)

        // Try to add same source again
        await expect(addSource(movieId, source)).rejects.toThrow('already exists')
      })

      it('should add quality marks with source', async () => {
        const movieId = 'test-helper-source-3'
        const now = new Date().toISOString()

        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(movieId, 'Test Movie', 2023, 0, now)

        const source: MovieSource = {
          type: 'youtube',
          url: 'https://youtube.com/watch?v=quality',
          id: 'quality',
          title: 'Quality Source',
          qualityMarks: ['low-quality', 'cam-rip'],
          addedAt: now,
        }

        await addSource(movieId, source)

        const sourceId = db.prepare('SELECT id FROM sources WHERE sourceId = ?').get('quality') as {
          id: number
        }

        const marks = db
          .prepare('SELECT mark FROM source_quality_marks WHERE sourceId = ?')
          .all(sourceId.id)

        expect(marks.length).toBe(2)
      })
    })

    describe('removeSource', () => {
      it('should remove source from movie', async () => {
        const movieId = 'test-helper-remove-1'
        const now = new Date().toISOString()

        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(movieId, 'Test Movie', 2023, 0, now)

        db.prepare(
          'INSERT INTO sources (movieId, type, url, sourceId, title, addedAt) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(movieId, 'youtube', 'https://youtube.com/watch?v=remove', 'remove', 'Remove Me', now)

        await removeSource(movieId, 'remove')

        const sources = db.prepare('SELECT * FROM sources WHERE movieId = ?').all(movieId)
        expect(sources.length).toBe(0)
      })

      it('should throw error if source does not exist', async () => {
        const movieId = 'test-helper-remove-2'
        const now = new Date().toISOString()

        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(movieId, 'Test Movie', 2023, 0, now)

        await expect(removeSource(movieId, 'nonexistent')).rejects.toThrow('not found')
      })
    })

    describe('getSourcesByMovieId', () => {
      it('should get all sources for a movie', async () => {
        const movieId = 'test-helper-getsources-1'
        const now = new Date().toISOString()

        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(movieId, 'Test Movie', 2023, 0, now)

        db.prepare(
          'INSERT INTO sources (movieId, type, url, sourceId, title, addedAt) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(movieId, 'youtube', 'https://youtube.com/watch?v=src1', 'src1', 'Source 1', now)
        db.prepare(
          'INSERT INTO sources (movieId, type, url, sourceId, title, addedAt) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(movieId, 'archive.org', 'https://archive.org/details/src2', 'src2', 'Source 2', now)

        const sources = await getSourcesByMovieId(movieId)

        expect(sources.length).toBe(2)
      })

      it('should throw error if movie does not exist', async () => {
        await expect(getSourcesByMovieId('nonexistent')).rejects.toThrow('not found')
      })
    })

    describe('updateSourceQualityMarks', () => {
      it('should update quality marks for a source', async () => {
        const movieId = 'test-helper-updatemarks-1'
        const now = new Date().toISOString()

        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(movieId, 'Test Movie', 2023, 0, now)

        const result = db
          .prepare(
            'INSERT INTO sources (movieId, type, url, sourceId, title, addedAt) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(movieId, 'youtube', 'https://youtube.com/watch?v=marks', 'marks', 'Marks Test', now)

        await updateSourceQualityMarks('marks', ['low-quality', 'cam-rip'])

        const marks = db
          .prepare('SELECT mark FROM source_quality_marks WHERE sourceId = ?')
          .all(result.lastInsertRowid) as Array<{ mark: string }>

        expect(marks.length).toBe(2)
        expect(marks.map(m => m.mark)).toContain('low-quality')
        expect(marks.map(m => m.mark)).toContain('cam-rip')
      })

      it('should replace existing quality marks', async () => {
        const movieId = 'test-helper-updatemarks-2'
        const now = new Date().toISOString()

        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(movieId, 'Test Movie', 2023, 0, now)

        const result = db
          .prepare(
            'INSERT INTO sources (movieId, type, url, sourceId, title, addedAt) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(
            movieId,
            'youtube',
            'https://youtube.com/watch?v=replace',
            'replace',
            'Replace Test',
            now
          )

        // Add initial marks
        db.prepare(
          'INSERT INTO source_quality_marks (sourceId, mark, addedAt) VALUES (?, ?, ?)'
        ).run(result.lastInsertRowid, 'low-quality', now)

        // Update with new marks
        await updateSourceQualityMarks('replace', ['cam-rip', 'hardcoded-subs'])

        const marks = db
          .prepare('SELECT mark FROM source_quality_marks WHERE sourceId = ?')
          .all(result.lastInsertRowid) as Array<{ mark: string }>

        expect(marks.length).toBe(2)
        expect(marks.map(m => m.mark)).not.toContain('low-quality')
        expect(marks.map(m => m.mark)).toContain('cam-rip')
      })
    })
  })

  describe('Metadata Operations', () => {
    describe('updateMetadata', () => {
      it('should update metadata for a movie', async () => {
        const movieId = 'test-helper-metadata-1'
        const now = new Date().toISOString()

        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(movieId, 'Test Movie', 2023, 0, now)

        await updateMetadata(movieId, {
          Title: 'Test Movie',
          Plot: 'Test plot',
          imdbRating: 8.5,
          Ratings: [{ Source: 'IMDB', Value: '8.5/10' }],
        })

        const metadata = db.prepare('SELECT * FROM metadata WHERE movieId = ?').get(movieId) as
          | { Title: string; Plot: string; imdbRating: number }
          | undefined

        expect(metadata?.Title).toBe('Test Movie')
        expect(metadata?.Plot).toBe('Test plot')
        expect(metadata?.imdbRating).toBe(8.5)

        const ratings = db.prepare('SELECT * FROM ratings WHERE movieId = ?').all(movieId)
        expect(ratings.length).toBe(1)
      })

      it('should throw error if movie does not exist', async () => {
        await expect(
          updateMetadata('nonexistent', {
            Title: 'Test',
          })
        ).rejects.toThrow('not found')
      })
    })

    describe('updateAIMetadata', () => {
      it('should update AI metadata for a movie', async () => {
        const movieId = 'test-helper-ai-1'
        const now = new Date().toISOString()

        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(movieId, 'Test Movie', 2023, 0, now)

        await updateAIMetadata(movieId, {
          title: 'Cleaned Title',
          year: 2023,
        })

        const aiMetadata = db
          .prepare('SELECT * FROM ai_metadata WHERE movieId = ?')
          .get(movieId) as { title: string; year: number } | undefined

        expect(aiMetadata?.title).toBe('Cleaned Title')
        expect(aiMetadata?.year).toBe(2023)
      })
    })

    describe('hasMetadata', () => {
      it('should return true if movie has metadata', async () => {
        const movieId = 'test-helper-hasmd-1'
        const now = new Date().toISOString()

        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(movieId, 'Test Movie', 2023, 0, now)

        db.prepare('INSERT INTO metadata (movieId, Title) VALUES (?, ?)').run(movieId, 'Test Movie')

        const result = await hasMetadata(movieId)
        expect(result).toBe(true)
      })

      it('should return false if movie does not have metadata', async () => {
        const movieId = 'test-helper-hasmd-2'
        const now = new Date().toISOString()

        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(movieId, 'Test Movie', 2023, 0, now)

        const result = await hasMetadata(movieId)
        expect(result).toBe(false)
      })
    })
  })

  describe('Quality Label Operations', () => {
    describe('addQualityLabel', () => {
      it('should add quality label to movie', async () => {
        const movieId = 'test-helper-label-1'
        const now = new Date().toISOString()

        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(movieId, 'Test Movie', 2023, 0, now)

        await addQualityLabel(movieId, QualityLabel.CLIP)

        const labels = db
          .prepare('SELECT label FROM movie_quality_labels WHERE movieId = ?')
          .all(movieId)

        expect(labels.length).toBe(1)
      })

      it('should throw error if label already exists', async () => {
        const movieId = 'test-helper-label-2'
        const now = new Date().toISOString()

        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(movieId, 'Test Movie', 2023, 0, now)

        await addQualityLabel(movieId, QualityLabel.CLIP)

        await expect(addQualityLabel(movieId, QualityLabel.CLIP)).rejects.toThrow('already exists')
      })
    })

    describe('removeQualityLabel', () => {
      it('should remove quality label from movie', async () => {
        const movieId = 'test-helper-removelabel-1'
        const now = new Date().toISOString()

        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(movieId, 'Test Movie', 2023, 0, now)

        db.prepare(
          'INSERT INTO movie_quality_labels (movieId, label, addedAt) VALUES (?, ?, ?)'
        ).run(movieId, 'clip', now)

        await removeQualityLabel(movieId, QualityLabel.CLIP)

        const labels = db
          .prepare('SELECT label FROM movie_quality_labels WHERE movieId = ?')
          .all(movieId)

        expect(labels.length).toBe(0)
      })
    })

    describe('getQualityLabels', () => {
      it('should get all quality labels for a movie', async () => {
        const movieId = 'test-helper-getlabels-1'
        const now = new Date().toISOString()

        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(movieId, 'Test Movie', 2023, 0, now)

        db.prepare(
          'INSERT INTO movie_quality_labels (movieId, label, addedAt) VALUES (?, ?, ?)'
        ).run(movieId, 'clip', now)
        db.prepare(
          'INSERT INTO movie_quality_labels (movieId, label, addedAt) VALUES (?, ?, ?)'
        ).run(movieId, 'trailer', now)

        const labels = await getQualityLabels(movieId)

        expect(labels.length).toBe(2)
        expect(labels).toContain(QualityLabel.CLIP)
        expect(labels).toContain(QualityLabel.TRAILER)
      })
    })
  })

  describe('Collection Operations', () => {
    describe('addToCollection', () => {
      it('should add movie to collection', async () => {
        const movieId = 'test-helper-collection-1'
        const collectionId = 'test-helper-collection-test'
        const now = new Date().toISOString()

        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(movieId, 'Test Movie', 2023, 0, now)

        db.prepare(
          'INSERT INTO collections (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)'
        ).run(collectionId, 'Test Collection', 'Test', now, now)

        await addToCollection(movieId, collectionId)

        const result = db
          .prepare('SELECT * FROM collection_movies WHERE movieId = ? AND collectionId = ?')
          .get(movieId, collectionId)

        expect(result).toBeDefined()
      })

      it('should throw error if collection does not exist', async () => {
        const movieId = 'test-helper-collection-2'
        const now = new Date().toISOString()

        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(movieId, 'Test Movie', 2023, 0, now)

        await expect(addToCollection(movieId, 'nonexistent-collection')).rejects.toThrow(
          'not found'
        )
      })
    })

    describe('removeFromCollection', () => {
      it('should remove movie from collection', async () => {
        const movieId = 'test-helper-removecol-1'
        const collectionId = 'test-helper-collection-remove'
        const now = new Date().toISOString()

        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(movieId, 'Test Movie', 2023, 0, now)

        db.prepare(
          'INSERT INTO collections (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)'
        ).run(collectionId, 'Test Collection', 'Test', now, now)

        db.prepare(
          'INSERT INTO collection_movies (collectionId, movieId, addedAt) VALUES (?, ?, ?)'
        ).run(collectionId, movieId, now)

        await removeFromCollection(movieId, collectionId)

        const result = db
          .prepare('SELECT * FROM collection_movies WHERE movieId = ? AND collectionId = ?')
          .get(movieId, collectionId)

        expect(result).toBeUndefined()
      })
    })

    describe('getCollections', () => {
      it('should get all collections for a movie', async () => {
        const movieId = 'test-helper-getcols-1'
        const collectionId1 = 'test-helper-collection-get-1'
        const collectionId2 = 'test-helper-collection-get-2'
        const now = new Date().toISOString()

        db.prepare(
          'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
        ).run(movieId, 'Test Movie', 2023, 0, now)

        db.prepare(
          'INSERT INTO collections (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)'
        ).run(collectionId1, 'Collection 1', 'Test', now, now)
        db.prepare(
          'INSERT INTO collections (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)'
        ).run(collectionId2, 'Collection 2', 'Test', now, now)

        db.prepare(
          'INSERT INTO collection_movies (collectionId, movieId, addedAt) VALUES (?, ?, ?)'
        ).run(collectionId1, movieId, now)
        db.prepare(
          'INSERT INTO collection_movies (collectionId, movieId, addedAt) VALUES (?, ?, ?)'
        ).run(collectionId2, movieId, now)

        const collections = await getMovieCollections(movieId)

        expect(collections.length).toBe(2)
        expect(collections.map(c => c.id)).toContain(collectionId1)
        expect(collections.map(c => c.id)).toContain(collectionId2)
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Try to get movie from closed database (simulating error)
      await expect(getMovieById('test-error')).rejects.toThrow()
    })
  })

  describe('Data Integrity', () => {
    it('should maintain foreign key constraints', async () => {
      const movieId = 'test-helper-fk-1'
      const now = new Date().toISOString()

      db.prepare(
        'INSERT INTO movies (movieId, title, year, verified, lastUpdated) VALUES (?, ?, ?, ?, ?)'
      ).run(movieId, 'Test Movie', 2023, 0, now)

      const source: MovieSource = {
        type: 'youtube',
        url: 'https://youtube.com/watch?v=fk',
        id: 'fk',
        title: 'FK Test',
        addedAt: now,
      }

      await addSource(movieId, source)

      // Delete movie (should cascade)
      db.prepare('DELETE FROM movies WHERE movieId = ?').run(movieId)

      const sources = db.prepare('SELECT * FROM sources WHERE movieId = ?').all(movieId)
      expect(sources.length).toBe(0)
    })
  })
})
