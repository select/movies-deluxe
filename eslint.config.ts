import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import oxlint from 'eslint-plugin-oxlint'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  oxlint.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        // Nuxt auto-imports
        useMovieStore: 'readonly',
        ref: 'readonly',
        computed: 'readonly',
        onMounted: 'readonly',
        onUnmounted: 'readonly',
        watch: 'readonly',
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        setTimeout: 'readonly',
        localStorage: 'readonly',
        Event: 'readonly',
        KeyboardEvent: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLElement: 'readonly',
        IntersectionObserver: 'readonly',
      },
    },
  },
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
