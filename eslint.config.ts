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
    ignores: ['.nuxt', '.output', 'dist', 'node_modules', '*.config.js', 'commitlint.config.js'],
  }
)
