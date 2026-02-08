import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    pool: 'forks', // Use forked processes instead of threads for better database isolation
    poolOptions: {
      forks: {
        singleFork: true, // Run all tests in a single fork to avoid database locking
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        '**/*.test.ts',
        '**/*.config.ts',
        'scripts/',
        '.nuxt/',
        'dist/',
      ],
    },
    testTimeout: 30000, // 30 seconds for database operations
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, './app'),
      '~/': resolve(__dirname, './app/'),
      '~/shared': resolve(__dirname, './shared'),
    },
  },
})
