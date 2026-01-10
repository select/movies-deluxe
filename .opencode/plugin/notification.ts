import type { Plugin } from '@opencode-ai/plugin'

/**
 * Notification idle plugin
 */
export const NotificationPlugin: Plugin = async ({ $ }) => {
  let lastMessage: { messageID: string | null; text: string | null } = {
    messageID: null,
    text: null,
  }

  const isKittyFocused = async (): Promise<boolean> => {
    try {
      const result = await $`xdotool getactivewindow getwindowname`.text()
      return result.toLowerCase().includes('kitty')
    } catch {
      return false
    }
  }

  const sendNotification = async (title: string, message: string): Promise<void> => {
    try {
      await $`notify-send -u normal -t 5000 -a "opencode" "${title}" "${message}"`
      // Optional: Play a sound using paplay (PulseAudio) if available
      try {
        await $`paplay /usr/share/sounds/freedesktop/stereo/message.oga`
      } catch {
        // Sound playback failed, but notification was sent
      }
    } catch {
      window.console.error('Failed to send notification. Make sure notify-send is installed.')
    }
  }

  return {
    event: async ({ event }) => {
      // Save message text for idle summary
      if (event.type === 'message.part.updated') {
        if (event.properties.part.type === 'text') {
          const { messageID, text } = event.properties.part
          lastMessage = { messageID, text }
        }
      }

      if (event.type === 'session.idle') {
        const kittyFocused = await isKittyFocused()
        if (!kittyFocused) {
          const summary = getIdleSummary(lastMessage?.text) ?? 'Idle'
          await sendNotification('opencode', summary)
        }
      }
    },
  }
}

/**
 * Extract a last `*Summary:* ...` line at the end of the text
 */
function getIdleSummary(text: string | null): string | undefined {
  if (!text) return

  const idleMatch = text.match(/[_*]Summary:[_*]? (.*)[_*]?$/m)
  if (idleMatch && idleMatch[1]) {
    let summary = idleMatch[1].trim()
    // Filter out leading exclamations like "Perfect!", "Excellent!", etc.
    summary = summary.replace(/^(Perfect|Excellent|Great|Amazing|Wonderful|Fantastic)!?\s*/i, '')
    return summary
  }

  if (text.length > 80) {
    return text.slice(0, 80) + '...'
  }

  return text
}
