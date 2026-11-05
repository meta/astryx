// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file focusOutline.stylex.ts
 * @input Uses the focus-outline tokens
 * @output focusOverlayStyles: the shared ring drawn as an overlay
 * @position Internal entry for Astryx's own packages: what the public
 *   utils/focusOutline.stylex does not hold
 */

import * as stylex from '@stylexjs/stylex';
import {focusVars} from '../theme/tokens.stylex';

export const focusOverlayStyles = stylex.create({
  /**
   * The shared keyboard ring for a wrapper's first child, drawn as an overlay
   * pseudo-element above the wrapper's content and inset by the ring's width.
   * It is for a primary that would cover a ring the wrapper draws itself: a
   * scroller with an edge-fade mask is its own stacking context. The wrapper
   * must be positioned and must not use `::after`. Pair it with
   * `focusOutlineStyles.suppressed` on the primary.
   */
  firstChild: {
    '::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      borderRadius: 'inherit',
      outlineWidth: focusVars['--focus-outline-width'],
      outlineColor: focusVars['--focus-outline-color'],
      outlineOffset: `calc(-1 * ${focusVars['--focus-outline-width']})`,
      outlineStyle: {
        default: 'none',
        ':has(> :first-child:focus-visible)':
          focusVars['--focus-outline-style'],
      },
    },
  },
});
