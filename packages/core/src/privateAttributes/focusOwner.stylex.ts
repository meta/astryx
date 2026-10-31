// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/focusOwner.stylex.ts
 * @input focus ring tokens
 * @output focusWithinOwner, the ring a wrapper draws only while its primary
 *   control has keyboard focus, and focusOwnerProps / focusOwnerGroupProps,
 *   which mark that control (and, where layout puts it one level down, the
 *   cell holding it)
 * @position Owner module of the private focus-owner attribute
 *   (`architecture:public-component-api` INV23): the only file that writes
 *   its name or its selector. Core wrappers spread these exports
 *   (`architecture:interaction-modality` INV3). No package entry exports it.
 */

import * as stylex from '@stylexjs/stylex';
import {focusVars} from '../theme/tokens.stylex';

/** Spread on the wrapper's primary control: the control the ring is for. */
export const focusOwnerProps = {'data-astryx-focus-owner': ''} as const;

/**
 * Spread on a layout cell that holds the primary control one level down
 * (Item's content cell beside a list marker), so the wrapper's ring still
 * reaches it.
 */
export const focusOwnerGroupProps = {
  'data-astryx-focus-owner-group': '',
} as const;

// Rings only for the wrapper's own marked control, a direct child or one level
// down inside a marked group, so every other control inside rings itself and a
// nested component's owner never rings this wrapper. Every condition of each
// property, rest state included, is here: a caller spreading this style does
// not set these properties again on the same element. Written as longhands,
// like focusOutlineStyles, so a base style cannot erase them through `outline`.
const styles = stylex.create({
  focusWithinOwner: {
    outlineWidth: {
      default: '0',
      ':has(> [data-astryx-focus-owner]:focus-visible, > [data-astryx-focus-owner-group] > [data-astryx-focus-owner]:focus-visible)':
        focusVars['--focus-outline-width'],
    },
    outlineStyle: {
      default: 'none',
      ':has(> [data-astryx-focus-owner]:focus-visible, > [data-astryx-focus-owner-group] > [data-astryx-focus-owner]:focus-visible)':
        focusVars['--focus-outline-style'],
    },
    outlineColor: {
      default: null,
      ':has(> [data-astryx-focus-owner]:focus-visible, > [data-astryx-focus-owner-group] > [data-astryx-focus-owner]:focus-visible)':
        focusVars['--focus-outline-color'],
    },
    outlineOffset: {
      default: '0',
      ':has(> [data-astryx-focus-owner]:focus-visible, > [data-astryx-focus-owner-group] > [data-astryx-focus-owner]:focus-visible)':
        focusVars['--focus-outline-offset'],
    },
  },
});

/** The wrapper's ring. Spread it first; caller styles that follow keep it. */
export const focusWithinOwner = styles.focusWithinOwner;
