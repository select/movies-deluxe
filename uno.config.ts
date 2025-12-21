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
    btn: 'px-4 py-2 rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors',
    'btn-secondary':
      'px-4 py-2 rounded bg-gray-200 text-gray-800 hover:bg-gray-300 transition-colors',
    card: 'p-4 rounded-lg shadow-md bg-white dark:bg-gray-800',
  },
  theme: {
    colors: {
      primary: '#3b82f6',
      secondary: '#64748b',
    },
  },
  // Enable dark mode with class strategy
  darkMode: 'class',
  // Safelist font-sans to ensure it's always generated
  safelist: ['font-sans'],
})
