// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Glass Theme — dark only
 *
 * A deep navy canvas with soft glows, glass cards with a light top edge, and
 * one vivid hue per colored card. A hued card also points its accent at the
 * hue, so its charts, progress bars, and links match the card.
 *
 * Uses Figtree for body and heading text.
 */

import {
  defineTheme,
  defineSyntaxTheme,
  type StyleOverrides,
} from '@astryxdesign/core/theme';
import {glassIconRegistry} from './icons';
import {glassPaletteRefs} from './glassPaletteRefs.generated';

const {blue, cyan, green, neutral, orange, pink, purple, red, teal, yellow} =
  glassPaletteRefs;

const withAlpha = (color: string, alpha: string): string => `${color}${alpha}`;

/**
 * Each categorical hue: the tint a hued surface takes, the vivid line color
 * for edges and data marks, and the light text color that reads on the tint.
 */
const HUES = {
  blue: {tint: blue.dark[60], line: blue.dark[70], text: blue.dark[85]},
  cyan: {tint: cyan.dark[60], line: cyan.dark[70], text: cyan.dark[85]},
  gray: {
    tint: neutral.dark[75],
    line: neutral.dark[75],
    text: neutral.dark[85],
  },
  green: {tint: green.dark[60], line: green.dark[70], text: green.dark[85]},
  orange: {tint: orange.dark[60], line: orange.dark[70], text: orange.dark[85]},
  pink: {tint: pink.dark[60], line: pink.dark[70], text: pink.dark[85]},
  purple: {tint: purple.dark[60], line: purple.dark[70], text: purple.dark[85]},
  red: {tint: red.dark[60], line: red.dark[70], text: red.dark[85]},
  teal: {tint: teal.dark[60], line: teal.dark[70], text: teal.dark[85]},
  yellow: {tint: yellow.dark[60], line: yellow.dark[70], text: yellow.dark[85]},
} as const;

type Hue = keyof typeof HUES;

const HUE_NAMES = Object.keys(HUES) as Hue[];

/** The alpha of each hue's tint, tuned so every hue reads at a similar weight. */
const TINT_ALPHA: Record<Hue, string> = {
  blue: '33',
  cyan: '29',
  gray: '24',
  green: '29',
  orange: '33',
  pink: '33',
  purple: '38',
  red: '2e',
  teal: '29',
  yellow: '2e',
};

/** The cool glass of a card with no hue. */
const GLASS = {
  tint: withAlpha(blue.dark[65], '1c'),
  line: withAlpha(blue.dark[80], '2e'),
  edge: withAlpha(blue.dark[90], '33'),
} as const;

/**
 * The light rim of a raised surface. It is a full ring, because native
 * platforms draw only inset rings. A card adds a brighter top edge.
 */
const RIM = `inset 0 0 0 1px ${withAlpha(neutral.dark[100], '12')}`;
const LIFT = `0 18px 40px ${withAlpha(neutral.dark[0], '59')}`;

/**
 * The edge of a field shell and of a checkbox or radio box. It is the only
 * cue to where the control is, so it holds 3:1 on every surface.
 */
const CONTROL_EDGE = {
  '--color-border-emphasized': withAlpha(blue.dark[80], '99'),
} as const;

/** A tint that fades from the top-left corner into the surface. */
const cornerTint = (color: string): string =>
  `linear-gradient(155deg, ${color} 0%, transparent 70%)`;

const glassSyntax = defineSyntaxTheme({
  name: 'astryx-glass',
  tokens: {
    keyword: purple.dark[80],
    string: green.dark[80],
    comment: neutral.dark[75],
    number: orange.dark[80],
    function: blue.dark[80],
    type: purple.dark[80],
    variable: neutral.dark[90],
    operator: neutral.dark[75],
    constant: orange.dark[80],
    tag: red.dark[80],
    attribute: yellow.dark[80],
    property: teal.dark[80],
    punctuation: neutral.dark[75],
    background: neutral.dark[5],
  },
});

function hueTokens(): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const hue of HUE_NAMES) {
    const {tint, line, text} = HUES[hue];
    tokens[`--color-background-${hue}`] = withAlpha(tint, TINT_ALPHA[hue]);
    tokens[`--color-border-${hue}`] = withAlpha(line, 'ad');
    tokens[`--color-icon-${hue}`] = text;
    tokens[`--color-text-${hue}`] = text;
  }
  return tokens;
}

/**
 * Data marks take the vivid line color of the matching hue. Gray and yellow
 * have no categorical data token. Core's data grays differ by mode, so they
 * take navy stops.
 */
function dataTokens(): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const hue of HUE_NAMES) {
    if (hue !== 'gray' && hue !== 'yellow') {
      tokens[`--color-data-categorical-${hue}`] = HUES[hue].line;
    }
  }
  tokens['--color-data-neutral'] = neutral.dark[70];
  tokens['--color-data-gray-1'] = neutral.dark[95];
  tokens['--color-data-gray-2'] = neutral.dark[90];
  tokens['--color-data-gray-3'] = neutral.dark[80];
  tokens['--color-data-gray-4'] = neutral.dark[55];
  tokens['--color-data-gray-5'] = neutral.dark[35];
  return tokens;
}

/**
 * A hued card points its accent at its hue. Charts, progress bars, links,
 * and focus rings inside the card then match it.
 */
function hueCards(): Record<string, StyleOverrides> {
  const rules: Record<string, StyleOverrides> = {};
  for (const hue of HUE_NAMES) {
    const {tint, line, text} = HUES[hue];
    rules[`variant:${hue}`] = {
      backgroundColor: 'var(--color-background-card)',
      backgroundImage: cornerTint(withAlpha(tint, TINT_ALPHA[hue])),
      borderColor: `var(--color-border-${hue})`,
      boxShadow: `inset 0 1px 0 ${withAlpha(text, '66')}, ${LIFT}`,
      '--color-accent': line,
      '--color-text-accent': text,
      '--color-icon-accent': text,
    };
  }
  return rules;
}

/** Secondary text on a selected or tinted fill takes one lighter stop. */
const LIFTED_SECONDARY_TEXT = {
  '--color-text-secondary': neutral.dark[80],
} as const;

export const glassTheme = defineTheme({
  name: 'glass',

  typography: {
    scale: {base: 14, ratio: 1.2},
    body: {
      family: 'Figtree',
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    heading: {
      family: 'Figtree',
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      weights: {3: 'bold', 4: 'bold'},
    },
    code: {
      family: 'ui-monospace',
      fallbacks:
        '"SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    },
  },

  // Touch and narrow screens raise the base to 16px. The ratio keeps
  // Display 1 at its desktop size: 1.2 * (14/16)^(1/6) ~= 1.1736.
  adaptations: {
    rules: [
      {
        when: {pointer: 'coarse', width: {below: 'lg'}},
        value: {typography: {scale: {base: 16, ratio: 1.1736}}},
      },
    ],
  },

  motion: {fast: 125, medium: 300, slow: 700, ratio: 0.75},

  syntax: glassSyntax,

  tokens: {
    '--color-background-body': neutral.dark[5],
    '--color-background-surface': neutral.dark[5],
    '--color-background-card': neutral.dark[15],
    '--color-background-popover': neutral.dark[20],
    '--color-background-muted': neutral.dark[20],
    '--color-background-inverted': neutral.dark[95],

    '--color-text-primary': neutral.dark[95],
    '--color-text-secondary': neutral.dark[75],
    '--color-text-disabled': neutral.dark[60],
    '--color-text-accent': blue.dark[85],
    '--color-on-dark': neutral.dark[95],
    '--color-on-light': neutral.dark[5],

    '--color-icon-primary': neutral.dark[95],
    '--color-icon-secondary': neutral.dark[75],
    '--color-icon-disabled': neutral.dark[60],
    '--color-icon-accent': blue.dark[85],

    '--color-accent': blue.dark[70],
    '--color-accent-muted': withAlpha(blue.dark[70], '2e'),
    '--color-on-accent': neutral.dark[5],
    '--color-neutral': withAlpha(neutral.dark[100], '1a'),

    '--color-info': blue.dark[70],
    '--color-info-muted': withAlpha(blue.dark[60], '33'),
    '--color-on-info': neutral.dark[5],
    '--color-text-info': blue.dark[85],
    '--color-on-info-muted': blue.dark[85],

    '--color-success': green.dark[70],
    '--color-success-muted': withAlpha(green.dark[60], '29'),
    '--color-on-success': neutral.dark[5],
    '--color-text-success': green.dark[85],
    '--color-on-success-muted': green.dark[85],

    '--color-warning': yellow.dark[70],
    '--color-warning-muted': withAlpha(yellow.dark[60], '2e'),
    '--color-on-warning': neutral.dark[5],
    '--color-text-warning': yellow.dark[85],
    '--color-on-warning-muted': yellow.dark[85],

    '--color-error': red.dark[70],
    '--color-error-muted': withAlpha(red.dark[60], '2e'),
    '--color-on-error': neutral.dark[5],
    '--color-text-error': red.dark[85],
    '--color-on-error-muted': red.dark[85],
    // The error toast's surface. Core's own value differs by mode.
    '--color-background-error-inverted': red.dark[40],

    '--color-border': withAlpha(blue.dark[80], '1f'),
    '--color-border-emphasized': withAlpha(blue.dark[80], '4d'),
    '--color-overlay': withAlpha(neutral.dark[5], 'cc'),
    '--color-overlay-hover': withAlpha(blue.dark[80], '14'),
    '--color-overlay-pressed': withAlpha(blue.dark[80], '24'),
    '--color-skeleton': neutral.dark[30],
    '--color-track': neutral.dark[55],
    '--color-shadow': withAlpha(neutral.dark[0], '73'),
    '--color-tint-hover': neutral.dark[100],

    ...hueTokens(),
    ...dataTokens(),

    // --radius-none and --radius-full are fixed values that a theme never
    // scales.
    '--radius-none': '0px',
    '--radius-inner': '0.375rem',
    '--radius-element': '0.625rem',
    '--radius-container': '1.25rem',
    '--radius-page': '1.75rem',
    '--radius-full': '9999px',

    '--shadow-low': `0 2px 6px ${withAlpha(neutral.dark[0], '59')}, ${RIM}`,
    '--shadow-med': `0 8px 24px ${withAlpha(neutral.dark[0], '66')}, ${RIM}`,
    '--shadow-high': `0 4px 6px ${withAlpha(neutral.dark[0], '80')}, 0 12px 24px ${withAlpha(neutral.dark[0], 'b3')}, inset 0 0 0 1px ${withAlpha(neutral.dark[100], '26')}`,
    '--shadow-inset-hover': `inset 0px 0px 0px 2px ${withAlpha(blue.dark[60], '4d')}`,
    '--shadow-inset-selected': `inset 0px 0px 0px 2px ${withAlpha(blue.dark[60], '80')}`,
    '--shadow-inset-success': `inset 0px 0px 0px 2px ${withAlpha(green.dark[60], '4d')}`,
    '--shadow-inset-warning': `inset 0px 0px 0px 2px ${withAlpha(yellow.dark[60], '4d')}`,
    '--shadow-inset-error': `inset 0px 0px 0px 2px ${withAlpha(red.dark[60], '4d')}`,
  },

  components: {
    'app-shell': {
      base: {
        backgroundColor: neutral.dark[5],
        backgroundImage: [
          `radial-gradient(60rem 36rem at 90% -10%, ${withAlpha(purple.dark[55], '33')}, transparent 65%)`,
          `radial-gradient(50rem 30rem at 0% 105%, ${withAlpha(cyan.dark[60], '1f')}, transparent 60%)`,
        ].join(', '),
        backgroundAttachment: 'fixed',
      },
    },
    // The content pane paints the surface color by default. That color
    // hides the shell's glows behind every page.
    'layout-content': {
      base: {backgroundColor: 'transparent'},
    },

    // Selected rows, a dropzone under a dragged file, and a numbered citation
    // put secondary text on a tinted fill.
    item: {selected: LIFTED_SECONDARY_TEXT},
    'tree-list-item': {selected: LIFTED_SECONDARY_TEXT},
    'file-input': {'mode:dropzone': LIFTED_SECONDARY_TEXT},
    citation: {'variant:number': LIFTED_SECONDARY_TEXT},

    field: {base: CONTROL_EDGE},
    'checkbox-indicator': {base: CONTROL_EDGE},
    'radio-indicator': {base: CONTROL_EDGE},

    button: {
      'variant:destructive': {
        backgroundColor: 'var(--color-error-muted)',
        color: 'var(--color-on-error-muted)',
      },
    },

    badge: {
      'variant:neutral': {
        backgroundColor: 'var(--color-background-gray)',
        color: 'var(--color-text-gray)',
      },
      'variant:red': {
        backgroundColor: 'var(--color-background-red)',
        color: 'var(--color-text-red)',
      },
      'variant:orange': {
        backgroundColor: 'var(--color-background-orange)',
        color: 'var(--color-text-orange)',
      },
      'variant:yellow': {
        backgroundColor: 'var(--color-background-yellow)',
        color: 'var(--color-text-yellow)',
      },
      'variant:green': {
        backgroundColor: 'var(--color-background-green)',
        color: 'var(--color-text-green)',
      },
      'variant:teal': {
        backgroundColor: 'var(--color-background-teal)',
        color: 'var(--color-text-teal)',
      },
      'variant:cyan': {
        backgroundColor: 'var(--color-background-cyan)',
        color: 'var(--color-text-cyan)',
      },
      'variant:blue': {
        backgroundColor: 'var(--color-background-blue)',
        color: 'var(--color-text-blue)',
      },
      'variant:purple': {
        backgroundColor: 'var(--color-background-purple)',
        color: 'var(--color-text-purple)',
      },
      'variant:pink': {
        backgroundColor: 'var(--color-background-pink)',
        color: 'var(--color-text-pink)',
      },
      'variant:gray': {
        backgroundColor: 'var(--color-background-gray)',
        color: 'var(--color-text-gray)',
      },
    },

    // The segmented control gets a roomier inset. Its labels sit on a tinted
    // track, and the selected segment stays flat on it.
    'segmented-control': {
      base: {padding: 'var(--spacing-1)'},
    },
    'segmented-control-item': {
      base: LIFTED_SECONDARY_TEXT,
      'size:sm': {height: 'calc(var(--size-element-sm) - 8px)'},
      'size:md': {height: 'calc(var(--size-element-md) - 8px)'},
      'size:lg': {height: 'calc(var(--size-element-lg) - 8px)'},
      selected: {boxShadow: 'none'},
    },

    // The translucent tint fills are too faint for a track. Tracks use the
    // emphasized border color instead.
    switch: {
      base: {'--color-background-gray': 'var(--color-border-emphasized)'},
    },
    'progress-bar': {
      base: {'--color-background-muted': 'var(--color-border-emphasized)'},
    },

    // Every card is glass: a cool tint from the top-left corner and a light
    // top edge. A hued card replaces the tint and edge with its hue. The 16px
    // padding gives a large stat number room.
    card: {
      base: {
        padding: 'var(--spacing-4)',
        borderColor: GLASS.line,
        backgroundImage: cornerTint(GLASS.tint),
        boxShadow: `inset 0 1px 0 ${GLASS.edge}, ${LIFT}`,
      },
      ...hueCards(),
    },

    section: {
      base: {padding: 'var(--spacing-3)'},
    },
  },

  // Glass's accent text and icons are one light color. On a media surface
  // they follow that surface's accent, so they stay readable on a light one.
  onDark: {
    tokens: {
      '--color-text-accent': 'var(--color-accent)',
      '--color-icon-accent': 'var(--color-accent)',
    },
  },
  onLight: {
    tokens: {
      '--color-text-accent': 'var(--color-accent)',
      '--color-icon-accent': 'var(--color-accent)',
    },
  },

  icons: glassIconRegistry,
});
