import type { Plugin } from '@opencode-ai/plugin'

export const GitHookProtection: Plugin = async () => {
  return {
    'tool.execute.before': async (input, output) => {
      if (input.tool !== 'bash') {
        return
      }

      const command = output.args.command
      if (!command) {
        return
      }

      // Check if this is a git command
      if (!command.includes('git')) {
        return
      }

      // Check for hook-bypassing flags
      const hookBypassPatterns = [
        /git\s+commit\s+[^|&;]*--no-verify/,
        /git\s+commit\s+[^|&;]*-n\s/,
        /git\s+commit\s+[^|&;]*-n$/,
        /git\s+push\s+[^|&;]*--no-verify/,
        /git\s+[^|&;]*--no-gpg-sign/,
        /git\s+[^|&;]*--no-post-rewrite/,
      ]

      for (const pattern of hookBypassPatterns) {
        if (pattern.test(command)) {
          throw new Error(
            `🚫 I'm not allowed to use git commands that bypass hooks (--no-verify, --no-gpg-sign, etc.)\n` +
              `This ensures commit-msg hooks (commitlint) and pre-commit hooks (lint-staged) are always executed.\n` +
              `Command: ${command}`
          )
        }
      }
    },
  }
}
