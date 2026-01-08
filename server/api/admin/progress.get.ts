interface ProgressData {
  type: string
  message: string
  current?: number
  total?: number
  percentage?: number
  status?: string
  error?: string
}

export default defineEventHandler(async event => {
  const setHeader = (name: string, value: string) => event.node.res.setHeader(name, value)

  setHeader('Content-Type', 'text/event-stream')
  setHeader('Cache-Control', 'no-cache')
  setHeader('Connection', 'keep-alive')
  setHeader('Access-Control-Allow-Origin', '*')

  const sendEvent = (data: ProgressData) => {
    event.node.res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  const onProgress = (update: ProgressData) => {
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
