export const useProgress = () => {
  const adminStore = useAdminStore()
  const eventSource = useState<EventSource | null>('eventSource', () => null)
  const isConnected = useState<boolean>('eventSourceConnected', () => false)
  const isReconnecting = useState<boolean>('eventSourceReconnecting', () => false)
  const reconnectTimer = useState<NodeJS.Timeout | null>('reconnectTimer', () => null)

  const connect = () => {
    if (eventSource.value) return

    const es = new EventSource('/api/admin/progress')

    es.onopen = () => {
      isConnected.value = true
      isReconnecting.value = false
    }

    es.onmessage = event => {
      try {
        const update = JSON.parse(event.data)
        if (import.meta.dev) {
          // eslint-disable-next-line no-console
          console.debug('[SSE] Progress update:', update.type, update.status, update.message)
        }
        adminStore.updateProgress(update)
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[SSE] Failed to parse message', e)
      }
    }

    es.onerror = error => {
      // eslint-disable-next-line no-console
      console.error('[SSE] Connection error', error)
      isConnected.value = false
      es.close()
      eventSource.value = null

      // Clear any existing reconnect timer
      if (reconnectTimer.value) {
        clearTimeout(reconnectTimer.value)
        reconnectTimer.value = null
      }

      // Try to reconnect after 5 seconds
      isReconnecting.value = true
      reconnectTimer.value = setTimeout(() => {
        reconnectTimer.value = null
        connect()
      }, 5000)
    }

    eventSource.value = es
  }

  const disconnect = () => {
    // Clear reconnect timer if exists
    if (reconnectTimer.value) {
      clearTimeout(reconnectTimer.value)
      reconnectTimer.value = null
    }

    if (eventSource.value) {
      eventSource.value.close()
      eventSource.value = null
      isConnected.value = false
      isReconnecting.value = false
    }
  }

  return {
    connect,
    disconnect,
    isConnected,
    isReconnecting,
  }
}
