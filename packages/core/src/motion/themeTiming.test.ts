// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themeTiming.test.ts
 * @input vitest (jsdom), themeTiming's readers and easedProgress, the
 *   theme's duration and easing defaults
 * @output Checks how a motion reads its timing: from the element's own
 *   transition, and from tokens set where the element is or at their
 *   defaults. A default that refers to a token reads it there. Also checks
 *   the values that give no curve, the progress velocity and easedProgress's
 *   curve. jsdom resolves no `calc()`; the browser proof covers it.
 * @position Testing; validates themeTiming.ts
 */

import {afterEach, describe, expect, it} from 'vitest';
import {cubicBezier} from './bezier';
import {parseCssEasing} from './roles';
import {
  declaredTimingTokens,
  easedProgress,
  readThemeTiming,
  readThemeTokens,
  resolveTiming,
  type ThemeTimingTokens,
} from './themeTiming';
import {durationDefaults, easeDefaults} from '../theme/tokens.stylex';

const FAST: ThemeTimingTokens = {
  duration: '--duration-fast',
  easing: '--ease-standard',
};

const standardEase = cubicBezier(
  parseCssEasing(easeDefaults['--ease-standard'])!,
);

function element(styles: Record<string, string> = {}): HTMLElement {
  const node = document.createElement('div');
  for (const [name, value] of Object.entries(styles)) {
    node.style.setProperty(name, value);
  }
  document.body.appendChild(node);
  return node;
}

describe('declaredTimingTokens', () => {
  it('declares every timing token as the token file does', () => {
    expect(declaredTimingTokens).toEqual({
      ...durationDefaults,
      ...easeDefaults,
    });
  });
});

describe('readThemeTiming', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('reads the element\u2019s own transition with no tokens', () => {
    const timing = readThemeTiming(
      element({
        'transition-duration': '0.3s, 1s',
        'transition-timing-function': 'linear, ease-in',
      }),
    )!;
    expect(timing.duration).toBeCloseTo(0.3, 6);
    expect(timing.at(0.15)).toBeCloseTo(0.5, 6);
    expect(readThemeTiming(element())).toBe(null);
  });

  it('reads tokens set where the element is, in ms or s', () => {
    const seconds = readThemeTiming(
      element({'--duration-fast': '0.3s', '--ease-standard': 'linear'}),
      FAST,
    )!;
    expect(seconds.duration).toBeCloseTo(0.3, 6);
    expect(seconds.at(0.15)).toBeCloseTo(0.5, 6);
    const ms = readThemeTiming(element({'--duration-fast': '250ms'}), FAST)!;
    expect(ms.duration).toBeCloseTo(0.25, 6);
    expect(document.body.children).toHaveLength(2);
  });

  it('reads a token with no value on the element at the default core declares', () => {
    const timing = readThemeTiming(element(), FAST)!;
    expect(timing.duration).toBeCloseTo(0.175, 6);
    expect(timing.at(0.0875)).toBeCloseTo(standardEase(0.5), 6);
    expect(timing.at(0.175)).toBe(1);
  });

  it('reads --duration-exit with no value at its declared default, var(--duration-fast), resolved where the element is', () => {
    const exit: ThemeTimingTokens = {
      duration: '--duration-exit',
      easing: '--ease-exit',
    };
    expect(readThemeTiming(element(), exit)?.duration).toBeCloseTo(0.175, 6);
    expect(
      readThemeTokens(element({'--duration-fast': '250ms'}), {
        duration: '--duration-exit',
      }),
    ).toEqual({ms: 250, points: null});
    expect(readThemeTokens(element({'--duration-exit': '90ms'}), exit).ms).toBe(
      90,
    );
  });

  it('gives the progress velocity per second, and none once the motion ends', () => {
    const timing = readThemeTiming(
      element({'--duration-fast': '0.3s', '--ease-standard': 'linear'}),
      FAST,
    )!;
    expect(timing.velocity(0)).toBeCloseTo(1 / 0.3, 4);
    expect(timing.velocity(0.15)).toBeCloseTo(1 / 0.3, 4);
    expect(timing.velocity(0.3)).toBe(0);
    const eased = readThemeTiming(element(), {
      duration: '--duration-fast',
      easing: '--ease-exit',
    })!;
    const t = 0.05;
    const h = 1e-6;
    expect(eased.velocity(t)).toBeCloseTo(
      (eased.at(t + h) - eased.at(t - h)) / (2 * h),
      3,
    );
  });

  it('returns no curve for a duration that is not a positive length, or an easing it does not read', () => {
    expect(readThemeTiming(element({'--duration-fast': '0ms'}), FAST)).toBe(
      null,
    );
    expect(readThemeTiming(element({'--duration-fast': 'fast'}), FAST)).toBe(
      null,
    );
    expect(
      readThemeTiming(element({'--ease-standard': 'steps(4)'}), FAST),
    ).toBe(null);
    expect(readThemeTiming(element({'transition-duration': '0s'}))).toBe(null);
  });
});

describe('resolveTiming', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('resolves a time of zero or more and a cubic Bézier, and null for anything else or a text left out', () => {
    const node = element();
    expect(
      resolveTiming(node, {duration: '0.3s', easing: 'ease-in-out'}),
    ).toEqual({ms: 300, points: [0.42, 0, 0.58, 1]});
    expect(resolveTiming(node, {duration: '0ms'}).ms).toBe(0);
    expect(resolveTiming(node, {duration: 'fast'}).ms).toBe(null);
    expect(resolveTiming(node, {duration: '-1ms'}).ms).toBe(null);
    expect(resolveTiming(node, {easing: 'steps(4)'}).points).toBe(null);
    expect(resolveTiming(node, {})).toEqual({ms: null, points: null});
    expect(document.body.children).toHaveLength(1);
  });
});

describe('easedProgress', () => {
  it('eases from 0 to 1 over its length, and a curve of no length is at its end', () => {
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
