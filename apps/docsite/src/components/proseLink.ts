// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file proseLink.ts
 * @input none
 * @output Shared StyleX partials for the docsite's inline prose-link treatment.
 * @position Single source of truth for how an inline link looks in docs prose.
 *   Consumed by docs/inlineMarkdown.tsx, InlineCode.tsx, MarkdownText.tsx, and
 *   component-detail/TypeRefText.tsx. Change link styling here, not at the
 *   call sites.
 *
 * The treatment: an always-visible 1px accent underline that thickens to 2px
 * on hover, with the color stepping from --color-text-accent to --color-accent.
 * The underline is the non-color affordance WCAG 1.4.1 asks for, so it is not
 * optional at rest. Split into partials because the consumers differ: raw
 * anchors and buttons take all three, while core Link brings its own focus
 * ring and only layers the decoration and color on top via xstyle.
 */

import * as stylex from '@stylexjs/stylex';
import {colorVars, radiusVars} from '@astryxdesign/core/theme/tokens.stylex';

export const proseLinkStyles = stylex.create({
  // Decoration only — safe to layer onto core Link via xstyle.
  underline: {
    textDecorationLine: 'underline',
    textDecorationThickness: {
      default: '1px',
      ':hover': {'@media (hover: hover)': '2px'},
    },
    textUnderlineOffset: '0.16em',
    transition: 'color 120ms ease, text-decoration-color 120ms ease',
  },
  // Rest and hover color ramp. On core Link this replaces its color-mix hover
  // tint, so chips and text links shift through the same colors.
  color: {
    color: {
      default: colorVars['--color-text-accent'],
      ':hover': {'@media (hover: hover)': colorVars['--color-accent']},
    },
  },
  // For raw <a>/<button> only. Core Link draws its own ring through
  // focusOutlineProps — never apply this partial to it.
  focusRing: {
    ':focus-visible': {
      borderRadius: radiusVars['--radius-inner'],
      outline: `2px solid ${colorVars['--color-accent']}`,
      outlineOffset: 2,
    },
  },
  // Chip labels only: nudges the underline clear of descenders in commands
  // like `astryx docs typography`, which sit lower inside a padded chip.
  chipOffset: {textUnderlineOffset: '0.2em'},
});
