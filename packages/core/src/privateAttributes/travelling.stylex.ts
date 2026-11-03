// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/travelling.stylex.ts
 * @input StyleX and the surface color token
 * @output `travellingStyles` for a List row that slides across other rows,
 *   and markTravelling, which marks the row for the length of its slide
 * @position Owner module of the private travelling attribute: the only file
 *   that writes its name. List/listLayoutUpdates.ts marks a row, and ListItem
 *   composes the styles. No package entry exports it.
 */

import * as stylex from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';

const TRAVELLING = 'data-astryx-travelling';

/**
 * Marks `row` as sliding across rows that move the other way. Returns the
 * call that removes the mark when the slide ends.
 */
export function markTravelling(row: Element): () => void {
  row.setAttribute(TRAVELLING, '');
  return () => row.removeAttribute(TRAVELLING);
}

export const travellingStyles = stylex.create({
  // A row that slides across rows moving the other way rides above them, with
  // the surface behind it, for the length of its slide. A UIKit cell passes
  // its neighbors opaque and on top, and these rows have no background of
  // their own. The surface is an inset shadow across the padding box, under
  // the press and the row's content, so the divider and the press stay
  // visible. A selected row keeps its own fill. It takes no pseudo-element,
  // since under a finger the row's `::after` is its hit layer. Its z-index, 2,
  // is above a swipeable row's raise under a finger (1), so it rides above
  // the swipeable rows it crosses.
  row: {
    zIndex: {
      default: null,
      '[data-astryx-travelling]': 2,
    },
    boxShadow: {
      default: null,
      '[data-astryx-travelling]:not([aria-selected="true"],[aria-current="true"])': `inset 0 0 0 100vmax ${colorVars['--color-background-surface']}`,
    },
  },
  // A swipeable row is a stacking context at rest, since Item translates its
  // swipe root. So its band's own z-index orders only inside it. Under a
  // finger the row itself rises above the rows after it, whose boxes its band
  // reaches into. The list isolates, so the row stays below a sticky header.
  // StyleX keeps one zIndex per element, so this style also carries the
  // travelling raise. Compose it after `row`.
  raisedSwipeRow: {
    zIndex: {
      default: null,
      '[data-astryx-travelling]': 2,
      '@media (pointer: coarse)': {
        default: 1,
        '[data-astryx-travelling]': 2,
      },
    },
  },
});
