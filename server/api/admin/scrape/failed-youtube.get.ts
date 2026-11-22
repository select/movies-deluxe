import { loadFailedYouTubeVideos } from '../../../utils/failedYoutube'
import { defineEventHandler } from 'h3'

export default defineEventHandler(async () => {
  return loadFailedYouTubeVideos()
})
