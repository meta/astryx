// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Stone Theme
 *
 * A warm, earthy neutral theme inspired by natural stone and sandstone.
 * Colors reference the reviewed Stone palette generated from palette.config.json.
 * Montserrat for headings, Figtree for body, JetBrains Mono for code.
 */

import {defineTheme, defineSyntaxTheme} from '@astryxdesign/core/theme';
import {stoneIconRegistry} from './icons';
import {stonePaletteRefs} from './stonePaletteRefs.generated';

const {blue, cyan, green, neutral, orange, pink, purple, red, teal, yellow} =
  stonePaletteRefs;

const lightDark = (light: string, dark: string): string =>
  `light-dark(${light}, ${dark})`;
const withAlpha = (color: string, alpha: string): string => `${color}${alpha}`;

/**
 * Input status borders and icons use softer mid-ramp stops than status text.
 * All supported input components share this one mapping so their status
 * treatment remains consistent.
 */
const INPUT_STATUS_VARS = {
  'status:success': {
    '--color-border-success': lightDark(green.light[55], green.dark[70]),
    '--color-icon-success': lightDark(green.light[55], green.dark[70]),
  },
  'status:warning': {
    '--color-border-warning': lightDark(yellow.light[55], yellow.dark[70]),
    '--color-icon-warning': lightDark(yellow.light[55], yellow.dark[70]),
  },
  'status:error': {
    '--color-border-error': lightDark(red.light[60], red.dark[70]),
    '--color-icon-error': lightDark(red.light[60], red.dark[70]),
  },
} as const;

/**
 * Stone syntax uses mid-ramp colors in light mode and lighter stops in dark
 * mode. Light strings and properties share Teal; dark strings use Green 70,
 * while dark properties remain Teal.
 */
const stoneSyntax = defineSyntaxTheme({
  name: 'astryx-stone',
  tokens: {
    keyword: [purple.light[40], purple.dark[70]],
    string: [teal.light[40], green.dark[70]],
    comment: [neutral.light[40], neutral.dark[70]],
    number: [red.light[40], orange.dark[70]],
    function: [blue.light[40], blue.dark[70]],
    type: [purple.light[40], purple.dark[70]],
    variable: [neutral.light[40], neutral.dark[70]],
    operator: [neutral.light[40], neutral.dark[70]],
    constant: [red.light[40], orange.dark[70]],
    tag: [red.light[40], red.dark[70]],
    attribute: [yellow.light[40], yellow.dark[70]],
    property: [teal.light[40], teal.dark[70]],
    punctuation: [neutral.light[40], neutral.dark[70]],
    background: [neutral.light[95], neutral.dark[5]],
    // Translucent diff rows retain each token's contrast while the opaque
    // markers carry the same Green and Red families as their row tint.
    added: [withAlpha(green.light[90], '40'), withAlpha(green.dark[80], '33')],
    removed: [withAlpha(red.light[90], '40'), withAlpha(red.dark[80], '33')],
    'added-marker': [green.light[30], green.dark[90]],
    'removed-marker': [red.light[30], red.dark[90]],
  },
});

/**
 * The secondary Button treatment. Selector, MultiSelector, and ComplexSelector
 * reuse it for their `secondary` trigger so every secondary control in this
 * theme matches (AST-079 FR2).
 */
const SECONDARY_BUTTON = {
  backgroundColor: 'transparent',
  borderWidth: '1.5px',
  borderStyle: 'solid',
  borderColor: 'var(--color-border-emphasized)',
  ':hover': {
    backgroundColor: 'var(--color-neutral)',
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
  ':hover:not(:has(> :is(:disabled, [aria-disabled="true"])))':
    SECONDARY_BUTTON[':hover'],
} as const;

export const stoneTheme = defineTheme({
  name: 'stone',

  typography: {
    scale: {base: 14, ratio: 1.25},
    body: {
      family: 'Figtree',
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    heading: {
      family: 'Montserrat',
      fallbacks:
        '"Figtree", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
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

  syntax: stoneSyntax,

  tokens: {
    // Core neutrals
    '--color-accent': [neutral.light[15], neutral.dark[95]],
    '--color-accent-muted': [
      withAlpha(neutral.light[15], '14'),
      withAlpha(neutral.dark[95], '20'),
    ],
    '--color-neutral': [
      withAlpha(neutral.light[15], '0f'),
      withAlpha(neutral.dark[95], '1a'),
    ],
    '--color-background-surface': [neutral.light[100], neutral.dark[10]],
    '--color-background-body': [neutral.light[95], neutral.dark[5]],
    '--color-overlay': [
      withAlpha(neutral.light[15], '80'),
      withAlpha(neutral.dark[15], 'cc'),
    ],
    '--color-overlay-hover': [
      withAlpha(neutral.light[15], '0d'),
      withAlpha(neutral.dark[95], '0d'),
    ],
    '--color-overlay-pressed': [
      withAlpha(neutral.light[15], '1a'),
      withAlpha(neutral.dark[95], '1a'),
    ],
    '--color-background-muted': [neutral.light[90], neutral.dark[25]],

    // Text
    '--color-text-primary': [neutral.light[15], neutral.dark[95]],
    // These stops keep normal secondary text readable on Stone's body,
    // muted, and categorical surfaces.
    '--color-text-secondary': [neutral.light[40], neutral.dark[70]],
    '--color-text-disabled': [neutral.light[85], neutral.dark[40]],
    '--color-text-accent': [neutral.light[15], neutral.dark[95]],
    '--color-on-dark': neutral.light[100],
    '--color-on-light': [neutral.light[15], neutral.dark[15]],
    '--color-on-accent': [neutral.light[100], neutral.dark[15]],
    '--color-on-success': [neutral.light[100], neutral.dark[10]],
    '--color-on-error': [neutral.light[100], neutral.dark[10]],
    '--color-on-warning': [neutral.light[100], neutral.dark[10]],

    '--color-info': [blue.light[40], blue.dark[70]],
    '--color-info-muted': [blue.light[90], blue.dark[25]],
    '--color-on-info': [neutral.light[100], neutral.dark[15]],

    '--color-text-info': [blue.light[30], blue.dark[90]],
    '--color-text-success': [green.light[30], green.dark[90]],
    '--color-text-warning': [yellow.light[30], yellow.dark[90]],
    '--color-text-error': [red.light[30], red.dark[90]],
    '--color-on-info-muted': [blue.light[30], blue.dark[90]],
    '--color-on-success-muted': [green.light[30], green.dark[25]],
    '--color-on-warning-muted': [yellow.light[30], yellow.dark[25]],
    '--color-on-error-muted': [red.light[30], red.dark[25]],

    // Icon
    '--color-icon-accent': [neutral.light[15], neutral.dark[95]],
    '--color-icon-primary': [neutral.light[15], neutral.dark[95]],
    '--color-icon-secondary': [neutral.light[55], neutral.dark[65]],
    '--color-icon-disabled': [neutral.light[85], neutral.dark[40]],

    // Surface variants
    '--color-background-card': [neutral.light[100], neutral.dark[15]],
    '--color-background-popover': [neutral.light[100], neutral.dark[20]],
    '--color-background-inverted': [neutral.light[15], neutral.dark[95]],

    // Status / sentiment
    '--color-success': [green.light[30], green.dark[80]],
    '--color-success-muted': [green.light[90], green.dark[80]],
    '--color-error': [red.light[30], red.dark[80]],
    '--color-error-muted': [red.light[90], red.dark[80]],
    '--color-warning': [yellow.light[30], yellow.dark[80]],
    '--color-warning-muted': [yellow.light[90], yellow.dark[80]],

    // Border
    '--color-border': [neutral.light[90], withAlpha(neutral.dark[95], '1a')],
    '--color-border-emphasized': [neutral.light[55], neutral.dark[40]],

    // Effects
    '--color-skeleton': [neutral.light[85], neutral.dark[40]],
    '--color-shadow': [
      withAlpha(neutral.light[15], '1a'),
      withAlpha(neutral.dark[0], '4d'),
    ],
    '--color-tint-hover': [neutral.light[0], neutral.dark[100]],

    // Typography override
    '--text-supporting-size': '12px',

    // Categorical
    // Light mode pairs pastel stop 90 surfaces with stop 30 foregrounds.
    // Dark mode pairs stop 35 surfaces with stop 90 foregrounds; borders move
    // one step inward in both modes.
    '--color-background-blue': [blue.light[90], blue.dark[35]],
    '--color-border-blue': [blue.light[85], blue.dark[25]],
    '--color-icon-blue': [blue.light[30], blue.dark[90]],
    '--color-text-blue': [blue.light[30], blue.dark[90]],

    '--color-background-cyan': [cyan.light[90], cyan.dark[35]],
    '--color-border-cyan': [cyan.light[85], cyan.dark[25]],
    '--color-icon-cyan': [cyan.light[30], cyan.dark[90]],
    '--color-text-cyan': [cyan.light[30], cyan.dark[90]],

    '--color-background-gray': [neutral.light[90], neutral.dark[35]],
    '--color-border-gray': [neutral.light[85], neutral.dark[25]],
    '--color-icon-gray': [neutral.light[30], neutral.dark[90]],
    '--color-text-gray': [neutral.light[30], neutral.dark[90]],

    '--color-background-green': [green.light[90], green.dark[35]],
    '--color-border-green': [green.light[85], green.dark[25]],
    '--color-icon-green': [green.light[30], green.dark[90]],
    '--color-text-green': [green.light[30], green.dark[90]],

    '--color-background-orange': [orange.light[90], orange.dark[35]],
    '--color-border-orange': [orange.light[85], orange.dark[25]],
    '--color-icon-orange': [orange.light[30], orange.dark[90]],
    '--color-text-orange': [orange.light[30], orange.dark[90]],

    '--color-background-pink': [pink.light[90], pink.dark[35]],
    '--color-border-pink': [pink.light[85], pink.dark[25]],
    '--color-icon-pink': [pink.light[30], pink.dark[90]],
    '--color-text-pink': [pink.light[30], pink.dark[90]],

    '--color-background-purple': [purple.light[90], purple.dark[35]],
    '--color-border-purple': [purple.light[85], purple.dark[25]],
    '--color-icon-purple': [purple.light[30], purple.dark[90]],
    '--color-text-purple': [purple.light[30], purple.dark[90]],

    '--color-background-red': [red.light[90], red.dark[35]],
    '--color-border-red': [red.light[85], red.dark[25]],
    '--color-icon-red': [red.light[30], red.dark[90]],
    '--color-text-red': [red.light[30], red.dark[90]],

    '--color-background-teal': [teal.light[90], teal.dark[35]],
    '--color-border-teal': [teal.light[85], teal.dark[25]],
    '--color-icon-teal': [teal.light[30], teal.dark[90]],
    '--color-text-teal': [teal.light[30], teal.dark[90]],

    '--color-background-yellow': [yellow.light[90], yellow.dark[35]],
    '--color-border-yellow': [yellow.light[85], yellow.dark[25]],
    '--color-icon-yellow': [yellow.light[30], yellow.dark[90]],
    '--color-text-yellow': [yellow.light[30], yellow.dark[90]],

    // Radius
    '--radius-none': '0px',
    '--radius-inner': '0.25rem',
    '--radius-element': '0.5rem',
    '--radius-container': '0.75rem',
    '--radius-page': '1.5rem',
    '--radius-full': '9999px',

    // Shadows
    '--shadow-low': `0 2px 4px ${withAlpha(neutral.light[15], '0d')}, 0 4px 8px ${withAlpha(neutral.light[15], '1a')}`,
    '--shadow-med': `0 2px 4px ${withAlpha(neutral.light[15], '0d')}, 0 4px 12px ${withAlpha(neutral.light[15], '1a')}`,
    '--shadow-high': `0 4px 6px ${withAlpha(neutral.light[15], '1a')}, 0 12px 24px ${withAlpha(neutral.light[15], '26')}`,
    '--shadow-inset-hover': `inset 0 0 0 2px ${withAlpha(neutral.light[15], '30')}`,
    '--shadow-inset-selected': `inset 0 0 0 2px ${withAlpha(neutral.light[15], '50')}`,
    '--shadow-inset-success': `inset 0 0 0 2px ${withAlpha(neutral.light[55], '30')}`,
    '--shadow-inset-warning': `inset 0 0 0 2px ${withAlpha(neutral.light[55], '30')}`,
    '--shadow-inset-error': `inset 0 0 0 2px ${withAlpha(neutral.light[55], '30')}`,
  },

  components: {
    button: {
      base: {
        borderRadius: 'var(--radius-full)',
      },
      'variant:secondary': SECONDARY_BUTTON,
      'variant:destructive': {
        backgroundColor: 'var(--color-background-red)',
        color: 'var(--color-text-red)',
      },
    },

    // Badges, banners, and field status messages share the categorical
    // surfaces and foregrounds so each semantic state has one visual source.
    badge: {
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

    // Banner status surfaces and content use the matching categorical pair.
    banner: {
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

    // Progress fills use the same family as their matching status surface;
    // the darker stop in dark mode keeps the channel visible on dark tracks.
    'progress-bar-fill': {
      'variant:accent': {
        backgroundColor: lightDark(blue.light[90], blue.dark[70]),
      },
      'variant:success': {
        backgroundColor: lightDark(green.light[90], green.dark[70]),
      },
      'variant:warning': {
        backgroundColor: lightDark(yellow.light[90], yellow.dark[70]),
      },
      'variant:error': {
        backgroundColor: lightDark(red.light[90], red.dark[70]),
      },
    },

    'progress-bar-mark': {
      'placement:fill+variant:accent': {
        backgroundColor: 'var(--color-on-light)',
      },
      'placement:fill+variant:success': {
        backgroundColor: 'var(--color-on-light)',
      },
      'placement:fill+variant:warning': {
        backgroundColor: 'var(--color-on-light)',
      },
      'placement:fill+variant:error': {
        backgroundColor: 'var(--color-on-light)',
      },
    },

    // The default muted track is too close to Stone's body surface.
    'progress-bar-track': {
      base: {
        backgroundColor: 'var(--color-skeleton)',
      },
    },

    // Match the Switch off-state track to the visible ProgressBar track.
    switch: {
      base: {
        '--color-background-gray': 'var(--color-skeleton)',
      },
    },

    // FieldStatus surfaces match the corresponding badge and banner family.
    'field-status': {
      'type:success': {
        backgroundColor: 'var(--color-background-green)',
        color: 'var(--color-text-green)',
      },
      'type:warning': {
        backgroundColor: 'var(--color-background-yellow)',
        color: 'var(--color-text-yellow)',
      },
      'type:error': {
        backgroundColor: 'var(--color-background-red)',
        color: 'var(--color-text-red)',
      },
    },

    // Every input status border and icon uses INPUT_STATUS_VARS above.
    'text-input': INPUT_STATUS_VARS,
    'text-area': INPUT_STATUS_VARS,
    'number-input': INPUT_STATUS_VARS,
    'date-input': INPUT_STATUS_VARS,
    'time-input': INPUT_STATUS_VARS,
    selector: {...INPUT_STATUS_VARS, 'variant:secondary': SECONDARY_SELECTOR},
    'multi-selector': {
      ...INPUT_STATUS_VARS,
      'variant:secondary': SECONDARY_SELECTOR,
    },
    'complex-selector': {'variant:secondary': SECONDARY_COMPLEX_SELECTOR},
    typeahead: INPUT_STATUS_VARS,
    tokenizer: INPUT_STATUS_VARS,

    card: {
      base: {
        padding: 'var(--spacing-3)',
      },
    },

    section: {
      base: {
        padding: 'var(--spacing-3)',
      },
    },
  },

  icons: stoneIconRegistry,
});

/**
 * Frozen released compatibility palettes. These values preserve the public
 * `stonePalettes` numeric stops, `hue`, and `chroma` for existing consumers;
 * the maintained theme renders selected stops from
 * `stonePalettes.generated.ts` instead. Components should consume semantic
 * theme tokens, and charts should use the data-visualization color API.
 */
export const stonePalettes = {
  neutral: {
    hue: 291,
    chroma: 3,
    0: '#000000',
    5: '#111015',
    10: '#1b1b1f',
    15: '#25252a',
    20: '#303034',
    25: '#3b3b3f',
    30: '#46464b',
    35: '#525257',
    40: '#5e5e63',
    45: '#6a6a6f',
    50: '#77777c',
    55: '#838388',
    60: '#909095',
    65: '#9d9da3',
    70: '#ababb0',
    75: '#b8b8be',
    80: '#c6c6cc',
    85: '#d4d4da',
    90: '#e2e2e8',
    95: '#f0f0f6',
    100: '#ffffff',
  },
  blue: {
    hue: 265,
    chroma: 10,
    0: '#000000',
    5: '#04121e',
    10: '#111c29',
    15: '#1b2734',
    20: '#26313f',
    25: '#313c4a',
    30: '#3c4856',
    35: '#485362',
    40: '#545f6e',
    45: '#606c7b',
    50: '#6c7888',
    55: '#798595',
    60: '#8692a2',
    65: '#939faf',
    70: '#a0acbd',
    75: '#adbacb',
    80: '#bbc8d9',
    85: '#c9d6e7',
    90: '#d7e4f5',
    95: '#e7f2ff',
    100: '#ffffff',
  },
  cyan: {
    hue: 190,
    chroma: 10,
    0: '#000000',
    5: '#001613',
    10: '#071f1e',
    15: '#122a28',
    20: '#1d3433',
    25: '#28403e',
    30: '#334b49',
    35: '#3e5755',
    40: '#4a6361',
    45: '#566f6d',
    50: '#627c7a',
    55: '#6f8986',
    60: '#7b9693',
    65: '#88a3a0',
    70: '#95b1ae',
    75: '#a3bebb',
    80: '#b0ccc9',
    85: '#bedad7',
    90: '#cce8e5',
    95: '#daf7f4',
    100: '#ffffff',
  },
  green: {
    hue: 142,
    chroma: 17,
    0: '#000000',
    5: '#001700',
    10: '#0c200a',
    15: '#162a16',
    20: '#213521',
    25: '#2b402b',
    30: '#374c36',
    35: '#425841',
    40: '#4e644d',
    45: '#5a7059',
    50: '#667d65',
    55: '#728a71',
    60: '#7f977e',
    65: '#8ca48b',
    70: '#99b298',
    75: '#a7bfa5',
    80: '#b4cdb2',
    85: '#c2dbc0',
    90: '#d0e9ce',
    95: '#def8dc',
    100: '#ffffff',
  },
  teal: {
    hue: 158,
    chroma: 9,
    0: '#000000',
    5: '#00150a',
    10: '#101e17',
    15: '#1a2921',
    20: '#25342b',
    25: '#303f36',
    30: '#3b4a41',
    35: '#46564d',
    40: '#526259',
    45: '#5e6e65',
    50: '#6a7b71',
    55: '#77887e',
    60: '#83958a',
    65: '#90a297',
    70: '#9dafa5',
    75: '#abbdb2',
    80: '#b8cbc0',
    85: '#c6d9ce',
    90: '#d4e7dc',
    95: '#e2f5ea',
    100: '#ffffff',
  },
  yellow: {
    hue: 90,
    chroma: 23,
    0: '#000000',
    5: '#1f0f00',
    10: '#261a00',
    15: '#2f2500',
    20: '#3a2f0d',
    25: '#463a18',
    30: '#524622',
    35: '#5e512d',
    40: '#6b5d39',
    45: '#786944',
    50: '#857650',
    55: '#92825c',
    60: '#9f8f68',
    65: '#ad9c75',
    70: '#bbaa81',
    75: '#c9b78e',
    80: '#d7c59c',
    85: '#e5d3a9',
    90: '#f4e1b7',
    95: '#ffefc7',
    100: '#ffffff',
  },
  orange: {
    hue: 70,
    chroma: 22,
    0: '#000000',
    5: '#250a00',
    10: '#2d1700',
    15: '#372104',
    20: '#432c12',
    25: '#4f361c',
    30: '#5b4227',
    35: '#684d32',
    40: '#75593d',
    45: '#826548',
    50: '#8f7154',
    55: '#9d7e60',
    60: '#aa8b6d',
    65: '#b89879',
    70: '#c6a586',
    75: '#d4b393',
    80: '#e3c0a0',
    85: '#f1ceae',
    90: '#ffdcbb',
    95: '#ffeddc',
    100: '#ffffff',
  },
  red: {
    hue: 33,
    chroma: 11,
    0: '#000000',
    5: '#210a04',
    10: '#2a1714',
    15: '#35211e',
    20: '#402b28',
    25: '#4c3633',
    30: '#58413e',
    35: '#644d49',
    40: '#715955',
    45: '#7e6561',
    50: '#8a716d',
    55: '#987e7a',
    60: '#a58b86',
    65: '#b39893',
    70: '#c0a5a1',
    75: '#ceb3ae',
    80: '#dcc0bc',
    85: '#ebcec9',
    90: '#f9dcd7',
    95: '#ffece9',
    100: '#ffffff',
  },
  pink: {
    hue: 340,
    chroma: 9,
    0: '#000000',
    5: '#1b0c16',
    10: '#251720',
    15: '#30222a',
    20: '#3b2c35',
    25: '#463740',
    30: '#52424c',
    35: '#5e4e57',
    40: '#6a5a63',
    45: '#776670',
    50: '#83727c',
    55: '#907f89',
    60: '#9d8c96',
    65: '#ab99a3',
    70: '#b8a6b1',
    75: '#c6b4be',
    80: '#d4c1cc',
    85: '#e2cfda',
    90: '#f0dde8',
    95: '#ffebf7',
    100: '#ffffff',
  },
  purple: {
    hue: 307,
    chroma: 11,
    0: '#000000',
    5: '#150e1d',
    10: '#1f1927',
    15: '#292332',
    20: '#342e3d',
    25: '#3f3949',
    30: '#4b4454',
    35: '#564f60',
    40: '#635b6d',
    45: '#6f6779',
    50: '#7b7486',
    55: '#888193',
    60: '#958da0',
    65: '#a39aad',
    70: '#b0a8bb',
    75: '#beb5c9',
    80: '#cbc3d7',
    85: '#d9d1e5',
    90: '#e8dff3',
    95: '#f6edff',
    100: '#ffffff',
  },
} as const;
