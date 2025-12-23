export const useProgress = () => {
  const adminStore = useAdminStore()
  const eventSource = useState<EventSource | null>('eventSource', () => null)

  const connect = () => {
    if (eventSource.value) return

    const es = new EventSource('/api/admin/progress')

    es.onmessage = event => {
      try {
        const update = JSON.parse(event.data)
        adminStore.updateProgress(update)
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[SSE] Failed to parse message', e)
      }
    }

    es.onerror = error => {
      // eslint-disable-next-line no-console
      console.error('[SSE] Connection error', error)
      es.close()
      eventSource.value = null

      // Try to reconnect after 5 seconds
      setTimeout(connect, 5000)
    }

    eventSource.value = es
  }

  const disconnect = () => {
    if (eventSource.value) {
      eventSource.value.close()
      eventSource.value = null
    }
  }

  return {
    connect,
    disconnect,
  }
}
