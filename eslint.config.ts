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
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: false,
          fixStyle: 'separate-type-imports',
        },
      ],

      // Vue rules
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'warn',

      // General rules
      'no-console': 'warn',
      'prefer-const': 'error',

      // Import rules (Nuxt auto-imports are handled by @nuxt/eslint)
      // Auto-imported modules (no import needed):
      // - Components from app/components/
      // - Composables from app/composables/
      // - Utils from app/utils/ (root level only)
      // - Stores from app/stores/
      // - Shared types from shared/types/
      // - Shared utils from shared/utils/
      // - Pinia helpers: storeToRefs, defineStore, acceptHMRUpdate
      // - Vue composition API: ref, computed, watch, onMounted, etc.
      // - Nuxt composables: useState, useFetch, useRoute, navigateTo, etc.
      //
      // Manual imports required for:
      // - Types from app/types/ (use import type)
      // - Type-only imports from stores (e.g., export type ToastType)
      // - Nested utils (e.g., app/utils/nested/helper.ts)
      // - Server-side code (server/api/, server/utils/)
      // - External packages
      'import/no-duplicates': 'error',

      // Custom rule: Prevent imports from auto-imported directories
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['~/components/*', '~~/app/components/*', '@/components/*'],
              message:
                'Components from app/components/ are auto-imported. Remove this import statement.',
            },
            {
              group: ['~/composables/*', '~~/app/composables/*', '@/composables/*'],
              message:
                'Composables from app/composables/ are auto-imported. Remove this import statement.',
            },
            {
              group: ['shared/types/*', '~~/shared/types/*'],
              message:
                'Types from shared/types/ are auto-imported. Remove this import statement and use the type directly.',
            },
            {
              group: ['shared/utils/*', '~~/shared/utils/*'],
              message: 'Utils from shared/utils/ are auto-imported. Remove this import statement.',
            },
            {
              group: ['~/utils/*.ts', '~~/app/utils/*.ts', '@/utils/*.ts'],
              message:
                'Root-level utils from app/utils/ are auto-imported. Remove this import statement. Note: Nested utils (e.g., utils/nested/helper.ts) require manual imports.',
            },
          ],
          paths: [
            {
              name: 'pinia',
              importNames: ['storeToRefs', 'defineStore', 'acceptHMRUpdate'],
              message:
                'Pinia helpers (storeToRefs, defineStore, acceptHMRUpdate) are auto-imported by Nuxt. Remove this import statement.',
            },
            {
              name: 'vue',
              importNames: [
                'ref',
                'computed',
                'reactive',
                'readonly',
                'watch',
                'watchEffect',
                'watchPostEffect',
                'watchSyncEffect',
                'isRef',
                'unref',
                'toRef',
                'toRefs',
                'isProxy',
                'isReactive',
                'isReadonly',
                'shallowRef',
                'triggerRef',
                'customRef',
                'shallowReactive',
                'shallowReadonly',
                'toRaw',
                'markRaw',
                'effectScope',
                'getCurrentScope',
                'onScopeDispose',
                'onMounted',
                'onUpdated',
                'onUnmounted',
                'onBeforeMount',
                'onBeforeUpdate',
                'onBeforeUnmount',
                'onErrorCaptured',
                'onRenderTracked',
                'onRenderTriggered',
                'onActivated',
                'onDeactivated',
                'onServerPrefetch',
                'provide',
                'inject',
                'nextTick',
                'defineComponent',
                'defineAsyncComponent',
                'getCurrentInstance',
              ],
              message:
                'Vue composition API functions are auto-imported by Nuxt. Remove this import statement.',
            },
            {
              name: '#app',
              message:
                'Nuxt composables from #app are auto-imported. Remove this import statement.',
            },
            {
              name: 'nuxt/app',
              message:
                'Nuxt composables from nuxt/app are auto-imported. Remove this import statement.',
            },
          ],
        },
      ],
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
