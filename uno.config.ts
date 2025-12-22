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
        'material-symbols-light': () =>
          import('@iconify-json/material-symbols-light/icons.json').then(i => i.default),
      },
    }),
    presetTypography(),
    presetWebFonts({
      provider: 'google',
      fonts: {
        sans: 'Ubuntu:300,400,500,700',
        mono: 'Ubuntu Mono',
      },
    }),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  shortcuts: {
    btn: 'px-4 py-2 rounded-full bg-gray-700 text-white hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-500 transition-all duration-200 shadow-md hover:shadow-lg active:scale-95 font-medium',
    'btn-secondary':
      'px-4 py-2 rounded-full bg-gray-200 text-gray-800 hover:bg-gray-300 transition-all duration-200 shadow-sm hover:shadow-md active:scale-95 font-medium',
    card: 'p-4 rounded-xl shadow-md bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700',
    glass:
      'bg-white/70 dark:bg-gray-900/70 backdrop-blur-md border border-white/20 dark:border-gray-800/30',
  },
  preflights: [
    {
      getCSS: () => `
        /* Global body settings */
        body {
          scrollbar-width: auto;
          scrollbar-color: #d4d4d4 #f5f5f5;
          line-height: 1.6;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        body::-webkit-scrollbar {
          width: 12px;
        }
        body::-webkit-scrollbar-track {
          background: #f5f5f5;
          border-radius: 6px;
        }
        body::-webkit-scrollbar-thumb {
          background: #d4d4d4;
          border-radius: 6px;
        }
        body::-webkit-scrollbar-thumb:hover {
          background: #a3a3a3;
        }

        /* Global body scrollbar - Dark mode */
        .dark body {
          scrollbar-color: #404040 #262626;
        }
        :is(.dark) body::-webkit-scrollbar-track {
          background: #262626;
        }
        :is(.dark) body::-webkit-scrollbar-thumb {
          background: #404040;
        }
        :is(.dark) body::-webkit-scrollbar-thumb:hover {
          background: #525252;
        }

        /* Thin scrollbar (8px) - Light mode */
        .scrollbar-thin {
          scrollbar-width: thin;
          scrollbar-color: #d4d4d4 transparent;
        }
        .scrollbar-thin::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: #d4d4d4;
          border-radius: 4px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: #a3a3a3;
        }

        /* Thin scrollbar - Dark mode */
        .dark .scrollbar-thin {
          scrollbar-color: #404040 transparent;
        }
        .dark .scrollbar-thin::-webkit-scrollbar-thumb {
          background: #404040;
        }
        .dark .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: #525252;
        }

        /* Default scrollbar (12px) - Light mode */
        .scrollbar-default {
          scrollbar-width: auto;
          scrollbar-color: #d4d4d4 #f5f5f5;
        }
        .scrollbar-default::-webkit-scrollbar {
          width: 12px;
          height: 12px;
        }
        .scrollbar-default::-webkit-scrollbar-track {
          background: #f5f5f5;
          border-radius: 6px;
        }
        .scrollbar-default::-webkit-scrollbar-thumb {
          background: #d4d4d4;
          border-radius: 6px;
        }
        .scrollbar-default::-webkit-scrollbar-thumb:hover {
          background: #a3a3a3;
        }

        /* Default scrollbar - Dark mode */
        .dark .scrollbar-default {
          scrollbar-color: #404040 #262626;
        }
        .dark .scrollbar-default::-webkit-scrollbar-track {
          background: #262626;
        }
        .dark .scrollbar-default::-webkit-scrollbar-thumb {
          background: #404040;
        }
        .dark .scrollbar-default::-webkit-scrollbar-thumb:hover {
          background: #525252;
        }

        /* Hidden scrollbar (but still scrollable) */
        .scrollbar-hidden {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .scrollbar-hidden::-webkit-scrollbar {
          display: none;
        }
      `,
    },
  ],
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
  // Safelist to ensure classes are always generated
  safelist: ['font-sans', 'scrollbar-thin', 'scrollbar-default', 'scrollbar-hidden'],
})
