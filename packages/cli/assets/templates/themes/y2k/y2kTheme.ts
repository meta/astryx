// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Y2K Theme
 *
 * A bubbly, playful pop theme inspired by early 2000s aesthetics.
 * Colors resolve through named stops from Y2K's reviewed light and dark palette.
 * The signature periwinkle and neon green remain exact anchors.
 */

import {defineTheme, defineSyntaxTheme} from '@astryxdesign/core/theme';
import {y2kIconRegistry} from './icons';
import {y2kPaletteRefs} from './y2kPaletteRefs.generated';

const {
  accent,
  blue,
  cyan,
  green,
  neutral,
  orange,
  pink,
  purple,
  red,
  teal,
  yellow,
} = y2kPaletteRefs;

const withAlpha = (color: string, alpha: string): string => `${color}${alpha}`;

const y2kSyntax = defineSyntaxTheme({
  name: 'astryx-y2k',
  tokens: {
    keyword: [purple.light[40], purple.dark[75]],
    string: [green.light[40], green.dark[65]],
    comment: [neutral.light[40], neutral.dark[70]],
    number: [orange.light[40], orange.dark[80]],
    function: [blue.light[40], blue.dark[75]],
    type: [purple.light[40], purple.dark[75]],
    variable: [neutral.light[40], neutral.dark[70]],
    operator: [neutral.light[40], neutral.dark[70]],
    constant: [orange.light[40], orange.dark[80]],
    tag: [red.light[35], red.dark[75]],
    attribute: [yellow.light[40], yellow.dark[70]],
    property: [teal.light[40], teal.dark[70]],
    punctuation: [neutral.light[40], neutral.dark[70]],
    background: [neutral.light[95], neutral.dark[5]],
    // Markers stay readable on diff tints in both modes. The closest pairing
    // is the dark added marker, which remains above the 4.5:1 text threshold.
    added: [withAlpha(green.light[80], '40'), withAlpha(green.dark[80], '33')],
    removed: [withAlpha(red.light[85], '40'), withAlpha(red.dark[85], '33')],
    'added-marker': [green.light[30], green.dark[65]],
    'removed-marker': [red.light[30], red.dark[75]],
  },
});

/**
 * The secondary Button treatment. Selector, MultiSelector, and ComplexSelector
 * reuse it for their `secondary` trigger so every secondary control in this
 * theme matches (AST-079 FR2).
 */
const SECONDARY_BUTTON = {
  backgroundColor: 'var(--color-background-green)',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--color-text-green)',
  color: 'var(--color-text-green)',
  ':hover': {
    backgroundColor: 'var(--color-border-green)',
  },
} as const;

/**
 * The secondary Button treatment on Selector and MultiSelector triggers
 * (AST-079 FR2). Inside an InputGroup a trigger keeps the neutral fill and the
 * group's edges instead (FR6). The hover stays off disabled and read-only
 * triggers, which carry `data-disabled` and `data-readonly`.
 */
const SECONDARY_SELECTOR = {
  ':not(.astryx-input-group *)': {
    backgroundColor: SECONDARY_BUTTON.backgroundColor,
    borderWidth: SECONDARY_BUTTON.borderWidth,
    borderStyle: SECONDARY_BUTTON.borderStyle,
    borderColor: SECONDARY_BUTTON.borderColor,
    color: SECONDARY_BUTTON.color,
  },
  ':hover:not([data-disabled], [data-readonly], .astryx-input-group *)':
    SECONDARY_BUTTON[':hover'],
} as const;

/**
 * The secondary Button treatment on ComplexSelector triggers (AST-079 FR2), with
 * the hover kept off a disabled trigger, whose inner button is disabled
 * (natively or, keeping its tab stop, with `aria-disabled`).
 */
const SECONDARY_COMPLEX_SELECTOR = {
  backgroundColor: SECONDARY_BUTTON.backgroundColor,
  borderWidth: SECONDARY_BUTTON.borderWidth,
  borderStyle: SECONDARY_BUTTON.borderStyle,
  borderColor: SECONDARY_BUTTON.borderColor,
  color: SECONDARY_BUTTON.color,
  ':hover:not(:has(> :is(:disabled, [aria-disabled="true"])))':
    SECONDARY_BUTTON[':hover'],
} as const;

export const y2kTheme = defineTheme({
  name: 'y2k',

  typography: {
    scale: {base: 16, ratio: 1.25},
    body: {
      family: 'Poppins',
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    heading: {
      family: 'Poppins',
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    code: {
      family: 'JetBrains Mono',
      fallbacks: '"SF Mono", Monaco, Consolas, monospace',
    },
  },

  radius: {base: 4, multiplier: 0},

  motion: {fast: 100, medium: 250, slow: 600, ratio: 0.8},

  syntax: y2kSyntax,

  tokens: {
    // =========================================================================
    // Spacing — comfortable preset (base=6)
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

    // Size — comfortable preset
    '--size-element-sm': '32px',
    '--size-element-md': '40px',
    '--size-element-lg': '48px',

    // =========================================================================
    // Colors — Y2K pop palette
    // =========================================================================

    // Core semantic colors
    '--color-accent': [neutral.light[15], neutral.dark[95]],
    '--color-accent-muted': [
      withAlpha(neutral.light[15], '14'),
      withAlpha(neutral.dark[95], '20'),
    ],
    '--color-neutral': [
      withAlpha(neutral.light[15], '10'),
      withAlpha(neutral.dark[95], '1A'),
    ],
    '--color-background-surface': [neutral.light[100], neutral.dark[10]],
    '--color-background-body': [accent.light[80], neutral.dark[5]],
    '--color-overlay': [
      withAlpha(neutral.light[15], '80'),
      withAlpha(neutral.dark[5], 'CC'),
    ],
    '--color-overlay-hover': [
      withAlpha(neutral.light[15], '0D'),
      withAlpha(neutral.dark[95], '0D'),
    ],
    '--color-overlay-pressed': [
      withAlpha(neutral.light[15], '1A'),
      withAlpha(neutral.dark[95], '1A'),
    ],
    '--color-background-muted': [neutral.light[90], neutral.dark[20]],

    // Text
    '--color-text-primary': [neutral.light[15], neutral.dark[95]],
    '--color-text-secondary': [neutral.light[40], neutral.dark[70]],
    '--color-text-disabled': [neutral.light[80], neutral.dark[35]],
    '--color-text-accent': [neutral.light[15], neutral.dark[95]],
    '--color-on-dark': neutral.light[100],
    '--color-on-light': neutral.light[15],
    '--color-on-accent': [neutral.light[100], neutral.dark[10]],
    '--color-on-success': [green.light[30], green.dark[20]],
    '--color-on-error': [red.light[30], red.dark[20]],
    '--color-on-warning': [yellow.light[30], yellow.dark[20]],

    '--color-info': [blue.light[40], blue.dark[75]],
    '--color-info-muted': 'var(--color-background-blue)',

    '--color-text-info': [blue.light[20], blue.dark[75]],
    '--color-text-success': [green.light[30], green.dark[75]],
    '--color-text-warning': [yellow.light[30], yellow.dark[85]],
    '--color-text-error': [red.light[30], red.dark[75]],
    '--color-on-info-muted': 'var(--color-text-blue)',
    '--color-on-success-muted': 'var(--color-text-green)',
    '--color-on-warning-muted': 'var(--color-text-yellow)',
    '--color-on-error-muted': 'var(--color-text-red)',

    // Icon
    '--color-icon-accent': [neutral.light[15], neutral.dark[95]],
    '--color-icon-primary': [neutral.light[15], neutral.dark[95]],
    '--color-icon-secondary': [neutral.light[40], neutral.dark[70]],
    '--color-icon-disabled': [neutral.light[80], neutral.dark[35]],

    // Surface variants
    '--color-background-card': [neutral.light[100], neutral.dark[10]],
    '--color-background-popover': [neutral.light[100], neutral.dark[20]],
    '--color-background-inverted': [neutral.light[15], neutral.dark[95]],

    // Status / sentiment
    '--color-success': [green.light[80], green.dark[80]],
    '--color-success-muted': [green.light[80], green.dark[80]],
    '--color-error': [red.light[85], red.dark[85]],
    '--color-error-muted': [red.light[85], red.dark[85]],
    '--color-warning': [yellow.light[90], yellow.dark[90]],
    '--color-warning-muted': [yellow.light[90], yellow.dark[90]],

    // Bold borders preserve the heavy-outline Y2K look.
    '--color-border': [neutral.light[20], withAlpha(neutral.dark[95], '1A')],
    '--color-border-emphasized': [neutral.light[20], neutral.dark[45]],

    // Effects
    '--color-skeleton': [neutral.light[80], neutral.dark[25]],
    '--color-shadow': [
      withAlpha(neutral.light[15], '1A'),
      withAlpha(neutral.dark[0], '4D'),
    ],
    '--color-tint-hover': [neutral.light[15], neutral.dark[95]],

    // Typography override
    '--text-supporting-size': '12px',

    // Categorical colors
    '--color-background-green': [green.light[80], green.dark[80]],
    '--color-border-green': [green.light[75], green.dark[75]],
    '--color-icon-green': [green.light[30], green.dark[20]],
    '--color-text-green': [green.light[30], green.dark[20]],

    '--color-background-red': [red.light[85], red.dark[85]],
    '--color-border-red': [red.light[75], red.dark[75]],
    '--color-icon-red': [red.light[30], red.dark[20]],
    '--color-text-red': [red.light[30], red.dark[20]],

    '--color-background-yellow': [yellow.light[90], yellow.dark[90]],
    '--color-border-yellow': [yellow.light[85], yellow.dark[85]],
    '--color-icon-yellow': [yellow.light[30], yellow.dark[20]],
    '--color-text-yellow': [yellow.light[30], yellow.dark[20]],

    '--color-background-blue': [blue.light[85], blue.dark[85]],
    '--color-border-blue': [blue.light[75], blue.dark[75]],
    '--color-icon-blue': [blue.light[20], blue.dark[20]],
    '--color-text-blue': [blue.light[20], blue.dark[20]],

    '--color-background-pink': [pink.light[85], pink.dark[85]],
    '--color-border-pink': [pink.light[80], pink.dark[80]],
    '--color-icon-pink': [pink.light[30], pink.dark[20]],
    '--color-text-pink': [pink.light[30], pink.dark[20]],

    '--color-background-purple': [purple.light[85], purple.dark[85]],
    '--color-border-purple': [purple.light[75], purple.dark[75]],
    '--color-icon-purple': [purple.light[25], purple.dark[15]],
    '--color-text-purple': [purple.light[25], purple.dark[15]],

    '--color-background-cyan': [cyan.light[90], cyan.dark[90]],
    '--color-border-cyan': [cyan.light[80], cyan.dark[80]],
    '--color-icon-cyan': [cyan.light[30], cyan.dark[15]],
    '--color-text-cyan': [cyan.light[30], cyan.dark[15]],

    '--color-background-orange': [orange.light[85], orange.dark[85]],
    '--color-border-orange': [orange.light[80], orange.dark[80]],
    '--color-icon-orange': [orange.light[30], orange.dark[15]],
    '--color-text-orange': [orange.light[30], orange.dark[15]],

    '--color-background-teal': [teal.light[90], teal.dark[85]],
    '--color-border-teal': [teal.light[80], teal.dark[80]],
    '--color-icon-teal': [teal.light[30], teal.dark[15]],
    '--color-text-teal': [teal.light[30], teal.dark[15]],

    // Gray
    '--color-background-gray': [neutral.light[90], neutral.dark[90]],
    '--color-border-gray': [neutral.light[85], neutral.dark[85]],
    '--color-icon-gray': [neutral.light[30], neutral.dark[10]],
    '--color-text-gray': [neutral.light[30], neutral.dark[10]],

    // =========================================================================
    // Radius — sharp / brutalist (multiplier: 0 via radius config + explicit)
    // =========================================================================
    '--radius-none': '0px',
    '--radius-inner': '0px',
    '--radius-element': '0px',
    '--radius-container': '0px',
    '--radius-page': '0px',
    '--radius-full': '0px',

    // =========================================================================
    // Shadows — warm cream neutral
    // =========================================================================
    '--shadow-low': `0 2px 4px ${withAlpha(neutral.light[15], '0D')}, 0 4px 8px ${withAlpha(neutral.light[15], '1A')}`,
    '--shadow-med': `0 2px 4px ${withAlpha(neutral.light[15], '0D')}, 0 4px 12px ${withAlpha(neutral.light[15], '1A')}`,
    '--shadow-high': `0 4px 6px ${withAlpha(neutral.light[15], '1A')}, 0 12px 24px ${withAlpha(neutral.light[15], '26')}`,
    '--shadow-inset-hover': `inset 0px 0px 0px 2px ${withAlpha(neutral.light[15], '30')}`,
    '--shadow-inset-selected': `inset 0px 0px 0px 2px ${withAlpha(neutral.light[15], '50')}`,
    '--shadow-inset-success': `inset 0px 0px 0px 2px ${withAlpha(green.light[30], '50')}`,
    '--shadow-inset-warning': `inset 0px 0px 0px 2px ${withAlpha(yellow.light[30], '50')}`,
    '--shadow-inset-error': `inset 0px 0px 0px 2px ${withAlpha(red.light[30], '50')}`,
  },

  components: {
    // Display sizes use a Crimson Text serif, distinct from the Poppins
    // used for body/headings.
    text: {
      'type:display-1': {
        fontFamily: '"Crimson Text", Georgia, "Times New Roman", Times, serif',
      },
      'type:display-2': {
        fontFamily: '"Crimson Text", Georgia, "Times New Roman", Times, serif',
      },
      'type:display-3': {
        fontFamily: '"Crimson Text", Georgia, "Times New Roman", Times, serif',
      },
    },

    // TopNav items: drop the pill background on the selected state and rely on
    // weight + primary text color for emphasis. Hover/active keep the neutral
    // overlay from the base styles.
    'top-nav-item': {
      selected: {
        backgroundColor: 'transparent',
        ':hover': {
          backgroundColor: 'var(--color-overlay-hover)',
        },
        ':active': {
          backgroundColor: 'var(--color-overlay-pressed)',
        },
      },
    },
    button: {
      base: {
        borderRadius: '0px',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--color-border)',
      },
      'variant:primary': {
        backgroundColor: 'var(--color-text-primary)',
        color: 'var(--color-background-body)',
        borderColor: 'transparent',
      },
      'variant:secondary': SECONDARY_BUTTON,
      'variant:ghost': {
        borderColor: 'transparent',
      },
      'variant:destructive': {
        backgroundColor: 'var(--color-background-red)',
        color: 'var(--color-text-red)',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--color-text-red)',
      },
    },
    // Secondary selector triggers match the secondary Button (AST-079 FR2).
    selector: {'variant:secondary': SECONDARY_SELECTOR},
    'multi-selector': {'variant:secondary': SECONDARY_SELECTOR},
    'complex-selector': {'variant:secondary': SECONDARY_COMPLEX_SELECTOR},

    badge: {
      base: {
        borderRadius: '9999px',
        borderWidth: '1.5px',
        borderStyle: 'solid',
        borderColor: 'color-mix(in srgb, currentColor 30%, transparent)',
      },
      'variant:info': {
        backgroundColor: 'var(--color-background-blue)',
        color: 'var(--color-text-blue)',
      },
      'variant:neutral': {
        backgroundColor: 'var(--color-background-gray)',
        color: 'var(--color-text-gray)',
      },
      'variant:success': {
        backgroundColor: 'var(--color-background-green)',
        color: 'var(--color-text-green)',
      },
      'variant:warning': {
        backgroundColor: 'var(--color-background-yellow)',
        color: 'var(--color-text-yellow)',
      },
      'variant:error': {
        backgroundColor: 'var(--color-background-red)',
        color: 'var(--color-text-red)',
      },
    },

    banner: {
      base: {
        borderRadius: '0px',
      },
      'status:info': {
        '--color-info-muted': 'var(--color-background-blue)',
        '--color-on-info-muted': 'var(--color-text-blue)',
      },
      'status:success': {
        '--color-success-muted': 'var(--color-background-green)',
        '--color-on-success-muted': 'var(--color-text-green)',
      },
      'status:warning': {
        '--color-warning-muted': 'var(--color-background-yellow)',
        '--color-on-warning-muted': 'var(--color-text-yellow)',
      },
      'status:error': {
        '--color-error-muted': 'var(--color-background-red)',
        '--color-on-error-muted': 'var(--color-text-red)',
      },
    },

    field: {
      base: {
        borderRadius: '0px',
      },
    },

    card: {
      base: {
        borderRadius: '0px',
        padding: 'var(--spacing-3)',
      },
    },

    section: {
      base: {
        padding: 'var(--spacing-3)',
      },
    },
  },

  icons: y2kIconRegistry,
});
