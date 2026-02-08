-- ============================================================================
-- Movies Deluxe - Admin Database Schema
-- ============================================================================
-- Purpose: Source of truth for all movie data (replaces movies.json)
-- Location: data/movies.db
-- Mode: WAL (Write-Ahead Logging for better write performance)
--
-- This schema stores the complete movie database including:
-- - All movie entries with metadata
-- - All sources (Archive.org, YouTube) with full details
-- - Quality marks for sources
-- - OMDB metadata (imdbRating is sufficient)
-- - AI-extracted metadata
-- - Collections and relationships
-- - Schema versioning
--
-- Key differences from web DB (public/data/movies.db):
-- - Admin DB stores ALL sources (including quality-marked ones)
-- - Admin DB stores raw source data (not filtered)
-- - Admin DB is the write target for scrapers and admin operations
-- - Admin DB uses WAL mode for better concurrent write performance
-- ============================================================================

-- Enable WAL mode for better write performance
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

-- ============================================================================
-- SCHEMA METADATA
-- ============================================================================

CREATE TABLE _schema (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Insert schema version metadata
INSERT INTO _schema (key, value) VALUES ('version', '1.0.0');
INSERT INTO _schema (key, value) VALUES ('description', 'Movies Deluxe Admin Database');
INSERT INTO _schema (key, value) VALUES ('created_at', datetime('now'));
INSERT INTO _schema (key, value) VALUES ('last_updated', datetime('now'));

-- ============================================================================
-- MOVIES TABLE
-- ============================================================================
-- Stores the main movie entry data (corresponds to MovieEntry interface)

CREATE TABLE movies (
  movieId TEXT PRIMARY KEY,              -- IMDB ID (tt0012345) or temporary ID (archive-xyz, youtube-abc)
  title TEXT NOT NULL,                   -- Movie title
  year INTEGER,                          -- Release year
  verified INTEGER DEFAULT 0,            -- Whether entry has been manually verified (0=false, 1=true)
  lastUpdated TEXT NOT NULL,             -- ISO 8601 timestamp
  
  -- Indexes for common queries
  CHECK (verified IN (0, 1))
);

CREATE INDEX idx_movies_title ON movies(title);
CREATE INDEX idx_movies_year ON movies(year);
CREATE INDEX idx_movies_verified ON movies(verified);
CREATE INDEX idx_movies_lastUpdated ON movies(lastUpdated);

-- ============================================================================
-- CHANNELS TABLE
-- ============================================================================
-- Stores channel/collection information normalized from sources
-- YouTube channels and Archive.org collection

CREATE TABLE channels (
  id TEXT PRIMARY KEY,                   -- channelId for YouTube, 'archive.org' for Archive
  name TEXT NOT NULL,                    -- Channel/collection name
  platform TEXT NOT NULL,                -- 'youtube' or 'archive.org'
  created_at INTEGER DEFAULT (unixepoch()),
  
  CHECK (platform IN ('youtube', 'archive.org'))
);

CREATE INDEX idx_channels_platform ON channels(platform);
CREATE INDEX idx_channels_name ON channels(name);

-- ============================================================================
-- SOURCES TABLE
-- ============================================================================
-- Stores all movie sources (Archive.org, YouTube) with complete details
-- Corresponds to MovieSource interface

CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movieId TEXT NOT NULL,                 -- Foreign key to movies table
  channelId TEXT NOT NULL,               -- Foreign key to channels table
  sourceId TEXT NOT NULL,                -- Archive.org identifier or YouTube video ID
  title TEXT,                            -- Original title from the source
  description TEXT,                      -- Original source description
  size INTEGER,                          -- File size in bytes (Archive.org only)
  addedAt INTEGER,                       -- Unix timestamp
  duration INTEGER,                      -- Duration in seconds
  language TEXT,                         -- Language code(s) - stored as JSON for arrays
  year INTEGER,                          -- Consolidated release year
  downloads INTEGER,                     -- Download count (Archive.org)
  viewCount INTEGER,                     -- View count (YouTube)
  regionRestriction TEXT,                -- JSON object with allowed/blocked regions
  
  FOREIGN KEY (movieId) REFERENCES movies(movieId) ON DELETE CASCADE,
  FOREIGN KEY (channelId) REFERENCES channels(id),
  UNIQUE(movieId, channelId, sourceId)
);

CREATE INDEX idx_sources_movieId ON sources(movieId);
CREATE INDEX idx_sources_channelId ON sources(channelId);
CREATE INDEX idx_sources_sourceId ON sources(sourceId);
CREATE INDEX idx_sources_year ON sources(year);
CREATE INDEX idx_sources_addedAt ON sources(addedAt);

-- ============================================================================
-- SOURCE QUALITY MARKS TABLE
-- ============================================================================
-- Stores quality marks for individual sources
-- Corresponds to qualityMarks field in MovieSource

CREATE TABLE source_quality_marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sourceId INTEGER NOT NULL,             -- Foreign key to sources table
  mark TEXT NOT NULL,                    -- Quality mark (e.g., 'low-quality', 'cam-rip')
  addedAt TEXT NOT NULL DEFAULT (datetime('now')),
  
  FOREIGN KEY (sourceId) REFERENCES sources(id) ON DELETE CASCADE,
  CHECK (mark IN (
    'low-quality',
    'cam-rip',
    'hardcoded-subs',
    'audio-issues',
    'video-issues',
    'incomplete',
    'wrong-aspect-ratio',
    'poor-metadata'
  ))
);

CREATE INDEX idx_source_quality_marks_sourceId ON source_quality_marks(sourceId);
CREATE INDEX idx_source_quality_marks_mark ON source_quality_marks(mark);
CREATE UNIQUE INDEX idx_source_quality_marks_unique ON source_quality_marks(sourceId, mark);

-- ============================================================================
-- METADATA TABLE
-- ============================================================================
-- Stores OMDB metadata for movies
-- Corresponds to MovieMetadata interface

CREATE TABLE metadata (
  movieId TEXT PRIMARY KEY,              -- Foreign key to movies table
  Title TEXT,
  Year TEXT,
  Rated TEXT,
  Runtime TEXT,
  Genre TEXT,
  Director TEXT,
  Writer TEXT,
  Actors TEXT,
  Plot TEXT,
  Language TEXT,
  Country TEXT,
  Awards TEXT,
  imdbRating REAL,
  imdbVotes INTEGER,
  imdbID TEXT,
  Type TEXT,
  
  FOREIGN KEY (movieId) REFERENCES movies(movieId) ON DELETE CASCADE
);

CREATE INDEX idx_metadata_imdbRating ON metadata(imdbRating);
CREATE INDEX idx_metadata_imdbVotes ON metadata(imdbVotes);
CREATE INDEX idx_metadata_Genre ON metadata(Genre);
CREATE INDEX idx_metadata_Country ON metadata(Country);
CREATE INDEX idx_metadata_Director ON metadata(Director);
CREATE INDEX idx_metadata_Year ON metadata(Year);



-- ============================================================================
-- AI METADATA TABLE
-- ============================================================================
-- Stores AI-extracted metadata from Ollama
-- Corresponds to AIMetadata interface

CREATE TABLE ai_metadata (
  movieId TEXT PRIMARY KEY,              -- Foreign key to movies table
  title TEXT,                            -- Cleaned movie title extracted by AI
  year INTEGER,                          -- Release year extracted by AI
  extractedAt TEXT NOT NULL DEFAULT (datetime('now')),
  
  FOREIGN KEY (movieId) REFERENCES movies(movieId) ON DELETE CASCADE
);

CREATE INDEX idx_ai_metadata_title ON ai_metadata(title);
CREATE INDEX idx_ai_metadata_year ON ai_metadata(year);

-- ============================================================================
-- COLLECTIONS TABLE
-- ============================================================================
-- Stores movie collections (curated lists)

CREATE TABLE collections (
  id TEXT PRIMARY KEY,                   -- Collection ID (e.g., 'criterion-collection')
  name TEXT NOT NULL,                    -- Display name
  description TEXT,                      -- Description
  createdAt TEXT NOT NULL,               -- ISO 8601 timestamp
  updatedAt TEXT NOT NULL                -- ISO 8601 timestamp
);

CREATE INDEX idx_collections_name ON collections(name);

-- ============================================================================
-- COLLECTION MOVIES TABLE
-- ============================================================================
-- Junction table for many-to-many relationship between collections and movies

CREATE TABLE collection_movies (
  collectionId TEXT NOT NULL,            -- Foreign key to collections table
  movieId TEXT NOT NULL,                 -- Foreign key to movies table
  addedAt TEXT NOT NULL,                 -- ISO 8601 timestamp
  
  PRIMARY KEY (collectionId, movieId),
  FOREIGN KEY (collectionId) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY (movieId) REFERENCES movies(movieId) ON DELETE CASCADE
);

CREATE INDEX idx_collection_movies_collectionId ON collection_movies(collectionId);
CREATE INDEX idx_collection_movies_movieId ON collection_movies(movieId);

-- ============================================================================
-- RELATED MOVIES TABLE
-- ============================================================================
-- Stores relationships between movies

CREATE TABLE related_movies (
  movieId TEXT NOT NULL,                 -- Foreign key to movies table
  relatedMovieId TEXT NOT NULL,          -- Foreign key to movies table
  addedAt TEXT NOT NULL DEFAULT (datetime('now')),
  
  PRIMARY KEY (movieId, relatedMovieId),
  FOREIGN KEY (movieId) REFERENCES movies(movieId) ON DELETE CASCADE,
  FOREIGN KEY (relatedMovieId) REFERENCES movies(movieId) ON DELETE CASCADE
);

CREATE INDEX idx_related_movies_movieId ON related_movies(movieId);
CREATE INDEX idx_related_movies_relatedMovieId ON related_movies(relatedMovieId);

-- ============================================================================
-- FULL-TEXT SEARCH TABLES
-- ============================================================================
-- FTS5 virtual tables for efficient text search

-- Movie titles
CREATE VIRTUAL TABLE fts_movies USING fts5(
  movieId UNINDEXED,
  title,
  tokenize='unicode61'
);

-- Source titles and descriptions
CREATE VIRTUAL TABLE fts_sources USING fts5(
  sourceId UNINDEXED,
  title,
  description,
  tokenize='unicode61'
);

-- Metadata (plot, actors, director, genre)
CREATE VIRTUAL TABLE fts_metadata USING fts5(
  movieId UNINDEXED,
  plot,
  actors,
  director,
  genre,
  tokenize='unicode61'
);

-- ============================================================================
-- QUALITY LABELS TABLE (for movie-level quality issues)
-- ============================================================================
-- Stores quality labels for entire movie entries
-- These are different from source_quality_marks which apply to individual sources

CREATE TABLE movie_quality_labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movieId TEXT NOT NULL,                 -- Foreign key to movies table
  label TEXT NOT NULL,                   -- Quality label
  addedAt TEXT NOT NULL DEFAULT (datetime('now')),
  
  FOREIGN KEY (movieId) REFERENCES movies(movieId) ON DELETE CASCADE,
  CHECK (label IN (
    'clip',
    'teaser',
    'trailer',
    'promo',
    'behind-the-scenes',
    'interview',
    'duplicate',
    'incorrect',
    'incomplete',
    'adult',
    'blocked'
  ))
);

CREATE INDEX idx_movie_quality_labels_movieId ON movie_quality_labels(movieId);
CREATE INDEX idx_movie_quality_labels_label ON movie_quality_labels(label);
CREATE UNIQUE INDEX idx_movie_quality_labels_unique ON movie_quality_labels(movieId, label);

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Lightweight movie view (for grid display and filtering)
CREATE VIEW v_movies_lightweight AS
SELECT 
  m.movieId,
  m.title,
  m.year,
  m.verified,
  m.lastUpdated,
  md.imdbRating,
  md.imdbVotes,
  md.Genre as genre,
  md.Country as country,
  md.Language as language,
  (SELECT c.platform FROM sources s JOIN channels c ON s.channelId = c.id WHERE s.movieId = m.movieId ORDER BY s.addedAt LIMIT 1) as primarySourceType,
  (SELECT c.name FROM sources s JOIN channels c ON s.channelId = c.id WHERE s.movieId = m.movieId AND c.platform = 'youtube' ORDER BY s.addedAt LIMIT 1) as primaryChannelName,
  (SELECT COUNT(*) FROM sources WHERE movieId = m.movieId) as sourceCount,
  (SELECT COUNT(*) FROM source_quality_marks sqm 
   JOIN sources s ON sqm.sourceId = s.id 
   WHERE s.movieId = m.movieId) as qualityMarkCount
FROM movies m
LEFT JOIN metadata md ON m.movieId = md.movieId;

-- Movies with quality issues (have quality labels or quality-marked sources)
CREATE VIEW v_movies_quality_issues AS
SELECT DISTINCT
  m.movieId,
  m.title,
  m.year,
  (SELECT GROUP_CONCAT(label, ', ') FROM movie_quality_labels WHERE movieId = m.movieId) as movieLabels,
  (SELECT GROUP_CONCAT(DISTINCT mark, ', ') 
   FROM source_quality_marks sqm 
   JOIN sources s ON sqm.sourceId = s.id 
   WHERE s.movieId = m.movieId) as sourceMarks
FROM movies m
WHERE EXISTS (SELECT 1 FROM movie_quality_labels WHERE movieId = m.movieId)
   OR EXISTS (SELECT 1 FROM source_quality_marks sqm 
              JOIN sources s ON sqm.sourceId = s.id 
              WHERE s.movieId = m.movieId);

-- Source statistics by type
CREATE VIEW v_source_stats AS
SELECT 
  c.platform as type,
  COUNT(*) as totalSources,
  COUNT(DISTINCT s.movieId) as uniqueMovies,
  AVG(s.duration) as avgDuration,
  SUM(s.size) as totalSize,
  AVG(s.size) as avgSize
FROM sources s
JOIN channels c ON s.channelId = c.id
GROUP BY c.platform;

-- Collection statistics
CREATE VIEW v_collection_stats AS
SELECT 
  c.id,
  c.name,
  COUNT(cm.movieId) as movieCount,
  c.updatedAt
FROM collections c
LEFT JOIN collection_movies cm ON c.id = cm.collectionId
GROUP BY c.id, c.name, c.updatedAt;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update schema last_updated timestamp on any data change
CREATE TRIGGER trg_update_schema_timestamp
AFTER INSERT ON movies
BEGIN
  UPDATE _schema SET value = datetime('now') WHERE key = 'last_updated';
END;

-- Prevent deletion of movies that are in collections (optional, can be removed if CASCADE is preferred)
-- Commented out as we're using ON DELETE CASCADE for automatic cleanup
-- CREATE TRIGGER trg_prevent_movie_deletion
-- BEFORE DELETE ON movies
-- FOR EACH ROW
-- WHEN EXISTS (SELECT 1 FROM collection_movies WHERE movieId = OLD.movieId)
-- BEGIN
--   SELECT RAISE(ABORT, 'Cannot delete movie that is in a collection');
-- END;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================
-- Additional composite indexes for common query patterns

-- Combined filters (year + rating)
CREATE INDEX idx_metadata_year_rating ON metadata(Year, imdbRating);

-- Combined filters (genre + rating)
CREATE INDEX idx_metadata_genre_rating ON metadata(Genre, imdbRating);

-- Source type + quality marks (for filtering clean sources)
CREATE INDEX idx_sources_channelId_movieId ON sources(channelId, movieId);

-- ============================================================================
-- STATISTICS AND OPTIMIZATION
-- ============================================================================

-- Analyze tables for query optimization
ANALYZE;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
