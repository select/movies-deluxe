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
    btn: 'px-4 py-2 rounded-full bg-theme-surface text-theme-text hover:bg-theme-selection transition-all duration-200 shadow-md hover:shadow-lg active:scale-95 font-medium border border-theme-border/50',
    'btn-primary':
      'px-4 py-2 rounded-full bg-theme-primary text-white hover:opacity-90 transition-all duration-200 shadow-md hover:shadow-lg active:scale-95 font-medium',
    'btn-secondary':
      'px-4 py-2 rounded-full bg-theme-secondary text-white hover:opacity-90 transition-all duration-200 shadow-sm hover:shadow-md active:scale-95 font-medium',
    card: 'p-4 rounded-xl shadow-md bg-theme-surface text-theme-text border border-theme-border/50',
    glass: 'bg-theme-surface/70 backdrop-blur-md border border-theme-border/30',
    // Skeleton loading styles
    skeleton: 'bg-theme-surface/50 animate-pulse',
    'skeleton-border': 'border-theme-border/30',
  },
  preflights: [
    {
      getCSS: () => `
        /* Global body settings */
        body {
          scrollbar-width: auto;
          scrollbar-color: var(--theme-border) var(--theme-background);
          line-height: 1.6;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          background-color: var(--theme-background);
          color: var(--theme-text);
        }
        body::-webkit-scrollbar {
          width: 12px;
        }
        body::-webkit-scrollbar-track {
          background: var(--theme-background);
          border-radius: 6px;
        }
        body::-webkit-scrollbar-thumb {
          background: var(--theme-border);
          border-radius: 6px;
        }
        body::-webkit-scrollbar-thumb:hover {
          background: var(--theme-selection);
        }

        /* Thin scrollbar (8px) */
        .scrollbar-thin {
          scrollbar-width: thin;
          scrollbar-color: var(--theme-border) transparent;
        }
        .scrollbar-thin::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: var(--theme-border);
          border-radius: 4px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: var(--theme-selection);
        }

        /* Default scrollbar (12px) */
        .scrollbar-default {
          scrollbar-width: auto;
          scrollbar-color: var(--theme-border) var(--theme-background);
        }
        .scrollbar-default::-webkit-scrollbar {
          width: 12px;
          height: 12px;
        }
        .scrollbar-default::-webkit-scrollbar-track {
          background: var(--theme-background);
          border-radius: 6px;
        }
        .scrollbar-default::-webkit-scrollbar-thumb {
          background: var(--theme-border);
          border-radius: 6px;
        }
        .scrollbar-default::-webkit-scrollbar-thumb:hover {
          background: var(--theme-selection);
        }

        /* Hidden scrollbar (but still scrollable) */
        .scrollbar-hidden {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .scrollbar-hidden::-webkit-scrollbar {
          display: none;
        }

        /* Modern shimmer animation for skeleton loaders */
        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }

        .shimmer {
          background: linear-gradient(
            110deg,
            transparent 0%,
            transparent 40%,
            rgba(255, 255, 255, 0.4) 50%,
            transparent 60%,
            transparent 100%
          );
          background-size: 200% 100%;
          animation: shimmer 2.5s ease-in-out infinite;
        }

        .dark .shimmer {
          background: linear-gradient(
            110deg,
            transparent 0%,
            transparent 40%,
            rgba(255, 255, 255, 0.03) 50%,
            transparent 60%,
            transparent 100%
          );
          background-size: 200% 100%;
        }
      `,
    },
  ],
  theme: {
    colors: {
      theme: {
        background: 'var(--theme-background)',
        surface: 'var(--theme-surface)',
        text: 'var(--theme-text)',
        textMuted: 'var(--theme-text-muted)',
        primary: 'var(--theme-primary)',
        secondary: 'var(--theme-secondary)',
        accent: 'var(--theme-accent)',
        border: 'var(--theme-border)',
        selection: 'var(--theme-selection)',
      },
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
  // Safelist to ensure classes are always generated
  safelist: [
    'font-sans',
    'scrollbar-thin',
    'scrollbar-default',
    'scrollbar-hidden',
    'skeleton',
    'skeleton-border',
    'shimmer',
  ],
})
