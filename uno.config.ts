import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'
import presetWind from '@unocss/preset-wind4'
import presetWebFonts from '@unocss/preset-web-fonts'

export default defineConfig({
  presets: [
    presetWind(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      warn: true,
      collections: {
        mdi: () => import('@iconify-json/mdi/icons.json').then(i => i.default),
        carbon: () => import('@iconify-json/carbon/icons.json').then(i => i.default),
      },
    }),
    presetTypography(),
    presetWebFonts({
      provider: 'google',
      fonts: {
        sans: 'Ubuntu:400,500,700',
        mono: 'Ubuntu Mono',
      },
    }),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  shortcuts: {
    btn: 'px-4 py-2 rounded bg-gray-700 text-white hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-500 transition-colors',
    'btn-secondary':
      'px-4 py-2 rounded bg-gray-200 text-gray-800 hover:bg-gray-300 transition-colors',
    card: 'p-4 rounded-lg shadow-md bg-white dark:bg-gray-800',
  },
  theme: {
    colors: {
      primary: '#525252', // neutral-600 - true carbon theme
      secondary: '#737373', // neutral-500
      // Override default gray with neutral (no blue tint)
      gray: {
        50: '#fafafa',
        100: '#f5f5f5',
        200: '#e5e5e5',
        300: '#d4d4d4',
        400: '#a3a3a3',
        500: '#737373',
        600: '#525252',
        700: '#404040',
        800: '#262626',
        900: '#171717',
        950: '#0a0a0a',
      },
    },
  },
  // Enable dark mode with class strategy
  darkMode: 'class',
  // Safelist font-sans to ensure it's always generated
  safelist: ['font-sans'],
})
