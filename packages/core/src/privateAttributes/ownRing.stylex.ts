// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/ownRing.stylex.ts
 * @input The focus tokens (theme/tokens.stylex.ts)
 * @output ownRingProps, which marks a control that rings itself;
 *   ownRingUnlessDimmedProps, which marks a control that rings itself but
 *   still takes a disabled row's ring; ownRingHiddenProps, which marks
 *   content hidden from sight; and ownRingContainerStyles: a row's
 *   focus-within ring, which leaves a marked control alone
 * @position Owner module of the private own-ring attribute: the only file
 *   that writes its name. ListReorderHandle and Button mark themselves, and
 *   VisuallyHidden marks its content. A reorderable List row and an Item row
 *   that delegates to a nested control take the container ring. No package
 *   entry exports it.
 *
 * SYNC: When modified, keep the ring equal to utils/focusOutline.stylex.ts's
 * focus outline.
 */

import * as stylex from '@stylexjs/stylex';
import {focusVars} from '../theme/tokens.stylex';

/**
 * A focused descendant that is not a control ringing itself, or a focused
 * descendant of hidden content, where no ring can show. A disabled row also
 * rings for a focused Button, because the row dims its end slot, and with it
 * the ring of a Button there.
 */
const OTHER_FOCUS =
  ':is(:has(:focus-visible:not([data-astryx-own-ring]), [data-astryx-own-ring="hidden"] :focus-visible), [aria-disabled="true"]:has([data-astryx-own-ring="unless-dimmed"]:focus-visible))';

/** Spread on a control that rings itself, such as a List row's reorder handle. */
export const ownRingProps: Readonly<Record<string, string>> = {
  'data-astryx-own-ring': '',
};

/**
 * Spread on a control that rings itself but still takes a disabled row's
 * ring, such as a Button. A disabled row dims its end slot, and the ring of a
 * control there.
 */
export const ownRingUnlessDimmedProps: Readonly<Record<string, string>> = {
  'data-astryx-own-ring': 'unless-dimmed',
};

/**
 * Spread on content hidden from sight. A control inside it cannot show its own
 * ring, so the container rings for it.
 */
export const ownRingHiddenProps: Readonly<Record<string, string>> = {
  'data-astryx-own-ring': 'hidden',
};

/**
 * A container that rings itself on focus within. A focused descendant marked
 * `data-astryx-own-ring` is left alone: a control that rings itself, such as
 * a Button or a List row's reorder handle. Without it the two rings stack for
 * one tab stop. Inside hidden content the container rings for such a control
 * too, because its own ring cannot show. A disabled container also rings for
 * a Button, but not for the reorder handle.
 * An ancestor that clips its inline overflow (List) also cuts the container's
 * ring to two lines.
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
