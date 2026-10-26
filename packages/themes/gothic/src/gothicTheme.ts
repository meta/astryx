// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Gothic Theme — dark only
 *
 * A dark-only theme with deep blue-gray tones and a distressed display
 * heading. Inspired by ink, manuscript, and noir typography.
 *
 * Categorical colors follow a pastel-on-dark pattern (light backgrounds
 * with dark text) — same in any system color preference.
 *
 * Uses Manufacturing Consent for headings and Fustat for body text.
 */

import {defineTheme, defineSyntaxTheme} from '@astryxdesign/core/theme';
import {gothicIconRegistry} from './icons';
import {gothicPaletteRefs} from './gothicPaletteRefs.generated';

const {blue, cyan, green, neutral, orange, pink, purple, red, teal, yellow} =
  gothicPaletteRefs;

const withAlpha = (color: string, alpha: string): string => `${color}${alpha}`;

/**
 * Gothic syntax palette — atmospheric tones drawn from the gothic
 * categorical palette: deep purples (cathedral), blood crimson (tags),
 * aged gold (numbers), forest moss (strings), midnight indigo (functions).
 *
 * Single values (no tuples) since this is a dark-only theme.
 */
const gothicSyntax = defineSyntaxTheme({
  name: 'astryx-gothic',
  tokens: {
    keyword: purple.dark[80],
    string: green.dark[70],
    comment: neutral.dark[65],
    number: yellow.dark[70],
    function: blue.dark[65],
    type: purple.dark[80],
    variable: neutral.dark[95],
    operator: neutral.dark[75],
    constant: yellow.dark[65],
    tag: pink.dark[65],
    attribute: yellow.dark[70],
    property: teal.dark[70],
    punctuation: neutral.dark[65],
    background: neutral.dark[10],
    added: green.dark[5],
    removed: red.dark[5],
    'added-marker': green.dark[70],
    'removed-marker': pink.dark[65],
  },
});

/**
 * The secondary Button treatment. Selector, MultiSelector, and ComplexSelector
 * reuse it for their `secondary` trigger so every secondary control in this
 * theme matches (AST-079 FR2).
 *
 * Primary inherits default — light pill with dark text via
 * --color-accent / --color-on-accent (matches the cream badge).
 * Secondary uses the dark-slate "neutral" badge treatment.
 */
const SECONDARY_BUTTON = {
  backgroundColor: 'var(--color-background-gray)',
  color: 'var(--color-text-gray)',
  borderColor: 'transparent',
  borderWidth: '0',
} as const;

/**
 * The secondary Button treatment on Selector and MultiSelector triggers
 * (AST-079 FR2). Inside an InputGroup a trigger keeps the neutral fill and the
 * group's edges instead (FR6).
 */
const SECONDARY_SELECTOR = {
  ':not(.astryx-input-group *)': {
    backgroundColor: SECONDARY_BUTTON.backgroundColor,
    color: SECONDARY_BUTTON.color,
    borderColor: SECONDARY_BUTTON.borderColor,
    borderWidth: SECONDARY_BUTTON.borderWidth,
  },
} as const;

export const gothicTheme = defineTheme({
  name: 'gothic',

  typography: {
    // base 16 / ratio 1.25 — larger scale so the (optically small) blackletter
    // display sizes read large enough to carry the theme.
    scale: {base: 16, ratio: 1.25},
    body: {
      family: 'Fustat',
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    // Headings (h1-h6) use Fustat to match the body — Manufacturing Consent
    // is reserved for display sizes only (see component overrides below).
    heading: {
      family: 'Fustat',
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      weights: {3: 'bold', 4: 'bold'},
    },
    code: {
      family: 'JetBrains Mono',
      fallbacks: '"SF Mono", Monaco, Consolas, monospace',
    },
  },

  // Slower, theatrical motion — gothic doesn't rush.
  motion: {fast: 150, medium: 350, slow: 800, ratio: 0.75},

  syntax: gothicSyntax,

  tokens: {
    '--color-accent': neutral.dark[95],
    '--color-accent-muted': withAlpha(neutral.dark[95], '20'),
    '--color-neutral': withAlpha(neutral.dark[95], '1a'),
    '--color-background-surface': neutral.dark[10],
    '--color-background-body': neutral.dark[10],
    '--color-overlay': withAlpha(neutral.dark[10], 'cc'),
    '--color-overlay-hover': withAlpha(neutral.dark[95], '0d'),
    '--color-overlay-pressed': withAlpha(neutral.dark[95], '1a'),
    '--color-background-muted': neutral.dark[20],

    '--color-text-primary': neutral.dark[95],
    '--color-text-secondary': neutral.dark[75],
    '--color-text-disabled': neutral.dark[40],
    '--color-text-accent': neutral.dark[95],
    '--color-on-dark': neutral.dark[95],
    '--color-on-light': neutral.dark[10],
    '--color-on-accent': neutral.dark[10],
    '--color-on-success': neutral.dark[10],
    '--color-on-error': neutral.dark[10],
    '--color-on-warning': neutral.dark[10],

    '--color-info': blue.dark[65],
    '--color-info-muted': blue.dark[75],
    '--color-on-info': neutral.dark[10],

    '--color-text-info': blue.dark[75],
    '--color-text-success': green.dark[75],
    '--color-text-warning': yellow.dark[75],
    '--color-text-error': red.dark[75],
    '--color-on-info-muted': blue.dark[20],
    '--color-on-success-muted': green.dark[20],
    '--color-on-warning-muted': yellow.dark[15],
    '--color-on-error-muted': red.dark[20],

    '--color-icon-accent': neutral.dark[95],
    '--color-icon-primary': neutral.dark[95],
    '--color-icon-secondary': neutral.dark[75],
    '--color-icon-disabled': neutral.dark[40],

    '--color-background-card': neutral.dark[15],
    '--color-background-popover': neutral.dark[20],
    '--color-background-inverted': neutral.dark[95],

    '--color-success': green.dark[75],
    '--color-success-muted': green.dark[75],
    '--color-error': red.dark[75],
    '--color-error-muted': red.dark[75],
    '--color-warning': yellow.dark[75],
    '--color-warning-muted': yellow.dark[75],

    '--color-border': withAlpha(neutral.dark[95], '1a'),
    '--color-border-emphasized': neutral.dark[40],

    '--color-skeleton': neutral.dark[40],
    '--color-shadow': withAlpha(neutral.dark[0], '4d'),
    '--color-tint-hover': neutral.dark[100],

    '--color-background-blue': blue.dark[75],
    '--color-border-blue': blue.dark[60],
    '--color-icon-blue': blue.dark[30],
    '--color-text-blue': blue.dark[20],

    '--color-background-cyan': cyan.dark[75],
    '--color-border-cyan': cyan.dark[60],
    '--color-icon-cyan': cyan.dark[30],
    '--color-text-cyan': cyan.dark[20],

    '--color-background-gray': neutral.dark[35],
    '--color-border-gray': neutral.dark[50],
    '--color-icon-gray': neutral.dark[95],
    '--color-text-gray': neutral.dark[95],

    '--color-background-green': green.dark[75],
    '--color-border-green': green.dark[60],
    '--color-icon-green': green.dark[30],
    '--color-text-green': green.dark[20],

    '--color-background-orange': orange.dark[75],
    '--color-border-orange': orange.dark[60],
    '--color-icon-orange': orange.dark[30],
    '--color-text-orange': orange.dark[20],

    '--color-background-pink': pink.dark[75],
    '--color-border-pink': pink.dark[60],
    '--color-icon-pink': pink.dark[30],
    '--color-text-pink': pink.dark[15],

    '--color-background-purple': purple.dark[75],
    '--color-border-purple': purple.dark[60],
    '--color-icon-purple': purple.dark[30],
    '--color-text-purple': purple.dark[20],

    '--color-background-red': red.dark[75],
    '--color-border-red': red.dark[60],
    '--color-icon-red': red.dark[30],
    '--color-text-red': red.dark[20],

    '--color-background-teal': teal.dark[75],
    '--color-border-teal': teal.dark[60],
    '--color-icon-teal': teal.dark[30],
    '--color-text-teal': teal.dark[20],

    '--color-background-yellow': yellow.dark[75],
    '--color-border-yellow': yellow.dark[60],
    '--color-icon-yellow': yellow.dark[30],
    '--color-text-yellow': yellow.dark[15],

    // =========================================================================
    // Radius — subtle rounding (original gothic)
    //   --radius-none and --radius-full are always fixed and must never be
    //   scaled by a theme (see defineTheme's radius config docs) — 0 and
    //   9999px respectively, matching @astryxdesign/core's own defaults.
    // =========================================================================
    '--radius-none': '0px',
    '--radius-inner': '0.25rem',
    '--radius-element': '0.5rem',
    '--radius-container': '0.75rem',
    '--radius-page': '1.5rem',
    '--radius-full': '9999px',

    // =========================================================================
    // Shadows — restrained, atmospheric
    // =========================================================================
    '--shadow-low': `0 2px 4px ${withAlpha(neutral.dark[0], '33')}, 0 4px 8px ${withAlpha(neutral.dark[0], '40')}`,
    '--shadow-med': `0 2px 4px ${withAlpha(neutral.dark[0], '33')}, 0 4px 12px ${withAlpha(neutral.dark[0], '40')}`,
    '--shadow-high': `0 4px 6px ${withAlpha(neutral.dark[0], '40')}, 0 12px 24px ${withAlpha(neutral.dark[0], '4d')}`,
    '--shadow-inset-hover': `inset 0 0 0 1px ${withAlpha(neutral.dark[75], '30')}`,
    '--shadow-inset-selected': `inset 0 0 0 2px ${withAlpha(neutral.dark[75], '50')}`,
    '--shadow-inset-success': `inset 0 0 0 1px ${withAlpha(green.dark[55], '50')}`,
    '--shadow-inset-warning': `inset 0 0 0 1px ${withAlpha(yellow.dark[75], '50')}`,
    '--shadow-inset-error': `inset 0 0 0 1px ${withAlpha(red.dark[75], '50')}`,
  },

  components: {
    button: {
      'variant:secondary': SECONDARY_BUTTON,
      'variant:ghost': {
        ':hover': {
          backgroundColor: 'var(--color-overlay-hover)',
        },
      },
      // Destructive uses the dusty rose bg with dark warm-brown text
      // (matches the red badge).
      'variant:destructive': {
        backgroundColor: 'var(--color-error)',
        color: 'var(--color-text-red)',
      },
    },
    // Secondary selector triggers match the secondary Button (AST-079 FR2).
    selector: {'variant:secondary': SECONDARY_SELECTOR},
    'multi-selector': {'variant:secondary': SECONDARY_SELECTOR},
    'complex-selector': {'variant:secondary': SECONDARY_BUTTON},

    badge: {
      base: {
        borderRadius: 'var(--radius-element)',
        fontWeight: 'var(--font-weight-medium)',
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
        borderRadius: 'var(--radius-element)',
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

    card: {
      base: {
        padding: 'var(--spacing-3)',
        borderRadius: 'var(--radius-container)',
      },
      // Categorical variants — flip --color-text-primary so child
      // XDSText labels stay readable against the dusty pastel bg.
      'variant:blue': {
        '--color-text-primary': 'var(--color-text-blue)',
        '--color-text-secondary': 'var(--color-text-blue)',
      },
      'variant:cyan': {
        '--color-text-primary': 'var(--color-text-cyan)',
        '--color-text-secondary': 'var(--color-text-cyan)',
      },
      'variant:gray': {
        '--color-text-primary': 'var(--color-text-gray)',
        '--color-text-secondary': 'var(--color-text-gray)',
      },
      'variant:green': {
        '--color-text-primary': 'var(--color-text-green)',
        '--color-text-secondary': 'var(--color-text-green)',
      },
      'variant:orange': {
        '--color-text-primary': 'var(--color-text-orange)',
        '--color-text-secondary': 'var(--color-text-orange)',
      },
      'variant:pink': {
        '--color-text-primary': 'var(--color-text-pink)',
        '--color-text-secondary': 'var(--color-text-pink)',
      },
      'variant:purple': {
        '--color-text-primary': 'var(--color-text-purple)',
        '--color-text-secondary': 'var(--color-text-purple)',
      },
      'variant:red': {
        '--color-text-primary': 'var(--color-text-red)',
        '--color-text-secondary': 'var(--color-text-red)',
      },
      'variant:teal': {
        '--color-text-primary': 'var(--color-text-teal)',
        '--color-text-secondary': 'var(--color-text-teal)',
      },
      'variant:yellow': {
        '--color-text-primary': 'var(--color-text-yellow)',
        '--color-text-secondary': 'var(--color-text-yellow)',
      },
    },

    section: {
      base: {
        padding: 'var(--spacing-3)',
      },
    },

    field: {
      base: {
        borderRadius: 'var(--radius-element)',
      },
    },

    // Display sizes use Manufacturing Consent — the signature gothic
    // display font, reserved for hero/marketing-scale text only.
    text: {
      'type:display-1': {
        fontFamily:
          '"Manufacturing Consent", "UnifrakturMaguntia", "Old English Text MT", serif',
      },
      'type:display-2': {
        fontFamily:
          '"Manufacturing Consent", "UnifrakturMaguntia", "Old English Text MT", serif',
      },
      'type:display-3': {
        fontFamily:
          '"Manufacturing Consent", "UnifrakturMaguntia", "Old English Text MT", serif',
      },
    },
  },

  icons: gothicIconRegistry,
});

/**
 * Frozen released compatibility palettes. These values preserve the public
 * `gothicPalettes` shape and values for existing consumers; the maintained
 * theme renders selected stops from `gothicPalettes.generated.ts` instead.
 * Components should consume semantic theme tokens, and charts should use the
 * data-visualization color API.
 */
export const gothicPalettes = {
  // Neutral — H=210 C=4 (cool blue-gray, original gothic)
  neutral: {
    hue: 210,
    chroma: 4,
    0: '#000000',
    5: '#0a0d0f',
    10: '#101314',
    15: '#181c1f',
    20: '#24292D',
    25: '#2c3236',
    30: '#363c40',
    35: '#40464b',
    40: '#495056',
    45: '#535a61',
    50: '#5d646b',
    55: '#676f76',
    60: '#727a82',
    65: '#7e8690',
    70: '#8a929c',
    75: '#96A0AB',
    80: '#a8b1bb',
    85: '#bbc3cb',
    90: '#cdd5db',
    95: '#E8F1F6',
    100: '#ffffff',
  },
  // Blue — H=255 C=20 (midnight indigo)
  blue: {
    hue: 255,
    chroma: 20,
    0: '#000000',
    5: '#050930',
    10: '#0c143f',
    15: '#161e4d',
    20: '#1f2c54',
    25: '#2a3565',
    30: '#2a3b6e',
    35: '#3a4783',
    40: '#475497',
    45: '#5462ab',
    50: '#6170bf',
    55: '#6a85cf',
    60: '#7793d6',
    65: '#8aa1d8',
    70: '#a3b5e0',
    75: '#b6c5e7',
    80: '#c4d1ec',
    85: '#d2dcef',
    90: '#dde2f1',
    95: '#e8ecf6',
    100: '#ffffff',
  },
  // Cyan — H=200 C=25 (cathedral mist)
  cyan: {
    hue: 200,
    chroma: 25,
    0: '#000000',
    5: '#001724',
    10: '#062436',
    15: '#0d3046',
    20: '#204858',
    25: '#1c4a66',
    30: '#2a5e75',
    35: '#3a6e85',
    40: '#487d94',
    45: '#598ea3',
    50: '#6a9eb1',
    55: '#7ab0c0',
    60: '#8cc3d8',
    65: '#a0cce0',
    70: '#b1d3e5',
    75: '#bcdaeb',
    80: '#c5dfee',
    85: '#cbe4f0',
    90: '#d6e6ee',
    95: '#e3eef3',
    100: '#ffffff',
  },
  // Green — H=140 C=18 (forest moss)
  green: {
    hue: 140,
    chroma: 18,
    0: '#000000',
    5: '#0c1a08',
    10: '#152511',
    15: '#1c321a',
    20: '#2c4a20',
    25: '#2c4d2a',
    30: '#3a5e2c',
    35: '#446a39',
    40: '#557c44',
    45: '#658d50',
    50: '#779e5d',
    55: '#87b06a',
    60: '#96bd76',
    65: '#a3c987',
    70: '#b5d397',
    75: '#bdd99e',
    80: '#c8e0ad',
    85: '#d4e6bd',
    90: '#dde6d4',
    95: '#eaf3df',
    100: '#ffffff',
  },
  // Orange — H=40 C=35 (rust copper)
  orange: {
    hue: 40,
    chroma: 35,
    0: '#000000',
    5: '#1f0d00',
    10: '#2c1606',
    15: '#3a200d',
    20: '#6e3812',
    25: '#5a371a',
    30: '#8a4818',
    35: '#9a5824',
    40: '#a05728',
    45: '#b66839',
    50: '#c87a4a',
    55: '#d6905a',
    60: '#dca275',
    65: '#e1b288',
    70: '#e8b894',
    75: '#ebbf9d',
    80: '#eecfb5',
    85: '#efddcd',
    90: '#f3e5d8',
    95: '#f9eee5',
    100: '#ffffff',
  },
  // Pink — H=345 C=22 (rose madder)
  pink: {
    hue: 345,
    chroma: 22,
    0: '#000000',
    5: '#22060e',
    10: '#2e0c16',
    15: '#3a131e',
    20: '#71223c',
    25: '#572235',
    30: '#8d2d4c',
    35: '#9b3358',
    40: '#a04563',
    45: '#a04a6e',
    50: '#b15876',
    55: '#c26988',
    60: '#cf7593',
    65: '#d56891',
    70: '#dc82a4',
    75: '#e094b1',
    80: '#e7a5be',
    85: '#ebb6ca',
    90: '#eed6df',
    95: '#f5e3eb',
    100: '#ffffff',
  },
  // Purple — H=290 C=30 (cathedral plum)
  purple: {
    hue: 290,
    chroma: 30,
    0: '#000000',
    5: '#1e0c25',
    10: '#2a1334',
    15: '#371b43',
    20: '#481b58',
    25: '#502163',
    30: '#5a2370',
    35: '#6e3088',
    40: '#82409c',
    45: '#9352ad',
    50: '#a363bd',
    55: '#b06ec9',
    60: '#bb7cd1',
    65: '#c084d6',
    70: '#c692db',
    75: '#cd9be0',
    80: '#d2a3df',
    85: '#dab3e6',
    90: '#e6daee',
    95: '#f0e6f4',
    100: '#ffffff',
  },
  // Red — H=15 C=12 (dusty rose) — gothic uses a desaturated rose
  // family rather than vibrant crimson; #c6a6a2 sits near T80.
  red: {
    hue: 15,
    chroma: 12,
    0: '#000000',
    5: '#1c0d09',
    10: '#26140f',
    15: '#301b16',
    20: '#3a231d',
    25: '#452c25',
    30: '#50352d',
    35: '#5b3e36',
    40: '#66483e',
    45: '#725347',
    50: '#7d5e51',
    55: '#896a5b',
    60: '#957565',
    65: '#a18170',
    70: '#ad8d7b',
    75: '#b99a87',
    80: '#c6a6a2',
    85: '#d2b4af',
    90: '#dec2bc',
    95: '#ebd0ca',
    100: '#ffffff',
  },
  // Teal — H=170 C=20 (verdigris)
  teal: {
    hue: 170,
    chroma: 20,
    0: '#000000',
    5: '#001b14',
    10: '#062821',
    15: '#0d3530',
    20: '#174a40',
    25: '#194e44',
    30: '#1f5e52',
    35: '#2c6c5f',
    40: '#3a7b6c',
    45: '#498a7a',
    50: '#5aa091',
    55: '#5db5a3',
    60: '#6cbeab',
    65: '#7cc5b3',
    70: '#90d0c0',
    75: '#9fd4c5',
    80: '#b1ddcf',
    85: '#c0e1d6',
    90: '#d4e7e2',
    95: '#e1efe9',
    100: '#ffffff',
  },
  // Yellow — H=80 C=40 (aged gold)
  yellow: {
    hue: 80,
    chroma: 40,
    0: '#000000',
    5: '#2c1d00',
    10: '#3a2900',
    15: '#4a3500',
    20: '#6c5010',
    25: '#6c5010',
    30: '#876515',
    35: '#9c7b1f',
    40: '#b18e2f',
    45: '#c39e3e',
    50: '#cca74c',
    55: '#d6b56a',
    60: '#dec074',
    65: '#e2c884',
    70: '#e6d091',
    75: '#e9d29a',
    80: '#ebd9a7',
    85: '#ebe1c4',
    90: '#f0e8d6',
    95: '#f7f1e3',
    100: '#ffffff',
  },
} as const;
