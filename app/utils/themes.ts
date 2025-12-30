import type { ThemeDefinition, ThemeRegistry, ThemeColors } from '~/types/theme'

/**
 * Default theme IDs
 */
export const DEFAULT_DARK_THEME_ID = 'kanagawa'
export const DEFAULT_LIGHT_THEME_ID = 'rose-pine-dawn'

/**
 * Default system themes
 */
export const DEFAULT_THEMES: ThemeRegistry = {
  'dark-default': {
    metadata: {
      id: 'dark-default',
      name: 'Dark Default',
      family: 'System',
      variant: 'dark',
    },
    colors: {
      background: '#171717',
      surface: '#262626',
      text: '#ffffff',
      textMuted: '#a3a3a3',
      primary: '#3b82f6',
      secondary: '#8b5cf6',
      accent: '#f43f5e',
      border: '#404040',
      selection: '#525252',
    },
  },
  'light-default': {
    metadata: {
      id: 'light-default',
      name: 'Light Default',
      family: 'System',
      variant: 'light',
    },
    colors: {
      background: '#ffffff',
      surface: '#f5f5f5',
      text: '#171717',
      textMuted: '#525252',
      primary: '#2563eb',
      secondary: '#7c3aed',
      accent: '#e11d48',
      border: '#e5e5e5',
      selection: '#f3f4f6',
    },
  },
}

/**
 * Popular color scheme themes
 */
export const COLOR_SCHEME_THEMES: ThemeRegistry = {
  'catppuccin-mocha': {
    metadata: {
      id: 'catppuccin-mocha',
      name: 'Mocha',
      family: 'Catppuccin',
      variant: 'dark',
    },
    colors: {
      background: '#1e1e2e',
      surface: '#313244',
      text: '#cdd6f4',
      textMuted: '#a6adc8',
      primary: '#89b4fa',
      secondary: '#cba6f7',
      accent: '#f38ba8',
      border: '#45475a',
      selection: '#585b70',
    },
  },
  'catppuccin-latte': {
    metadata: {
      id: 'catppuccin-latte',
      name: 'Latte',
      family: 'Catppuccin',
      variant: 'light',
    },
    colors: {
      background: '#eff1f5',
      surface: '#ccd0da',
      text: '#4c4f69',
      textMuted: '#6c6f85',
      primary: '#1d99f3',
      secondary: '#8839ef',
      accent: '#d20f39',
      border: '#bcc0cc',
      selection: '#acb0be',
    },
  },
  nord: {
    metadata: {
      id: 'nord',
      name: 'Nord',
      family: 'Nord',
      variant: 'dark',
    },
    colors: {
      background: '#2e3440',
      surface: '#3b4252',
      text: '#d8dee9',
      textMuted: '#9ca3af',
      primary: '#88c0d0',
      secondary: '#81a1c1',
      accent: '#bf616a',
      border: '#434c5e',
      selection: '#4c566a',
    },
  },
  'gruvbox-dark': {
    metadata: {
      id: 'gruvbox-dark',
      name: 'Dark',
      family: 'Gruvbox',
      variant: 'dark',
    },
    colors: {
      background: '#282828',
      surface: '#3c3836',
      text: '#fbf1c7',
      textMuted: '#bdae93',
      primary: '#fabd2f',
      secondary: '#d3869b',
      accent: '#fe8019',
      border: '#504945',
      selection: '#665c54',
    },
  },
  'tokyo-night': {
    metadata: {
      id: 'tokyo-night',
      name: 'Tokyo Night',
      family: 'Tokyo Night',
      variant: 'dark',
    },
    colors: {
      background: '#1a1b26',
      surface: '#24283b',
      text: '#c0caf5',
      textMuted: '#76abee',
      primary: '#7aa2f7',
      secondary: '#bb9af7',
      accent: '#f7768e',
      border: '#32344a',
      selection: '#565f89',
    },
  },
  'tokyo-night-storm': {
    metadata: {
      id: 'tokyo-night-storm',
      name: 'Storm',
      family: 'Tokyo Night',
      variant: 'dark',
    },
    colors: {
      background: '#24283b',
      surface: '#1f2335',
      text: '#c0caf5',
      textMuted: '#a9b1d6',
      primary: '#7aa2f7',
      secondary: '#bb9af7',
      accent: '#f7768e',
      border: '#32344a',
      selection: '#565f89',
    },
  },
  'everforest-dark': {
    metadata: {
      id: 'everforest-dark',
      name: 'Everforest Dark',
      family: 'Everforest',
      variant: 'dark',
    },
    colors: {
      background: '#2d353b',
      surface: '#374247',
      text: '#d3c6aa',
      textMuted: '#9da9a0',
      primary: '#a7c080',
      secondary: '#d699b6',
      accent: '#e67e80',
      border: '#414b50',
      selection: '#4a555b',
    },
  },
  'rose-pine': {
    metadata: {
      id: 'rose-pine',
      name: 'Rosé Pine',
      family: 'Rosé Pine',
      variant: 'dark',
    },
    colors: {
      background: '#191724',
      surface: '#1f1d2e',
      text: '#e0def4',
      textMuted: '#908caa',
      primary: '#31748f',
      secondary: '#c4a7e7',
      accent: '#eb6f92',
      border: '#26233a',
      selection: '#403d52',
    },
  },
  'rose-pine-moon': {
    metadata: {
      id: 'rose-pine-moon',
      name: 'Moon',
      family: 'Rosé Pine',
      variant: 'dark',
    },
    colors: {
      background: '#232136',
      surface: '#2a273f',
      text: '#e0def4',
      textMuted: '#908caa',
      primary: '#3e8fb0',
      secondary: '#c4a7e7',
      accent: '#ea9a97',
      border: '#393552',
      selection: '#44415a',
    },
  },
  'rose-pine-dawn': {
    metadata: {
      id: 'rose-pine-dawn',
      name: 'Rosé Pine Dawn',
      family: 'Rosé Pine',
      variant: 'light',
    },
    colors: {
      background: '#faf4ed',
      surface: '#fffaf3',
      text: '#575279',
      textMuted: '#797593',
      primary: '#286983',
      secondary: '#907aa9',
      accent: '#b4637a',
      border: '#f2e9de',
      selection: '#cecacd',
    },
  },
  kanagawa: {
    metadata: {
      id: 'kanagawa',
      name: 'Kanagawa',
      family: 'Kanagawa',
      variant: 'dark',
    },
    colors: {
      background: '#1f1f28',
      surface: '#2a2a37',
      text: '#dcd7ba',
      textMuted: '#727169',
      primary: '#7e9cd8',
      secondary: '#957fb8',
      accent: '#e46876',
      border: '#363646',
      selection: '#54546d',
    },
  },
  dracula: {
    metadata: {
      id: 'dracula',
      name: 'Dracula',
      family: 'Dracula',
      variant: 'dark',
    },
    colors: {
      background: '#282a36',
      surface: '#44475a',
      text: '#f8f8f2',
      textMuted: '#6272a4',
      primary: '#bd93f9',
      secondary: '#8be9fd',
      accent: '#ff79c6',
      border: '#44475a',
      selection: '#6272a4',
    },
  },
  'solarized-dark': {
    metadata: {
      id: 'solarized-dark',
      name: 'Solarized Dark',
      family: 'Solarized',
      variant: 'dark',
    },
    colors: {
      background: '#002b36',
      surface: '#073642',
      text: '#839496',
      textMuted: '#586e75',
      primary: '#268bd2',
      secondary: '#b58900',
      accent: '#d33682',
      border: '#073642',
      selection: '#586e75',
    },
  },
  'solarized-light': {
    metadata: {
      id: 'solarized-light',
      name: 'Solarized Light',
      family: 'Solarized',
      variant: 'light',
    },
    colors: {
      background: '#fdf6e3',
      surface: '#eee8d5',
      text: '#657b83',
      textMuted: '#93a1a1',
      primary: '#268bd2',
      secondary: '#b58900',
      accent: '#d33682',
      border: '#eee8d5',
      selection: '#93a1a1',
    },
  },
  'one-dark': {
    metadata: {
      id: 'one-dark',
      name: 'One Dark',
      family: 'One Dark',
      variant: 'dark',
    },
    colors: {
      background: '#282c34',
      surface: '#2c313a',
      text: '#abb2bf',
      textMuted: '#5c6370',
      primary: '#61afef',
      secondary: '#c678dd',
      accent: '#e06c75',
      border: '#3e4451',
      selection: '#3e4451',
    },
  },
}

/**
 * Unified theme registry
 */
export const THEMES: ThemeRegistry = {
  ...DEFAULT_THEMES,
  ...COLOR_SCHEME_THEMES,
}

/**
 * Get theme by ID
 */
export function getTheme(id: string): ThemeDefinition | undefined {
  return THEMES[id]
}

/**
 * Get all available themes
 */
export function getAllThemes(): ThemeDefinition[] {
  return Object.values(THEMES)
}

/**
 * Get themes by variant
 */
export function getThemesByVariant(variant: 'light' | 'dark'): ThemeDefinition[] {
  return getAllThemes().filter(t => t.metadata.variant === variant)
}

/**
 * Get themes by family
 */
export function getThemesByFamily(family: string): ThemeDefinition[] {
  return getAllThemes().filter(t => t.metadata.family === family)
}

/**
 * Validate a theme definition
 */
export function validateTheme(theme: Partial<ThemeDefinition>): theme is ThemeDefinition {
  if (!theme.metadata || !theme.colors) return false

  const requiredMetadata: (keyof typeof theme.metadata)[] = ['id', 'name', 'family', 'variant']
  const hasMetadata = requiredMetadata.every(key => !!theme.metadata![key])

  const requiredColors: (keyof ThemeColors)[] = [
    'background',
    'surface',
    'text',
    'textMuted',
    'primary',
    'secondary',
    'accent',
    'border',
    'selection',
  ]
  const hasColors = requiredColors.every(key => !!theme.colors![key])

  return hasMetadata && hasColors
}

/**
 * Get theme with fallback
 */
export function getThemeWithFallback(
  id?: string,
  variant: 'light' | 'dark' = 'dark'
): ThemeDefinition {
  if (id) {
    const theme = getTheme(id)
    if (theme) return theme
  }

  const fallbackId = variant === 'dark' ? DEFAULT_DARK_THEME_ID : DEFAULT_LIGHT_THEME_ID
  return getTheme(fallbackId)!
}

/**
 * Generate CSS variables for a theme
 */
export function generateThemeVariables(theme: ThemeDefinition): Record<string, string> {
  const vars: Record<string, string> = {}

  Object.entries(theme.colors).forEach(([key, value]) => {
    // Convert camelCase to kebab-case for CSS variables
    const cssKey = `--theme-${key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`
    vars[cssKey] = value
  })

  return vars
}
