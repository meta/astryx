// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/focusOwner.stylex.ts
 * @input focus ring tokens
 * @output focusWithinOwner, the ring a wrapper draws only while its primary
 *   control has keyboard focus, and focusOwnerProps, which mark that control
 * @position Owner module of the private focus-owner attribute: the only file
 *   that writes its name or its selector. Core wrappers spread these exports.
 *   No package entry exports it.
 */

import * as stylex from '@stylexjs/stylex';
import {focusVars} from '../theme/tokens.stylex';

/** Spread on the wrapper's primary control: the control the ring is for. */
export const focusOwnerProps = {'data-astryx-focus-owner': ''} as const;

// Rings only for the wrapper's own marked control, a direct child, so every
// other control inside rings itself and a nested component's owner never rings
// this wrapper. Every condition of each
// property, rest state included, is here: a caller spreading this style does
// not set these properties again on the same element. Written as longhands,
// like focusOutlineStyles, so a base style cannot erase them through `outline`.
const styles = stylex.create({
  focusWithinOwner: {
    outlineWidth: {
      default: '0',
      ':has(> [data-astryx-focus-owner]:focus-visible)':
        focusVars['--focus-outline-width'],
    },
    outlineStyle: {
      default: 'none',
      ':has(> [data-astryx-focus-owner]:focus-visible)':
        focusVars['--focus-outline-style'],
    },
    outlineColor: {
      default: null,
      ':has(> [data-astryx-focus-owner]:focus-visible)':
        focusVars['--focus-outline-color'],
    },
    outlineOffset: {
      default: '0',
      ':has(> [data-astryx-focus-owner]:focus-visible)':
        focusVars['--focus-outline-offset'],
    },
  },
  // The same ring, drawn as an overlay pseudo-element above the wrapper's
  // content and inset by the ring's width, for a marked control whose own
  // painting would cover a ring on the wrapper: a scroller with an edge-fade
  // mask is its own stacking context. The wrapper must be positioned and must
  // not use ::after.
  focusWithinOwnerOverlay: {
    '::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      borderRadius: 'inherit',
      outlineWidth: {
        default: null,
        ':has(> [data-astryx-focus-owner]:focus-visible)':
          focusVars['--focus-outline-width'],
      },
      outlineStyle: {
        default: 'none',
        ':has(> [data-astryx-focus-owner]:focus-visible)':
          focusVars['--focus-outline-style'],
      },
      outlineColor: {
        default: null,
        ':has(> [data-astryx-focus-owner]:focus-visible)':
          focusVars['--focus-outline-color'],
      },
      outlineOffset: {
        default: null,
        ':has(> [data-astryx-focus-owner]:focus-visible)': `calc(-1 * ${focusVars['--focus-outline-width']})`,
      },
    },
  },
});

/** The wrapper's focus ring. */
export const focusWithinOwner = styles.focusWithinOwner;

/** The wrapper's focus ring, drawn above the wrapper's content. */
export const focusWithinOwnerOverlay = styles.focusWithinOwnerOverlay;
