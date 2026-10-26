// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Astryx Design Tokens
 *
 * Defines all design tokens using StyleX defineVars.
 * - *Defaults: Plain objects with default values (used by defineVars and themes)
 * - *Vars: CSS custom properties that themes can override via createTheme
 *
 * SYNC: When modified, run `node scripts/generate-token-docs.mjs` to update docs.
 * CI checks for drift via --check flag. Adding or removing a token FAMILY (a
 * whole `*Defaults` group) also means updating:
 * - /packages/cli/assets/theme.template.ts (its inventory of what exists)
 *
 * Domain tokens (syntax highlighting, data visualization) live separately in
 * /packages/core/src/theme/domainTokens/ — they're tree-shaken from core components.
 */

import * as stylex from '@stylexjs/stylex';

// =============================================================================
// Color Tokens
// =============================================================================

export const colorDefaults = {
  // Core semantic
  '--color-accent': 'light-dark(#0064E0, #2694FE)',
  '--color-accent-muted': 'light-dark(#0082FB33, #0082FB3F)',
  '--color-on-accent': 'light-dark(#FFFFFF, #FFFFFF)',
  '--color-neutral':
    'light-dark(rgba(5, 54, 89, 0.1), rgba(223, 226, 229, 0.2))',
  '--color-background-surface': 'light-dark(#FFFFFF, #1F1F22)',
  '--color-background-body': 'light-dark(#F1F4F7, #111112)',
  '--color-overlay': 'light-dark(#01122866, #11111299)',
  '--color-overlay-hover': 'light-dark(#0536590C, #FFFFFF0C)',
  '--color-overlay-pressed': 'light-dark(#05365919, #FFFFFF19)',
  '--color-background-muted': 'light-dark(#0536590C, #1111127F)',

  // Text
  '--color-text-primary': 'light-dark(#0A1317, #DFE2E5)',
  '--color-text-secondary': 'light-dark(#4E606F, #AAAFB5)',
  '--color-text-disabled': 'light-dark(#A4B0BC, #6F747C)',
  '--color-text-accent': 'light-dark(#0064E0, #3E9EFB)',
  '--color-on-dark': 'light-dark(#FFFFFF, #FFFFFF)',
  '--color-on-light': 'light-dark(#000000, #000000)',

  // Icon
  '--color-icon-accent': 'light-dark(#0064E0, #2694FE)',
  '--color-icon-primary': 'light-dark(#0A1317, #DFE2E5)',
  '--color-icon-secondary': 'light-dark(#4E606F, #AAAFB5)',
  '--color-icon-disabled': 'light-dark(#A4B0BC, #6F747C)',

  // Surface variants
  '--color-background-card': 'light-dark(#FFFFFF, #1F1F22)',
  '--color-background-popover': 'light-dark(#FFFFFF, #28292C)',
  '--color-background-inverted': 'light-dark(#0A1317, #FFFFFF)',
  '--color-background-error-inverted': 'light-dark(#AA071E, #E3193B)',

  // Status fills (architecture:theme-tokens INV11). Each `--color-<status>` is
  // the strong status fill, and `--color-on-<status>` is content on it at
  // 4.5:1 or more. `-muted` is the pale fill, with `--color-on-<status>-muted`.
  // Info is independent of the accent.
  '--color-info': 'light-dark(#0064E0, #0064E0)',
  '--color-info-muted': 'light-dark(#0082FB33, #0082FB3F)',
  '--color-on-info': 'light-dark(#FFFFFF, #FFFFFF)',
  '--color-success': 'light-dark(#0D8626, #0D8626)',
  '--color-success-muted': 'light-dark(#0B991F33, #0B991F3F)',
  '--color-on-success': 'light-dark(#FFFFFF, #FFFFFF)',
  '--color-error': 'light-dark(#E3193B, #F5394F)',
  '--color-error-muted': 'light-dark(#E3193B33, #F5394F3F)',
  // Dark error is light enough that white misses 4.5:1, so its content is dark.
  '--color-on-error': 'light-dark(#FFFFFF, #0A1317)',
  '--color-warning': 'light-dark(#E9AF08, #F2C00B)',
  '--color-warning-muted': 'light-dark(#E2A40033, #E2A4003F)',
  '--color-on-warning': 'light-dark(#0A1317, #0A1317)',

  // Status text on the default page and card surfaces, 4.5:1 or more.
  '--color-text-info': 'var(--color-text-blue)',
  '--color-text-success': 'var(--color-text-green)',
  '--color-text-warning': 'var(--color-text-yellow)',
  '--color-text-error': 'var(--color-text-red)',

  // Status icons and borders on those surfaces follow the text role.
  '--color-icon-info': 'var(--color-text-info)',
  '--color-icon-success': 'var(--color-text-success)',
  '--color-icon-warning': 'var(--color-text-warning)',
  '--color-icon-error': 'var(--color-text-error)',
  '--color-border-info': 'var(--color-text-info)',
  '--color-border-success': 'var(--color-text-success)',
  '--color-border-warning': 'var(--color-text-warning)',
  '--color-border-error': 'var(--color-text-error)',

  // Content on pale status fills.
  '--color-on-info-muted': 'var(--color-text-blue)',
  '--color-on-success-muted': 'var(--color-text-green)',
  '--color-on-warning-muted': 'var(--color-text-yellow)',
  '--color-on-error-muted': 'var(--color-text-red)',

  // Border
  '--color-border': 'light-dark(#05365919, #F2F4F619)',
  '--color-border-emphasized': 'light-dark(#CCD3DB, #494D53)',

  // Effects
  '--color-skeleton': 'light-dark(#CCD3DB, #5A5E66)',
  // "Channel on body" — slim affordances that need to read against body
  // luminance (ProgressBar tracks, Slider rails, Switch off-state). Default
  // is the same low-contrast surface as --color-skeleton; themes can
  // override per their neutral ramp if 1-D channels need more weight.
  '--color-track': 'light-dark(#CCD3DB, #5A5E66)',
  '--color-shadow': 'light-dark(rgba(5, 54, 89, 0.1), rgba(0, 0, 0, 0.3))',
  // Hover tint: black in light mode, white in dark mode - used with color-mix for hover states
  '--color-tint-hover': 'light-dark(black, white)',

  // Blue
  '--color-background-blue': 'light-dark(#0171E333, #0171E333)',
  '--color-border-blue': 'light-dark(#0064E0, #2694FE)', // Blue 650 / 500
  '--color-icon-blue': 'light-dark(#0064E0, #2694FE)',
  '--color-text-blue': 'light-dark(#042F97, #AFD7FF)',

  // Cyan
  '--color-background-cyan': 'light-dark(#03A7D733, #03A7D733)',
  '--color-border-cyan': 'light-dark(#089DD0, #0171A4)', // Cyan 500 / 650
  '--color-icon-cyan': 'light-dark(#00ACC1, #26C6DA)',
  '--color-text-cyan': 'light-dark(#014975, #A1EEF9)',

  // Gray
  '--color-background-gray': 'light-dark(#0A131733, #666A724C)',
  '--color-border-gray': 'light-dark(#647685, #748695)', // Gray 600 / 550
  '--color-icon-gray': 'light-dark(#4E606F, #AAAFB5)',
  '--color-text-gray': 'light-dark(#0A1317, #E7EAED)',

  // Green
  '--color-background-green': 'light-dark(#24BB5E33, #24BB5E33)',
  '--color-border-green': 'light-dark(#0D8626, #0B991F)', // Green 600 / 550
  '--color-icon-green': 'light-dark(#0D8626, #26A756)',
  '--color-text-green': 'light-dark(#09441F, #A5F690)',

  // Orange
  '--color-background-orange': 'light-dark(#F2790233, #F2790233)',
  '--color-border-orange': 'light-dark(#EB6E00, #B34A01)', // Orange 500 / 650
  '--color-icon-orange': 'light-dark(#E9690B, #FB8C00)',
  '--color-text-orange': 'light-dark(#6B2203, #FDB876)',

  // Pink
  '--color-background-pink': 'light-dark(#E638B333, #E638B333)',
  '--color-border-pink': 'light-dark(#F351C0, #C02294)', // Pink 500 / 650
  '--color-icon-pink': 'light-dark(#C2185B, #EC407A)',
  '--color-text-pink': 'light-dark(#650053, #FEADE3)',

  // Purple
  '--color-background-purple': 'light-dark(#7952FF33, #7952FF33)',
  '--color-border-purple': 'light-dark(#9081FF, #7340FE)', // Purple 500 / 650
  '--color-icon-purple': 'light-dark(#5B08D8, #7952FF)',
  '--color-text-purple': 'light-dark(#3E0697, #B3B0FE)',

  // Red
  '--color-background-red': 'light-dark(#E3193B33, #E3193B33)',
  '--color-border-red': 'light-dark(#E3193B, #F5394F)',
  '--color-icon-red': 'light-dark(#D31130, #E3193B)',
  '--color-text-red': 'light-dark(#7B0210, #FFB2B8)',

  // Teal
  '--color-background-teal': 'light-dark(#0DB7AF33, #0DB7AF33)',
  '--color-border-teal': 'light-dark(#08A3A3, #08767D)', // Teal 500 / 650
  '--color-icon-teal': 'light-dark(#009688, #26A69A)',
  '--color-text-teal': 'light-dark(#083943, #40DCCD)',

  // Yellow
  '--color-background-yellow': 'light-dark(#E2A40033, #E2A40033)',
  '--color-border-yellow': 'light-dark(#C58600, #B47700)', // Yellow 500 / 550
  '--color-icon-yellow': 'light-dark(#FBC02D, #FFEE58)',
  '--color-text-yellow': 'light-dark(#753F07, #FBCE03)',

  // Syntax highlighting
} as const;

export const colorVars = stylex.defineVars(colorDefaults);

// =============================================================================
// Spacing Tokens
// =============================================================================

// rem, like the type scale, so gaps and padding grow with the reader's root
// font size instead of tightening around larger text. At the default 16px
// root every step is still 4px × step: --spacing-2 is 8px, --spacing-4 16px.
export const spacingDefaults = {
  '--spacing-0': '0rem',
  '--spacing-0-5': '0.125rem',
  '--spacing-1': '0.25rem',
  '--spacing-1-5': '0.375rem',
  '--spacing-2': '0.5rem',
  '--spacing-3': '0.75rem',
  '--spacing-4': '1rem',
  '--spacing-5': '1.25rem',
  '--spacing-6': '1.5rem',
  '--spacing-7': '1.75rem',
  '--spacing-8': '2rem',
  '--spacing-9': '2.25rem',
  '--spacing-10': '2.5rem',
  '--spacing-11': '2.75rem',
  '--spacing-12': '3rem',
} as const;

export const spacingVars = stylex.defineVars(spacingDefaults);

// =============================================================================
// Size Tokens
// =============================================================================

export const sizeDefaults = {
  '--size-element-sm': '28px',
  '--size-element-md': '32px',
  '--size-element-lg': '36px',
} as const;

export const sizeVars = stylex.defineVars(sizeDefaults);

// =============================================================================
// Border Tokens
// =============================================================================

export const borderDefaults = {
  '--border-width': '1px',
} as const;

export const borderVars = stylex.defineVars(borderDefaults);

export type BorderVarName = keyof typeof borderDefaults;

// =============================================================================
// Focus Tokens
// =============================================================================
// The keyboard focus ring, as one definition for the whole system. Values come
// from Design Conventions §User Interaction States: 2px --color-accent at 3px
// offset. Components read these through utils/focusOutline.stylex.ts; the
// `:focus-visible` condition stays in core, so a theme can restyle the ring
// but cannot show it to pointer users.

export const focusDefaults = {
  '--focus-outline-width': '2px',
  '--focus-outline-style': 'solid',
  '--focus-outline-color': 'var(--color-accent)',
  '--focus-outline-offset': '3px',
} as const;

export const focusVars = stylex.defineVars(focusDefaults);

// =============================================================================
// Radius Tokens
// =============================================================================

export const radiusDefaults = {
  '--radius-none': '0px',
  '--radius-inner': '4px',
  '--radius-element': '8px',
  '--radius-container': '12px',
  '--radius-page': '28px',
  // Chat surfaces (bubbles, composer, drawer) are intentionally rounder than
  // cards in the same view. Tracks --radius-page's value by default but is a
  // distinct token so chat rounding can be themed independently. See #2072.
  '--radius-chat': '28px',
  '--radius-full': '9999px',
} as const;

export const radiusVars = stylex.defineVars(radiusDefaults);

// =============================================================================
// Shadow Tokens
// =============================================================================
// Shadow tokens: low → med → high (ascending intensity).
// Inset shadows: for input state rings.

export const shadowDefaults = {
  // Outer elevation shadows (ascending intensity: low < med < high)
  '--shadow-low':
    '0px 1px 1px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2)), 0px 2px 8px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2))',
  '--shadow-med':
    '0px 1px 2px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2)), 0px 2px 12px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2))',
  '--shadow-high':
    '0px 2px 2px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2)), 0px 8px 24px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.3))',
  // Inset shadows for input border rings (interaction + validation states)
  '--shadow-inset-hover':
    'inset 0px 0px 0px 2px light-dark(rgba(5, 54, 89, 0.15), rgba(223, 226, 229, 0.2))',
  '--shadow-inset-selected': 'inset 0px 0px 0px 2px rgba(1, 113, 227, 0.5)',
  '--shadow-inset-success': 'inset 0px 0px 0px 2px rgba(38, 167, 86, 0.3)',
  '--shadow-inset-warning': 'inset 0px 0px 0px 2px rgba(226, 164, 0, 0.3)',
  '--shadow-inset-error': 'inset 0px 0px 0px 2px rgba(227, 25, 59, 0.3)',
} as const;

export const shadowVars = stylex.defineVars(shadowDefaults);

// =============================================================================
// Motion Tokens — Duration
// =============================================================================
// Duration primitives: pick a duration that matches the visual weight.
// Three bands: fast (micro-interactions), medium (entrance/exit), slow (continuous).
// min/max variants derive from base × ratio (default ratio ≈ 0.75).
// See motion in defineTheme for computed generation.

export const durationDefaults = {
  '--duration-fast-min': '130ms',
  '--duration-fast': '175ms',
  '--duration-fast-max': '230ms',
  '--duration-medium-min': '310ms',
  '--duration-medium': '410ms',
  '--duration-medium-max': '550ms',
  '--duration-slow-min': '730ms',
  '--duration-slow': '975ms',
  '--duration-slow-max': '1300ms',
} as const;

export const durationVars = stylex.defineVars(durationDefaults);

export type DurationVarName = keyof typeof durationDefaults;

// =============================================================================
// Motion Tokens — Easing
// =============================================================================

export const easeDefaults = {
  '--ease-standard': 'cubic-bezier(0.24, 1, 0.4, 1)',
} as const;

export const easeVars = stylex.defineVars(easeDefaults);

export type EaseVarName = keyof typeof easeDefaults;
// =============================================================================
// Typography Tokens - Font Families
// =============================================================================

export const typographyDefaults = {
  '--font-family-body':
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  '--font-family-code': '"SF Mono", Monaco, Consolas, monospace',
  '--font-family-heading':
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
} as const;

export const typographyVars = stylex.defineVars(typographyDefaults);

// =============================================================================
// Typography Tokens - Text Sizes
// =============================================================================

export const textSizeDefaults = {
  // Full geometric scale: round(14 × 1.2^step) / 16, default base=14, ratio=1.2
  '--font-size-4xs': '0.375rem', // step -5: 6px (14 × 1.2⁻⁵ ≈ 5.63 → 6)
  '--font-size-3xs': '0.4375rem', // step -4: 7px (14 × 1.2⁻⁴ ≈ 6.75 → 7)
  '--font-size-2xs': '0.5rem', // step -3: 8px (14 × 1.2⁻³ ≈ 8.10 → 8)
  '--font-size-xs': '0.625rem', // step -2: 10px (14 × 1.2⁻² ≈ 9.72 → 10)
  '--font-size-sm': '0.75rem', // step -1: 12px (14 × 1.2⁻¹ ≈ 11.67 → 12)
  '--font-size-base': '0.875rem', // step  0: 14px — base anchor
  '--font-size-lg': '1.0625rem', // step +1: 17px (14 × 1.2¹ ≈ 16.8 → 17)
  '--font-size-xl': '1.25rem', // step +2: 20px (14 × 1.2² ≈ 20.16 → 20)
  '--font-size-2xl': '1.5rem', // step +3: 24px (14 × 1.2³ ≈ 24.19 → 24)
  '--font-size-3xl': '1.8125rem', // step +4: 29px (14 × 1.2⁴ ≈ 29.03 → 29)
  '--font-size-4xl': '2.1875rem', // step +5: 35px (14 × 1.2⁵ ≈ 34.84 → 35)
  '--font-size-5xl': '2.625rem', // step +6: 42px (14 × 1.2⁶ ≈ 41.80 → 42)
} as const;

export const textSizeVars = stylex.defineVars(textSizeDefaults);

// =============================================================================
// Typography Tokens - Font Weights
// =============================================================================

export const fontWeightDefaults = {
  '--font-weight-normal': '400', // body, captions, code
  '--font-weight-medium': '500', // subheadlines, data viz
  '--font-weight-semibold': '600', // emphasized body, titles
  '--font-weight-bold': '700', // strong emphasis, headings
} as const;

export const fontWeightVars = stylex.defineVars(fontWeightDefaults);

// =============================================================================
// Token Types
// =============================================================================

export type ColorVarName = keyof typeof colorDefaults;
export type SpacingVarName = keyof typeof spacingDefaults;
export type SizeVarName = keyof typeof sizeDefaults;
export type RadiusVarName = keyof typeof radiusDefaults;
export type ShadowVarName = keyof typeof shadowDefaults;
export type TypographyVarName = keyof typeof typographyDefaults;
export type TextSizeVarName = keyof typeof textSizeDefaults;
export type FontWeightVarName = keyof typeof fontWeightDefaults;

// =============================================================================
// Typography Tokens - Type Scale (computed from base=14, ratio=1.2)
// =============================================================================
// These tokens are the source of truth for heading and text sizing.
// Components reference these tokens so that themes
// can override them via typography.scale in defineTheme.
//
// Default scale: base=14px, ratio=1.2, h4 anchored to base.
// Suggested starting points:
//   Dense/functional: { base: 12, ratio: 1.125 }
//   Default:          { base: 14, ratio: 1.2 }
//   Airy/editorial:   { base: 16, ratio: 1.25 }

export const typeScaleDefaults = {
  // Sizes are var() references to raw size tokens.
  // Line heights are hardcoded computed values (4px grid snapped, tiered target).
  // When typography.scale is used in defineTheme, both raw tokens AND these semantic
  // tokens are overridden together.
  //
  // Step mapping: h6=-2, h5=-1, h4=0(base), h3=+1, h2=+2, h1=+3
  //
  // Heading tokens
  '--text-heading-1-size': 'var(--font-size-2xl)', // step +3: 24px
  '--text-heading-1-weight': 'var(--font-weight-semibold)',
  '--text-heading-1-leading': '1.3333', // 24px → 32px (target 1.4, 4px snap)
  '--text-heading-2-size': 'var(--font-size-xl)', // step +2: 20px
  '--text-heading-2-weight': 'var(--font-weight-semibold)',
  '--text-heading-2-leading': '1.4', // 20px → 28px (target 1.4, 4px snap)
  '--text-heading-3-size': 'var(--font-size-lg)', // step +1: 17px
  '--text-heading-3-weight': 'var(--font-weight-semibold)',
  '--text-heading-3-leading': '1.4118', // 17px → 24px (target 1.5, 4px snap)
  '--text-heading-4-size': 'var(--font-size-base)', // step  0: 14px — base anchor
  '--text-heading-4-weight': 'var(--font-weight-semibold)',
  '--text-heading-4-leading': '1.4286', // 14px → 20px (target 1.5, 4px snap)
  '--text-heading-5-size': 'var(--font-size-sm)', // step -1: 12px
  '--text-heading-5-weight': 'var(--font-weight-semibold)',
  '--text-heading-5-leading': '1.6667', // 12px → 20px (target 1.5, 4px snap)
  '--text-heading-6-size': 'var(--font-size-xs)', // step -2: 10px
  '--text-heading-6-weight': 'var(--font-weight-semibold)',
  '--text-heading-6-leading': '1.6', // 10px → 16px (target 1.5, min dominated)

  // Text tokens — body/label/code at base(0), large at +1, supporting at -1
  '--text-body-size': 'var(--font-size-base)', // 14px
  '--text-body-weight': 'var(--font-weight-normal)',
  '--text-body-leading': '1.4286', // 14px → 20px
  '--text-large-size': 'var(--font-size-lg)', // 17px
  '--text-large-weight': 'var(--font-weight-semibold)',
  '--text-large-leading': '1.4118', // 17px → 24px
  '--text-label-size': 'var(--font-size-base)', // 14px
  '--text-label-weight': 'var(--font-weight-medium)',
  '--text-label-leading': '1.4286', // 14px → 20px
  '--text-code-size': 'var(--font-size-base)', // 14px
  '--text-code-weight': 'var(--font-weight-normal)',
  '--text-code-leading': '1.4286', // 14px → 20px
  '--text-supporting-size': 'var(--font-size-sm)', // 12px
  '--text-supporting-weight': 'var(--font-weight-normal)',
  '--text-supporting-leading': '1.6667', // 12px → 20px

  // Display tokens — continue the geometric progression above h1.
  // Display 1 = step +6 (largest, 42px), Display 3 = step +4 (29px, closest to h1).
  // Line heights are tighter (~1.2) than headings (~1.3) since large text reads better tight.
  // Font weight is normal (400) to balance the visual presence of large sizes.
  '--text-display-1-size': 'var(--font-size-5xl)', // 42px (14 × 1.2⁶, largest)
  '--text-display-1-weight': 'var(--font-weight-normal)',
  '--text-display-1-leading': '1.2381',
  '--text-display-2-size': 'var(--font-size-4xl)', // 35px (14 × 1.2⁵)
  '--text-display-2-weight': 'var(--font-weight-normal)',
  '--text-display-2-leading': '1.2571',
  '--text-display-3-size': 'var(--font-size-3xl)', // 29px (14 × 1.2⁴, closest to h1)
  '--text-display-3-weight': 'var(--font-weight-normal)',
  '--text-display-3-leading': '1.2414',
} as const;

export const typeScaleVars = stylex.defineVars(typeScaleDefaults);

export type TypeScaleVarName = keyof typeof typeScaleDefaults;
