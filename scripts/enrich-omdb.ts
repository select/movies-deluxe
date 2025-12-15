/**
 * OMDB Enrichment Script
 *
 * Processes movies with temporary IDs (archive-*, youtube-*) and attempts to match them
 * with OMDB API to get proper IMDB IDs and metadata.
 *
 * Usage:
 *   npm run enrich:omdb -- --limit 10 --dry-run
 *   npm run enrich:omdb -- --limit 100
 *   npm run enrich:omdb -- --min-confidence high
 */

import { parseArgs } from "util";
import { config } from "dotenv";
import {
  loadMoviesDatabase,
  saveMoviesDatabase,
  getUnmatchedMovies,
  migrateMovieId,
  getDatabaseStats,
} from "./utils/dataManager.ts";
import { matchMovie } from "./utils/omdbMatcher.ts";
import { createLogger } from "./utils/logger.ts";
import type { MovieEntry, MatchConfidence } from "../types/movie.ts";

// Load environment variables
config();

const logger = createLogger("EnrichOMDB");

interface EnrichmentOptions {
  dryRun: boolean;
  limit?: number;
  minConfidence: MatchConfidence;
  skipFailed: boolean;
}

interface EnrichmentResult {
  processed: number;
  matched: number;
  failed: number;
  skipped: number;
  matches: Array<{
    oldId: string;
    newId: string;
    title: string;
    confidence: MatchConfidence;
  }>;
  failures: Array<{
    id: string;
    title: string;
    reason: string;
  }>;
}

/**
 * Parse title to extract movie name and year
 */
function parseTitle(title: string): { name: string; year?: number } {
  // Try to extract year from title like "Movie Name (1999)"
  const match = title.match(/^(.+?)\s*\((\d{4})\)/);
  if (match) {
    return {
      name: match[1].trim(),
      year: parseInt(match[2], 10),
    };
  }
  return { name: title };
}

/**
 * Check if confidence meets minimum threshold
 */
function meetsConfidenceThreshold(
  confidence: MatchConfidence,
  minConfidence: MatchConfidence,
): boolean {
  const confidenceLevels: Record<MatchConfidence, number> = {
    exact: 4,
    high: 3,
    medium: 2,
    low: 1,
    none: 0,
  };

  return confidenceLevels[confidence] >= confidenceLevels[minConfidence];
}

/**
 * Enrich movies with OMDB data
 */
async function enrichMovies(
  options: EnrichmentOptions,
): Promise<EnrichmentResult> {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) {
    throw new Error("OMDB_API_KEY environment variable is required");
  }

  logger.info("Loading movies database...");
  const db = await loadMoviesDatabase();

  // Get unmatched movies
  const unmatchedMovies = getUnmatchedMovies(db);
  logger.info(`Found ${unmatchedMovies.length} unmatched movies`);

  if (unmatchedMovies.length === 0) {
    logger.success("All movies are already matched!");
    return {
      processed: 0,
      matched: 0,
      failed: 0,
      skipped: 0,
      matches: [],
      failures: [],
    };
  }

  // Limit processing if specified
  const moviesToProcess = options.limit
    ? unmatchedMovies.slice(0, options.limit)
    : unmatchedMovies;

  logger.info(
    `Processing ${moviesToProcess.length} movies (min confidence: ${options.minConfidence})`,
  );

  const result: EnrichmentResult = {
    processed: 0,
    matched: 0,
    failed: 0,
    skipped: 0,
    matches: [],
    failures: [],
  };

  // Process each movie
  for (let i = 0; i < moviesToProcess.length; i++) {
    const movie = moviesToProcess[i];
    const oldId = movie.imdbId;

    // Validate title is a string
    if (!movie.title || typeof movie.title !== "string") {
      logger.warn(
        `[${i + 1}/${moviesToProcess.length}] Skipping ${oldId}: invalid title (${typeof movie.title})`,
      );
      result.processed++;
      result.failed++;
      result.failures.push({
        id: oldId,
        title: String(movie.title),
        reason: "Invalid title type (expected string)",
      });
      continue;
    }

    logger.info(
      `[${i + 1}/${moviesToProcess.length}] Processing: ${movie.title}`,
    );

    // Parse title to extract name and year
    const { name, year } = parseTitle(movie.title);

    try {
      // Attempt to match with OMDB
      const matchResult = await matchMovie(name, year, apiKey);

      result.processed++;

      if (matchResult.confidence === "none") {
        logger.warn(`No match found for: ${movie.title}`);
        result.failed++;
        result.failures.push({
          id: oldId,
          title: movie.title,
          reason: "No OMDB match found",
        });
        continue;
      }

      // Check if confidence meets threshold
      if (
        !meetsConfidenceThreshold(matchResult.confidence, options.minConfidence)
      ) {
        logger.warn(
          `Match confidence too low (${matchResult.confidence}) for: ${movie.title}`,
        );
        result.skipped++;
        continue;
      }

      // We have a match!
      const newId = matchResult.imdbId!;
      logger.success(
        `✓ Matched "${movie.title}" → "${matchResult.title}" (${matchResult.year}) [${matchResult.confidence}]`,
      );
      logger.info(`  Old ID: ${oldId} → New ID: ${newId}`);

      result.matched++;
      result.matches.push({
        oldId,
        newId,
        title: matchResult.title!,
        confidence: matchResult.confidence,
      });

      // Update database (unless dry run)
      if (!options.dryRun) {
        // Update the movie entry in-place with new metadata BEFORE migration
        movie.imdbId = newId;
        movie.title = matchResult.title!;
        movie.year = matchResult.year
          ? parseInt(matchResult.year, 10)
          : undefined;
        movie.metadata = matchResult.metadata;

        // Now migrate from old ID to new ID (will use the updated movie entry)
        migrateMovieId(db, oldId, newId);

        // Save progress after each successful match
        await saveMoviesDatabase(db);
        logger.debug("Progress saved");
      }
    } catch (error) {
      logger.error(`Error processing ${movie.title}:`, error);
      result.failed++;
      result.failures.push({
        id: oldId,
        title: movie.title,
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return result;
}

/**
 * Print enrichment report
 */
function printReport(result: EnrichmentResult, dryRun: boolean): void {
  logger.info("\n" + "=".repeat(60));
  logger.info("ENRICHMENT REPORT");
  logger.info("=".repeat(60));

  if (dryRun) {
    logger.warn("DRY RUN MODE - No changes were saved");
  }

  logger.info(`\nProcessed: ${result.processed} movies`);
  logger.success(`Matched:   ${result.matched} movies`);
  logger.warn(`Skipped:   ${result.skipped} movies (low confidence)`);
  logger.error(`Failed:    ${result.failed} movies`);

  if (result.matches.length > 0) {
    logger.info("\n" + "-".repeat(60));
    logger.info("SUCCESSFUL MATCHES:");
    logger.info("-".repeat(60));
    for (const match of result.matches) {
      logger.success(
        `${match.oldId} → ${match.newId}: ${match.title} [${match.confidence}]`,
      );
    }
  }

  if (result.failures.length > 0) {
    logger.info("\n" + "-".repeat(60));
    logger.info("FAILURES:");
    logger.info("-".repeat(60));
    for (const failure of result.failures) {
      logger.error(`${failure.id}: ${failure.title}`);
      logger.error(`  Reason: ${failure.reason}`);
    }
  }

  logger.info("\n" + "=".repeat(60));
}

/**
 * Main function
 */
async function main() {
  const { values } = parseArgs({
    options: {
      "dry-run": {
        type: "boolean",
        default: false,
        description: "Run without saving changes",
      },
      limit: {
        type: "string",
        description: "Maximum number of movies to process",
      },
      "min-confidence": {
        type: "string",
        default: "medium",
        description: "Minimum confidence level (exact, high, medium, low)",
      },
      "skip-failed": {
        type: "boolean",
        default: false,
        description: "Skip movies that previously failed to match",
      },
      stats: {
        type: "boolean",
        default: false,
        description: "Show database statistics and exit",
      },
    },
  });

  // Show stats if requested
  if (values.stats) {
    const db = await loadMoviesDatabase();
    const stats = getDatabaseStats(db);

    logger.info("\n" + "=".repeat(60));
    logger.info("DATABASE STATISTICS");
    logger.info("=".repeat(60));
    logger.info(`Total movies:        ${stats.total}`);
    logger.success(`Matched (IMDB IDs):  ${stats.matched}`);
    logger.warn(`Unmatched (temp IDs): ${stats.unmatched}`);
    logger.info(`Archive.org sources: ${stats.archiveOrgSources}`);
    logger.info(`YouTube sources:     ${stats.youtubeSources}`);
    logger.info("=".repeat(60) + "\n");
    return;
  }

  const options: EnrichmentOptions = {
    dryRun: values["dry-run"] as boolean,
    limit: values.limit ? parseInt(values.limit as string, 10) : undefined,
    minConfidence: (values["min-confidence"] as MatchConfidence) || "medium",
    skipFailed: values["skip-failed"] as boolean,
  };

  logger.info("Starting OMDB enrichment...");
  logger.info(`Options: ${JSON.stringify(options, null, 2)}`);

  try {
    const result = await enrichMovies(options);
    printReport(result, options.dryRun);

    if (!options.dryRun && result.matched > 0) {
      logger.success(
        `\n✓ Successfully enriched ${result.matched} movies with OMDB data`,
      );
    }
  } catch (error) {
    logger.error("Enrichment failed:", error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
