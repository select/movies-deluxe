/**
 * Movie JSON Generation Script
 *
 * Splits the large data/movies.json into individual JSON files
 * in public/movies/[movieId].json for on-demand loading.
 */

import { generateMovieJSON } from '../server/utils/generateMovieJSON'

// Run the generation
generateMovieJSON().catch(err => {
  console.error(err)
  process.exit(1)
})
