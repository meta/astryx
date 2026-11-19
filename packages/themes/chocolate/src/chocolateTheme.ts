// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Chocolate Theme
 *
 * A warm, cozy theme inspired by rich chocolate and caramel tones.
 * Core palette: #8C5927, #B88859, #C4AC95, #EDE4D4, #FFFCF7
 * Uses Fraunces for headings and Albert Sans for body text.
 */

import {defineTheme, defineSyntaxTheme} from '@astryxdesign/core/theme';
import {chocolateIconRegistry} from './icons';

/**
 * Comments and operators in light code: stop 45 of the astryx-oklch-v1 ramp
 * grown from #B88859 (anchored at its own stop, 60), the nearest stop that
 * reads at 4.5:1 on the code background and on the page.
 */
const CODE_BROWN = '#955c26';

/** Chocolate syntax palette — warm browns and amber tones. */
const chocolateSyntax = defineSyntaxTheme({
  name: 'astryx-chocolate',
  tokens: {
    keyword: ['#8C5927', '#d4a06a'],
    string: ['#2e6b4a', '#7bc49e'],
    comment: [CODE_BROWN, '#B88859'],
    number: ['#a06018', '#d4b870'],
    function: ['#3a5e8c', '#7ba8d4'],
    type: ['#6b4a8c', '#b08ed4'],
    variable: ['#4a3520', '#EDE4D4'],
    operator: [CODE_BROWN, '#c4a882'],
    constant: ['#a06018', '#d4b870'],
    tag: ['#8c3a3a', '#d47a7a'],
    attribute: ['#8C5927', '#d4a06a'],
    property: ['#3a7c6b', '#70c4b0'],
    // #B88859/#6b5540 failed WCAG AA against the syntax background: 3.06:1
    // light, 2.56:1 dark. #5386.
    punctuation: ['#9e622e', '#cb884d'], // 4.84:1 / 6.12:1
    background: ['#FFFCF7', '#1c1610'],
  },
});

/**
 * The secondary Button treatment. Selector, MultiSelector, and ComplexSelector
 * reuse it for their `secondary` trigger so every secondary control in this
 * theme matches (AST-079 FR2).
 */
const SECONDARY_BUTTON = {
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--color-border-emphasized)',
} as const;

/**
 * The secondary Button treatment on Selector and MultiSelector triggers
 * (AST-079 FR2). Inside an InputGroup a trigger keeps the neutral fill and the
 * group's edges instead (FR6).
 */
const SECONDARY_SELECTOR = {
  ':not(.astryx-input-group *)': {
    borderWidth: SECONDARY_BUTTON.borderWidth,
    borderStyle: SECONDARY_BUTTON.borderStyle,
    borderColor: SECONDARY_BUTTON.borderColor,
  },
} as const;

/**
 * Secondary text on a coloured card, where a selected row or a numbered
 * citation adds the accent tint: light is stop 35 of the astryx-oklch-v1 ramp
 * grown from #B88859 (anchored at its own stop, 60), one stop deeper than the
 * page's. In dark, the green and teal cards take that ramp's stop 75 and the
 * yellow card its stop 80, the nearest lighter stops that read there on the
 * page and on a surface.
 */
const SECONDARY_ON_TINT = 'light-dark(#7b4200, #c4a882)';
const SECONDARY_ON_YELLOW = 'light-dark(#894d0e, #f4ba82)';
const SECONDARY_ON_GREEN = 'light-dark(#894d0e, #e4ad77)';
const SECONDARY_ON_TEAL = 'light-dark(#7b4200, #e4ad77)';

/**
 * Link text on a cool tinted card. Light: stop 40 of the astryx-oklch-v1
 * ramp grown from the accent #8C5927 (anchored at its own stop, 45), the
 * nearest stop that reads at 4.5:1 on those cards. Dark keeps the accent.
 */
const LINK_ON_TINT = 'light-dark(#7d4e21, #d4a06a)';

export const chocolateTheme = defineTheme({
  name: 'chocolate',

  typography: {
    scale: {base: 14, ratio: 1.2},
    body: {
      family: 'Albert Sans',
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    heading: {
      family: 'Fraunces',
      fallbacks: 'Georgia, "Times New Roman", Times, serif',
      weights: {3: 'bold', 4: 'bold'},
    },
    code: {
      family: 'JetBrains Mono',
      fallbacks: '"SF Mono", Monaco, Consolas, monospace',
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

  motion: {fast: 125, medium: 300, slow: 700, ratio: 0.75},

  syntax: chocolateSyntax,

  tokens: {
    // =========================================================================
    // Colors — warm chocolate palette
    // Core: #8C5927, #B88859, #C4AC95, #EDE4D4, #FFFCF7
    // =========================================================================

    // Core semantic
    '--color-accent': ['#8C5927', '#d4a06a'],
    '--color-accent-muted': ['#8C592714', '#d4a06a20'],
    '--color-neutral': ['#8C59270F', '#EDE4D41A'],
    '--color-background-surface': ['#FFFCF7', '#1c1610'],
    '--color-background-body': ['#FFFCF7', '#141010'],
    '--color-overlay': ['#4a352080', '#140e0aCC'],
    '--color-overlay-hover': ['#4a35200D', '#EDE4D40D'],
    '--color-overlay-pressed': ['#4a35201A', '#EDE4D41A'],
    '--color-background-muted': ['#EDE4D4', '#2a2018'],

    // Text
    '--color-text-primary': ['#4a3520', '#EDE4D4'],
    // Light: stop 40 of the astryx-oklch-v1 ramp grown from #B88859 (anchored
    // at its own stop, 60), the nearest stop that reads at 4.5:1 on the page
    // and on every card.
    '--color-text-secondary': ['#894d0e', '#c4a882'],
    '--color-text-disabled': ['#C4AC95', '#6b5540'],
    '--color-text-accent': ['#8C5927', '#d4a06a'],
    '--color-on-dark': '#FFFCF7',
    '--color-on-light': '#4a3520',
    '--color-on-accent': ['#FFFFFF', '#4a3520'],
    '--color-on-success': '#141010',
    '--color-on-error': '#141010',
    '--color-on-warning': ['#4a3520', '#4a3520'],

    // Info is its own blue status, independent of the accent.
    '--color-info': ['#3a5e8c', '#7ba8d4'],
    '--color-info-muted': 'var(--color-background-blue)',

    '--color-text-info': ['#2e4a6e', '#8dbce0'],
    '--color-text-success': ['#526f00', '#a8d43a'],
    '--color-text-warning': ['#7a5500', '#ffd960'],
    '--color-text-error': ['#cc0000', '#ff7a7a'],
    '--color-on-info-muted': ['#2e4a6e', '#8dbce0'],
    '--color-on-success-muted': ['#4d6800', '#a8d43a'],
    '--color-on-warning-muted': ['#7a5500', '#ffd960'],
    '--color-on-error-muted': ['#b40000', '#ff7a7a'],

    // Icon
    '--color-icon-accent': ['#8C5927', '#d4a06a'],
    '--color-icon-primary': ['#4a3520', '#EDE4D4'],
    '--color-icon-secondary': ['#894d0e', '#c4a882'],
    '--color-icon-disabled': ['#C4AC95', '#6b5540'],

    // Surface variants
    '--color-background-card': ['#EDE4D4', '#2a2018'],
    '--color-background-popover': ['#FFFCF7', '#2a2018'],
    '--color-background-inverted': ['#4a3520', '#EDE4D4'],

    // Status / Sentiment
    '--color-success': ['#709900', '#96bf2a'],
    '--color-success-muted': ['#70990020', '#96bf2a20'],
    '--color-error': ['#FD0000', '#ff5c5c'],
    '--color-error-muted': ['#FD000020', '#ff5c5c20'],
    '--color-warning': ['#FFB600', '#ffc940'],
    '--color-warning-muted': ['#FFB60020', '#ffc94020'],

    // Border
    '--color-border': ['#C4AC95', '#EDE4D41A'],
    '--color-border-emphasized': ['#B88859', '#6b5540'],

    // Effects
    '--color-skeleton': ['#C4AC95', '#6b5540'],
    '--color-shadow': ['#4a35201A', '#0000004D'],
    '--color-tint-hover': ['black', 'white'],

    // Categorical — Blue
    '--color-background-blue': ['#3a5e8c33', '#3a5e8c33'],
    '--color-border-blue': ['#3a5e8c', '#7ba8d4'],
    '--color-icon-blue': ['#3a5e8c', '#7ba8d4'],
    '--color-text-blue': ['#2e4a6e', '#8dbce0'],

    // Categorical — Cyan
    '--color-background-cyan': ['#3a7c7c33', '#3a7c7c33'],
    '--color-border-cyan': ['#3a7c7c', '#70c4c4'],
    '--color-icon-cyan': ['#3a7c7c', '#70c4c4'],
    // Light category text reads at 4.5:1 on its tinted fill over the tan
    // card as well as the page.
    '--color-text-cyan': ['#2d5f5f', '#82d4d4'],

    // Categorical — Gray
    '--color-background-gray': ['#B8885933', '#6b554033'],
    '--color-border-gray': ['#B88859', '#B88859'],
    '--color-icon-gray': ['#B88859', '#c4a882'],
    '--color-text-gray': ['#4a3520', '#EDE4D4'],

    // Categorical — Green
    '--color-background-green': ['#70990033', '#96bf2a33'],
    '--color-border-green': ['#709900', '#96bf2a'],
    '--color-icon-green': ['#709900', '#96bf2a'],
    // Light category text (green, orange, red, yellow): each is the stop of
    // the astryx-oklch-v1 ramp grown from the earlier value (anchored at its
    // own stop) nearest it that reads at 4.5:1 on its own category fill:
    // #5a7a00 stop 40, #a06018 stop 45, #cc0000 stop 40, #cc9200 stop 45.
    '--color-text-green': ['#476300', '#a8d43a'],

    // Categorical — Orange
    '--color-background-orange': ['#c4762033', '#d4903a33'],
    '--color-border-orange': ['#c47620', '#d4903a'],
    '--color-icon-orange': ['#c47620', '#d4903a'],
    '--color-text-orange': ['#894a04', '#e0a04a'],

    // Categorical — Pink
    '--color-background-pink': ['#c44a7033', '#e07a9a33'],
    '--color-border-pink': ['#c44a70', '#e07a9a'],
    '--color-icon-pink': ['#c44a70', '#e07a9a'],
    '--color-text-pink': ['#963152', '#f08aaa'],

    // Categorical — Purple
    '--color-background-purple': ['#6b4a8c33', '#b08ed433'],
    '--color-border-purple': ['#6b4a8c', '#b08ed4'],
    '--color-icon-purple': ['#6b4a8c', '#b08ed4'],
    '--color-text-purple': ['#553a70', '#c0a0e0'],

    // Categorical — Red
    '--color-background-red': ['#FD000033', '#ff5c5c33'],
    '--color-border-red': ['#FD0000', '#ff5c5c'],
    '--color-icon-red': ['#FD0000', '#ff5c5c'],
    '--color-text-red': ['#a80000', '#ff7a7a'],

    // Categorical — Teal
    '--color-background-teal': ['#2e6b5a33', '#5ab89833'],
    '--color-border-teal': ['#2e6b5a', '#5ab898'],
    '--color-icon-teal': ['#2e6b5a', '#5ab898'],
    '--color-text-teal': ['#245546', '#6ccaaa'],

    // Categorical — Yellow
    '--color-background-yellow': ['#FFB60033', '#ffc94033'],
    '--color-border-yellow': ['#FFB600', '#ffc940'],
    '--color-icon-yellow': ['#FFB600', '#ffc940'],
    '--color-text-yellow': ['#805a00', '#ffd960'],

    // =========================================================================
    // Radius — soft and rounded
    //   --radius-none and --radius-full are always fixed and must never be
    //   scaled by a theme (see defineTheme's radius config docs) — 0 and
    //   9999px respectively, matching @astryxdesign/core's own defaults.
    // =========================================================================
    '--radius-none': '0px',
    '--radius-inner': '0.375rem',
    '--radius-element': '0.625rem',
    '--radius-container': '0.75rem',
    '--radius-page': '1.5rem',
    // Chat surfaces stay rounder than cards.
    '--radius-chat': '28px',
    '--radius-full': '9999px',

    // =========================================================================
    // Shadows — warm-toned
    // =========================================================================
    '--shadow-low': '0 2px 4px #4a35200D, 0 4px 8px #4a35201A',
    '--shadow-med': '0 2px 4px #4a35200D, 0 4px 12px #4a35201A',
    '--shadow-high': '0 4px 6px #4a35201A, 0 12px 24px #4a352026',
    '--shadow-inset-hover': 'inset 0px 0px 0px 2px #8C592730',
    '--shadow-inset-selected': 'inset 0px 0px 0px 2px #8C592750',
    '--shadow-inset-success': 'inset 0px 0px 0px 2px #70990050',
    '--shadow-inset-warning': 'inset 0px 0px 0px 2px #FFB60050',
    '--shadow-inset-error': 'inset 0px 0px 0px 2px #FD000050',
  },

  components: {
    button: {
      base: {
        borderRadius: 'var(--radius-full)',
      },
      'variant:secondary': SECONDARY_BUTTON,
    },
    // Secondary selector triggers match the secondary Button (AST-079 FR2).
    selector: {'variant:secondary': SECONDARY_SELECTOR},
    'multi-selector': {'variant:secondary': SECONDARY_SELECTOR},
    'complex-selector': {'variant:secondary': SECONDARY_BUTTON},

    // Links on the cooler tinted cards step to LINK_ON_TINT, which reads at
    // 4.5:1 on them; the warm tints already read with the accent.
    card: {
      base: {
        padding: 'var(--spacing-3)',
      },
      'variant:blue': {
        '--color-text-accent': LINK_ON_TINT,
        '--color-text-secondary': SECONDARY_ON_TINT,
      },
      'variant:cyan': {
        '--color-text-accent': LINK_ON_TINT,
      },
      'variant:pink': {
        '--color-text-accent': LINK_ON_TINT,
      },
      'variant:purple': {
        '--color-text-accent': LINK_ON_TINT,
        '--color-text-secondary': SECONDARY_ON_TINT,
      },
      'variant:red': {
        '--color-text-accent': LINK_ON_TINT,
        '--color-text-secondary': SECONDARY_ON_TINT,
      },
      'variant:teal': {
        '--color-text-accent': LINK_ON_TINT,
        '--color-text-secondary': SECONDARY_ON_TEAL,
      },
      'variant:green': {
        '--color-text-secondary': SECONDARY_ON_GREEN,
      },
      'variant:yellow': {
        '--color-text-secondary': SECONDARY_ON_YELLOW,
      },
    },

    section: {
      base: {
        padding: 'var(--spacing-3)',
      },
    },
  },

  icons: chocolateIconRegistry,
});
