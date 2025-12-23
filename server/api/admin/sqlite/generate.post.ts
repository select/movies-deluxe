export default defineEventHandler(async () => {
  return {
    success: false,
    message: 'SQLite generation is currently disabled due to environment issues.',
  }
})
