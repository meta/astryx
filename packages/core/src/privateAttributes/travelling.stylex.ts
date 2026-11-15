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
 * Each row's latest mark, so the end of an earlier slide leaves a later
 * mark in place.
 */
const marks = new WeakMap<Element, object>();

/**
 * Marks `row` as sliding across rows that move the other way. Returns the
 * call that removes the mark when the slide ends. A later mark on the row
 * stays when that call runs.
 */
export function markTravelling(row: Element): () => void {
  const mark = {};
  marks.set(row, mark);
  row.setAttribute(TRAVELLING, '');
  return () => {
    if (marks.get(row) === mark) {
      marks.delete(row);
      row.removeAttribute(TRAVELLING);
    }
  };
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
    // A row of a List with dividers takes its shadow from the press layer's
    // `overDividers`, composed later, which wins over the one above. So the
    // surface is also a custom property, which `overDividers` adds to its own
    // shadows. Every other row resets it, so a row inside a travelling row
    // does not inherit it.
    '--_travelling-surface': {
      default: null,
      '[data-astryx-travelling]:not([aria-selected="true"],[aria-current="true"])': `inset 0 0 0 100vmax ${colorVars['--color-background-surface']}`,
      ':not([data-astryx-travelling]:not([aria-selected="true"],[aria-current="true"]))':
        'initial',
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
