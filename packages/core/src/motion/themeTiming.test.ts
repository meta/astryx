// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themeTiming.test.ts
 * @input vitest (jsdom), themeTiming's readers, the theme's duration and
 *   easing defaults
 * @output Checks how a motion reads its timing: from the element's own
 *   transition, and from tokens set where the element is or at their
 *   defaults. A default that refers to a token reads it there. Also checks
 *   the values that give no curve and the progress velocity. jsdom resolves no
 *   `calc()` and plays no `linear()` or `steps()`: a stand-in plays one, and
 *   the browser proof covers both.
 * @position Testing; validates themeTiming.ts
 */

import {afterEach, describe, expect, it} from 'vitest';
import {cubicBezier} from './bezier';
import {parseCssEasing} from './roles';
import {
  declaredTimingTokens,
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

  it('plays an easing that is not a cubic Bézier as the browser does, and a jump in it hands on no speed', () => {
    // jsdom has no Web Animations, so a stand-in plays steps(4, jump-end).
    class StandInEffect {
      time = 0;
      constructor(_target: null, _frames: null, timing: {easing: string}) {
        if (timing.easing !== 'steps(4, jump-end)') {
          throw new TypeError(timing.easing);
        }
      }
      getComputedTiming() {
        return {progress: Math.floor((4 * this.time) / 1000) / 4};
      }
    }
    class StandInAnimation {
      constructor(readonly effect: StandInEffect) {}
      set currentTime(ms: number) {
        this.effect.time = ms;
      }
    }
    const view = window as unknown as Record<string, unknown>;
    const before = {
      Animation: view.Animation,
      KeyframeEffect: view.KeyframeEffect,
    };
    Object.assign(view, {
      Animation: StandInAnimation,
      KeyframeEffect: StandInEffect,
    });
    try {
      const curve = readThemeTiming(
        element({'--ease-standard': 'steps(4, jump-end)'}),
        FAST,
      );
      // 175 ms at the default, so the jumps fall at 43.75, 87.5 and 131.25 ms.
      expect(curve?.duration).toBeCloseTo(0.175, 6);
      expect(curve?.at(0.05)).toBe(0.25);
      // A retarget at a jump inherits this speed.
      for (const t of [0.04375, 0.0875, 0.13125, 0.1749]) {
        expect(curve?.velocity(t), `${t} s`).toBe(0);
      }
    } finally {
      Object.assign(view, before);
    }
  });

  it('returns no curve for a duration that is not a positive length, or an easing it does not read', () => {
    expect(readThemeTiming(element({'--duration-fast': '0ms'}), FAST)).toBe(
      null,
    );
    expect(readThemeTiming(element({'--duration-fast': 'fast'}), FAST)).toBe(
      null,
    );
    expect(readThemeTiming(element({'--ease-standard': 'bounce'}), FAST)).toBe(
      null,
    );
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
