// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layoutViewport.test.ts
 * @input vitest, a stand-in window, visual viewport and document root. The
 *   horizontal scrollbar's cases run on jsdom's window, in
 *   keyboard/keyboardHeight.test.ts.
 * @output Tests layoutViewportHeight. It is innerHeight at a scale of 1, a
 *   classic scrollbar included. The function scales it back where WebKit
 *   reports it in the zoomed visual viewport's px, as in Safari on iOS 26.2.
 *   It leaves innerHeight as is where innerHeight ignores the zoom, or with no
 *   visual viewport.
 * @position Unit tests for utils/layoutViewport.ts
 */

import {describe, expect, it} from 'vitest';
import {layoutViewportHeight} from './layoutViewport';

function windowWith({
  innerHeight,
  innerWidth,
  viewport,
}: {
  innerHeight: number;
  innerWidth: number;
  viewport: {width: number; height: number; scale: number} | null;
}): Window {
  // A root as tall and as wide as the window: no horizontal scrollbar.
  const documentElement = {
    clientHeight: innerHeight,
    clientWidth: innerWidth,
    scrollWidth: innerWidth,
  };
  return {
    innerHeight,
    innerWidth,
    visualViewport: viewport,
    document: {documentElement},
  } as unknown as Window;
}

describe('layoutViewportHeight', () => {
  it('is innerHeight at a scale of 1', () => {
    const win = windowWith({
      innerHeight: 714,
      innerWidth: 402,
      viewport: {width: 402, height: 377, scale: 1},
    });
    expect(layoutViewportHeight(win)).toBe(714);
  });

  it('is innerHeight beside a classic scrollbar, which innerWidth counts and the visual viewport does not', () => {
    // A desktop page with a 17 px vertical scrollbar: the layout viewport is
    // still innerHeight tall.
    const win = windowWith({
      innerHeight: 800,
      innerWidth: 1280,
      viewport: {width: 1263, height: 800, scale: 1},
    });
    expect(layoutViewportHeight(win)).toBe(800);
  });

  it('scales innerHeight back where WebKit reports it in the zoomed visual viewport\u2019s px', () => {
    // Safari on iOS 26.2 at a 1.33 and a 2.56 zoom of a 402 × 714 layout
    // viewport.
    const zoomed = windowWith({
      innerHeight: 536,
      innerWidth: 302,
      viewport: {width: 301.5, height: 282.75, scale: 4 / 3},
    });
    expect(Math.abs(layoutViewportHeight(zoomed) - 714)).toBeLessThan(1);
    const deep = windowWith({
      innerHeight: 279,
      innerWidth: 157,
      viewport: {width: 157.03, height: 147.3, scale: 2.56},
    });
    expect(Math.abs(layoutViewportHeight(deep) - 714)).toBeLessThan(1);
  });

  it('leaves innerHeight as it is where it ignores the zoom', () => {
    // innerWidth stays the layout width: the visual viewport's width times
    // its scale.
    const win = windowWith({
      innerHeight: 714,
      innerWidth: 402,
      viewport: {width: 201, height: 357, scale: 2},
    });
    expect(layoutViewportHeight(win)).toBe(714);
  });

  it('follows the layout viewport WebKit clamps to the document after a scroll', () => {
    const win = windowWith({
      innerHeight: 666,
      innerWidth: 402,
      viewport: {width: 402, height: 377, scale: 1},
    });
    expect(layoutViewportHeight(win)).toBe(666);
  });

  it('is innerHeight without a visual viewport', () => {
    const win = windowWith({innerHeight: 714, innerWidth: 402, viewport: null});
    expect(layoutViewportHeight(win)).toBe(714);
  });
});
