// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/reducedMotion.test.tsx
 * @input vitest (jsdom), reducedMotion.stylex.ts, motion/reducedMotion.ts
 * @output Checks that `themeReducesMotion` reads the reduced-motion mark on an
 *   element, an ancestor, or `<html>`, and that `reducedMotionFade` counts the
 *   mark as the person's Reduce Motion setting
 * @position Testing; validates the owner module's reader and its use in
 *   motion/reducedMotion.ts
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {reducedMotionFade} from '../motion/reducedMotion';
import {timing} from '../motion/uikit/timing';
import {themeReducesMotion} from './reducedMotion.stylex';

const MARK = 'data-astryx-reduced-motion';

/** The person's settings: Reduce Motion off. */
function settings(coarse: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('pointer: coarse') ? coarse : false,
    media: query,
  }));
}

function inTheme(marked: boolean) {
  const theme = document.createElement('div');
  if (marked) {
    theme.setAttribute(MARK, '');
  }
  const element = document.createElement('span');
  theme.append(element);
  document.body.append(theme);
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute(MARK);
  vi.unstubAllGlobals();
});

describe('themeReducesMotion', () => {
  it('reads the mark on an ancestor', () => {
    expect(themeReducesMotion(inTheme(true))).toBe(true);
    expect(themeReducesMotion(inTheme(false))).toBe(false);
  });

  it('reads the mark on <html>, for a layer portaled outside the theme', () => {
    const layer = document.createElement('div');
    document.body.append(layer);
    expect(themeReducesMotion(layer)).toBe(false);
    document.documentElement.setAttribute(MARK, '');
    expect(themeReducesMotion(layer)).toBe(true);
  });

  it('is false without an element', () => {
    expect(themeReducesMotion(null)).toBe(false);
    expect(themeReducesMotion(undefined)).toBe(false);
  });
});

describe('reducedMotionFade under the mark', () => {
  it('counts the mark as the setting', () => {
    settings(true);
    expect(reducedMotionFade(inTheme(false))).toBeNull();
    expect(reducedMotionFade(inTheme(true))?.duration).toBe(
      timing.reducedMotionCrossFadeMs,
    );
  });

  it('completes at once on a fine pointer', () => {
    settings(false);
    expect(reducedMotionFade(inTheme(true))).toEqual({
      duration: 0,
      easing: 'linear',
    });
  });
});
