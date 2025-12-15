#!/usr/bin/env node

/**
 * YouTube Metadata Augmentation Script
 *
 * This script adds YouTube title and channel information to song metadata files
 * in server/assets/songs/*.json by fetching data directly from YouTube.
 *
 * The script will:
 * 1. Load all video IDs from data/anonymized-metadata.json
 * 2. Check which videos don't have metadata files yet
 * 3. Create new metadata files for videos without files
 * 4. Update existing files that are missing youtube metadata
 * 5. Fetch title and channel from YouTube API for each video
 *
 * Usage:
 *   pnpm augment:youtube
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { Client } from "youtubei";
import type { SongMetaData } from "../app/types/song.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SONGS_DIR = path.join(__dirname, "../server/assets/songs");
const ANONYMIZED_METADATA_FILE = path.join(
	__dirname,
	"../data/anonymized-metadata.json",
);
const RATE_LIMIT_MS = 500; // 500ms between requests to avoid rate limiting

interface AnonymizedMetadata {
	videoId: string;
	datetime: number;
	userId: string;
}

/**
 * Load a song metadata file
 */
function loadSongMetadata(youtubeId: string): SongMetaData | null {
	const songFilePath = path.join(SONGS_DIR, `${youtubeId}.json`);
	try {
		if (fs.existsSync(songFilePath)) {
			const data = fs.readFileSync(songFilePath, "utf8");
			return JSON.parse(data) as SongMetaData;
		}
		return null;
	} catch (error) {
		console.warn(
			`Error loading song metadata for ${youtubeId}:`,
			(error as Error).message,
		);
		return null;
	}
}

/**
 * Save song metadata file
 */
function saveSongMetadata(youtubeId: string, metadata: SongMetaData): boolean {
	const songFilePath = path.join(SONGS_DIR, `${youtubeId}.json`);
	try {
		fs.writeFileSync(songFilePath, JSON.stringify(metadata, null, 2));
		return true;
	} catch (error) {
		console.error(
			`Error saving song metadata for ${youtubeId}:`,
			(error as Error).message,
		);
		return false;
	}
}

/**
 * Get all song files
 */
function getAllSongFiles(): string[] {
	try {
		return fs
			.readdirSync(SONGS_DIR)
			.filter((file) => file.endsWith(".json"))
			.map((file) => file.replace(".json", ""));
	} catch (error) {
		console.error("Error reading songs directory:", (error as Error).message);
		process.exit(1);
	}
}

/**
 * Load all unique video IDs from anonymized metadata
 */
function loadAllVideoIds(): Set<string> {
	try {
		const data = fs.readFileSync(ANONYMIZED_METADATA_FILE, "utf8");
		const metadataArray = JSON.parse(data) as AnonymizedMetadata[];
		return new Set(metadataArray.map((item) => item.videoId));
	} catch (error) {
		console.error(
			"Error loading anonymized metadata:",
			(error as Error).message,
		);
		process.exit(1);
	}
}

/**
 * Create a new minimal song metadata file
 */
function createNewSongMetadata(
	youtubeId: string,
	title: string,
	channel: string,
): SongMetaData {
	return {
		youtubeId,
		title,
		lastFetched: new Date().toISOString(),
		youtube: {
			title,
			channel,
		},
	};
}

/**
 * Fetch video metadata from YouTube
 */
async function fetchYouTubeMetadata(
	youtube: Client,
	videoId: string,
): Promise<{ title: string; channel: string } | null> {
	try {
		const video = await youtube.getVideo(videoId);
		if (!video) {
			return null;
		}

		return {
			title: video.title || "Unknown Title",
			channel: video.channel?.name || "Unknown Channel",
		};
	} catch (error) {
		console.error(
			`Error fetching YouTube metadata for ${videoId}:`,
			(error as Error).message,
		);
		return null;
	}
}

/**
 * Sleep function for rate limiting
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
	console.log("=== YouTube Metadata Augmentation Script ===\n");

	// Load data sources
	console.log("Loading video IDs from anonymized metadata...");
	const allVideoIds = loadAllVideoIds();
	console.log(`Found ${allVideoIds.size} unique video IDs\n`);

	console.log("Loading existing song files...");
	const existingSongFiles = new Set(getAllSongFiles());
	console.log(`Found ${existingSongFiles.size} existing song files\n`);

	// Find videos that need new metadata files
	const videosNeedingNewFiles: string[] = [];
	for (const videoId of allVideoIds) {
		if (!existingSongFiles.has(videoId)) {
			videosNeedingNewFiles.push(videoId);
		}
	}

	// Find existing files that need youtube metadata
	const existingFilesNeedingUpdate: string[] = [];
	for (const youtubeId of existingSongFiles) {
		const songMetadata = loadSongMetadata(youtubeId);
		if (songMetadata && !songMetadata.youtube) {
			existingFilesNeedingUpdate.push(youtubeId);
		}
	}

	console.log(`Videos needing new metadata files: ${videosNeedingNewFiles.length}`);
	console.log(
		`Existing files needing YouTube metadata: ${existingFilesNeedingUpdate.length}\n`,
	);

	// Combine both lists
	const allVideosToProcess = [
		...videosNeedingNewFiles,
		...existingFilesNeedingUpdate,
	];

	if (allVideosToProcess.length === 0) {
		console.log("All songs already have YouTube metadata. Nothing to do!");
		return;
	}

	// Show sample of videos to be processed
	console.log(
		`Total videos to process: ${allVideosToProcess.length}\n`,
	);
	console.log("Sample of videos to be processed:");
	for (let i = 0; i < Math.min(5, allVideosToProcess.length); i++) {
		const isNew = videosNeedingNewFiles.includes(allVideosToProcess[i]);
		console.log(`  - ${allVideosToProcess[i]} ${isNew ? "(NEW)" : "(UPDATE)"}`);
	}
	if (allVideosToProcess.length > 5) {
		console.log(`  ... and ${allVideosToProcess.length - 5} more`);
	}
	console.log();

	// Initialize YouTube client
	console.log("Initializing YouTube client...");
	const youtube = new Client();
	console.log("YouTube client ready\n");

	// Process updates
	console.log("Starting processing...");
	console.log(`Rate limit: ${RATE_LIMIT_MS}ms between requests\n`);
	let createdCount = 0;
	let updatedCount = 0;
	let errorCount = 0;

	for (let i = 0; i < allVideosToProcess.length; i++) {
		const youtubeId = allVideosToProcess[i];
		const isNewFile = videosNeedingNewFiles.includes(youtubeId);
		const existingMetadata = loadSongMetadata(youtubeId);

		// Fetch YouTube metadata
		const youtubeMetadata = await fetchYouTubeMetadata(youtube, youtubeId);

		if (!youtubeMetadata) {
			console.log(
				`[${i + 1}/${allVideosToProcess.length}] ❌ ${youtubeId}: Failed to fetch from YouTube`,
			);
			errorCount++;
			// Rate limiting even on errors
			if (i < allVideosToProcess.length - 1) {
				await sleep(RATE_LIMIT_MS);
			}
			continue;
		}

		// Create new or update existing metadata
		let metadataToSave: SongMetaData;

		if (isNewFile || !existingMetadata) {
			// Create new file
			metadataToSave = createNewSongMetadata(
				youtubeId,
				youtubeMetadata.title,
				youtubeMetadata.channel,
			);
		} else {
			// Update existing file
			metadataToSave = {
				...existingMetadata,
				youtube: {
					title: youtubeMetadata.title,
					channel: youtubeMetadata.channel,
				},
			};
		}

		// Save the metadata
		if (saveSongMetadata(youtubeId, metadataToSave)) {
			const action = isNewFile || !existingMetadata ? "CREATED" : "UPDATED";
			console.log(
				`[${i + 1}/${allVideosToProcess.length}] ✅ ${action} ${youtubeId}: ${youtubeMetadata.title} by ${youtubeMetadata.channel}`,
			);
			if (isNewFile || !existingMetadata) {
				createdCount++;
			} else {
				updatedCount++;
			}
		} else {
			console.log(
				`[${i + 1}/${allVideosToProcess.length}] ❌ ${youtubeId}: Failed to save`,
			);
			errorCount++;
		}

		// Rate limiting: wait before next request (except for last item)
		if (i < allVideosToProcess.length - 1) {
			await sleep(RATE_LIMIT_MS);
		}
	}

	// Summary
	console.log("\n=== Summary ===");
	console.log(`Total videos processed: ${allVideosToProcess.length}`);
	console.log(`New files created: ${createdCount}`);
	console.log(`Existing files updated: ${updatedCount}`);
	console.log(`Errors: ${errorCount}`);
	console.log(
		`\nTotal song files now: ${existingSongFiles.size + createdCount}`,
	);
	console.log("\nScript completed!");
}

// Handle graceful shutdown
process.on("SIGINT", () => {
	console.log("\n\nReceived SIGINT. Gracefully shutting down...");
	process.exit(0);
});

process.on("SIGTERM", () => {
	console.log("\n\nReceived SIGTERM. Gracefully shutting down...");
	process.exit(0);
});

// Run the script
main().catch((error) => {
	console.error("Script error:", error);
	process.exit(1);
});
