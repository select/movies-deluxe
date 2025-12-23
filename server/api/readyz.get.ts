export default defineEventHandler(() => {
  return {
    status: 'ready',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }
})
