// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Matcha Theme
 *
 * An earthy green theme inspired by matcha tea and natural botanicals.
 * Uses Playwrite US Trad for headings and DM Sans for body text.
 */

import {defineTheme, defineSyntaxTheme} from '@astryxdesign/core/theme';
import {matchaIconRegistry} from './icons';
import {matchaPaletteRefs} from './matchaPaletteRefs.generated';

const {blue, cyan, green, neutral, orange, pink, purple, red, teal, yellow} =
  matchaPaletteRefs;

const withAlpha = (color: string, alpha: string): string => `${color}${alpha}`;

/** Matcha syntax palette — earthy greens and warm tones. */
const matchaSyntax = defineSyntaxTheme({
  name: 'astryx-matcha',
  tokens: {
    keyword: [neutral.light[30], neutral.dark[70]],
    string: [teal.light[50], teal.dark[75]],
    comment: [neutral.light[40], neutral.dark[40]],
    number: [yellow.light[45], yellow.dark[75]],
    function: [blue.light[50], blue.dark[70]],
    type: [purple.light[50], purple.dark[70]],
    variable: [neutral.light[20], neutral.dark[75]],
    operator: [neutral.light[40], neutral.dark[60]],
    constant: [yellow.light[45], yellow.dark[75]],
    tag: [pink.light[30], pink.dark[65]],
    attribute: [orange.light[30], yellow.dark[70]],
    property: [teal.light[55], teal.dark[75]],
    // Punctuation uses dedicated neutral stops that maintain WCAG AA against
    // the syntax background in both modes (issue 5386).
    punctuation: [neutral.light[30], neutral.dark[65]],
    background: [neutral.light[95], neutral.dark[10]],
  },
});

export const matchaTheme = defineTheme({
  name: 'matcha',

  typography: {
    // base 16 / ratio 1.25 — aligned with the other themes' geometric scale.
    scale: {base: 16, ratio: 1.25},
    body: {
      family: 'DM Sans',
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    heading: {
      family: 'Playwrite US Trad',
      fallbacks: 'Georgia, "Times New Roman", Times, serif',
    },
    code: {
      family: 'JetBrains Mono',
      fallbacks: '"SF Mono", Monaco, Consolas, monospace',
    },
  },

  motion: {fast: 125, medium: 300, slow: 700, ratio: 0.75},

  syntax: matchaSyntax,

  tokens: {
    // =========================================================================
    // Colors — earthy matcha palette
    // =========================================================================

    // Core semantic
    '--color-accent': [neutral.light[20], neutral.dark[75]],
    '--color-accent-muted': [
      withAlpha(neutral.light[20], '14'),
      withAlpha(neutral.dark[75], '20'),
    ],
    '--color-neutral': [
      withAlpha(neutral.light[20], '0f'),
      withAlpha(neutral.dark[75], '1a'),
    ],
    '--color-background-surface': [neutral.light[100], neutral.dark[10]],
    '--color-background-body': [neutral.light[95], neutral.dark[5]],
    '--color-overlay': [
      withAlpha(neutral.light[20], '80'),
      withAlpha(neutral.dark[20], 'cc'),
    ],
    '--color-overlay-hover': [
      withAlpha(neutral.light[20], '0d'),
      withAlpha(neutral.dark[75], '0d'),
    ],
    '--color-overlay-pressed': [
      withAlpha(neutral.light[20], '1a'),
      withAlpha(neutral.dark[75], '1a'),
    ],
    '--color-background-muted': [neutral.light[95], neutral.dark[20]],

    // Text
    '--color-text-primary': [neutral.light[20], neutral.dark[75]],
    '--color-text-secondary': [neutral.light[40], neutral.dark[60]],
    '--color-text-disabled': [neutral.light[75], neutral.dark[30]],
    '--color-text-accent': [neutral.light[20], neutral.dark[75]],
    '--color-on-dark': neutral.light[100],
    '--color-on-light': neutral.light[20],
    '--color-on-accent': [neutral.light[100], neutral.dark[20]],
    '--color-on-success': neutral.dark[5],
    '--color-on-error': neutral.dark[5],
    '--color-on-warning': [neutral.light[20], neutral.dark[20]],

    // Info is its own blue status, independent of the accent.
    '--color-info': [blue.light[50], blue.dark[80]],
    '--color-info-muted': 'var(--color-background-blue)',

    '--color-text-info': [blue.light[35], blue.dark[75]],
    '--color-text-success': [green.light[35], green.dark[75]],
    '--color-text-warning': [yellow.light[45], yellow.dark[90]],
    '--color-text-error': [red.light[35], red.dark[75]],
    '--color-on-info-muted': [blue.light[35], blue.dark[75]],
    '--color-on-success-muted': [green.light[35], green.dark[75]],
    '--color-on-warning-muted': [yellow.light[45], yellow.dark[90]],
    '--color-on-error-muted': [red.light[35], red.dark[75]],

    // Icon
    '--color-icon-accent': [neutral.light[20], neutral.dark[75]],
    '--color-icon-primary': [neutral.light[20], neutral.dark[75]],
    '--color-icon-secondary': [neutral.light[40], neutral.dark[60]],
    '--color-icon-disabled': [neutral.light[75], neutral.dark[30]],

    // Surface variants
    '--color-background-card': [neutral.light[100], neutral.dark[15]],
    '--color-background-popover': [neutral.light[100], neutral.dark[20]],
    '--color-background-inverted': [neutral.light[20], neutral.dark[75]],

    // Status / Sentiment
    '--color-success': [green.light[50], green.dark[70]],
    '--color-success-muted': [
      withAlpha(green.light[50], '20'),
      withAlpha(green.dark[70], '20'),
    ],
    '--color-error': [red.light[50], red.dark[70]],
    '--color-error-muted': [
      withAlpha(red.light[50], '20'),
      withAlpha(red.dark[70], '20'),
    ],
    '--color-warning': [yellow.light[80], yellow.dark[85]],
    '--color-warning-muted': [
      withAlpha(yellow.light[80], '20'),
      withAlpha(yellow.dark[85], '20'),
    ],

    // Border
    // Softer sage borders (default + emphasized/card) in light mode.
    '--color-border': [neutral.light[85], withAlpha(neutral.dark[75], '1a')],
    '--color-border-emphasized': [neutral.light[70], neutral.dark[30]],

    // Effects
    '--color-skeleton': [neutral.light[75], neutral.dark[30]],
    '--color-shadow': [
      withAlpha(neutral.light[20], '1a'),
      withAlpha(neutral.dark[0], '4d'),
    ],
    '--color-tint-hover': [neutral.light[0], neutral.dark[100]],

    // Categorical — Blue
    '--color-background-blue': [
      withAlpha(blue.light[50], '33'),
      withAlpha(blue.dark[50], '33'),
    ],
    '--color-border-blue': [blue.light[50], blue.dark[70]],
    '--color-icon-blue': [blue.light[50], blue.dark[70]],
    '--color-text-blue': [blue.light[35], blue.dark[75]],

    // Categorical — Cyan
    '--color-background-cyan': [
      withAlpha(cyan.light[50], '33'),
      withAlpha(cyan.dark[50], '33'),
    ],
    '--color-border-cyan': [cyan.light[50], cyan.dark[70]],
    '--color-icon-cyan': [cyan.light[50], cyan.dark[70]],
    '--color-text-cyan': [cyan.light[35], cyan.dark[75]],

    // Categorical — Gray
    '--color-background-gray': [
      withAlpha(neutral.light[40], '33'),
      withAlpha(neutral.dark[30], '33'),
    ],
    '--color-border-gray': [neutral.light[40], neutral.dark[40]],
    '--color-icon-gray': [neutral.light[40], neutral.dark[60]],
    '--color-text-gray': [neutral.light[20], neutral.dark[75]],

    // Categorical — Green
    '--color-background-green': [
      withAlpha(green.light[50], '33'),
      withAlpha(green.dark[70], '33'),
    ],
    '--color-border-green': [green.light[50], green.dark[70]],
    '--color-icon-green': [green.light[50], green.dark[70]],
    '--color-text-green': [green.light[35], green.dark[75]],

    // Categorical — Orange
    '--color-background-orange': [
      withAlpha(orange.light[50], '33'),
      withAlpha(orange.dark[70], '33'),
    ],
    '--color-border-orange': [orange.light[50], orange.dark[70]],
    '--color-icon-orange': [orange.light[50], orange.dark[70]],
    '--color-text-orange': [orange.light[35], orange.dark[75]],

    // Categorical — Pink
    '--color-background-pink': [
      withAlpha(pink.light[50], '33'),
      withAlpha(pink.dark[70], '33'),
    ],
    '--color-border-pink': [pink.light[50], pink.dark[70]],
    '--color-icon-pink': [pink.light[50], pink.dark[70]],
    '--color-text-pink': [pink.light[35], pink.dark[75]],

    // Categorical — Purple
    '--color-background-purple': [
      withAlpha(purple.light[50], '33'),
      withAlpha(purple.dark[70], '33'),
    ],
    '--color-border-purple': [purple.light[50], purple.dark[70]],
    '--color-icon-purple': [purple.light[50], purple.dark[70]],
    '--color-text-purple': [purple.light[35], purple.dark[75]],

    // Categorical — Red
    '--color-background-red': [
      withAlpha(red.light[50], '33'),
      withAlpha(red.dark[70], '33'),
    ],
    '--color-border-red': [red.light[50], red.dark[70]],
    '--color-icon-red': [red.light[50], red.dark[70]],
    '--color-text-red': [red.light[35], red.dark[75]],

    // Categorical — Teal
    '--color-background-teal': [
      withAlpha(teal.light[50], '33'),
      withAlpha(teal.dark[70], '33'),
    ],
    '--color-border-teal': [teal.light[50], teal.dark[70]],
    '--color-icon-teal': [teal.light[50], teal.dark[70]],
    '--color-text-teal': [teal.light[35], teal.dark[75]],

    // Categorical — Yellow
    '--color-background-yellow': [
      withAlpha(yellow.light[80], '33'),
      withAlpha(yellow.dark[85], '33'),
    ],
    '--color-border-yellow': [yellow.light[80], yellow.dark[85]],
    '--color-icon-yellow': [yellow.light[80], yellow.dark[85]],
    '--color-text-yellow': [yellow.light[65], yellow.dark[90]],

    // =========================================================================
    // Spacing
    // =========================================================================
    '--spacing-0-5': '0.1875rem',
    '--spacing-1': '0.375rem',
    '--spacing-1-5': '0.5625rem',
    '--spacing-2': '0.75rem',
    '--spacing-3': '1.125rem',
    '--spacing-4': '1.5rem',
    '--spacing-5': '1.875rem',
    '--spacing-6': '2.25rem',
    '--spacing-7': '2.625rem',
    '--spacing-8': '3rem',
    '--spacing-9': '3.375rem',
    '--spacing-10': '3.75rem',
    '--spacing-11': '4.125rem',
    '--spacing-12': '4.5rem',

    // =========================================================================
    // Radius — soft and rounded
    // =========================================================================
    '--radius-inner': '6px',
    '--radius-element': '12px',
    '--radius-container': '18px',
    '--radius-page': '42px',

    // No explicit --font-size-* overrides — font sizes come from
    // typography.scale above, keeping the scale the single source of truth.

    // =========================================================================
    // Element sizes
    // =========================================================================
    '--size-element-sm': '36px',
    '--size-element-md': '40px',
    '--size-element-lg': '44px',

    // =========================================================================
    // Shadows
    // =========================================================================
    '--shadow-low': `0 2px 4px ${withAlpha(neutral.light[20], '0d')}, 0 4px 8px ${withAlpha(neutral.light[20], '1a')}`,
    '--shadow-med': `0 2px 4px ${withAlpha(neutral.light[20], '0d')}, 0 4px 12px ${withAlpha(neutral.light[20], '1a')}`,
    '--shadow-high': `0 4px 6px ${withAlpha(neutral.light[20], '1a')}, 0 12px 24px ${withAlpha(neutral.light[20], '26')}`,
    '--shadow-inset-hover': `inset 0px 0px 0px 2px ${withAlpha(neutral.light[20], '30')}`,
    '--shadow-inset-selected': `inset 0px 0px 0px 2px ${withAlpha(neutral.light[20], '50')}`,
    '--shadow-inset-success': `inset 0px 0px 0px 2px ${withAlpha(green.light[50], '50')}`,
    '--shadow-inset-warning': `inset 0px 0px 0px 2px ${withAlpha(yellow.light[80], '50')}`,
    '--shadow-inset-error': `inset 0px 0px 0px 2px ${withAlpha(red.light[50], '50')}`,
  },

  components: {
    button: {
      base: {
        borderRadius: 'var(--radius-full)',
      },
    },
    card: {
      base: {
        borderRadius: 'var(--radius-page)',
        padding: 'var(--spacing-3)',
      },
    },
    section: {
      base: {
        padding: 'var(--spacing-3)',
      },
    },
  },

  icons: matchaIconRegistry,
});
