import type { Plugin } from '@opencode-ai/plugin'

export const NotificationPlugin: Plugin = async ({ $ }) => {
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
      console.error('Failed to send notification. Make sure notify-send is installed.')
    }
  }

  return {
    event: async ({ event }) => {
      if (event.type === 'session.idle') {
        const kittyFocused = await isKittyFocused()
        if (!kittyFocused) {
          await sendNotification('opencode', 'Hey! Waiting for you...')
        }
      }
    },
  }
}
