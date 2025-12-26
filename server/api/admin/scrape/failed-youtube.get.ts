import { loadFailedYouTubeVideos } from '../../../utils/failedYoutube'

export default defineEventHandler(async () => {
  return loadFailedYouTubeVideos()
})
