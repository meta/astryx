// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ownRing.stylex.ts
 * @input The focus tokens (theme/tokens.stylex.ts)
 * @output ownRingContainerStyles: a reorderable List row's focus-within ring,
 *   which leaves a handle that rings itself alone
 * @position Internal to the List reorder: ListReorderHandle reads it, and
 *   only createReorderable's engine imports that, so a List without
 *   `reorderable` carries none of it. Not part of the package's exports
 *   (utils/focusOutline.stylex.ts is).
 *
 * SYNC: When modified, keep the ring equal to utils/focusOutline.stylex.ts's
 * focus outline.
 */

import * as stylex from '@stylexjs/stylex';
import {focusVars} from '../theme/tokens.stylex';

/** A focused descendant that is not a control ringing itself. */
const OTHER_FOCUS = ':has(:focus-visible:not([data-astryx-own-ring]))';

/**
 * A container that rings itself on focus within, except for a focused
 * descendant marked `data-astryx-own-ring`: a control that rings itself,
 * such as a List row's reorder handle. Without it the two rings stack for
 * one tab stop, and an ancestor that clips its inline overflow (List) cuts
 * the container's ring to two lines. Its own object, so the reorder that
 * uses it (List/listReorderEngine.tsx, with createReorderable) carries it
 * and a List without one does not.
 */
export const ownRingContainerStyles = stylex.create({
  focusWithin: {
    outlineWidth: {
      default: '0',
      [OTHER_FOCUS]: focusVars['--focus-outline-width'],
    },
    outlineStyle: {
      default: 'none',
      [OTHER_FOCUS]: focusVars['--focus-outline-style'],
    },
    outlineColor: {
      default: null,
      [OTHER_FOCUS]: focusVars['--focus-outline-color'],
    },
    outlineOffset: {
      default: '0',
      [OTHER_FOCUS]: focusVars['--focus-outline-offset'],
    },
  },
});
