/**
 * Theme System Type Definitions
 */

export type ThemeVariant = 'light' | 'dark'

/**
 * Core semantic colors for a theme
 */
export interface ThemeColors {
  /** Main background color */
  background: string
  /** Surface color for cards, menus, etc. */
  surface: string
  /** Primary text color */
  text: string
  /** Secondary/muted text color */
  textMuted: string
  /** Primary brand/action color */
  primary: string
  /** Secondary brand/action color */
  secondary: string
  /** Accent color for highlights */
  accent: string
  /** Border and divider color */
  border: string
  /** Selection/hover background color */
  selection: string
}

/**
 * Theme metadata
 */
export interface ThemeMetadata {
  /** Unique identifier (e.g., 'catppuccin-mocha') */
  id: string
  /** Display name (e.g., 'Catppuccin Mocha') */
  name: string
  /** Theme family (e.g., 'Catppuccin') */
  family: string
  /** Whether it's a light or dark theme */
  variant: ThemeVariant
  /** Optional description */
  description?: string
  /** Optional author information */
  author?: string
}

/**
 * Complete theme definition
 */
export interface ThemeDefinition {
  metadata: ThemeMetadata
  colors: ThemeColors
}

/**
 * Theme registry structure
 */
export type ThemeRegistry = Record<string, ThemeDefinition>
