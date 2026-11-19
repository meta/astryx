// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Carousel.a11y.renders.tsx
 * @input Uses Carousel and the binding state ids
 * @output Stable component renders shared by jsdom and Storybook
 * @position Checked-in reproduction seam for the Carousel accessibility contract.
 */

import type {ReactElement} from 'react';
import {Carousel} from '../Carousel';
import type {CarouselBindingRow} from './Carousel.a11y.states';

function CarouselFixture() {
  return (
    <Carousel
      data-testid="carousel-a11y"
      hasLoop
      hasSnap
      aria-label="Featured work"
      style={{width: 240}}>
      {['One', 'Two', 'Three', 'Four'].map(label => (
        <div key={label} style={{width: 180, minWidth: 180, height: 80}}>
          {label}
        </div>
      ))}
    </Carousel>
  );
}

export const CAROUSEL_STATE_RENDERS: Readonly<
  Record<CarouselBindingRow['id'], () => ReactElement>
> = {
  'container-labelled': () => <CarouselFixture />,
  'slide-visible': () => <CarouselFixture />,
  'slide-offscreen': () => <CarouselFixture />,
  'scroller-keyboard': () => <CarouselFixture />,
  'next-control-focus': () => <CarouselFixture />,
};
