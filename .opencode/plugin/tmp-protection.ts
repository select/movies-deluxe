import type { Plugin } from '@opencode-ai/plugin'

export const TmpProtection: Plugin = async () => {
  return {
    'tool.execute.before': async (input, output) => {
      if (input.tool !== 'edit' && input.tool !== 'write' && input.tool !== 'bash') {
        return
      }

      const filePath = output.args.filePath
      if (filePath?.startsWith('/tmp/') || filePath?.startsWith('/tmp')) {
        throw new Error(`🚫 I'm not allowed to write files to /tmp directory\n${filePath}`)
      }

      const command = output.args.command
      if (command) {
        // Check for writes to /tmp (redirects, tee, etc.)
        const tmpWritePatterns = [
          />\s*\/tmp\//,
          /tee\s+\/tmp\//,
          /mv\s+.*\s+\/tmp\//,
          /cp\s+.*\s+\/tmp\//,
          /touch\s+\/tmp\//,
          /mkdir\s+.*\/tmp\//,
        ]

        for (const pattern of tmpWritePatterns) {
          if (pattern.test(command)) {
            throw new Error(`🚫 I'm not allowed to execute commands that write to /tmp directory`)
          }
        }
      }
    },
  }
}
