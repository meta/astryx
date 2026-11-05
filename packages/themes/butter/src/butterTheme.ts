// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Butter Theme
 *
 * Warm, golden buttery theme with blue accents.
 * Sarina for display, Outfit for headings and body.
 *
 * All colors resolve through named stops from Butter's reviewed palette.
 * The signature blue and butter yellow remain exact anchors.
 */

import {defineTheme, defineSyntaxTheme} from '@astryxdesign/core/theme';
import {butterIconRegistry} from './icons';
import {butterPaletteRefs} from './butterPaletteRefs.generated';

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
} = butterPaletteRefs;

const withAlpha = (color: string, alpha: string): string => `${color}${alpha}`;
const lightDark = (light: string, dark: string): string =>
  `light-dark(${light}, ${dark})`;

/** Butter syntax colors resolved through reviewed palette stops. */
const butterSyntax = defineSyntaxTheme({
  name: 'astryx-butter',
  tokens: {
    keyword: [purple.light[25], purple.dark[80]], // Purple
    string: [green.light[25], green.dark[80]], // Green
    comment: [neutral.light[45], neutral.dark[70]],
    number: [orange.light[25], orange.dark[80]], // Orange
    function: [blue.light[25], blue.dark[80]], // Blue
    type: [purple.light[25], purple.dark[80]], // Purple
    variable: [neutral.light[45], neutral.dark[70]],
    operator: [neutral.light[45], neutral.dark[70]],
    constant: [orange.light[25], orange.dark[80]],
    tag: [red.light[25], red.dark[80]], // Red
    attribute: [yellow.light[25], yellow.dark[70]], // Yellow
    property: [teal.light[25], teal.dark[80]], // Teal
    punctuation: [neutral.light[45], neutral.dark[70]],
    background: [neutral.light[95], neutral.dark[5]],
  },
});

/**
 * The secondary Button treatment. Selector, MultiSelector, and ComplexSelector
 * reuse it for their `secondary` trigger so every secondary control in this
 * theme matches (AST-079 FR2).
 *
 * Secondary: blue outline + label in light, butter yellow in dark.
 */
const SECONDARY_BUTTON = {
  backgroundColor: 'transparent',
  borderWidth: '1.5px',
  borderStyle: 'solid',
  borderColor: lightDark(accent.light[40], yellow.dark[90]),
  color: lightDark(accent.light[40], yellow.dark[90]),
  ':hover': {
    backgroundColor: lightDark(
      withAlpha(accent.light[40], '14'),
      withAlpha(yellow.dark[90], '14'),
    ),
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

/**
 * Butter's bright status rims and glyphs in input status scopes. Light mode
 * uses mid-ramp stops so a rim reaches 3:1 on the field (theme-tokens INV11).
 */
const INPUT_STATUS_VARS = {
  'status:success': {
    '--color-border-success': lightDark(green.light[55], green.light[70]),
    '--color-icon-success': lightDark(green.light[55], green.light[70]),
  },
  'status:warning': {
    '--color-border-warning': lightDark(yellow.light[55], yellow.light[80]),
    '--color-icon-warning': lightDark(yellow.light[55], yellow.light[80]),
  },
  'status:error': {
    '--color-border-error': red.light[60],
    '--color-icon-error': red.light[60],
  },
} as const;

export const butterTheme = defineTheme({
  name: 'butter',

  typography: {
    scale: {base: 14, ratio: 1.25},
    body: {
      family: 'Outfit',
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    heading: {
      family: 'Outfit',
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      weights: {3: 'bold', 4: 'bold'},
    },
    code: {
      family: 'JetBrains Mono',
      fallbacks: '"SF Mono", Monaco, Consolas, monospace',
    },
  },

  // Touch + narrow (Mobile Type, Pin): floor base to the 16px floor and
  // re-derive the ratio so Display 1 keeps its desktop size:
  // ratio' = 1.25 * (14/16)^(1/6) ~= 1.2225. Body 14 -> 16px, display-1 stays 53px.
  adaptations: {
    rules: [
      {
        when: {pointer: 'coarse', width: {below: 'lg'}},
        value: {typography: {scale: {base: 16, ratio: 1.2225}}},
      },
    ],
  },

  motion: {fast: 125, medium: 300, slow: 700, ratio: 0.75},

  syntax: butterSyntax,

  tokens: {
    // =========================================================================
    // Core semantic — accent uses the exact signature brand stop
    // =========================================================================
    '--color-accent': [accent.light[40], yellow.dark[90]],
    '--color-accent-muted': [
      withAlpha(accent.light[40], '33'),
      withAlpha(yellow.dark[90], '40'),
    ],
    '--color-neutral': [
      withAlpha(neutral.light[15], '0f'),
      withAlpha(neutral.dark[90], '1a'),
    ],
    '--color-background-surface': [neutral.light[100], neutral.dark[15]],
    '--color-background-body': [neutral.light[95], neutral.dark[10]],
    '--color-overlay': [
      withAlpha(neutral.light[15], '80'),
      withAlpha(neutral.dark[10], 'cc'),
    ],
    '--color-overlay-hover': [
      withAlpha(neutral.light[15], '0d'),
      withAlpha(neutral.dark[90], '0d'),
    ],
    '--color-overlay-pressed': [
      withAlpha(neutral.light[15], '1a'),
      withAlpha(neutral.dark[90], '1a'),
    ],
    '--color-background-muted': [neutral.light[90], neutral.dark[20]],

    // Text — warm neutral
    '--color-text-primary': [neutral.light[15], neutral.dark[90]],
    '--color-text-secondary': [neutral.light[45], neutral.dark[70]],
    '--color-text-disabled': [neutral.light[70], neutral.dark[45]],
    '--color-text-accent': [accent.light[40], yellow.dark[90]],
    '--color-on-dark': neutral.light[100],
    '--color-on-light': neutral.light[15],
    '--color-on-accent': [neutral.light[100], neutral.light[15]],
    // Light foregrounds used on vivid semantic surfaces.
    '--color-on-success': [green.light[85], green.dark[15]],
    '--color-on-error': [red.light[95], red.dark[15]],
    '--color-on-warning': [yellow.light[95], yellow.dark[15]],

    // Info is its own blue status, independent of the accent.
    '--color-info': [accent.light[40], accent.dark[70]],
    '--color-info-muted': 'var(--color-background-blue)',

    '--color-text-info': [accent.light[40], accent.dark[70]],
    '--color-text-success': [green.light[25], green.dark[80]],
    '--color-text-warning': [yellow.light[25], yellow.dark[85]],
    '--color-text-error': [red.light[25], red.dark[80]],
    '--color-on-info-muted': 'var(--color-text-blue)',
    '--color-on-success-muted': [green.light[25], green.dark[80]],
    '--color-on-warning-muted': [yellow.light[25], yellow.dark[85]],
    '--color-on-error-muted': [red.light[25], red.dark[90]],

    // Icon
    '--color-icon-accent': [accent.light[40], yellow.dark[90]],
    '--color-icon-primary': [neutral.light[15], neutral.dark[90]],
    '--color-icon-secondary': [neutral.light[45], neutral.dark[70]],
    '--color-icon-disabled': [neutral.light[70], neutral.dark[45]],

    // Surface variants
    '--color-background-card': [neutral.light[100], neutral.dark[20]],
    '--color-background-popover': [neutral.light[100], neutral.dark[20]],
    '--color-background-inverted': [neutral.light[15], neutral.dark[95]],

    // Status semantics share the Red, Yellow, and Green families.
    '--color-error': [red.light[30], red.dark[85]],
    '--color-error-muted': [
      withAlpha(red.light[30], '33'),
      withAlpha(red.dark[85], '40'),
    ],
    '--color-warning': [yellow.light[30], yellow.dark[75]],
    '--color-warning-muted': [
      withAlpha(yellow.light[30], '33'),
      withAlpha(yellow.dark[75], '40'),
    ],
    '--color-success': [green.light[25], green.dark[70]],
    '--color-success-muted': [
      withAlpha(green.light[25], '33'),
      withAlpha(green.dark[70], '40'),
    ],

    // Border — softer taupe card outline (emphasized) in light mode.
    '--color-border': [neutral.light[85], withAlpha(neutral.dark[90], '1a')],
    '--color-border-emphasized': [neutral.light[75], neutral.dark[60]],

    // Effects
    '--color-skeleton': [neutral.light[85], neutral.dark[35]],
    '--color-shadow': [
      withAlpha(neutral.light[15], '1a'),
      withAlpha(neutral.dark[0], '4d'),
    ],
    '--color-tint-hover': [neutral.light[0], neutral.dark[100]],

    // Typography override
    '--text-supporting-size': '12px',

    // Element sizes — slightly taller defaults so the new input padding
    // (--spacing-2 block) has room to breathe.
    '--size-element-sm': '32px',
    '--size-element-md': '40px',
    '--size-element-lg': '48px',

    // =========================================================================
    // Categorical — reviewed light and dark stops for each family.
    // =========================================================================

    // Blue
    '--color-background-blue': [blue.light[90], blue.dark[90]],
    '--color-border-blue': [blue.light[80], blue.dark[80]],
    '--color-icon-blue': [blue.light[25], blue.dark[25]],
    '--color-text-blue': [blue.light[25], blue.dark[25]],

    // Cyan
    '--color-background-cyan': [cyan.light[90], cyan.dark[90]],
    '--color-border-cyan': [cyan.light[80], cyan.dark[80]],
    '--color-icon-cyan': [cyan.light[25], cyan.dark[25]],
    '--color-text-cyan': [cyan.light[25], cyan.dark[25]],

    // Gray (uses the neutral palette)
    '--color-background-gray': [neutral.dark[85], neutral.dark[85]],
    '--color-border-gray': [neutral.light[80], neutral.dark[80]],
    '--color-icon-gray': [neutral.light[30], neutral.dark[30]],
    '--color-text-gray': [neutral.light[30], neutral.dark[30]],

    // Green
    '--color-background-green': [green.light[90], green.dark[90]],
    '--color-border-green': [green.light[80], green.dark[80]],
    '--color-icon-green': [green.light[25], green.dark[20]],
    '--color-text-green': [green.light[25], green.dark[20]],

    // Orange
    '--color-background-orange': [orange.light[90], orange.dark[90]],
    '--color-border-orange': [orange.light[80], orange.dark[80]],
    '--color-icon-orange': [orange.light[25], orange.dark[25]],
    '--color-text-orange': [orange.light[25], orange.dark[25]],

    // Pink
    '--color-background-pink': [pink.light[90], pink.dark[90]],
    '--color-border-pink': [pink.light[80], pink.dark[80]],
    '--color-icon-pink': [pink.light[25], pink.dark[25]],
    '--color-text-pink': [pink.light[25], pink.dark[25]],

    // Purple
    '--color-background-purple': [purple.light[90], purple.dark[90]],
    '--color-border-purple': [purple.light[80], purple.dark[80]],
    '--color-icon-purple': [purple.light[25], purple.dark[25]],
    '--color-text-purple': [purple.light[25], purple.dark[25]],

    // Red
    '--color-background-red': [red.light[90], red.dark[90]],
    '--color-border-red': [red.light[80], red.dark[80]],
    '--color-icon-red': [red.light[25], red.dark[25]],
    '--color-text-red': [red.light[25], red.dark[25]],

    // Teal
    '--color-background-teal': [teal.light[90], teal.dark[90]],
    '--color-border-teal': [teal.light[80], teal.dark[80]],
    '--color-icon-teal': [teal.light[25], teal.dark[25]],
    '--color-text-teal': [teal.light[25], teal.dark[25]],

    // Yellow
    '--color-background-yellow': [yellow.light[85], yellow.dark[85]],
    '--color-border-yellow': [yellow.light[70], yellow.dark[70]],
    '--color-icon-yellow': [yellow.light[25], yellow.dark[25]],
    '--color-text-yellow': [yellow.light[25], yellow.dark[25]],

    // =========================================================================
    // Radius
    //   --radius-element drives buttons, badges, inputs — 8px per design
    //   --radius-container drives cards, banners, popovers — 12px per design
    //   --radius-none and --radius-full are always fixed and must never be
    //   scaled by a theme (see defineTheme's radius config docs) — 0 and
    //   9999px respectively, matching @astryxdesign/core's own defaults.
    // =========================================================================
    '--radius-none': '0px',
    '--radius-inner': '0.375rem',
    '--radius-element': '0.5rem', // 8px
    '--radius-container': '0.75rem', // 12px
    '--radius-page': '1.5rem',
    '--radius-full': '9999px',

    // =========================================================================
    // Shadows — warm neutral tint
    // =========================================================================
    '--shadow-low': `0 2px 4px ${withAlpha(neutral.light[15], '0d')}, 0 4px 8px ${withAlpha(neutral.light[15], '1a')}`,
    '--shadow-med': `0 2px 4px ${withAlpha(neutral.light[15], '0d')}, 0 4px 12px ${withAlpha(neutral.light[15], '1a')}`,
    '--shadow-high': `0 4px 6px ${withAlpha(neutral.light[15], '1a')}, 0 12px 24px ${withAlpha(neutral.light[15], '26')}`,
    '--shadow-inset-hover': `inset 0px 0px 0px 2px ${withAlpha(neutral.light[55], '30')}`,
    '--shadow-inset-selected': `inset 0px 0px 0px 2px ${withAlpha(neutral.light[55], '50')}`,
    '--shadow-inset-success': `inset 0px 0px 0px 2px ${withAlpha(green.light[25], '30')}`,
    '--shadow-inset-warning': `inset 0px 0px 0px 2px ${withAlpha(yellow.light[30], '30')}`,
    '--shadow-inset-error': `inset 0px 0px 0px 2px ${withAlpha(red.light[30], '30')}`,
  },

  components: {
    // TopNav uses Butter's blue accent: the heading and the selected item are
    // the full brand blue; unselected items (default + hover) use a lighter
    // blue. Dark mode keeps the theme's butter-yellow accent.
    'top-nav-heading': {
      // The heading text is an inner span that reads --color-text-primary, so
      // redirect that token (not just `color`) to the brand blue so the text
      // itself turns blue, not only the container.
      base: {
        color: lightDark(accent.light[40], yellow.dark[90]),
        '--color-text-primary': lightDark(accent.light[40], yellow.dark[90]),
      },
    },
    'top-nav-item': {
      base: {
        color: lightDark(accent.light[40], withAlpha(yellow.dark[90], 'cc')),
      },
      // Selected item: a darker Blue stop in light mode and full Butter Yellow
      // in dark mode, with no pill background. Weight + color carry emphasis.
      selected: {
        color: lightDark(accent.light[35], yellow.dark[90]),
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
      // Radius intentionally not pinned, so buttons keep core's
      // `var(--_button-radius, --radius-element)`: standalone buttons stay 8px,
      // while the chat composer (which sets --_button-radius) rounds them fully.
      base: {
        paddingBlock: 'var(--spacing-3)',
        paddingInline: 'var(--spacing-4)',
      },
      'variant:secondary': SECONDARY_BUTTON,
      // Ghost: same accent color as secondary, no background.
      'variant:ghost': {
        color: lightDark(accent.light[40], yellow.dark[90]),
      },
      'variant:destructive': {
        backgroundColor: lightDark(red.light[90], red.dark[80]),
        color: lightDark(red.light[10], red.dark[25]),
      },
    },

    badge: {
      // Match astryx/daily badge sizing: 30px tall with 12px horizontal pad.
      // Use explicit values because butter inherits the standard spacing
      // scale (where --spacing-3 = 12px), unlike astryx which redefines it.
      base: {
        height: '30px',
        paddingBlock: '0',
        paddingInline: 'var(--spacing-3)',
      },
      // Vivid semantic badges — pinned to the reviewed semantic stops.
      // Info uses Butter’s lighter accent stop rather than its signature stop.
      'variant:info': {
        backgroundColor: accent.light[55],
        color: neutral.light[15],
      },
      'variant:neutral': {
        backgroundColor: yellow.light[90],
        color: accent.light[35],
      },
      'variant:success': {
        backgroundColor: green.light[70],
        color: neutral.light[15],
      },
      'variant:warning': {
        backgroundColor: yellow.light[80],
        color: neutral.light[15],
      },
      'variant:error': {
        backgroundColor: red.light[60],
        color: neutral.light[15],
      },
    },

    // Banner status surfaces and content use the reviewed vivid pair.
    banner: {
      'status:info': {
        '--color-info-muted': accent.light[55],
        '--color-on-info-muted': neutral.light[15],
      },
      'status:success': {
        '--color-success-muted': green.light[70],
        '--color-on-success-muted': neutral.light[15],
      },
      'status:warning': {
        '--color-warning-muted': yellow.light[80],
        '--color-on-warning-muted': neutral.light[15],
      },
      'status:error': {
        '--color-error-muted': red.light[60],
        '--color-on-error-muted': neutral.light[15],
      },
    },

    card: {
      base: {
        borderRadius: 'var(--radius-container)',
        padding: 'var(--spacing-4)',
      },
      'variant:info': {
        '--color-text-primary': neutral.light[15],
        '--color-text-secondary': neutral.light[45],
      },
      'variant:success': {
        '--color-text-primary': neutral.light[15],
        '--color-text-secondary': neutral.light[45],
      },
      'variant:warning': {
        '--color-text-primary': neutral.light[15],
        '--color-text-secondary': neutral.light[45],
      },
      'variant:error': {
        '--color-text-primary': neutral.light[15],
        '--color-text-secondary': neutral.light[45],
      },
      'variant:blue': {
        '--color-text-primary': neutral.light[15],
        '--color-text-secondary': neutral.light[45],
      },
      'variant:cyan': {
        '--color-text-primary': neutral.light[15],
        '--color-text-secondary': neutral.light[45],
      },
      'variant:gray': {
        '--color-text-primary': neutral.light[15],
        '--color-text-secondary': neutral.light[45],
      },
      'variant:green': {
        '--color-text-primary': neutral.light[15],
        '--color-text-secondary': neutral.light[45],
      },
      'variant:orange': {
        '--color-text-primary': neutral.light[15],
        '--color-text-secondary': neutral.light[45],
      },
      'variant:pink': {
        '--color-text-primary': neutral.light[15],
        '--color-text-secondary': neutral.light[45],
      },
      'variant:purple': {
        '--color-text-primary': neutral.light[15],
        '--color-text-secondary': neutral.light[45],
      },
      'variant:red': {
        '--color-text-primary': neutral.light[15],
        '--color-text-secondary': neutral.light[45],
      },
      'variant:teal': {
        '--color-text-primary': neutral.light[15],
        '--color-text-secondary': neutral.light[45],
      },
      'variant:yellow': {
        '--color-text-primary': neutral.light[15],
        '--color-text-secondary': neutral.light[45],
      },
      'variant:muted': {
        '--color-text-primary': neutral.light[15],
        '--color-text-secondary': neutral.light[45],
      },
    },

    section: {
      base: {
        padding: 'var(--spacing-4)',
      },
    },

    // Progress bar — pale track in light, warm brown in dark. Vivid
    // semantic fills match the banner colors (Success / Warning / Error).
    'progress-bar-track': {
      base: {
        backgroundColor: lightDark(neutral.light[85], neutral.dark[40]),
      },
    },
    'progress-bar-fill': {
      'variant:success': {
        backgroundColor: green.light[70],
      },
      'variant:warning': {
        backgroundColor: yellow.light[80],
      },
      'variant:error': {
        backgroundColor: red.light[60],
      },
    },

    // Field status bubble — match the corresponding banner colors so the
    // helper text below an input reads as the same "this is a warning /
    // error / success" surface as the standalone banner.
    'field-status': {
      'type:success': {
        backgroundColor: green.light[70],
        color: neutral.light[15],
      },
      'type:warning': {
        backgroundColor: yellow.light[80],
        color: neutral.light[15],
      },
      'type:error': {
        backgroundColor: red.light[60],
        color: neutral.light[15],
      },
    },

    // Inputs — softer border than default, more vertical breathing room.
    // Status modifiers also remap the semantic tokens locally so the
    // status icon + border read as the same vivid hue as the banner
    // (icons inherit from --color-{success,warning,error}).
    'text-input': {
      base: {
        paddingBlock: 'var(--spacing-2)',
        paddingInline: 'var(--spacing-3)',
        borderColor: 'var(--color-border)',
      },
      ...INPUT_STATUS_VARS,
    },
    'text-area': {
      base: {
        paddingBlock: 'var(--spacing-2)',
        paddingInline: 'var(--spacing-3)',
        borderColor: 'var(--color-border)',
      },
      ...INPUT_STATUS_VARS,
    },
    'number-input': {
      base: {
        paddingBlock: 'var(--spacing-2)',
        paddingInline: 'var(--spacing-3)',
        borderColor: 'var(--color-border)',
      },
      ...INPUT_STATUS_VARS,
    },
    'date-input': {
      base: {
        paddingBlock: 'var(--spacing-2)',
        paddingInline: 'var(--spacing-3)',
        borderColor: 'var(--color-border)',
      },
      ...INPUT_STATUS_VARS,
    },
    'time-input': {
      base: {
        paddingBlock: 'var(--spacing-2)',
        paddingInline: 'var(--spacing-3)',
        borderColor: 'var(--color-border)',
      },
      ...INPUT_STATUS_VARS,
    },
    selector: {
      base: {
        paddingBlock: 'var(--spacing-2)',
        paddingInline: 'var(--spacing-3)',
        borderColor: 'var(--color-border)',
      },
      ...INPUT_STATUS_VARS,
      'variant:secondary': SECONDARY_SELECTOR,
    },
    'multi-selector': {
      base: {
        paddingBlock: 'var(--spacing-2)',
        paddingInline: 'var(--spacing-3)',
        borderColor: 'var(--color-border)',
      },
      ...INPUT_STATUS_VARS,
      'variant:secondary': SECONDARY_SELECTOR,
    },
    'complex-selector': {'variant:secondary': SECONDARY_COMPLEX_SELECTOR},
    typeahead: {
      base: {
        paddingBlock: 'var(--spacing-2)',
        paddingInline: 'var(--spacing-3)',
        borderColor: 'var(--color-border)',
      },
      ...INPUT_STATUS_VARS,
    },
    tokenizer: {
      base: {
        paddingBlock: 'var(--spacing-2)',
        paddingInline: 'var(--spacing-3)',
        borderColor: 'var(--color-border)',
      },
      ...INPUT_STATUS_VARS,
    },

    // Display sizes use Sarina — the signature buttery display
    // cursive, reserved for hero/marketing-scale text only.
    // Headings (h1–h6) and body still use Outfit (configured above
    // under typography.heading / typography.body). Same pattern
    // Gothic uses for its Manufacturing Consent display family.
    text: {
      'type:display-1': {
        fontFamily: 'Sarina, "Brush Script MT", "Snell Roundhand", cursive',
      },
      'type:display-2': {
        fontFamily: 'Sarina, "Brush Script MT", "Snell Roundhand", cursive',
      },
      'type:display-3': {
        fontFamily: 'Sarina, "Brush Script MT", "Snell Roundhand", cursive',
      },
    },
  },

  icons: butterIconRegistry,
});

/**
 * Frozen released compatibility palettes. These ramps preserve the public
 * `butterPalettes` shape and values for existing consumers; the maintained
 * theme renders selected stops from `butterPalettes.generated.ts` instead.
 * Do not regenerate this object from the private mode-aware palette.
 *
 * Historical source labels for this compatibility snapshot:
 *   accent  #225BFF   neutral #868B99
 *   red     #ffc3b8   orange  #ffc98d   yellow  #feee7b
 *   green   #bdebb4   cyan    #abf1f1   teal    #aeefd6
 *   blue    #cdd5fc   purple  #e6c2ff   pink    #fec0f5
 *   error   #fc473b   warning #ffc502   success #91D143
 *
 * The original snapshot used pastel categorical source labels and vivid semantic
 * source labels. The current maintained theme does not derive from this object.
 *
 * These notes describe the released snapshot and are not regeneration
 * instructions for the maintained theme.
 */
export const butterPalettes = {
  blue: {
    0: '#000000',
    5: '#001041',
    10: '#001b4c',
    15: '#002558',
    20: '#062f63',
    25: '#203a6c',
    30: '#324575',
    35: '#41517d',
    40: '#505d86',
    45: '#5f698f',
    50: '#6d7698',
    55: '#7a82a6',
    60: '#878fb3',
    65: '#949cc1',
    70: '#a2aacf',
    75: '#afb7dd',
    80: '#bdc5eb',
    85: '#cbd3f9',
    90: '#dbe1ff',
    95: '#edf0ff',
    100: '#ffffff',
  },
  cyan: {
    0: '#000000',
    5: '#001d1e',
    10: '#00262a',
    15: '#003034',
    20: '#003a3e',
    25: '#004649',
    30: '#005255',
    35: '#005e61',
    40: '#006a6d',
    45: '#1f7678',
    50: '#3c8183',
    55: '#4a8e90',
    60: '#579c9d',
    65: '#65a9aa',
    70: '#72b7b8',
    75: '#80c4c5',
    80: '#8dd2d3',
    85: '#9be0e1',
    90: '#a9eff0',
    95: '#b7fdfe',
    100: '#ffffff',
  },
  green: {
    0: '#000000',
    5: '#001f00',
    10: '#002800',
    15: '#003100',
    20: '#003c00',
    25: '#004800',
    30: '#01530d',
    35: '#1f5f1f',
    40: '#346a30',
    45: '#467640',
    50: '#578151',
    55: '#648e5d',
    60: '#709c6a',
    65: '#7da976',
    70: '#8ab783',
    75: '#98c490',
    80: '#a5d29d',
    85: '#b3e0ab',
    90: '#c1efb8',
    95: '#cffdc6',
    100: '#ffffff',
  },
  orange: {
    0: '#000000',
    5: '#2d0600',
    10: '#381200',
    15: '#461b00',
    20: '#542400',
    25: '#622e00',
    30: '#6d3a00',
    35: '#794700',
    40: '#845406',
    45: '#906121',
    50: '#9b6e36',
    55: '#a97b42',
    60: '#b7874e',
    65: '#c6945b',
    70: '#d4a267',
    75: '#e3af74',
    80: '#f2bd81',
    85: '#ffcb8e',
    90: '#ffdcb6',
    95: '#ffedda',
    100: '#ffffff',
  },
  pink: {
    0: '#000000',
    5: '#3c003d',
    10: '#490048',
    15: '#560054',
    20: '#62005f',
    25: '#6c0a68',
    30: '#762371',
    35: '#80357a',
    40: '#894583',
    45: '#93558c',
    50: '#9c6496',
    55: '#aa71a3',
    60: '#b77eb0',
    65: '#c58bbe',
    70: '#d398cc',
    75: '#e2a6da',
    80: '#f0b3e8',
    85: '#ffc1f6',
    90: '#ffd5fb',
    95: '#ffeafd',
    100: '#ffffff',
  },
  purple: {
    0: '#000000',
    5: '#1e004f',
    10: '#2b005c',
    15: '#390268',
    20: '#461373',
    25: '#52237b',
    30: '#5d3283',
    35: '#69408b',
    40: '#744e92',
    45: '#7f5c9a',
    50: '#8b6aa2',
    55: '#9877b0',
    60: '#a584bd',
    65: '#b391cb',
    70: '#c19ed9',
    75: '#cfabe8',
    80: '#ddb9f6',
    85: '#eac8ff',
    90: '#f2daff',
    95: '#f9ecff',
    100: '#ffffff',
  },
  red: {
    0: '#000000',
    5: '#3e0000',
    10: '#490000',
    15: '#550000',
    20: '#62100f',
    25: '#6d211c',
    30: '#773029',
    35: '#823f36',
    40: '#8c4d44',
    45: '#955b52',
    50: '#9f6961',
    55: '#ad766d',
    60: '#bb837a',
    65: '#c99087',
    70: '#d79d94',
    75: '#e6aba1',
    80: '#f4b8ae',
    85: '#ffc7bd',
    90: '#ffdad3',
    95: '#ffece8',
    100: '#ffffff',
  },
  teal: {
    0: '#000000',
    5: '#001f00',
    10: '#00280b',
    15: '#003216',
    20: '#003d22',
    25: '#00482d',
    30: '#005439',
    35: '#005f45',
    40: '#136b52',
    45: '#30775f',
    50: '#46826d',
    55: '#528f79',
    60: '#5f9d86',
    65: '#6caa93',
    70: '#7ab8a0',
    75: '#87c5ae',
    80: '#94d3bb',
    85: '#a2e1c9',
    90: '#b0f0d7',
    95: '#befee5',
    100: '#ffffff',
  },
  yellow: {
    0: '#000000',
    5: '#1e1200',
    10: '#271c00',
    15: '#2e2700',
    20: '#373200',
    25: '#413e00',
    30: '#4c4a00',
    35: '#575600',
    40: '#646200',
    45: '#726e00',
    50: '#817a00',
    55: '#8e860e',
    60: '#9c9320',
    65: '#aba02f',
    70: '#b9ae3d',
    75: '#c7bb4a',
    80: '#d6c957',
    85: '#e5d765',
    90: '#f4e572',
    95: '#fff294',
    100: '#ffffff',
  },
  neutral: {
    0: '#000000',
    5: '#051124',
    10: '#101c2f',
    15: '#1b263a',
    20: '#273045',
    25: '#333b4f',
    30: '#3f4759',
    35: '#4b5264',
    40: '#585e6f',
    45: '#656a79',
    50: '#727784',
    55: '#7f8491',
    60: '#8c909f',
    65: '#999eac',
    70: '#a6abba',
    75: '#b4b9c7',
    80: '#c1c6d5',
    85: '#cfd4e3',
    90: '#dde2f2',
    95: '#ebf0ff',
    100: '#ffffff',
  },
  accent: {
    0: '#000000',
    5: '#00085e',
    10: '#00136c',
    15: '#001c7e',
    20: '#002592',
    25: '#002fa7',
    30: '#0039be',
    35: '#0043d7',
    40: '#004df0',
    45: '#0759ff',
    50: '#4a67ff',
    55: '#6875ff',
    60: '#8083ff',
    65: '#9492ff',
    70: '#a6a1ff',
    75: '#b6b0ff',
    80: '#c6bfff',
    85: '#d5cfff',
    90: '#e3dfff',
    95: '#f1efff',
    100: '#ffffff',
  },
  error: {
    0: '#000000',
    5: '#470000',
    10: '#530000',
    15: '#600000',
    20: '#6d0000',
    25: '#771210',
    30: '#82261e',
    35: '#8c372c',
    40: '#96463b',
    45: '#a0564a',
    50: '#a96559',
    55: '#b77265',
    60: '#c57e72',
    65: '#d48b7e',
    70: '#e2998b',
    75: '#f1a698',
    80: '#ffb4a6',
    85: '#ffc7bc',
    90: '#ffdad2',
    95: '#ffece8',
    100: '#ffffff',
  },
  warning: {
    0: '#000000',
    5: '#270c00',
    10: '#301800',
    15: '#3b2200',
    20: '#472c00',
    25: '#543700',
    30: '#614200',
    35: '#6f4d00',
    40: '#7d5800',
    45: '#8b6400',
    50: '#9a7000',
    55: '#a97d00',
    60: '#b88900',
    65: '#c89600',
    70: '#d8a300',
    75: '#e7b100',
    80: '#f7be00',
    85: '#ffcd51',
    90: '#ffde9c',
    95: '#ffeed0',
    100: '#ffffff',
  },
  success: {
    0: '#000000',
    5: '#001a00',
    10: '#092300',
    15: '#0b2e00',
    20: '#043b00',
    25: '#004700',
    30: '#005400',
    35: '#036100',
    40: '#136e00',
    45: '#277b00',
    50: '#448700',
    55: '#529400',
    60: '#60a105',
    65: '#6eaf1d',
    70: '#7cbd2e',
    75: '#8bcb3c',
    80: '#99d94b',
    85: '#a7e758',
    90: '#b5f566',
    95: '#ccff88',
    100: '#ffffff',
  },
} as const;
