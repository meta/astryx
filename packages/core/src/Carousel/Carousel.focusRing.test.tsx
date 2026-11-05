// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Carousel.focusRing.test.tsx
 * @input Uses Carousel and focusOutlineStyles
 * @output Tests that the Carousel root paints its scroller's shared focus ring
 * @position Colocated test; the painted ring is checked in
 *   CarouselFocusRing.a11y.chromium.spec.ts
 *
 * jsdom does not match `:focus-visible` or paint, so this pins the
 * composition the root's first-child ring needs: the scroller is the root's
 * first child, and it paints no ring of its own, because its edge-fade mask
 * would erase it.
 */

import * as stylex from '@stylexjs/stylex';
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {Carousel} from './Carousel';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';

const atoms = (className: string | undefined) =>
  (className ?? '').split(' ').filter(c => c !== '' && !c.includes('__'));

describe("Carousel: the root paints the scroller's shared focus ring", () => {
  it("keeps the scroller as the root's first child, with no ring of its own", () => {
    render(
      <Carousel aria-label="Photos">
        <div>One</div>
        <div>Two</div>
      </Carousel>,
    );
    const root = screen.getByRole('region', {name: 'Photos'});
    const scroller = root.querySelector('.astryx-carousel-scroller');
    expect(scroller).not.toBeNull();
    expect(root.firstElementChild).toBe(scroller);
    for (const c of atoms(
      stylex.props(focusOutlineStyles.suppressed).className,
    )) {
      expect(scroller!.className.split(' ')).toContain(c);
    }
  });
});
