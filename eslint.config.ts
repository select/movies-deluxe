import oxlint from 'eslint-plugin-oxlint'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  oxlint.configs['flat/recommended'],

  {
    rules: {
      // TypeScript rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-dynamic-delete': 'off', // Allow delete with dynamic keys

      // Vue rules
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'warn',

      // General rules
      'no-console': 'warn',
      'prefer-const': 'error',
    },
  },
  {
    // Allow console.log in scripts, tests, and server (Node.js code, not frontend)
    files: ['scripts/**/*.ts', 'tests/**/*.ts', 'server/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: ['.nuxt', '.output', 'dist', 'node_modules', '*.config.js', 'commitlint.config.js'],
  }
)
