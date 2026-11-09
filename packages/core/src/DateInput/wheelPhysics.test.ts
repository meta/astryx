// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file wheelPhysics.test.ts
 * @input wheelPhysics.ts and per-frame offsets recorded from a UIPickerView,
 *   with the release velocity UIKit handed its delegate
 * @output Proves the Wheel's curves reproduce UIKit's measured picker. They
 *   cover the projected target, the coast onto the row, the coast into an
 *   end and the snap. They also cover the rubber band, a turn from rest and
 *   the ticks
 * @position Unit coverage for DateInput/wheelPhysics.ts
 *
 * The recordings are of a 216 pt UIPickerView column of 60 rows, 32 pt each.
 * Real HID touches drove it on the iOS 26.2 simulator (iPhone 17 Pro), Oct 23
 * 2026. Offsets are converted to this file's convention (row k centred at k ×
 * 32): UIKit's contentOffset + 129.67. Frames are [ms after the lift, offset].
 */

import {describe, expect, it} from 'vitest';
import {springs} from '../motion/uikit/springs';
import {
  MAX_PLAN_SECONDS,
  bounceCurve,
  coastCurve,
  dragOffset,
  planRelease,
  projectRelease,
  reachesRow,
  snapCurve,
  tickTimes,
  type WheelLayout,
} from './wheelPhysics';

const MINUTES: WheelLayout = {rowHeight: 32, rowCount: 60};

interface Recording {
  /** Offset at the lift. */
  readonly offset: number;
  /** The velocity UIKit handed scrollViewWillEndDragging, px/s. */
  readonly velocity: number;
  /** Its projected target, and the row it snapped that to. */
  readonly targetIn: number;
  readonly targetOut: number;
  /** ms after the lift. */
  readonly didSelect: number;
  readonly frames: ReadonlyArray<readonly [number, number]>;
}

const SWIPE_200_IN_50MS: Recording = {
  offset: 1093.33,
  velocity: 933.4,
  targetIn: 1554.67,
  targetOut: 1568,
  didSelect: 2314,
  frames: [],
};

const SWIPE_200_IN_100MS: Recording = {
  offset: 1143.33,
  velocity: 2114,
  targetIn: 1888,
  targetOut: 1888,
  didSelect: 1220,
  frames: [],
};

const SWIPE_200_IN_200MS: Recording = {
  offset: 1110,
  velocity: 1016.2,
  targetIn: 1612.67,
  targetOut: 1600,
  didSelect: 2316,
  frames: [
    [15, 1126.67],
    [81.4, 1187.67],
    [149.2, 1241],
    [215.6, 1287.67],
    [282.2, 1328],
    [351.3, 1363.33],
    [415, 1394.33],
    [481.6, 1421],
    [550.8, 1444.67],
    [617.3, 1465],
    [681.5, 1482.67],
    [749, 1498.33],
    [815.9, 1512],
    [882.6, 1523.67],
    [949.1, 1534],
    [1015.5, 1543],
    [1084, 1551],
    [1149.7, 1557.67],
    [1214.9, 1563.67],
    [1282.1, 1569],
    [1351.5, 1573.33],
    [1415.2, 1577.33],
    [1481.7, 1581],
    [1549, 1584],
    [1614.7, 1586.33],
    [1684.1, 1588.67],
    [1748.1, 1590.67],
    [1815.2, 1592.33],
    [1883.9, 1594],
    [1948.2, 1595.33],
    [2014.9, 1596.33],
    [2081.6, 1597.33],
    [2149.5, 1598.33],
    [2216.3, 1599],
    [2282.4, 1599.67],
    [2315.2, 1600],
  ],
};

const FLICK_90: Recording = {
  offset: 1014,
  velocity: 543.6,
  targetIn: 1280.67,
  targetOut: 1280,
  didSelect: 2032,
  frames: [
    [19.4, 1023],
    [81.4, 1055.67],
    [151.9, 1084.33],
    [215.5, 1109.33],
    [281.4, 1131.33],
    [352.9, 1150.67],
    [415.1, 1167.33],
    [482, 1182],
    [548.2, 1195],
    [615.9, 1206],
    [682.6, 1216],
    [748.2, 1224.67],
    [816.8, 1232],
    [883.1, 1238.67],
    [949.1, 1244.33],
    [1016, 1249.33],
    [1081.5, 1254],
    [1149.7, 1257.67],
    [1214.8, 1261],
    [1281.9, 1264],
    [1350.8, 1266.67],
    [1415.7, 1269],
    [1483.9, 1271],
    [1548.4, 1272.67],
    [1616.4, 1274],
    [1682.3, 1275.33],
    [1750.6, 1276.67],
    [1815, 1277.67],
    [1882.9, 1278.67],
    [1949.6, 1279.33],
    [2015.2, 1280],
    [2031.5, 1280],
  ],
};

/** A slow drag up, held still 300 ms: no velocity, 6 px past row 31. */
const STILL_6PX_PAST: Recording = {
  offset: 998,
  velocity: 0,
  targetIn: 998,
  targetOut: 992,
  didSelect: 300,
  frames: [
    [16.1, 997],
    [34.2, 996],
    [50.7, 995.33],
    [66.2, 994.67],
    [82.9, 994.33],
    [102.3, 994],
    [116.3, 993.67],
    [133.2, 993.33],
    [152.4, 993.33],
    [166.2, 993],
    [184.1, 993],
    [199.5, 992.67],
    [216.1, 992.67],
    [232.8, 992.67],
    [249.5, 992.33],
    [267.3, 992.33],
    [283, 992],
    [299.7, 992],
  ],
};

/** RMS distance between a curve and recorded frames, in px. */
function rms(
  value: (t: number) => number,
  frames: Recording['frames'],
): number {
  let sum = 0;
  for (const [ms, offset] of frames) {
    sum += (value(ms / 1000) - offset) ** 2;
  }
  return Math.sqrt(sum / frames.length);
}

describe('the projected target', () => {
  it.each([
    ['200 pt in 50 ms', SWIPE_200_IN_50MS],
    ['200 pt in 200 ms', SWIPE_200_IN_200MS],
    ['a 90 pt flick', FLICK_90],
  ])('matches UIKit’s targetContentOffset for %s', (_name, recording) => {
    expect(
      Math.abs(
        projectRelease(recording.offset, recording.velocity) -
          recording.targetIn,
      ),
    ).toBeLessThan(0.3);
  });

  it('snaps to the row UIKit snapped to', () => {
    for (const recording of [SWIPE_200_IN_50MS, SWIPE_200_IN_200MS, FLICK_90]) {
      const plan = planRelease(recording.offset, recording.velocity, MINUTES);
      expect(plan.kind).toBe('coast');
      expect(plan.index * 32).toBe(recording.targetOut);
    }
  });
});

describe('the coast onto a row', () => {
  it.each([
    ['200 pt in 200 ms', SWIPE_200_IN_200MS, 0.8],
    ['a 90 pt flick', FLICK_90, 0.8],
  ])(
    'follows UIKit’s frames for %s and stops on the row',
    (_name, recording, tolerance) => {
      const {curve} = planRelease(
        recording.offset,
        recording.velocity,
        MINUTES,
      );
      expect(rms(curve.value, recording.frames)).toBeLessThan(tolerance);
      expect(curve.value(curve.duration)).toBe(recording.targetOut);
      // didSelect lands in the frame of the last offset change.
      expect(
        Math.abs(curve.duration * 1000 - recording.didSelect),
      ).toBeLessThan(50);
    },
  );

  it('keeps the release velocity at the lift and ends at the stop speed', () => {
    const curve = coastCurve(1110, 1016.2, 1600);
    expect(curve.velocity(0)).toBeCloseTo(1016.2, 6);
    expect(curve.velocity(curve.duration - 1e-9)).toBeCloseTo(8.9, 3);
    expect(curve.velocity(curve.duration)).toBe(0);
  });

  it('is never re-solved backwards: a target behind the velocity snaps', () => {
    const curve = coastCurve(1010, 500, 992);
    expect(curve.value(curve.duration)).toBe(992);
    expect(curve.velocity(0)).toBeLessThan(0);
  });
});

describe('a coast into an end', () => {
  it('decays at the normal rate into the last row, then bounces back to it', () => {
    const plan = planRelease(
      SWIPE_200_IN_100MS.offset,
      SWIPE_200_IN_100MS.velocity,
      MINUTES,
    );
    expect(plan.kind).toBe('edge');
    expect(plan.index).toBe(59);
    const end = 59 * 32;
    // UIKit's frames pass the end about 600 ms after the lift. They overshoot
    // by 20.7 pt around 700 ms and are back on the row by about 1.2 s.
    let hit = 0;
    let peak = end;
    for (let t = 0; t < plan.curve.duration; t += 1 / 240) {
      const value = plan.curve.value(t);
      if (hit === 0 && value >= end) {
        hit = t;
      }
      peak = Math.max(peak, value);
    }
    expect(hit).toBeGreaterThan(0.55);
    expect(hit).toBeLessThan(0.65);
    expect(peak - end).toBeGreaterThan(10);
    expect(peak - end).toBeLessThan(30);
    expect(plan.curve.value(plan.curve.duration)).toBe(end);
  });
});

describe('a release without velocity', () => {
  it('eases onto the nearest row as UIKit does', () => {
    const plan = planRelease(STILL_6PX_PAST.offset, 0, MINUTES);
    expect(plan.kind).toBe('snap');
    expect(plan.index).toBe(31);
    expect(rms(plan.curve.value, STILL_6PX_PAST.frames)).toBeLessThan(0.4);
    expect(
      Math.abs(plan.curve.duration * 1000 - STILL_6PX_PAST.didSelect),
    ).toBeLessThan(60);
  });

  it('treats a release below the velocity floor as no velocity', () => {
    // 244.7 pt/s was zeroed by UIKit; 257.7 was handed on.
    expect(planRelease(1000, 240, MINUTES).kind).toBe('snap');
    expect(planRelease(1000, -240, MINUTES).kind).toBe('snap');
    expect(planRelease(1000, 260, MINUTES).kind).toBe('coast');
  });

  it('is already at rest on a row', () => {
    const curve = snapCurve(992, 992);
    expect(curve.duration).toBe(0);
    expect(curve.value(0)).toBe(992);
  });
});

describe('past an end', () => {
  it('rubber-bands a drag past the last row as UIPickerView does', () => {
    const end = 59 * 32;
    // 10, 50 and 110 px of finger travel past the end; UIKit showed 5.3, 25
    // and 50.
    expect(dragOffset(end + 10, MINUTES) - end).toBeCloseTo(5.4, 1);
    expect(dragOffset(end + 50, MINUTES) - end).toBeCloseTo(25.1, 1);
    expect(dragOffset(end + 110, MINUTES) - end).toBeCloseTo(50.1, 1);
    expect(dragOffset(-50, MINUTES)).toBeCloseTo(-25.1, 1);
    expect(dragOffset(500, MINUTES)).toBe(500);
  });

  it('returns to the end it was released past, keeping any velocity', () => {
    const plan = planRelease(-37.33, -147.8, MINUTES);
    expect(plan.kind).toBe('return');
    expect(plan.index).toBe(0);
    expect(plan.curve.velocity(0)).toBeCloseTo(-147.8, 6);
    expect(plan.curve.value(plan.curve.duration)).toBe(0);
  });
});

describe('a turn from rest', () => {
  it('springs onto the row on the settle spring, from rest, without overshoot', () => {
    // A tap, a key or the program turns the wheel on `springs.settle`, from
    // rest.
    const curve = bounceCurve(0, 0, 64, 1, springs.settle);
    expect(curve.velocity(0)).toBe(0);
    expect(curve.value(curve.duration)).toBe(64);
    let last = 0;
    for (let t = 0; t <= curve.duration; t += 1 / 120) {
      const value = curve.value(t);
      expect(value).toBeGreaterThanOrEqual(last - 1e-9);
      expect(value).toBeLessThanOrEqual(64 + 1e-9);
      last = value;
    }
  });
});

describe('the selection tick', () => {
  it('fires when a row’s centre reaches the band, not when it leaves it', () => {
    expect(reachesRow(31.9 * 32, 32 * 32, 32)).toBe(true);
    expect(reachesRow(32 * 32, 32.4 * 32, 32)).toBe(false);
    expect(reachesRow(32.1 * 32, 32 * 32, 32)).toBe(true);
    expect(reachesRow(32 * 32, 31.6 * 32, 32)).toBe(false);
  });

  it('ticks once per row on a coast, at most every 40 ms', () => {
    const {curve} = planRelease(1110, 1016.2, MINUTES);
    const ticks = tickTimes(curve, 32);
    // From row 34.7 to row 50: rows 35 to 50.
    expect(ticks.length).toBeLessThanOrEqual(16);
    expect(ticks.length).toBeGreaterThan(12);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i] - ticks[i - 1]).toBeGreaterThanOrEqual(0.04 - 1e-9);
    }
  });
});

describe('the bounce spring it is handed', () => {
  it('returns from past an end on the spring it is handed', () => {
    const layout: WheelLayout = {rowHeight: 32, rowCount: 60};
    const table = planRelease(-60, 0, layout);
    const stiff = planRelease(-60, 0, layout, {duration: 0.2, bounce: 0});
    expect(table.kind).toBe('return');
    expect(stiff.kind).toBe('return');
    expect(stiff.curve.to).toBe(0);
    expect(stiff.curve.duration).toBeLessThan(table.curve.duration);
  });

  // An undamped bounce spring (bounce 1, or a physical spring with no
  // damping) never settles, and a plan that never ends cannot be baked. It snaps onto its end at the animator's limit, as the
  // animator's own motion does.
  it('ends a plan whose bounce never settles at the animator limit', () => {
    const springs = [
      {duration: 0.5, bounce: 1},
      {stiffness: 300, damping: 0},
      {duration: 0.5, bounce: 0.999},
    ];
    for (const bounce of springs) {
      const back = planRelease(-60, 0, MINUTES, bounce);
      const into = planRelease(
        SWIPE_200_IN_100MS.offset,
        SWIPE_200_IN_100MS.velocity,
        MINUTES,
        bounce,
      );
      expect([back.kind, into.kind]).toEqual(['return', 'edge']);
      for (const {curve} of [back, into]) {
        expect(curve.duration, JSON.stringify(bounce)).toBeLessThanOrEqual(
          MAX_PLAN_SECONDS,
        );
        expect(curve.value(curve.duration)).toBe(curve.to);
        expect(curve.velocity(curve.duration)).toBe(0);
      }
    }
  });
});
