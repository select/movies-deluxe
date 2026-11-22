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
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-dynamic-delete': 'off', // Allow delete with dynamic keys
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: false,
          fixStyle: 'separate-type-imports',
        },
      ],

      // Vue rules
      'vue/no-v-html': 'warn',
      'vue/html-self-closing': [
        'error',
        {
          html: {
            void: 'always', // <img /> - self-closing for void elements
            normal: 'never', // <div></div> - never self-close normal elements
            component: 'always', // <MyComponent /> - self-closing for components
          },
          svg: 'always',
          math: 'always',
        },
      ],

      // General rules
      'no-console': 'warn',
      'prefer-const': 'error',

      'import/no-duplicates': 'error',
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
    // Allow console.log in database worker and movie store (debugging/logging)
    files: ['app/workers/database.worker.ts', 'app/stores/useMovieStore.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: [
      '.nuxt',
      '.output',
      'dist',
      'node_modules',
      '*.config.js',
      'commitlint.config.js',
      'public/sqlite-wasm/**',
    ],
  }
)
