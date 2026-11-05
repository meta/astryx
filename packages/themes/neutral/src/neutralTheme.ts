// Copyright (c) Meta Platforms, Inc. and affiliates.

import {
  defineTheme,
  defineSyntaxTheme,
  type TokenValue,
} from '@astryxdesign/core/theme';
import {neutralIconRegistry} from './icons';
import {neutralPaletteRefs} from './neutralPaletteRefs.generated';

const {blue, cyan, green, neutral, orange, pink, purple, red, teal, yellow} =
  neutralPaletteRefs;
const withAlpha = (color: string, alpha: string) => `${color}${alpha}`;

const neutralSyntax = defineSyntaxTheme({
  name: 'astryx-neutral',
  tokens: {
    keyword: [purple.light[30], purple.light[80]],
    string: [green.light[30], green.light[80]],
    comment: [neutral.light[45], neutral.dark[65]],
    number: [orange.light[30], orange.dark[80]],
    function: [blue.light[30], blue.dark[80]],
    type: [purple.light[30], purple.light[80]],
    variable: [neutral.light[5], neutral.dark[90]],
    operator: [neutral.light[45], neutral.dark[65]],
    constant: [orange.light[30], orange.dark[80]],
    tag: [red.light[30], red.dark[80]],
    attribute: [yellow.light[30], yellow.light[80]],
    property: [teal.light[30], teal.light[80]],
    punctuation: [neutral.light[45], neutral.dark[65]],
    background: [neutral.light[100], neutral.dark[5]],
  },
});

const neutralLocalTokens: Record<string, TokenValue> = {
  // Deprecated: kept with its released name, meaning, and value for Neutral
  // extensions (theme:neutral DEC-1); Neutral itself paints status through the
  // portable --color-* roles and no longer reads it.
  '--astryx-theme-neutral-color-status-fill-accent': ['#0074e2', '#6d9cfe'],
};

export const neutralTheme = defineTheme({
  name: 'neutral',
  localTokens: neutralLocalTokens,

  // Typography: Figtree across body, heading, and display sizes (display
  // size tokens inherit from heading.family). Monospace stays as the
  // platform default for code.
  // Scale: base=14, ratio=1.2. Bold weights on h3/h4 for subsection hierarchy.
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

  // Touch + narrow (Mobile Type, Pin): floor base to the 16px floor and
  // re-derive the ratio so Display 1 keeps its desktop size:
  // ratio' = 1.2 * (14/16)^(1/6) ~= 1.1736. Body 14 -> 16px, display-1 stays 42px.
  adaptations: {
    rules: [
      {
        when: {pointer: 'coarse', width: {below: 'lg'}},
        value: {typography: {scale: {base: 16, ratio: 1.1736}}},
      },
    ],
  },

  // Motion: snappier than default to match shadcn/Tailwind conventions.
  // Produces: fast-min=95ms, fast=125ms, fast-max=165ms,
  //           medium-min=225ms, medium=300ms, medium-max=400ms.
  motion: {fast: 125, medium: 300, slow: 700, ratio: 0.75},

  syntax: neutralSyntax,

  tokens: {
    '--color-background-surface': [neutral.light[100], neutral.dark[15]],
    '--color-background-body': [neutral.light[95], neutral.dark[10]],
    '--color-background-card': [neutral.light[100], neutral.dark[10]],
    '--color-background-popover': [neutral.light[100], neutral.dark[10]],
    '--color-background-muted': [neutral.light[95], neutral.dark[10]],

    '--color-accent': [neutral.light[10], neutral.dark[95]],
    '--color-accent-muted': [neutral.light[95], neutral.dark[15]],
    '--color-neutral': [
      withAlpha(neutral.light[0], '0F'),
      withAlpha(neutral.dark[100], '1A'),
    ],

    // Overlays (modal scrims, hover/pressed tints)
    '--color-overlay': [
      withAlpha(neutral.light[0], '80'),
      withAlpha(neutral.dark[0], 'CC'),
    ],
    '--color-overlay-hover': [
      withAlpha(neutral.light[0], '0D'),
      withAlpha(neutral.dark[100], '0D'),
    ],
    '--color-overlay-pressed': [
      withAlpha(neutral.light[0], '1A'),
      withAlpha(neutral.dark[100], '1A'),
    ],

    // Text
    '--color-text-primary': [neutral.light[0], neutral.dark[100]],
    '--color-text-secondary': [neutral.light[30], neutral.dark[65]],
    '--color-text-disabled': [neutral.light[60], neutral.dark[35]],
    '--color-text-accent': [neutral.light[10], neutral.dark[95]],
    '--color-on-dark': neutral.light[100],
    '--color-on-light': neutral.light[5],
    '--color-on-accent': [neutral.light[100], neutral.dark[5]],
    '--color-on-success': [neutral.light[100], neutral.dark[5]],
    '--color-on-error': [neutral.light[100], neutral.dark[5]],
    '--color-on-warning': neutral.light[5],

    '--color-info': ['#0074e2', '#6d9cfe'],
    '--color-info-muted': [blue.light[85], withAlpha(blue.dark[75], '3D')],
    '--color-on-info': [neutral.light[100], neutral.dark[5]],

    '--color-text-info': [blue.light[45], blue.dark[80]],
    '--color-text-success': [green.light[45], green.light[75]],
    '--color-text-warning': [yellow.light[45], yellow.light[80]],
    '--color-text-error': [red.light[45], red.dark[80]],

    '--color-on-info-muted': [blue.light[25], blue.dark[80]],
    '--color-on-success-muted': [green.light[25], green.light[75]],
    '--color-on-warning-muted': [yellow.light[25], yellow.light[80]],
    '--color-on-error-muted': [red.light[25], red.dark[80]],

    // Icon
    '--color-icon-accent': [neutral.light[10], neutral.dark[95]],
    '--color-icon-primary': [neutral.light[0], neutral.dark[100]],
    '--color-icon-secondary': [neutral.light[45], neutral.dark[65]],
    '--color-icon-disabled': [neutral.light[60], neutral.dark[35]],

    // Strong status fills (architecture:theme-tokens INV11): Neutral's
    // reviewed status-fill colours, with --color-on-<status> above.
    '--color-success': ['#198100', '#64af4c'],
    '--color-warning': '#ffce2f',
    '--color-error': ['#c9303a', '#ff705d'],
    '--color-success-muted': [green.dark[85], withAlpha(green.light[75], '3D')],
    '--color-error-muted': [red.light[85], withAlpha(red.dark[75], '3D')],
    '--color-warning-muted': [
      yellow.dark[90],
      withAlpha(yellow.light[75], '3D'),
    ],

    '--color-border': [
      withAlpha(neutral.light[0], '14'),
      withAlpha(neutral.dark[100], '1A'),
    ],
    '--color-border-emphasized': [neutral.light[85], neutral.dark[35]],

    // Effects
    '--color-skeleton': [neutral.light[95], neutral.dark[35]],
    '--color-shadow': [
      withAlpha(neutral.light[0], '1A'),
      withAlpha(neutral.dark[0], '4D'),
    ],
    '--color-tint-hover': [neutral.light[0], neutral.dark[100]],

    '--color-background-red': [red.light[85], red.dark[25]],
    '--color-border-red': [red.light[80], red.light[65]],
    '--color-icon-red': [red.light[25], red.dark[75]],
    '--color-text-red': [red.light[25], red.dark[80]],

    '--color-background-orange': [orange.light[85], orange.dark[25]],
    '--color-border-orange': [orange.light[85], orange.dark[65]],
    '--color-icon-orange': [orange.light[25], orange.light[75]],
    '--color-text-orange': [orange.light[25], orange.dark[80]],

    '--color-background-yellow': [yellow.dark[90], yellow.dark[25]],
    '--color-border-yellow': [yellow.dark[80], yellow.light[65]],
    '--color-icon-yellow': [yellow.light[25], yellow.light[75]],
    '--color-text-yellow': [yellow.light[25], yellow.light[80]],

    '--color-background-green': [green.dark[85], green.dark[25]],
    '--color-border-green': [green.dark[80], green.light[65]],
    '--color-icon-green': [green.light[25], green.light[75]],
    '--color-text-green': [green.light[25], green.light[75]],

    '--color-background-teal': [teal.light[85], teal.dark[25]],
    '--color-border-teal': [teal.light[80], teal.dark[65]],
    '--color-icon-teal': [teal.light[25], teal.dark[75]],
    '--color-text-teal': [teal.light[25], teal.light[80]],

    '--color-background-cyan': [cyan.dark[85], cyan.dark[25]],
    '--color-border-cyan': [cyan.dark[80], cyan.dark[65]],
    '--color-icon-cyan': [cyan.light[25], cyan.dark[75]],
    '--color-text-cyan': [cyan.light[25], cyan.dark[80]],

    '--color-background-blue': [blue.light[85], blue.dark[25]],
    '--color-border-blue': [blue.light[80], blue.dark[65]],
    '--color-icon-blue': [blue.light[25], blue.dark[75]],
    '--color-text-blue': [blue.light[25], blue.dark[80]],

    '--color-background-purple': [purple.light[90], purple.dark[25]],
    '--color-border-purple': [purple.light[85], purple.light[70]],
    '--color-icon-purple': [purple.light[25], purple.light[75]],
    '--color-text-purple': [purple.light[25], purple.dark[80]],

    '--color-background-pink': [pink.light[85], pink.dark[25]],
    '--color-border-pink': [pink.light[85], pink.light[70]],
    '--color-icon-pink': [pink.light[25], pink.dark[75]],
    '--color-text-pink': [pink.light[25], pink.dark[80]],

    '--color-background-gray': [neutral.light[90], neutral.dark[20]],
    '--color-border-gray': [neutral.light[85], neutral.dark[15]],
    '--color-icon-gray': [neutral.light[30], neutral.dark[65]],
    '--color-text-gray': [neutral.light[10], neutral.dark[85]],

    // =========================================================================
    // Radius — slightly larger than default (kept as-is)
    // --radius-none and --radius-full are always fixed and must never be
    // scaled by a theme (see defineTheme's radius config docs) — 0 and
    // 9999px respectively, matching @astryxdesign/core's own defaults.
    // =========================================================================
    '--radius-none': '0px',
    '--radius-inner': '0.375rem',
    '--radius-element': '0.625rem',
    '--radius-container': '0.75rem',
    '--radius-page': '1.75rem',
    '--radius-full': '9999px',

    // =========================================================================
    // Shadows
    //
    // Light mode: matches origin/main exactly (5%/10% low+med, 10%/15% high).
    // Subtle drops; light surfaces don't need rim highlights.
    //
    // Dark mode: deepened drops + an all-around 1px white inset that wraps
    // every edge ("Figma-style bezel"). The inset mimics ambient light
    // catching the surface's rim on every side, giving cards/popovers/modals
    // a substantial "lit from above" feel that drop shadows alone can't
    // achieve against a dark canvas.
    //   low  :  drops 25%/40% + 8%  white all-around inset
    //   med  :  drops 35%/50% + 12% white all-around inset
    //   high :  drops 50%/70% + 15% white all-around inset
    //
    // The inset layer uses light-dark(transparent, ...) so light mode is
    // unaffected — main's exact light values are preserved.
    // =========================================================================
    '--shadow-low':
      '0 2px 4px light-dark(oklch(0 0 0 / 5%), oklch(0 0 0 / 25%)), ' +
      '0 4px 8px light-dark(oklch(0 0 0 / 10%), oklch(0 0 0 / 40%)), ' +
      'inset 0 0 0 1px light-dark(transparent, oklch(1 0 0 / 8%))',
    '--shadow-med':
      '0 2px 4px light-dark(oklch(0 0 0 / 5%), oklch(0 0 0 / 35%)), ' +
      '0 4px 12px light-dark(oklch(0 0 0 / 10%), oklch(0 0 0 / 50%)), ' +
      'inset 0 0 0 1px light-dark(transparent, oklch(1 0 0 / 12%))',
    '--shadow-high':
      '0 4px 6px light-dark(oklch(0 0 0 / 10%), oklch(0 0 0 / 50%)), ' +
      '0 12px 24px light-dark(oklch(0 0 0 / 15%), oklch(0 0 0 / 70%)), ' +
      'inset 0 0 0 1px light-dark(transparent, oklch(1 0 0 / 15%))',
    '--shadow-inset-hover': `inset 0px 0px 0px 2px ${withAlpha(blue.light[50], '4D')}`,
    '--shadow-inset-selected': `inset 0px 0px 0px 2px ${withAlpha(blue.light[50], '80')}`,
    '--shadow-inset-success': `inset 0px 0px 0px 2px ${withAlpha(green.light[45], '4D')}`,
    '--shadow-inset-warning': `inset 0px 0px 0px 2px ${withAlpha(yellow.light[85], '4D')}`,
    '--shadow-inset-error': `inset 0px 0px 0px 2px ${withAlpha(red.light[55], '4D')}`,
  },

  components: {
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

    // Give the Neutral segmented control a roomier inset without changing its
    // outside height. The selected item stays flat against the tinted track.
    'segmented-control': {
      base: {
        padding: 'var(--spacing-1)',
      },
    },
    'segmented-control-item': {
      'size:sm': {
        height: 'calc(var(--size-element-sm) - 8px)',
      },
      'size:md': {
        height: 'calc(var(--size-element-md) - 8px)',
      },
      'size:lg': {
        height: 'calc(var(--size-element-lg) - 8px)',
      },
      selected: {
        boxShadow: 'none',
      },
    },

    switch: {
      base: {
        '--color-background-gray': 'var(--color-border-emphasized)',
      },
    },

    'progress-bar': {
      base: {
        '--color-background-muted': 'var(--color-border-emphasized)',
      },
    },

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

    // Heading and text component overrides are auto-generated by typography.scale.
    // h3/h4 bold weights come from typography.heading.weights above.
  },

  icons: neutralIconRegistry,
});
