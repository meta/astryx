// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file refreshPull.test.ts
 * @input vitest, refreshPull
 * @output Holds the pull mapping to UIKit's own frames, and the trigger
 *   distance to UIKit's on four view heights. Checks the inverse, the reveal,
 *   the release target, the end motion and the end's theme timing
 * @position Testing; colocated with refreshPull.ts
 */

import {describe, expect, it} from 'vitest';
import {
  endMotion,
  endTiming,
  modeAfterTrigger,
  pullOverscroll,
  pullSlope,
  pullTravel,
  REFRESH_HEIGHT,
  releaseTarget,
  revealFraction,
  revealProgress,
  triggerDistance,
} from './refreshPull';

/**
 * UIKit lab capture: a UIRefreshControl on a 334 pt tall scroll view, iOS 26.2
 * simulator, HID drags at about 150 pt/s. Each row is [finger travel since
 * touch-down, overscroll shown, whether the pull triggered], from the
 * setContentOffset log. The pan's 10 pt hysteresis is part of the travel here.
 */
const UIKIT_PULLS: Record<string, ReadonlyArray<[number, number, 0 | 1]>> = {
  pull120: [
    [12.67, 2.67, 0],
    [15, 5, 0],
    [20, 10, 0],
    [25, 15, 0],
    [27.67, 17.67, 0],
    [32.33, 22.33, 0],
    [35, 25, 0],
    [40, 30, 0],
    [45, 35, 0],
    [50, 40, 0],
    [52.67, 42.67, 0],
    [55, 45, 0],
    [60, 50, 0],
    [62.33, 52.33, 0],
    [67.67, 57.67, 0],
    [70, 60, 0],
    [75, 62.67, 0],
    [77.33, 64, 0],
    [82.67, 66.67, 0],
    [87.67, 69.33, 0],
    [92.33, 72, 0],
    [95, 73.33, 0],
    [100, 75.67, 0],
    [105, 95, 1],
    [110, 100, 1],
    [115, 105, 1],
    [117.67, 107.67, 1],
    [120, 110, 1],
  ],
  pull200: [
    [15, 5, 0],
    [20, 10, 0],
    [25, 15, 0],
    [30, 20, 0],
    [35, 25, 0],
    [37.67, 27.67, 0],
    [40, 30, 0],
    [42.67, 32.67, 0],
    [47.33, 37.33, 0],
    [52.67, 42.67, 0],
    [57.67, 47.67, 0],
    [62.33, 52.33, 0],
    [67.67, 57.67, 0],
    [72.67, 61.33, 0],
    [75, 62.67, 0],
    [80, 65.33, 0],
    [85, 68, 0],
    [90, 70.67, 0],
    [95, 73.33, 0],
    [97.67, 74.67, 0],
    [102.67, 92.67, 1],
    [107.33, 97.33, 1],
    [110, 100, 1],
    [112.67, 102.67, 1],
    [115, 105, 1],
    [120, 110, 1],
    [125, 115, 1],
    [127.67, 117.67, 1],
  ],
};
const UIKIT_VIEW_HEIGHT = 334;
const HYSTERESIS = 10;

describe('pullOverscroll', () => {
  it('reproduces UIKit’s pull frame by frame, before and after the trigger', () => {
    for (const [name, rows] of Object.entries(UIKIT_PULLS)) {
      for (const [travel, shown, triggered] of rows) {
        const model = pullOverscroll(
          travel - HYSTERESIS,
          UIKIT_VIEW_HEIGHT,
          triggered === 1 ? modeAfterTrigger(travel - HYSTERESIS) : 'reveal',
        );
        expect(
          Math.abs(model - shown),
          `${name} at ${travel} pt of travel: ${model} vs ${shown}`,
        ).toBeLessThanOrEqual(triggered === 1 ? 0.01 : 0.2);
      }
    }
  });

  it('tracks the finger one to one up to the control’s height', () => {
    expect(REFRESH_HEIGHT).toBe(60);
    for (const travel of [0.5, 10, 30, 59.9, 60]) {
      expect(pullOverscroll(travel, 800, 'reveal')).toBe(travel);
    }
  });

  it('rubber-bands the excess past the height, never reaching the view’s height', () => {
    const at = (travel: number) => pullOverscroll(travel, 800, 'reveal');
    expect(at(61)).toBeGreaterThan(60);
    expect(at(61) - 60).toBeLessThan(1);
    expect(at(2000)).toBeLessThan(60 + 800);
    expect(at(200)).toBeGreaterThan(at(150));
  });

  it('is one to one up to twice the height in the band', () => {
    expect(pullOverscroll(95, 800, 'band')).toBe(95);
    expect(pullOverscroll(120, 800, 'band')).toBe(120);
    expect(pullOverscroll(121, 800, 'band')).toBeLessThan(121);
  });

  it('steps onto the finger only for a trigger within the band', () => {
    expect(modeAfterTrigger(90)).toBe('band');
    expect(modeAfterTrigger(120)).toBe('band');
    // A tall view triggers past the band: the pull keeps its curve.
    expect(modeAfterTrigger(296)).toBe('reveal');
  });

  it('shows nothing for a pull that has not started or went the other way', () => {
    expect(pullOverscroll(0, 800, 'reveal')).toBe(0);
    expect(pullOverscroll(-25, 800, 'reveal')).toBe(0);
    expect(pullOverscroll(Number.NaN, 800, 'reveal')).toBe(0);
  });
});

describe('pullTravel', () => {
  it('inverts pullOverscroll in both modes', () => {
    for (const mode of ['reveal', 'band'] as const) {
      for (const travel of [0, 12, 60, 61, 90, 140, 400]) {
        const shown = pullOverscroll(travel, 874, mode);
        expect(pullTravel(shown, 874, mode)).toBeCloseTo(travel, 6);
      }
    }
  });
});

describe('trigger and reveal', () => {
  it('triggers at UIKit’s distance for each view height', () => {
    // Measured: 334 pt → 73.0–73.3; 400 → 79.0–79.3; 874 → 168.3–173.7;
    // 1366 → about 271.
    expect(triggerDistance(334)).toBeCloseTo(73, 0);
    expect(triggerDistance(400)).toBeGreaterThanOrEqual(79);
    expect(triggerDistance(400)).toBeLessThanOrEqual(79.3);
    expect(triggerDistance(874)).toBeGreaterThanOrEqual(168.3);
    expect(triggerDistance(874)).toBeLessThanOrEqual(173.7);
    expect(Math.abs(triggerDistance(1366) - 271)).toBeLessThan(2);
    // Never below the floor, even for a view with no height yet.
    expect(triggerDistance(0)).toBe(73);
  });

  it('triggers on UIKit’s frames, at most one frame ahead of UIKit’s own report', () => {
    // UIKit reports valueChanged on the frame after the crossing.
    const trigger = triggerDistance(UIKIT_VIEW_HEIGHT);
    for (const rows of Object.values(UIKIT_PULLS)) {
      const reported = rows.findIndex(row => row[2] === 1);
      const shown = (travel: number) =>
        pullOverscroll(travel - HYSTERESIS, UIKIT_VIEW_HEIGHT, 'reveal');
      expect(shown(rows[reported - 1][0])).toBeGreaterThanOrEqual(trigger);
      expect(shown(rows[reported - 3][0])).toBeLessThan(trigger);
    }
  });

  it('reveals in proportion to the pull, fully at the trigger', () => {
    expect(revealFraction(0, 874)).toBe(0);
    expect(revealFraction(triggerDistance(874) / 2, 874)).toBeCloseTo(0.5, 6);
    expect(revealFraction(triggerDistance(874), 874)).toBe(1);
    expect(revealFraction(500, 874)).toBe(1);
    expect(revealFraction(-5, 874)).toBe(0);
  });

  it('eases the reveal on UIKit’s reveal curve (0.42, 0, 0.58, 1)', () => {
    const trigger = triggerDistance(334);
    expect(revealProgress(0, 334)).toBe(0);
    expect(revealProgress(trigger, 334)).toBeCloseTo(1, 6);
    // The ease-in-out curve is symmetric: halfway through is halfway.
    expect(revealProgress(trigger / 2, 334)).toBeCloseTo(0.5, 3);
    expect(revealProgress(trigger / 4, 334)).toBeLessThan(0.25);
  });
});

describe('release and end', () => {
  it('releases onto the inset while refreshing and back to the top otherwise', () => {
    expect(releaseTarget(true)).toBe(60);
    expect(releaseTarget(false)).toBe(0);
  });

  it('slides the content up to close a visible gap, then drops inset and offset together', () => {
    expect(endMotion(0)).toEqual({animateTo: 0, scrollBy: -0});
    expect(endMotion(25)).toEqual({animateTo: 25, scrollBy: -25});
  });

  it('moves nothing when the control has scrolled out of view', () => {
    expect(endMotion(60)).toEqual({animateTo: null, scrollBy: -60});
    expect(endMotion(500)).toEqual({animateTo: null, scrollBy: -60});
  });
});

describe('the end’s timing', () => {
  it('plays UIKit’s easeInEaseOut over the theme’s duration token as the element computes it (spec:AST-094 FR45)', () => {
    const style = (values: Record<string, string>) => ({
      getPropertyValue: (name: string) => values[name] ?? '',
    });
    // The theme's move easing changes nothing: the curve is UIKit's.
    expect(
      endTiming(
        style({
          '--duration-medium': '300ms',
          '--ease-move': 'cubic-bezier(0.24, 1, 0.4, 1)',
        }),
      ),
    ).toEqual({ms: 300, points: [0.42, 0, 0.58, 1]});
    // A theme's tempo reaches the end through the token's value.
    expect(endTiming(style({'--duration-medium': '450ms'}))?.ms).toBe(450);
    // No token, or a token in a form it cannot read: no slide.
    expect(
      endTiming(style({'--duration-medium': 'calc(300ms * 1)'})),
    ).toBeNull();
    expect(endTiming(style({}))).toBeNull();
  });
});

describe('pullSlope', () => {
  it('is 1 where the pull tracks the finger, and the rubber band slope past it', () => {
    expect(pullSlope(0, 334, 'reveal')).toBe(0);
    expect(pullSlope(30, 334, 'reveal')).toBeCloseTo(1, 6);
    const past = 100;
    const slope = pullSlope(past, 334, 'reveal');
    expect(slope).toBeGreaterThan(0);
    expect(slope).toBeLessThan(1);
    // The slope of the mapping itself, and it falls as the band stretches.
    const step = 0.5;
    expect(slope).toBeCloseTo(
      (pullOverscroll(past + step, 334, 'reveal') -
        pullOverscroll(past - step, 334, 'reveal')) /
        (2 * step),
      3,
    );
    expect(pullSlope(past + 100, 334, 'reveal')).toBeLessThan(slope);
    // The band after a trigger tracks one to one for twice as long.
    expect(pullSlope(100, 334, 'band')).toBeCloseTo(1, 6);
  });
});
