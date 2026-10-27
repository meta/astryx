// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file toastSwipe.test.ts
 * @input toastSwipe.ts and the Toast constants of the UIKit table
 * @output Unit tests for how far the card follows a finger and which
 *   releases dismiss, against the recorded notification-banner releases
 * @position Colocated with toastSwipe.ts
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {resolveMotion} from '../motion/resolveMotion';
import {listMotionRoles, motionRoleOf} from '../motion/roles';
import {dampingRatioOf, responseOf, toSpring} from '../motion/spring';
import {
  SETTLE_SPRING,
  registerSpringsTable,
  springs,
} from '../motion/uikit/springs';
import {toast} from '../motion/uikit/toast';
import {
  RETRACT_CLEARANCE,
  followOffset,
  isDismissRelease,
  retractCurve,
  retractTarget,
} from './toastSwipe';

registerSpringsTable();

describe('followOffset', () => {
  it('keeps the card still until the finger has travelled the follow distance', () => {
    expect(followOffset(0)).toBe(0);
    expect(followOffset(toast.followFrom - 0.5)).toBe(0);
    expect(followOffset(toast.followFrom)).toBe(0);
    // Never pulled back past rest by a finger that moved away from the edge.
    expect(followOffset(-30)).toBe(0);
  });

  it('then follows at the follow ratio, continuously (no jump)', () => {
    expect(followOffset(toast.followFrom + 0.1)).toBeCloseTo(
      0.1 * toast.followRatio,
      10,
    );
    expect(followOffset(toast.followFrom + 40)).toBeCloseTo(
      40 * toast.followRatio,
      10,
    );
  });

  it('reproduces the banner: a 60 px drag moves it 0.55 × (60 − 14)', () => {
    expect(followOffset(60)).toBeCloseTo(25.3, 10);
  });
});

describe('isDismissRelease', () => {
  // Each recorded banner release: finger travel toward the edge, the
  // finger's release speed (UIKit's estimator over the recorded touch
  // stream), and what the banner did.
  const releases: ReadonlyArray<
    readonly [name: string, travel: number, speed: number, dismissed: boolean]
  > = [
    ['slow 25 pt', 25, 82, false],
    ['slow 30 pt', 30, 82, false],
    ['slow 35 pt', 35, 55, false],
    ['slow 40 pt', 40, 82, false],
    ['slow 45 pt', 45, 60, true],
    ['slow 50 pt', 50, 66, true],
    ['10 pt flick', 10, 129, true],
    ['15 pt flick', 15, 219, true],
    ['15 pt flick, still 120 ms before the lift', 15, 188, true],
    ['40 pt at 300 pt/s, still 150 ms before the lift', 40, 245, true],
    ['slow 60 pt, still 300 ms before the lift', 60, 71, true],
    ['30 pt at 1400 pt/s', 30, 1714, true],
    ['40 pt up, then 20 pt back', 20, -121, false],
    ['slow 20 pt', 20, 60, false],
  ];

  it.each(releases)(
    'reproduces the banner release: %s',
    (_name, travel, speed, dismissed) => {
      expect(isDismissRelease(followOffset(travel), speed)).toBe(dismissed);
    },
  );

  it('cancels a release moving back toward rest, however far out the card is (spec:AST-094 FR37)', () => {
    // 60 px out, then lifted while moving back at 50 px/s with the finger
    // 50 px out: the card is 19.8 px out, past the dismiss offset.
    expect(followOffset(50)).toBeCloseTo(19.8, 10);
    expect(isDismissRelease(followOffset(50), -50)).toBe(false);
    expect(isDismissRelease(toast.dismissOffset + 40, -1)).toBe(false);
    // A finger still at the lift reads no speed (spec:AST-100 FR2): the
    // distance decides.
    expect(isDismissRelease(followOffset(50), 0)).toBe(true);
  });

  it('dismisses at the dismiss offset or the flick velocity, whichever comes first', () => {
    expect(isDismissRelease(toast.dismissOffset, 0)).toBe(true);
    expect(isDismissRelease(toast.dismissOffset - 0.01, 0)).toBe(false);
    expect(isDismissRelease(0, toast.flickVelocity)).toBe(true);
    expect(isDismissRelease(0, toast.flickVelocity - 1)).toBe(false);
  });
});

describe('motion values', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('springs back on springs.settle, which the measured banner settle matches, and owns no role', () => {
    // Seven recorded banner settles: critically damped, a 0.5 s response.
    // Toast imports that one row (INV6).
    expect(SETTLE_SPRING).toBe(springs.settle);
    const settle = toSpring(SETTLE_SPRING);
    expect(responseOf(settle)).toBeCloseTo(0.5, 6);
    expect(dampingRatioOf(settle)).toBeCloseTo(1, 6);
    expect(motionRoleOf(springs.settle)?.id).toBe('springs.settle');
    // Its follow, release and retract values are plain constants.
    expect(motionRoleOf(toast.exitCurve)).toBeUndefined();
    expect(
      listMotionRoles().filter(role => role.id.startsWith('toast.')),
    ).toEqual([]);
  });

  it('a --motion-… variable changes nothing: the settle plays its table value', () => {
    const scope = document.createElement('div');
    scope.setAttribute('data-astryx-theme', 'snappy');
    const card = document.createElement('div');
    scope.append(card);
    document.body.append(scope);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () =>
        ({
          getPropertyValue: (name: string) =>
            name.startsWith('--motion-') ? '0.3s 0' : '',
        }) as CSSStyleDeclaration,
    );
    expect(resolveMotion(card, springs.settle)).toEqual(springs.settle);
  });
});

describe('the retract', () => {
  it('ends with the card past its edge, clear of its shadow', () => {
    // A top toast whose box ends 89 px down; a bottom toast starting 700 px
    // down a 768 px window.
    expect(retractTarget({top: 33, bottom: 89}, 768, -1)).toBe(
      -(89 + RETRACT_CLEARANCE),
    );
    expect(retractTarget({top: 700, bottom: 756}, 768, 1)).toBe(
      768 - 700 + RETRACT_CLEARANCE,
    );
  });

  it("follows the banner's recorded retracts within 7 % of the travel", () => {
    // The two timeout retracts the table cites: the bottom edge, rest to the
    // top edge, screen pt per frame (ms from the last rest frame).
    const runs = [
      {
        rest: 123.8,
        frames: [
          [18.3, 118.5],
          [35, 109.2],
          [50, 95.8],
          [66.7, 82.5],
          [83.3, 67.2],
          [100, 51.9],
          [115, 35.9],
          [133.3, 21.3],
          [148.3, 7.3],
        ],
      },
      {
        rest: 124.5,
        frames: [
          [11.7, 120.5],
          [30, 111.8],
          [48.3, 100.5],
          [63.3, 86.5],
          [78.3, 71.9],
          [95, 57.2],
          [111.7, 41.3],
          [130, 12],
        ],
      },
    ];
    for (const {rest, frames} of runs) {
      const curve = retractCurve(rest, 0, toast.exitMs, toast.exitCurve);
      for (const [t, bottom] of frames) {
        expect(Math.abs(curve.at(t / 1000) - bottom) / rest).toBeLessThan(0.07);
      }
    }
  });

  it('starts at the release velocity after a dismissing release (spec:AST-094 FR38)', () => {
    // An upward retract from 25 px to 105 px out, for releases at 0 to
    // 600 px/s toward the edge (negative: up).
    for (const speed of [0, 150, 600]) {
      const curve = retractCurve(-25, -105, 160, toast.exitCurve, -speed);
      expect(curve.duration).toBeCloseTo(0.16, 5);
      expect(Math.abs(curve.velocity(0) + speed)).toBeLessThanOrEqual(
        Math.max(2, speed * 0.02),
      );
      expect(curve.at(0)).toBe(-25);
      expect(curve.at(curve.duration)).toBe(-105);
      let previous = curve.at(0);
      for (let t = 0.005; t <= curve.duration; t += 0.005) {
        expect(curve.at(t)).toBeLessThanOrEqual(previous);
        expect(curve.at(t)).toBeGreaterThanOrEqual(-105);
        previous = curve.at(t);
      }
    }
  });

  it('carries a flick faster than its curve out sooner, still at the release velocity', () => {
    const curve = retractCurve(-25, -105, 160, toast.exitCurve, -3000);
    expect(curve.duration).toBeLessThan(0.16);
    expect(Math.abs(curve.velocity(0) + 3000)).toBeLessThanOrEqual(60);
    expect(curve.at(curve.duration)).toBe(-105);
    let previous = curve.at(0);
    for (let t = 0.002; t <= curve.duration; t += 0.002) {
      expect(curve.at(t)).toBeLessThanOrEqual(previous);
      expect(curve.at(t)).toBeGreaterThanOrEqual(-105);
      previous = curve.at(t);
    }
  });

  it('starts at rest where the card is and ends at the target', () => {
    const curve = retractCurve(-25, -105, 160, toast.exitCurve);
    expect(curve.duration).toBeCloseTo(0.16, 5);
    expect(curve.at(0)).toBe(-25);
    expect(curve.at(curve.duration)).toBe(-105);
    // No continuation of the finger's speed: it starts slowly.
    expect(Math.abs(curve.velocity(0))).toBeLessThan(
      Math.abs(curve.velocity(curve.duration / 2)),
    );
    // Monotonic all the way.
    let previous = curve.at(0);
    for (let t = 0.01; t <= curve.duration; t += 0.01) {
      expect(curve.at(t)).toBeLessThanOrEqual(previous);
      previous = curve.at(t);
    }
  });
});
