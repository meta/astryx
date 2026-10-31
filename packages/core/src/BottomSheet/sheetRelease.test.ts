// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sheetRelease.test.ts
 * @input vitest, resolveSheetRelease and the UIKit constants table
 * @output Holds the release rule to UIKit's own releases: 164 drags of a
 *   UISheetPresentationController `[.medium(), .large()]` sheet read from
 *   UIKit (offset and velocity of the sheet interaction's last drag update
 *   before the lift, the detent it settled on, and for the 79 whose spring
 *   was read the damping of the spring it attached); plus the rule's own
 *   edges
 * @position Testing; pure, no DOM
 */

import {describe, expect, it} from 'vitest';
import {sheet, springs} from '../motion/uikit';
import type {ReleaseRule} from '../motion/interactive';
import {solveSpring, toSpring} from '../motion/spring';
import {
  limitOvershoot,
  resolveDefaultRelease,
  resolveSheetRelease,
  sheetReleaseRule,
} from './sheetRelease';

/**
 * Measured on the iOS 26.2 simulator (iPhone 17 Pro, 402 × 874 pt), in
 * UIKit's own interaction offsets: the sheet's top at the large detent is at
 * 62 pt, at the medium detent 404.32 pt, and gone at 874 pt.
 * [case, offset at the lift (pt), velocity (pt/s, + = down), outcome, ζ of
 * the release spring (null: a translate release, whose spring was not read)]
 */
const UIKIT_RELEASES: ReadonlyArray<
  [string, number, number, 'large' | 'medium' | 'dismissed', number | null]
> = [
  ['off-300.v0', 120.99, -12.5, 'large', 1],
  ['off-300.v500', 122.65, -481.4, 'large', 1],
  ['off-300.v1500', 116.65, -1495.6, 'large', 0.8],
  ['off-300.v3000', 129.32, -2903.5, 'large', 0.8],
  ['off-230.v0', 184.32, 0, 'large', 1],
  ['off-230.v500', 188.65, -472, 'large', 1],
  ['off-230.v1500', 199.65, -1590, 'large', 0.8],
  ['off-230.v3000', 225.65, -4037.7, 'large', 0.8],
  ['off-170.v0', 244.32, 0, 'medium', 1],
  ['off-170.v500', 250.99, -494.8, 'large', 1],
  ['off-170.v1500', 282.99, -2323, 'large', 0.8],
  ['off-170.v3000', 258.65, -3292.1, 'large', 0.8],
  ['off-120.v0', 294.32, 0, 'medium', 1],
  ['off-120.v500', 300.65, -466, 'medium', 1],
  ['off-120.v1500', 296.32, -2209.6, 'large', 0.8],
  ['off-120.v3000', 356.32, -686.1, 'medium', 1],
  ['off-60.v0', 354.32, 0, 'medium', 1],
  ['off-60.v500', 365.65, -493.5, 'medium', 1],
  ['off-60.v1500', 368.32, -574.9, 'medium', 1],
  ['off60.v0', 454.32, 0, 'medium', null],
  ['off60.v500', 446.99, 481.5, 'medium', null],
  ['off60.v1500', 428.32, 450.6, 'medium', null],
  ['off120.v0', 514.32, 0, 'medium', null],
  ['off120.v500', 503.65, 453.3, 'medium', null],
  ['off120.v1500', 512.32, 1969.9, 'dismissed', null],
  ['off120.v3000', 476.32, 1139.7, 'dismissed', null],
  ['off200.v0', 594.32, 0, 'medium', null],
  ['off200.v500', 583.65, 494.5, 'medium', null],
  ['off200.v1500', 579.32, 1400, 'dismissed', null],
  ['off200.v3000', 579.32, 3094.6, 'dismissed', null],
  ['off300.v0', 694.32, 0, 'dismissed', null],
  ['off300.v500', 687.65, 478.4, 'dismissed', null],
  ['off300.v1500', 666.65, 1489.2, 'dismissed', null],
  ['off300.v3000', 679.32, 3008.2, 'dismissed', null],
  ['up.end356.v900', 351.65, -926.5, 'medium', 1],
  ['up.end356.v1000', 352.65, -996.7, 'medium', 1],
  ['down.end500.v1000', 501.99, 991, 'medium', null],
  ['down.end500.v1200', 500.65, 1212.4, 'dismissed', null],
  ['up.long.v400', 277.65, -381.2, 'medium', 1],
  ['down.end600.v200', 590.32, 210.5, 'medium', null],
  ['zeta.towardLarge.v720', 160.32, -726.6, 'large', 1],
  ['zeta.towardLarge.v760', 160.65, -736.9, 'large', 1],
  ['zeta.towardLarge.v800', 167.65, -746.9, 'large', 1],
  ['zeta.towardLarge.v840', 161.32, -837.8, 'large', 1],
  ['zeta.awayFromTarget.v760', 224.32, 801.4, 'medium', 1],
  ['zeta.awayFromTarget.v840', 224.32, 1147.3, 'medium', 0.8],
  ['zeta.awayFromTarget.v1000', 208.32, 76, 'large', 1],
];

/**
 * The second capture, placed to separate the candidate laws: releases from
 * 90 pt above to 180 pt below the medium detent at 600 to 1400 pt/s in
 * either direction, the finger at a constant speed for its last 0.15 s and
 * lifting while moving (iOS 26.2 simulator, Oct 24 2026). Same columns; ζ
 * is null where the release dismissed or its spring was not read.
 */
const UIKIT_FLICK_RELEASES: ReadonlyArray<
  readonly [
    string,
    number,
    number,
    'large' | 'medium' | 'dismissed',
    1 | 0.8 | null,
  ]
> = [
  ['d-90.v-1400', 315.99, -1403.9, 'large', 0.8],
  ['d-90.v-1200', 310.99, -1195.1, 'large', 0.8],
  ['d-90.v-1000', 312.65, -1090.0, 'large', 0.8],
  ['d-90.v-800', 310.99, -746.9, 'medium', 1],
  ['d-90.v-600', 339.32, -607.5, 'medium', 1],
  ['d-90.v600', 319.32, 567.3, 'medium', 1],
  ['d-90.v800', 320.99, 776.4, 'medium', 1],
  ['d-90.v1000', 324.32, 979.0, 'medium', 1],
  ['d-90.v1200', 324.32, 1122.4, 'medium', 0.8],
  ['d-90.v1400', 315.99, 1432.4, 'medium', 0.8],
  ['d-45.v-1400', 345.99, -1399.9, 'large', 0.8],
  ['d-45.v-1200', 369.32, -1288.8, 'large', 0.8],
  ['d-45.v-1000', 346.32, -1028.3, 'large', 0.8],
  ['d-45.v-800', 349.32, -868.6, 'medium', 1],
  ['d-45.v-600', 349.32, -628.2, 'medium', 1],
  ['d-45.v600', 372.32, 565.6, 'medium', 1],
  ['d-45.v800', 359.32, 814.1, 'medium', 1],
  ['d-45.v1000', 352.65, 1290.9, 'medium', 0.8],
  ['d-45.v1200', 349.32, 1279.1, 'medium', 0.8],
  ['d-45.v1400', 367.65, 2318.6, 'medium', 0.8],
  ['d0.v-1400', 417.65, -2014.5, 'large', 0.8],
  ['d0.v-1200', 404.32, -1222.1, 'large', 0.8],
  ['d0.v-1000', 402.65, -920.3, 'medium', 1],
  ['d0.v-800', 400.99, -927.9, 'medium', 1],
  ['d0.v-600', 399.32, -594.7, 'medium', 1],
  ['d0.v600', 404.32, 533.8, 'medium', null],
  ['d0.v800', 414.32, 819.5, 'medium', null],
  ['d0.v1000', 397.65, 1088.7, 'medium', 0.8],
  ['d0.v1200', 404.32, 1164.9, 'dismissed', null],
  ['d0.v1400', 414.32, 1873.1, 'dismissed', null],
  ['d30.v-1400', 424.32, -928.4, 'medium', null],
  ['d30.v-1200', 424.32, -1402.5, 'medium', null],
  ['d30.v-1000', 424.32, -1014.9, 'medium', null],
  ['d30.v-800', 427.65, -814.4, 'medium', null],
  ['d30.v-600', 429.32, -582.8, 'medium', null],
  ['d30.v600', 450.99, 605.9, 'medium', null],
  ['d30.v800', 437.65, 803.7, 'medium', null],
  ['d30.v1000', 444.32, 977.4, 'medium', null],
  ['d30.v1200', 444.32, 1184.7, 'dismissed', null],
  ['d30.v1400', 420.99, 1397.1, 'dismissed', null],
  ['d60.v-1400', 454.32, -1723.7, 'medium', null],
  ['d60.v-1200', 464.32, -1470.6, 'medium', null],
  ['d60.v-1000', 450.99, -947.3, 'medium', null],
  ['d60.v-800', 454.32, -806.7, 'medium', null],
  ['d60.v-600', 450.99, -596.6, 'medium', null],
  ['d60.v600', 472.65, 570.9, 'medium', null],
  ['d60.v800', 484.32, 806.8, 'medium', null],
  ['d60.v1000', 474.32, 967.4, 'medium', null],
  ['d60.v1200', 474.32, 1179.4, 'dismissed', null],
  ['d60.v1400', 450.99, 1306.2, 'dismissed', null],
  ['d90.v-1400', 489.32, -1430.1, 'medium', null],
  ['d90.v-1200', 484.32, -1213.0, 'medium', null],
  ['d90.v-1000', 484.32, -1071.7, 'medium', null],
  ['d90.v-800', 484.32, -924.6, 'medium', null],
  ['d90.v-600', 489.32, -610.9, 'medium', null],
  ['d90.v600', 479.32, 615.4, 'medium', null],
  ['d90.v800', 497.65, 780.5, 'medium', null],
  ['d90.v1000', 507.65, 975.6, 'medium', null],
  ['d90.v1200', 504.32, 1177.0, 'dismissed', null],
  ['d90.v1400', 490.99, 1443.1, 'dismissed', null],
  ['d120.v-1400', 525.99, -1430.3, 'medium', null],
  ['d120.v-1200', 507.65, -1164.3, 'medium', null],
  ['d120.v-1000', 519.32, -1026.1, 'medium', null],
  ['d120.v-800', 510.99, -807.4, 'medium', null],
  ['d120.v-600', 519.32, -607.2, 'medium', null],
  ['d120.v600', 502.65, 605.0, 'medium', null],
  ['d120.v800', 484.32, 792.8, 'medium', null],
  ['d120.v1000', 529.32, 965.5, 'medium', null],
  ['d120.v1200', 534.32, 1177.8, 'dismissed', null],
  ['d120.v1400', 522.65, 1408.6, 'dismissed', null],
  ['d150.v-1200', 554.32, -1240.1, 'medium', null],
  ['d150.v-1000', 552.65, -981.5, 'medium', null],
  ['d150.v-800', 540.99, -794.3, 'medium', null],
  ['d150.v-600', 537.65, -583.2, 'medium', null],
  ['d150.v600', 537.65, 600.3, 'medium', null],
  ['d150.v800', 537.65, 810.5, 'medium', null],
  ['d150.v1000', 535.99, 1067.8, 'dismissed', null],
  ['d150.v1200', 544.32, 1226.5, 'dismissed', null],
  ['d150.v1400', 567.65, 1419.1, 'dismissed', null],
  ['d180.v-1000', 582.65, -1063.9, 'medium', null],
  ['d180.v-800', 570.99, -786.2, 'medium', null],
  ['d180.v-600', 574.32, -645.2, 'medium', null],
  ['d180.v600', 565.99, 601.9, 'medium', null],
  ['d180.v800', 554.32, 800.5, 'medium', null],
  ['d180.v1000', 554.32, 990.4, 'dismissed', null],
  ['d180.v1200', 524.32, 1183.9, 'dismissed', null],
  ['d180.v1400', 600.99, 1424.8, 'dismissed', null],
];

/**
 * The third capture, back-outs (iOS 26.2 simulator, Oct 25 2026): from the
 * medium detent, a drag past the midpoint toward large (to about 174 pt),
 * or 90 % of the way to gone, then 40 pt back toward medium at a constant
 * speed, lifting while moving. Below 250 pt/s none returns to medium: it
 * settles where it is nearest (`sheet.release.minProjectionSpeed`).
 */
const UIKIT_BACKOUT_RELEASES: ReadonlyArray<
  readonly [string, number, number, 'large' | 'medium' | 'dismissed', 1 | null]
> = [
  ['back.large.v100.r1', 229.32, 140.0, 'large', 1],
  ['back.large.v250.r1', 224.32, 161.4, 'large', 1],
  ['back.gone.v100.r1', 778.32, -96.3, 'dismissed', null],
  ['back.gone.v250.r1', 781.65, -239.1, 'dismissed', null],
  ['back.large.v100.r2', 223.65, 60.2, 'large', 1],
  ['back.large.v250.r2', 224.32, 200.9, 'large', 1],
  ['back.gone.v100.r2', 778.32, -95.9, 'dismissed', null],
  ['back.gone.v250.r2', 779.32, -263.8, 'dismissed', null],
  ['back.large.v100.r3', 224.32, 91.9, 'large', 1],
  ['back.large.v250.r3', 222.32, 242.4, 'large', 1],
  ['back.gone.v100.r3', 777.32, -105.4, 'dismissed', null],
  ['back.gone.v250.r3', 777.32, -246.1, 'dismissed', null],
  ['back.large224.v300', 224.32, 300.6, 'medium', 1],
  ['back.large224.v400', 220.99, 403.9, 'medium', 1],
  ['back.large224.v500', 224.32, 451.7, 'medium', 1],
  ['back.large224.v650', 224.32, 634.4, 'medium', 1],
  ['back.large224.v800', 217.65, 970.0, 'medium', 1],
  ['back.large204.v300', 204.32, 327.3, 'medium', 1],
  ['back.large204.v500', 196.32, 566.5, 'medium', 1],
  ['back.large204.v800', 204.32, 963.1, 'medium', 1],
  ['back.large244.v300', 239.32, 296.4, 'medium', 1],
  ['back.large244.v500', 244.32, 501.7, 'medium', 1],
  ['back.large224.v250.r1', 224.32, 243.6, 'large', 1],
  ['back.large224.v262.r1', 224.32, 254.4, 'medium', 1],
  ['back.large224.v275.r1', 224.32, 269.8, 'medium', 1],
  ['back.large224.v288.r1', 224.32, 282.8, 'medium', 1],
  ['back.large224.v250.r2', 222.32, 250.6, 'medium', 1],
  ['back.large224.v262.r2', 221.99, 264.7, 'medium', 1],
  ['back.large224.v275.r2', 224.32, 272.4, 'medium', 1],
  ['back.large224.v288.r2', 222.32, 287.2, 'medium', 1],
];

const LARGE = 62;
const MEDIUM = 404.32;
const GONE = 874;

describe('resolveSheetRelease against UIKit', () => {
  // Every measured drag began at the medium detent. A release moving back
  // toward it cancels there (spec:AST-094 FR37), where UIKit's own sheet
  // settled 14 of those back-outs on the stop nearest them and flicked one
  // (`d0.v-1400`) to large (listed below); on every other release the rule
  // lands where UIKit landed.
  const movingBack = (offset: number, velocity: number) =>
    velocity !== 0 && Math.sign(velocity) === Math.sign(MEDIUM - offset);
  const releases = [
    ...UIKIT_RELEASES,
    ...UIKIT_FLICK_RELEASES,
    ...UIKIT_BACKOUT_RELEASES,
  ];
  for (const [name, offset, velocity, outcome, zeta] of releases) {
    const expected = movingBack(offset, velocity) ? 'medium' : outcome;
    const note = expected === outcome ? '' : ` (UIKit: ${outcome})`;
    it(`${name}: ${velocity} pt/s from ${offset} pt → ${expected}${note}`, () => {
      const release = resolveSheetRelease({
        detents: [LARGE, MEDIUM],
        dismissedOffset: GONE,
        position: offset,
        velocity,
        start: MEDIUM,
      });
      const landed =
        release.kind === 'dismiss'
          ? 'dismissed'
          : release.index === 0
            ? 'large'
            : 'medium';
      expect(landed).toBe(expected);
      if (zeta != null && expected === outcome) {
        expect(release.spring).toBe(
          zeta === 1 ? springs.sheetDetent : springs.sheetReleaseFast,
        );
      }
    });
  }

  // The same releases with the cancel out of the way: each one starts where
  // it is lifted, so FR37 never applies and every release lands where
  // UIKit's sheet landed. With a start at the medium detent the cancel decides
  // every release moving back toward it, and the slowest projected speed,
  // the projection time and the tolerance on a stop would go untested on
  // those.
  describe('with no back-out to cancel (each release starting where it is lifted)', () => {
    for (const [name, offset, velocity, outcome, zeta] of releases) {
      it(`${name}: ${velocity} pt/s from ${offset} pt → ${outcome}`, () => {
        const release = resolveSheetRelease({
          detents: [LARGE, MEDIUM],
          dismissedOffset: GONE,
          position: offset,
          velocity,
          start: offset,
        });
        const landed =
          release.kind === 'dismiss'
            ? 'dismissed'
            : release.index === 0
              ? 'large'
              : 'medium';
        expect(landed).toBe(outcome);
        if (zeta != null) {
          expect(release.spring).toBe(
            zeta === 1 ? springs.sheetDetent : springs.sheetReleaseFast,
          );
        }
      });
    }
  });

  it('departs from UIKit only on back-outs, which FR37 cancels', () => {
    expect(
      releases
        .filter(
          ([, offset, velocity, outcome]) =>
            movingBack(offset, velocity) && outcome !== 'medium',
        )
        .map(([name]) => name),
    ).toEqual([
      'zeta.awayFromTarget.v1000',
      'd0.v-1400',
      'back.large.v100.r1',
      'back.large.v250.r1',
      'back.gone.v100.r1',
      'back.gone.v250.r1',
      'back.large.v100.r2',
      'back.large.v250.r2',
      'back.gone.v100.r2',
      'back.gone.v250.r2',
      'back.large.v100.r3',
      'back.large.v250.r3',
      'back.gone.v100.r3',
      'back.gone.v250.r3',
      'back.large224.v250.r1',
    ]);
  });
});

describe('resolveSheetRelease', () => {
  it('projects linearly: offset plus the velocity times the projection time', () => {
    const release = resolveSheetRelease({
      detents: [0, 300],
      dismissedOffset: 640,
      position: 100,
      velocity: 500,
      start: 0,
    });
    expect(release.projected).toBeCloseTo(
      100 + 500 * sheet.release.projectionSeconds,
      9,
    );
  });

  it('at rest, dismisses only past halfway from the shortest detent to gone', () => {
    const at = (position: number) =>
      resolveSheetRelease({
        detents: [0, 300],
        dismissedOffset: 640,
        position,
        velocity: 0,
        start: 300,
      }).kind;
    expect(at(469)).toBe('detent');
    expect(at(471)).toBe('dismiss');
  });

  it('sends a flick at least to the next position beyond it', () => {
    // On the 300 px detent, flicked down at the threshold: its projection
    // (about 400 px) is nearer 300, but a flick goes on to the next position.
    expect(
      resolveSheetRelease({
        detents: [0, 300],
        dismissedOffset: 640,
        position: 300,
        velocity: sheet.release.fastSpeed,
        start: 0,
      }),
    ).toMatchObject({kind: 'dismiss', offset: 640});
    // Just under the threshold, the same release projects back to 300.
    expect(
      resolveSheetRelease({
        detents: [0, 300],
        dismissedOffset: 640,
        position: 300,
        velocity: sheet.release.fastSpeed - 1,
        start: 0,
      }),
    ).toMatchObject({kind: 'detent', offset: 300});
    // Within the tolerance a detent counts as passed; a flick up from just
    // below 300 goes on to 0 instead of stopping at 300.
    expect(
      resolveSheetRelease({
        detents: [0, 300],
        dismissedOffset: 640,
        position: 300 + sheet.release.detentTolerance / 2,
        velocity: -sheet.release.fastSpeed,
        start: 400,
      }),
    ).toMatchObject({kind: 'detent', offset: 0});
  });

  it('takes the projection when a flick carries farther than the next position', () => {
    // Flicked down at 5000 px/s from 50 px: the next position is 300, but
    // the projection (550 px) is nearest gone, so it dismisses.
    expect(
      resolveSheetRelease({
        detents: [0, 300],
        dismissedOffset: 640,
        position: 50,
        velocity: 5000,
        start: 0,
      }),
    ).toMatchObject({kind: 'dismiss', offset: 640});
  });

  it('settles against the motion when the projection says so', () => {
    // Just above the shortest detent, moving up slowly: back down to it.
    const release = resolveSheetRelease({
      detents: [0, 300],
      dismissedOffset: 640,
      position: 250,
      velocity: -200,
      start: 300,
    });
    expect(release).toMatchObject({kind: 'detent', index: 1, offset: 300});
  });

  it('projects nothing below sheet.release.minProjectionSpeed', () => {
    // From the tallest detent, past the midpoint toward the shorter one and
    // let go moving on toward it just under the speed: it stays with the
    // tallest, where it is nearest; just over it, the projection takes it on.
    // (Moving back toward where the drag began, FR37 would cancel instead.)
    const slow = sheet.release.minProjectionSpeed - 1;
    const fast = sheet.release.minProjectionSpeed + 1;
    expect(
      resolveSheetRelease({
        detents: [0, 300],
        dismissedOffset: 640,
        position: 140,
        velocity: slow,
        start: 0,
      }),
    ).toMatchObject({kind: 'detent', index: 0, projected: 140});
    expect(
      resolveSheetRelease({
        detents: [0, 300],
        dismissedOffset: 640,
        position: 140,
        velocity: fast,
        start: 0,
      }),
    ).toMatchObject({kind: 'detent', index: 1});
  });

  it('cancels a release moving back toward its start, whatever the travel so far (spec:AST-094 FR37)', () => {
    // Dragged from the 300 px detent to 600 px (gone at 640 px) and let go
    // moving back up: back to 300, though the projection is nearest gone.
    for (const velocity of [-100, -400, -1500]) {
      expect(
        resolveSheetRelease({
          detents: [0, 300],
          dismissedOffset: 640,
          position: 600,
          velocity,
          start: 300,
        }),
      ).toMatchObject({kind: 'detent', index: 1, offset: 300});
    }
    // Past the midpoint toward the tallest detent, moving back down: 300.
    expect(
      resolveSheetRelease({
        detents: [0, 300],
        dismissedOffset: 640,
        position: 120,
        velocity: 80,
        start: 300,
      }),
    ).toMatchObject({kind: 'detent', index: 1, offset: 300});
    // Moving on, away from the start, the projection decides as before.
    expect(
      resolveSheetRelease({
        detents: [0, 300],
        dismissedOffset: 640,
        position: 600,
        velocity: 100,
        start: 300,
      }),
    ).toMatchObject({kind: 'dismiss'});
  });

  it('cancels to a detent, never to gone: a drag begun where a finger caught the sheet near gone (spec:AST-094 FR37)', () => {
    // Caught at 720 pt, past the midpoint from medium to gone, dragged up to
    // 600 and let go moving back down: a cancel commits nothing, so the sheet
    // goes to the detent nearest the start, medium, where the same lift from
    // a drag begun on medium settles too.
    for (const velocity of [60, 400, 1500]) {
      expect(
        resolveSheetRelease({
          detents: [LARGE, MEDIUM],
          dismissedOffset: GONE,
          position: 600,
          velocity,
          start: 720,
        }),
      ).toMatchObject({kind: 'detent', index: 1, offset: MEDIUM});
    }
    expect(
      resolveSheetRelease({
        detents: [LARGE, MEDIUM],
        dismissedOffset: GONE,
        position: 600,
        velocity: 60,
        start: MEDIUM,
      }),
    ).toMatchObject({kind: 'detent', index: 1, offset: MEDIUM});
  });

  it('never dismisses a sheet a drag may not dismiss', () => {
    const release = resolveSheetRelease({
      detents: [0, 300],
      dismissedOffset: null,
      position: 600,
      velocity: 3000,
      start: 300,
    });
    expect(release).toMatchObject({kind: 'detent', index: 1, offset: 300});
  });

  it('picks the spring by speed alone, from sheet.release.fastSpeed', () => {
    const spring = (velocity: number, position = 150) =>
      resolveSheetRelease({
        detents: [0, 300],
        dismissedOffset: 640,
        position,
        velocity,
        // Released where the drag began: the cancel never applies.
        start: position,
      }).spring;
    const fast = sheet.release.fastSpeed;
    expect(spring(fast - 1)).toBe(springs.sheetDetent);
    expect(spring(-(fast - 1))).toBe(springs.sheetDetent);
    expect(spring(fast)).toBe(springs.sheetReleaseFast);
    expect(spring(-fast)).toBe(springs.sheetReleaseFast);
    // Dismissals: the swipe spring when fast, the detent spring when slow.
    expect(spring(fast, 600)).toBe(springs.sheetDismissSwipe);
    expect(spring(0, 600)).toBe(springs.sheetDetent);
  });

  it('needs a detent', () => {
    expect(() =>
      resolveSheetRelease({
        detents: [],
        dismissedOffset: 640,
        position: 0,
        velocity: 0,
        start: 0,
      }),
    ).toThrow(RangeError);
  });
});

describe("resolveDefaultRelease (under a mouse: today's rule)", () => {
  const base = {
    detents: [0, 300],
    shortestDetentHeight: 340,
    dismissible: true,
    startOffset: 300,
  };

  it('dismisses a downward release projected past 40 % of the shortest detent', () => {
    expect(matchMedia('(pointer: coarse)').matches).toBe(false);
    // 420 + 0.6 × 499 = 719 > 300 + 0.4 × 340 = 436.
    expect(
      resolveDefaultRelease({
        ...base,
        position: 420,
        velocity: 600,
        travel: 120,
        direction: 1,
      }),
    ).toMatchObject({kind: 'dismiss', offset: 640});
    // At rest it dismisses only past the line.
    expect(
      resolveDefaultRelease({
        ...base,
        position: 430,
        velocity: 0,
        travel: 130,
        direction: 1,
      }),
    ).toMatchObject({kind: 'detent', offset: 300});
    expect(
      resolveDefaultRelease({
        ...base,
        position: 440,
        velocity: 0,
        travel: 140,
        direction: 1,
      }),
    ).toMatchObject({kind: 'dismiss'});
  });

  it('holds the shortest detent instead when a drag may not dismiss', () => {
    expect(matchMedia('(pointer: coarse)').matches).toBe(false);
    expect(
      resolveDefaultRelease({
        ...base,
        dismissible: false,
        position: 420,
        velocity: 600,
        travel: 120,
        direction: 1,
      }),
    ).toMatchObject({kind: 'detent', index: 1, offset: 300});
  });

  it('projects nothing for a gesture under 48 px', () => {
    expect(matchMedia('(pointer: coarse)').matches).toBe(false);
    // A fast 20 px nudge up from 300: no projection, back to 300.
    expect(
      resolveDefaultRelease({
        ...base,
        position: 280,
        velocity: -2000,
        travel: 20,
        direction: -1,
      }),
    ).toMatchObject({kind: 'detent', offset: 300});
  });

  it('never settles past the detent a drag started from, against its direction', () => {
    expect(matchMedia('(pointer: coarse)').matches).toBe(false);
    // Up 50 px net from 300, then thrown down at the lift: projected
    // 250 + 0.6 × 499 = 549 would land on 500, but an upward drag stops at
    // its start.
    expect(
      resolveDefaultRelease({
        ...base,
        detents: [0, 300, 500],
        position: 250,
        velocity: 600,
        travel: 50,
        direction: -1,
      }),
    ).toMatchObject({kind: 'detent', offset: 300});
  });
});

describe('limitOvershoot', () => {
  /** How far the spring goes past `to`, px. */
  const overshootOf = (from: number, to: number, velocity: number) => {
    const curve = solveSpring(toSpring(springs.sheetReleaseFast), {
      from,
      to,
      velocity,
    });
    let worst = 0;
    for (let t = 0; t <= 1.5; t += 1 / 480) {
      worst = Math.max(worst, to - curve.value(t));
    }
    return worst;
  };

  it('keeps a hand-off whose overshoot fits', () => {
    expect(limitOvershoot(springs.sheetReleaseFast, 5, 0, -1000, 48)).toBe(
      -1000,
    );
  });

  it('caps a throw that would overshoot past the reserve', () => {
    // Released 5 px below fully open at 3000 px/s: the 80 % damped spring
    // would carry the sheet about 60 px above it, past the 48 px reserve.
    expect(overshootOf(5, 0, -3000)).toBeGreaterThan(55);
    const capped = limitOvershoot(springs.sheetReleaseFast, 5, 0, -3000, 48);
    expect(capped).toBeGreaterThan(-3000);
    expect(capped).toBeLessThan(-1500);
    expect(overshootOf(5, 0, capped)).toBeLessThanOrEqual(48.5);
  });

  it('keeps a release let go above the tallest detent, still moving up, within the reserve', () => {
    // Let go at the 48 px wall above fully open moving up at 1500 px/s: the
    // spring would carry the sheet about 72 px above fully open first.
    expect(overshootOf(-48, 0, -1500)).toBeGreaterThan(65);
    const capped = limitOvershoot(springs.sheetReleaseFast, -48, 0, -1500, 48);
    expect(overshootOf(-48, 0, capped)).toBeLessThanOrEqual(48.5);
  });

  it('keeps a downward release from above the tallest detent as it is', () => {
    // Moving down from the wall it only falls back toward the detent.
    expect(limitOvershoot(springs.sheetReleaseFast, -48, 0, 600, 48)).toBe(600);
  });
});

describe('sheetReleaseRule (the interactive-transition driver\u2019s rule)', () => {
  const context = {
    detents: [LARGE, MEDIUM],
    dismissedOffset: GONE,
    isUIKit: true,
    shortestDetentHeight: GONE - MEDIUM,
    startOffset: LARGE,
    today: {direction: 0, travel: 0, velocity: 0},
  };

  it('is UIKit\u2019s rule under a finger, from where the drag began, for all 134 measured releases', () => {
    for (const [, offset, velocity] of [
      ...UIKIT_RELEASES,
      ...UIKIT_FLICK_RELEASES,
    ]) {
      const release = resolveSheetRelease({
        detents: [LARGE, MEDIUM],
        dismissedOffset: GONE,
        position: offset,
        velocity,
        start: context.startOffset,
      });
      expect(
        sheetReleaseRule({position: offset, finger: offset, velocity}, context),
      ).toEqual({
        target: release.offset,
        motion: release.spring,
        outcome: release.kind,
        index: release.index,
        exits: release.kind === 'dismiss',
      });
    }
  });

  it('is today\u2019s rule under a mouse, and keeps a sheet that cannot be dismissed', () => {
    expect(matchMedia('(pointer: coarse)').matches).toBe(false);
    const today = {direction: 1, travel: 300, velocity: 900};
    const landing = sheetReleaseRule(
      {position: 700, finger: 700, velocity: 1200},
      {...context, isUIKit: false, today},
    );
    const release = resolveDefaultRelease({
      detents: [LARGE, MEDIUM],
      shortestDetentHeight: GONE - MEDIUM,
      dismissible: true,
      position: 700,
      velocity: 900,
      travel: 300,
      direction: 1,
      startOffset: LARGE,
    });
    expect(landing.target).toBe(release.offset);
    expect(landing.outcome).toBe(release.kind);
    const kept = sheetReleaseRule(
      {position: 700, finger: 700, velocity: 1200},
      {...context, isUIKit: false, today, dismissedOffset: null},
    );
    expect(kept.outcome).toBe('detent');
    expect(kept.exits).toBe(false);
  });

  it('is a release rule the driver takes', () => {
    const rule: ReleaseRule<
      'detent' | 'dismiss',
      Parameters<typeof sheetReleaseRule>[1]
    > = sheetReleaseRule;
    expect(
      rule(
        {position: 800, finger: 800, velocity: 1500},
        {...context, track: undefined},
      ).exits,
    ).toBe(true);
  });
});
