import { progressEmitter } from '../../utils/progress'

export default defineEventHandler(async event => {
  const setHeader = (name: string, value: string) => event.node.res.setHeader(name, value)

  setHeader('Content-Type', 'text/event-stream')
  setHeader('Cache-Control', 'no-cache')
  setHeader('Connection', 'keep-alive')
  setHeader('Access-Control-Allow-Origin', '*')

  const sendEvent = (data: any) => {
    event.node.res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  const onProgress = (update: any) => {
    sendEvent(update)
  }

  progressEmitter.on('progress', onProgress)

  // Keep connection alive
  const keepAlive = setInterval(() => {
    event.node.res.write(': keep-alive\n\n')
  }, 30000)

  event.node.res.on('close', () => {
    progressEmitter.off('progress', onProgress)
    clearInterval(keepAlive)
  })

  // Send initial message
  event.node.res.write(': ok\n\n')

  // Return a promise that never resolves to keep the connection open
  return new Promise(() => {})
})
