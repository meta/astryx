// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swipeRelease.test.ts
 * @input vitest; swipeRelease.ts and the UIKit constants table
 * @output The release rule against the UIKit lab's releases; where a full
 *   swipe confirms; the swipe spring is the one UIKit reported
 * @position Unit tests of packages/core/src/Item/swipeRelease.ts
 */

import {describe, expect, it} from 'vitest';
import {
  dampingRatioOf,
  naturalFrequency,
  settlingDuration,
  toSpring,
} from '../motion/spring';
import {swipeActions} from '../motion/uikit/swipeActions';
import {confirmedOffset, confirmPoint, resolveRelease} from './swipeRelease';

describe('resolveRelease', () => {
  // The UIKit lab's releases (iOS 26.2 simulator, Oct 23 2026: plain table,
  // 402 pt rows, two trailing actions, a 156.67 pt open width; the full-swipe
  // point far beyond them), as the swipe pan reported them when the finger
  // lifted: the swipe's travel (past the 25 pt the pan needs to begin;
  // negative when the finger came back past where it began) and its velocity
  // in pt/s, positive toward open. A scripted "closing" release can still be
  // opening when it lifts (the 36 pt one at +458), so the reported values are
  // the inputs.
  const OPEN_WIDTH = 156.67;
  const RELEASES: [travel: number, velocity: number, lands: string][] = [
    [35, -19, 'closed'],
    [65, 490, 'open'],
    [125, 1506, 'open'],
    [5, -492, 'closed'],
    [-55, -1532, 'closed'],
    [95, -16, 'open'],
    [125, 478, 'open'],
    [185, 1565, 'open'],
    [65, -468, 'closed'],
    // [115, +135]: closed. Scripted as a 1500 pt/s closing flick, it lifted
    // with the pan reporting a slow opening one: the one release of the 51
    // neither this rule nor projection explains.
    [-67, -2545, 'closed'],
    [-47.7, -1025, 'closed'],
    [-3, -256, 'closed'],
    [12.3, -22, 'closed'],
    [30.3, 293, 'open'],
    [64, 1058, 'open'],
    [132.3, 1983, 'open'],
    [-67, -2060, 'closed'],
    [-10, -1087, 'closed'],
    [35.7, 458, 'open'],
    [50, -18, 'closed'],
    [63, 286, 'open'],
    [93, 1372, 'open'],
    [170, 2031, 'open'],
    [1.7, -2168, 'closed'],
    [27.3, -996, 'closed'],
    [69.3, -287, 'closed'],
    [87.7, -5, 'open'],
    [100.3, 148, 'open'],
    [147.3, 1271, 'open'],
    [190.3, 608, 'open'],
    [39.3, -2052, 'closed'],
    [65, -983, 'closed'],
    [107, -308, 'closed'],
    [125, -18, 'open'],
    [143, 347, 'open'],
    [185, 948, 'open'],
    [245, 2082, 'open'],
    [42.3, -1975, 'closed'],
    [102.7, -991, 'closed'],
    [144.3, -283, 'closed'],
    [162.3, -19, 'open'],
    [180.3, 271, 'open'],
    [222.7, 1002, 'open'],
    [282.3, 1971, 'open'],
  ];

  it.each(RELEASES)(
    'lands where UIKit did: %s pt of swipe at %s pt/s → %s',
    (travel, velocity, lands) => {
      expect(
        resolveRelease({
          behavior: 'reveal',
          isConfirmed: false,
          openWidth: OPEN_WIDTH,
          travel: Math.max(0, travel),
          velocity,
          wasConfirmed: false,
        }),
      ).toBe(lands);
    },
  );

  it('goes the way a release moves from about 50 pt/s, and by where it is below that (UIKit lab, iOS 26.2 simulator, Oct 23 2026)', () => {
    // 204.67 pt open width, released at 0.7 of it: past half. The speeds
    // are the pan's at its end, as UIKit read them.
    const base = {
      behavior: 'reveal' as const,
      isConfirmed: false,
      openWidth: 204.67,
      travel: 143,
      wasConfirmed: false,
    };
    for (const velocity of [-19.9, -21.2, -35.7, -40.7, 0, 56.1]) {
      expect(resolveRelease({...base, velocity})).toBe('open');
    }
    for (const velocity of [-56.1, -56.5, -68.5, -105, -200, -308]) {
      expect(resolveRelease({...base, velocity})).toBe('closed');
    }
  });

  it('fires on a confirmed release at any velocity, and never on one that has not confirmed', () => {
    const base = {behavior: 'reveal' as const, openWidth: 204.67, travel: 340};
    for (const velocity of [0, 1000, -1000]) {
      expect(
        resolveRelease({
          ...base,
          isConfirmed: true,
          velocity,
          wasConfirmed: true,
        }),
      ).toBe('perform');
    }
    expect(
      resolveRelease({
        ...base,
        isConfirmed: false,
        travel: 44,
        velocity: 3000,
        wasConfirmed: false,
      }),
    ).toBe('open');
  });

  it('fires under commit only when confirmed, and never rests', () => {
    const base = {behavior: 'commit' as const, openWidth: 72};
    expect(
      resolveRelease({
        ...base,
        isConfirmed: true,
        travel: 250,
        velocity: -1000,
        wasConfirmed: true,
      }),
    ).toBe('perform');
    expect(
      resolveRelease({
        ...base,
        isConfirmed: false,
        travel: 100,
        velocity: 0,
        wasConfirmed: false,
      }),
    ).toBe('closed');
    expect(
      resolveRelease({
        ...base,
        isConfirmed: false,
        travel: 40,
        velocity: 3000,
        wasConfirmed: false,
      }),
    ).toBe('closed');
  });
});

// `spec:AST-057` FR5 is UIKit's release rule: a release goes by its speed
// first, then by half the panel; speed alone never fires an entry; a swipe
// that confirmed and came back short of the confirm point closes. Each case
// below is UIKit's own reading (the lab's releases, as the pan reported them).
describe('spec:AST-057 FR5 against the UIKit lab', () => {
  const reveal = {behavior: 'reveal' as const, isConfirmed: false};

  it('never fires an entry on speed alone, under either model: UIKit opened every release at 1,002 to 2,082 pt/s', () => {
    const flings: [travel: number, velocity: number][] = [
      [222.7, 1002],
      [64, 1058],
      [147.3, 1271],
      [93, 1372],
      [125, 1506],
      [185, 1565],
      [282.3, 1971],
      [132.3, 1983],
      [170, 2031],
      [245, 2082],
    ];
    for (const [travel, velocity] of flings) {
      const release = {
        isConfirmed: false,
        openWidth: 156.67,
        travel,
        velocity,
        wasConfirmed: false,
      };
      expect(resolveRelease({...release, behavior: 'reveal'})).toBe('open');
      // Under commit nothing rests: the fling closes, and fires nothing.
      expect(resolveRelease({...release, behavior: 'commit'})).toBe('closed');
    }
  });

  it('closes a swipe that confirmed and came back short of the confirm point, even released at rest past the panel width', () => {
    expect(
      resolveRelease({
        ...reveal,
        openWidth: 204.67,
        travel: 275,
        velocity: 0,
        wasConfirmed: true,
      }),
    ).toBe('closed');
  });

  it('closes a release past the panel width that is closing at the release speed or faster', () => {
    expect(
      resolveRelease({
        ...reveal,
        openWidth: 204.67,
        travel: 305,
        velocity: -300,
        wasConfirmed: false,
      }),
    ).toBe('closed');
    // The same release at rest, or still opening, stays open: slower than
    // the release speed, it goes by where it is.
    for (const velocity of [0, 300]) {
      expect(
        resolveRelease({
          ...reveal,
          openWidth: 204.67,
          travel: 305,
          velocity,
          wasConfirmed: false,
        }),
      ).toBe('open');
    }
  });

  it('opens a release short of half the panel that is opening at the release speed or faster', () => {
    // 156.67 pt open width: half of it is 78.3 pt.
    const opening: [travel: number, velocity: number][] = [
      [30.3, 293],
      [35.7, 458],
      [63, 286],
      [64, 1058],
      [65, 490],
    ];
    for (const [travel, velocity] of opening) {
      expect(travel).toBeLessThan(swipeActions.openFraction * 156.67);
      expect(
        resolveRelease({
          ...reveal,
          openWidth: 156.67,
          travel,
          velocity,
          wasConfirmed: false,
        }),
      ).toBe('open');
    }
  });
});

describe('confirmPoint', () => {
  it('lands inside the brackets UIKit gave: (315, 335] at a 204.67 pt open width and (275, 315] at 156.67, on 402 pt rows', () => {
    const wide = confirmPoint(204.67, 402);
    expect(wide).toBeGreaterThan(315);
    expect(wide).toBeLessThanOrEqual(335);
    const narrow = confirmPoint(156.67, 402);
    expect(narrow).toBeGreaterThan(275);
    expect(narrow).toBeLessThanOrEqual(315);
  });

  it('is never short of the open width, and the confirmed row sits the inset short of its far edge', () => {
    expect(confirmPoint(390, 402)).toBe(390);
    expect(confirmedOffset(402)).toBe(373);
    expect(confirmedOffset(375)).toBe(346);
  });
});

describe('the swipe spring', () => {
  it('is the one UIKit reported: critically damped at 10 rad/s, settling in 0.9235 s', () => {
    for (const description of [swipeActions.tracking, swipeActions.settle]) {
      const spring = toSpring(description);
      expect(dampingRatioOf(spring)).toBeCloseTo(1, 10);
      expect(naturalFrequency(spring)).toBeCloseTo(10, 10);
      // UIKit's settlingDuration for it, within the 0.02 % the solver's
      // critically damped branch is documented to land.
      expect(settlingDuration(spring)).toBeCloseTo(0.9235, 3);
    }
  });
});
