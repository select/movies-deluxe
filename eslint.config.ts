import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import oxlint from 'eslint-plugin-oxlint'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
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
