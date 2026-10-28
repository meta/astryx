// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themeTiming.test.ts
 * @input vitest (jsdom), readThemeTiming and easedProgress, the theme's
 *   duration and easing defaults
 * @output Checks how a motion reads its theme tokens. Covers a set value, an
 *   explicit zero, an empty or unparseable value, the fallback chain, the
 *   progress velocity and easedProgress's curve.
 * @position Testing; validates themeTiming.ts
 */

import {afterEach, describe, expect, it} from 'vitest';
import {cubicBezier} from './bezier';
import {parseCssEasing} from './roles';
import {
  easedProgress,
  readThemeTiming,
  type ThemeTimingTokens,
} from './themeTiming';
import {easeDefaults} from '../theme/tokens.stylex';

const EXIT: ThemeTimingTokens = {
  durations: ['--duration-exit', '--duration-fast'],
  easing: '--ease-exit',
};

const exitEase = cubicBezier(parseCssEasing(easeDefaults['--ease-exit'])!);

function element(tokens: Record<string, string> = {}): HTMLElement {
  const node = document.createElement('div');
  for (const [name, value] of Object.entries(tokens)) {
    node.style.setProperty(name, value);
  }
  document.body.appendChild(node);
  return node;
}

describe('readThemeTiming', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('plays the last token\u2019s default duration and the easing default when no token is set', () => {
    const timing = readThemeTiming(element(), EXIT);
    expect(timing.duration).toBeCloseTo(0.175, 6);
    expect(timing.at(0.0875)).toBeCloseTo(exitEase(0.5), 6);
    expect(timing.at(0.175)).toBe(1);
  });

  it('plays the first set token of the chain, in ms or s, with its easing', () => {
    const exit = readThemeTiming(
      element({
        '--duration-exit': '0.3s',
        '--duration-fast': '100ms',
        '--ease-exit': 'linear',
      }),
      EXIT,
    );
    expect(exit.duration).toBeCloseTo(0.3, 6);
    expect(exit.at(0.15)).toBeCloseTo(0.5, 6);
    const fast = readThemeTiming(element({'--duration-fast': '250ms'}), EXIT);
    expect(fast.duration).toBeCloseTo(0.25, 6);
  });

  it('gives the progress velocity per second, and none once the motion ends', () => {
    const timing = readThemeTiming(
      element({'--duration-exit': '0.3s', '--ease-exit': 'linear'}),
      EXIT,
    );
    expect(timing.velocity(0)).toBeCloseTo(1 / 0.3, 4);
    expect(timing.velocity(0.15)).toBeCloseTo(1 / 0.3, 4);
    expect(timing.velocity(0.3)).toBe(0);
    const eased = readThemeTiming(element(), EXIT);
    const t = 0.05;
    const h = 1e-6;
    expect(eased.velocity(t)).toBeCloseTo(
      (eased.at(t + h) - eased.at(t - h)) / (2 * h),
      3,
    );
  });

  it('an explicit zero duration means no motion', () => {
    const timing = readThemeTiming(
      element({'--duration-exit': '0ms', '--duration-fast': '250ms'}),
      EXIT,
    );
    expect(timing.duration).toBe(0);
    expect(timing.at(0)).toBe(1);
    expect(timing.velocity(0)).toBe(0);
  });

  it('an empty duration falls back down the chain', () => {
    const timing = readThemeTiming(
      element({'--duration-exit': ' ', '--duration-fast': '250ms'}),
      EXIT,
    );
    expect(timing.duration).toBeCloseTo(0.25, 6);
  });

  it('an unparseable duration falls back down the chain, and never means no motion', () => {
    const next = readThemeTiming(
      element({'--duration-exit': 'fast', '--duration-fast': '250ms'}),
      EXIT,
    );
    expect(next.duration).toBeCloseTo(0.25, 6);
    const last = readThemeTiming(
      element({'--duration-exit': '-1ms', '--duration-fast': 'calc(1s)'}),
      EXIT,
    );
    expect(last.duration).toBeCloseTo(0.175, 6);
  });

  it('an unparseable easing gets its default', () => {
    const timing = readThemeTiming(
      element({'--duration-exit': '200ms', '--ease-exit': 'steps(4)'}),
      EXIT,
    );
    expect(timing.at(0.1)).toBeCloseTo(exitEase(0.5), 6);
  });
});

describe('easedProgress', () => {
  it('eases from 0 to 1 over its length, and a zero length means no motion', () => {
    const curve = easedProgress(0.2, x => x * x);
    expect(curve.duration).toBe(0.2);
    expect(curve.at(0)).toBe(0);
    expect(curve.at(0.1)).toBeCloseTo(0.25, 6);
    expect(curve.at(0.2)).toBe(1);
    expect(curve.velocity(0.1)).toBeCloseTo(5, 3);
    expect(curve.velocity(0.2)).toBe(0);
    const none = easedProgress(0, x => x);
    expect(none.at(0)).toBe(1);
    expect(none.velocity(0)).toBe(0);
  });
});
