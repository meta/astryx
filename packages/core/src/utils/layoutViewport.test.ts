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
 *   visual viewport. At a scale of 1 it keeps the root's client height while
 *   Safari pans and shrinks innerHeight to the visual viewport. It follows a
 *   true shrink, and ignores a root wider than the visual viewport.
 * @position Unit tests for utils/layoutViewport.ts
 */

import {describe, expect, it} from 'vitest';
import {layoutViewportHeight} from './layoutViewport';

function windowWith({
  innerHeight,
  innerWidth,
  viewport,
  rootHeight = innerHeight,
  rootWidth = innerWidth,
}: {
  innerHeight: number;
  innerWidth: number;
  viewport: {width: number; height: number; scale: number} | null;
  rootHeight?: number;
  rootWidth?: number;
}): Window {
  // A root with no horizontal scrollbar, as wide and as tall as the window
  // unless a case says otherwise.
  const documentElement = {
    clientHeight: rootHeight,
    clientWidth: rootWidth,
    scrollWidth: rootWidth,
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
      rootHeight: 714,
    });
    expect(layoutViewportHeight(win)).toBe(666);
  });

  it('keeps a zoomed-out page\u2019s height in the units of its scaled innerHeight', () => {
    // Safari on iOS with no width=device-width viewport: a 980 px layout
    // viewport at a scale of 402 / 980, and no keyboard. The root's client
    // height is in unscaled px, so it is no floor here.
    const scale = 402 / 980;
    const win = windowWith({
      innerHeight: 1741,
      innerWidth: 980,
      viewport: {width: 980, height: 1741, scale},
      rootHeight: 1741,
    });
    expect(layoutViewportHeight(win)).toBeCloseTo(1741 * scale);
  });

  it('keeps the root\u2019s height while Safari pans the page to a focused field', () => {
    // Safari on iOS 26.2 with the keyboard up: innerHeight follows the
    // visual viewport while it pans, and the root's client height does not.
    const win = windowWith({
      innerHeight: 377,
      innerWidth: 402,
      viewport: {width: 402, height: 377, scale: 1},
      rootHeight: 714,
    });
    expect(layoutViewportHeight(win)).toBe(714);
  });

  it('keeps innerHeight where the layout is wider than the screen at a scale of 1', () => {
    // A width=1024 page at initial-scale=1 in a 412 × 839 viewport, with no
    // keyboard: the root spans the whole 1024 px layout, and its height too.
    const win = windowWith({
      innerHeight: 839,
      innerWidth: 412,
      viewport: {width: 412, height: 839, scale: 1},
      rootHeight: 2085,
      rootWidth: 1024,
    });
    expect(layoutViewportHeight(win)).toBe(839);
  });

  it('follows a layout viewport that truly shrinks for the keyboard, as under resizes-content', () => {
    // Chrome under interactive-widget=resizes-content: innerHeight and the
    // root shrink together.
    const win = windowWith({
      innerHeight: 377,
      innerWidth: 402,
      viewport: {width: 402, height: 377, scale: 1},
      rootHeight: 377,
    });
    expect(layoutViewportHeight(win)).toBe(377);
  });

  it('keeps innerHeight where it is taller than the root, as in Chrome on Android with its toolbar hidden', () => {
    const win = windowWith({
      innerHeight: 760,
      innerWidth: 412,
      viewport: {width: 412, height: 760, scale: 1},
      rootHeight: 704,
    });
    expect(layoutViewportHeight(win)).toBe(760);
  });

  it('is innerHeight without a visual viewport', () => {
    const win = windowWith({innerHeight: 714, innerWidth: 402, viewport: null});
    expect(layoutViewportHeight(win)).toBe(714);
  });
});
