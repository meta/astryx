// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file insetFocusRing.ts
 * @input Uses StyleX, focusOutlineStyles, focusVars
 * @output Test helpers asserting an element composes the shared focus ring,
 *   either as is or inset by its own width (for a tab stop that sits flush
 *   against a clipping ancestor)
 * @position Shared test utility for focus-ring composition checks
 *
 * jsdom does not match `:focus-visible`, so these pin the composition: the
 * element carries the atomic classes the ring compiles to. The geometry is
 * checked in a real browser.
 */

import * as stylex from '@stylexjs/stylex';
import {expect} from 'vitest';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {focusVars} from '../theme/tokens.stylex';

const inset = stylex.create({
  ring: {
    outlineOffset: {
      default: null,
      ':focus-visible': `calc(-1 * ${focusVars['--focus-outline-width']})`,
    },
  },
});

// Debug class names name their source file; only the atoms matter.
const atoms = (className: string | undefined) =>
  (className ?? '').split(' ').filter(c => c !== '' && !c.includes('__'));

const sharedRing = atoms(
  stylex.props(focusOutlineStyles.focusVisible).className,
);
const insetRing = atoms(
  stylex.props(focusOutlineStyles.focusVisible, inset.ring).className,
);

/** The element draws the shared ring at the token offset. */
export function expectSharedFocusRing(el: Element): void {
  const classes = el.className.split(' ');
  for (const c of sharedRing) {
    expect(classes).toContain(c);
  }
}

/** The element draws the shared ring inset by the ring's own width. */
export function expectInsetSharedFocusRing(el: Element): void {
  const classes = el.className.split(' ');
  for (const c of insetRing) {
    expect(classes).toContain(c);
  }
}
