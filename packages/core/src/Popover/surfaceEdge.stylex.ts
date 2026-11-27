// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file surfaceEdge.stylex.ts
 * @input Uses StyleX and the focus-outline theme tokens
 * @output The forced-colors edge of a floating surface, kept beside its focus
 *   ring
 * @position Internal styles for the Popover, DropdownMenu sub-menu flyout and
 *   ContextMenu surfaces. No package export reaches this file.
 */

// Forced colors drop a floating surface's shadow, its only edge. The edge is
// a 1 px `CanvasText` outline inside the box, so it adds no size and a capped
// layer keeps its viewport gutters. The edge and the focus ring both use
// `outline`, so each style here also holds the ring: on keyboard focus the
// ring replaces the edge. The ring values are the shared `--focus-outline-*`
// tokens, as in `utils/focusOutline.stylex.ts`.

import * as stylex from '@stylexjs/stylex';
import {focusVars} from '../theme/tokens.stylex';

const RING_WIDTH = focusVars['--focus-outline-width'];
const RING_STYLE = focusVars['--focus-outline-style'];
const RING_COLOR = focusVars['--focus-outline-color'];
const RING_OFFSET = focusVars['--focus-outline-offset'];

export const surfaceEdgeStyles = stylex.create({
  /**
   * The shared focus ring at all times, and the edge under forced colors.
   * For a surface that draws the shared ring itself (Popover).
   */
  edgeWithFocusRing: {
    outlineWidth: {
      default: '0',
      ':focus-visible': RING_WIDTH,
      '@media (forced-colors: active)': {
        default: '1px',
        ':focus-visible': RING_WIDTH,
      },
    },
    outlineStyle: {
      default: 'none',
      ':focus-visible': RING_STYLE,
      '@media (forced-colors: active)': {
        default: 'solid',
        ':focus-visible': RING_STYLE,
      },
    },
    outlineColor: {
      default: null,
      ':focus-visible': RING_COLOR,
      '@media (forced-colors: active)': {
        default: 'CanvasText',
        ':focus-visible': RING_COLOR,
      },
    },
    outlineOffset: {
      default: '0',
      ':focus-visible': RING_OFFSET,
      '@media (forced-colors: active)': {
        default: '-1px',
        ':focus-visible': RING_OFFSET,
      },
    },
  },
  /**
   * The edge under forced colors, and the shared ring on keyboard focus
   * there. Outside forced colors it sets no outline, so the surface keeps
   * its own focus treatment. For a menu surface that takes focus itself.
   */
  edgeKeepingFocus: {
    outlineWidth: {
      default: null,
      '@media (forced-colors: active)': {
        default: '1px',
        ':focus-visible': RING_WIDTH,
      },
    },
    outlineStyle: {
      default: null,
      '@media (forced-colors: active)': {
        default: 'solid',
        ':focus-visible': RING_STYLE,
      },
    },
    outlineColor: {
      default: null,
      '@media (forced-colors: active)': {
        default: 'CanvasText',
        ':focus-visible': RING_COLOR,
      },
    },
    outlineOffset: {
      default: null,
      '@media (forced-colors: active)': {
        default: '-1px',
        ':focus-visible': RING_OFFSET,
      },
    },
  },
});
