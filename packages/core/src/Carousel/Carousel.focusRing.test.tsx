// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Carousel.focusRing.test.tsx
 * @input Uses Carousel and the inset focus-ring test helper
 * @output Tests that the scroller draws the shared focus ring, inset so the
 *   root's clip does not cut it
 * @position Colocated test; the ring's geometry is checked in a real browser
 */

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {Carousel} from './Carousel';
import {expectInsetSharedFocusRing} from '../__tests__/insetFocusRing';

describe('Carousel: the scroller draws the shared focus ring', () => {
  it('inset inside the clipped root', () => {
    render(
      <Carousel aria-label="Photos">
        <div>One</div>
        <div>Two</div>
      </Carousel>,
    );
    const scroller = screen
      .getByRole('region', {name: 'Photos'})
      .querySelector('.astryx-carousel-scroller');
    expect(scroller).not.toBeNull();
    expectInsetSharedFocusRing(scroller!);
  });
});
