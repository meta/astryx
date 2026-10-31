// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file releaseMotion.test.ts
 * @input vitest, jsdom and readReleaseMotion
 * @output Which timing a sheet's release runs on: UIKit's under a finger,
 *   the stylesheet's transform transition under a mouse or a finger on
 *   Android (lists, keywords, transitions turned off, unreadable values);
 *   the theme curve's values
 * @position Testing; validates releaseMotion.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {readReleaseMotion} from './releaseMotion';

/** A finger or a mouse; with `ios`, in WebKit on iOS (which changes nothing: one touch model). */
function pointer(coarse: boolean, {ios = false}: {ios?: boolean} = {}) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: coarse && query.includes('pointer: coarse'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal('CSS', {
    supports: (condition: string) =>
      ios && condition.includes('-webkit-touch-callout'),
  });
}

const THEME = {
  transitionProperty: 'transform',
  transitionDuration: '410ms',
  transitionTimingFunction: 'cubic-bezier(0.24, 1, 0.4, 1)',
};

function sheet(style: Partial<CSSStyleDeclaration>): HTMLElement {
  const element = document.createElement('div');
  Object.assign(element.style, style);
  return element;
}

beforeEach(() => pointer(false));
afterEach(() => vi.unstubAllGlobals());

describe('readReleaseMotion', () => {
  it('runs on UIKit springs under a finger', () => {
    pointer(true, {ios: true});
    expect(readReleaseMotion(sheet(THEME), 'touch')).toEqual({kind: 'uikit'});
  });

  it('runs on UIKit springs under a finger on Android too (one touch model)', () => {
    pointer(true);
    expect(readReleaseMotion(sheet(THEME), 'touch')).toEqual({kind: 'uikit'});
  });

  it('runs on UIKit springs under a pen where the primary pointer is coarse', () => {
    pointer(true, {ios: true});
    expect(readReleaseMotion(sheet(THEME), 'pen')).toEqual({kind: 'uikit'});
  });

  it('keeps the theme timing under a mouse where the primary pointer is coarse (spec:AST-094 FR13)', () => {
    pointer(true, {ios: true});
    expect(readReleaseMotion(sheet(THEME), 'mouse')).toMatchObject({
      kind: 'theme',
    });
  });

  it('keeps the theme timing under a finger where the primary pointer is fine (spec:AST-094 FR13)', () => {
    pointer(false);
    expect(readReleaseMotion(sheet(THEME), 'touch')).toMatchObject({
      kind: 'theme',
    });
  });

  it("keeps the theme timing under a mouse, in WebKit on iOS's engine too", () => {
    pointer(false, {ios: true});
    expect(matchMedia('(pointer: coarse)').matches).toBe(false);
    expect(readReleaseMotion(sheet(THEME), 'mouse')).toMatchObject({
      kind: 'theme',
    });
  });

  it('reads the transform transition under a mouse, from a list', () => {
    expect(matchMedia('(pointer: coarse)').matches).toBe(false);
    const motion = readReleaseMotion(
      sheet({
        transitionProperty: 'opacity, transform',
        transitionDuration: '0.2s, 0.41s',
        transitionDelay: '0s, 0s',
        transitionTimingFunction: 'linear, cubic-bezier(0.24, 1, 0.4, 1)',
      }),
      'mouse',
    );
    expect(motion.kind).toBe('theme');
    if (motion.kind === 'theme') {
      expect(motion.durationMs).toBeCloseTo(410, 6);
      expect(motion.easing(0.5)).toBeGreaterThan(0.9); // a fast-out curve
    }
  });

  it('understands the CSS keywords', () => {
    const motion = readReleaseMotion(
      sheet({
        transitionProperty: 'all',
        transitionDuration: '300ms',
        transitionTimingFunction: 'ease-in',
      }),
      'mouse',
    );
    expect(motion.kind === 'theme' && motion.easing(0.5)).toBeCloseTo(0.315, 2);
  });

  it('does not animate when transitions are off', () => {
    const motion = readReleaseMotion(
      sheet({transitionProperty: 'none'}),
      'mouse',
    );
    expect(motion).toMatchObject({kind: 'theme', durationMs: 0});
    const notTransform = readReleaseMotion(
      sheet({transitionProperty: 'opacity', transitionDuration: '1s'}),
      'mouse',
    );
    expect(notTransform).toMatchObject({kind: 'theme', durationMs: 0});
  });

  it('plays an unreadable easing linearly, and settles at once without an element', () => {
    const motion = readReleaseMotion(
      sheet({
        transitionProperty: 'transform',
        transitionDuration: '410ms',
        transitionTimingFunction: 'steps(4, end)',
      }),
      'mouse',
    );
    expect(motion).toMatchObject({kind: 'theme', durationMs: 410});
    expect(motion.kind === 'theme' && motion.easing(0.3)).toBeCloseTo(0.3, 9);
    expect(readReleaseMotion(null, 'mouse')).toMatchObject({
      kind: 'theme',
      durationMs: 0,
    });
  });
});
