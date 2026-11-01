// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file paging.test.ts
 * @input vitest, the paging math, and UIKit reference curves recorded on the
 *   iOS 26.2 simulator (a 402 pt paging UIScrollView, contentOffset per 60 Hz
 *   frame)
 * @output Holds solvePaging and solveAnimatedPageScroll to the recorded
 *   motion
 * @position Testing; validates paging.ts without a browser
 */

import {describe, expect, it} from 'vitest';
import {
  pagingSettleVelocity,
  solveAnimatedPageScroll,
  solvePaging,
} from './paging';
import {paging} from './uikit/paging';

const PAGE = 402;

/**
 * contentOffset per frame after a release at rest, from the frame the settle
 * starts (ms, px). UIKit lab, iOS 26.2 simulator, 402 pt pages.
 */
const SETTLES: Record<
  string,
  {from: number; velocity?: number; to: number; frames: number[][]}
> = {
  // 60 % of the way from page 1 to page 2, released at rest: page 2.
  forwardFrom60: {
    from: 633.33,
    to: 804,
    frames: [
      [0.7, 633.33],
      [17.4, 639],
      [34.0, 652],
      [50.7, 668.67],
      [67.4, 686.67],
      [84.0, 704.67],
      [100.7, 721.33],
      [117.4, 736.33],
      [134.0, 749.67],
      [150.7, 761],
      [167.4, 770.67],
      [184.0, 778.33],
      [200.7, 784.67],
      [217.4, 789.67],
      [234.0, 793.67],
      [250.7, 796.67],
      [267.4, 799],
      [284.0, 800.67],
      [300.7, 802],
      [317.4, 803],
      [334.0, 803.67],
      [350.7, 804],
    ],
  },
  // 46 % (content) of the way to page 2, released at rest: back to page 1.
  backFrom46: {
    from: 589,
    to: 402,
    frames: [
      [0.6, 589],
      [17.3, 583],
      [33.9, 569],
      [50.6, 550.67],
      [67.3, 531],
      [83.9, 511.33],
      [100.6, 493],
      [117.3, 476.33],
      [133.9, 461.67],
      [150.6, 449.33],
      [167.3, 439],
      [183.9, 430.33],
      [200.6, 423.33],
      [217.3, 417.67],
      [233.9, 413.33],
      [250.6, 410],
      [267.3, 407.33],
      [283.9, 405.33],
      [300.6, 404],
      [317.3, 403],
      [333.9, 402.33],
      [350.6, 402],
    ],
  },
  // Dragged back 23 % toward page 0, released at rest: page 1.
  forwardFromMinus23: {
    from: 311.33,
    to: 402,
    frames: [
      [0.6, 311.33],
      [17.2, 314.33],
      [33.9, 321],
      [50.6, 330],
      [67.2, 339.67],
      [83.9, 349.33],
      [100.6, 358.33],
      [117.2, 366.33],
      [133.9, 373.33],
      [150.6, 379.33],
      [167.2, 384.33],
      [183.9, 388.33],
      [200.6, 391.67],
      [217.2, 394.33],
      [233.9, 396.33],
      [250.6, 398],
      [267.2, 399.33],
      [283.9, 400.33],
      [300.6, 401],
      [317.2, 401.33],
      [333.9, 401.67],
      [350.6, 402],
    ],
  },
  // Released moving forward at 25 % with a settle velocity of 0.314 pt/ms
  // (steady 320 pt/s drag): the next page.
  flick314From24: {
    from: 499.67,
    velocity: 314,
    to: 804,
    frames: [
      [15.0, 499.67],
      [31.7, 513.33],
      [48.4, 538.33],
      [65.0, 569],
      [81.7, 601.67],
      [98.4, 633.33],
      [115.0, 662.67],
      [131.7, 689],
      [148.4, 712],
      [165.0, 731.67],
      [181.7, 748],
      [198.4, 761.33],
      [215.0, 772],
      [231.7, 780.33],
      [248.4, 787],
      [265.0, 792],
      [281.7, 796],
      [298.4, 799],
      [315.0, 801],
      [331.7, 802.33],
      [348.4, 803.33],
      [365.0, 804],
    ],
  },
  // 600 pt/s drag released with no hold: settle velocity 0.565 pt/ms.
  flick565From24: {
    from: 497.33,
    velocity: 565,
    to: 804,
    frames: [
      [-3.2, 497.33],
      [13.5, 514.33],
      [30.2, 541.33],
      [46.8, 573],
      [63.5, 606],
      [80.2, 637.67],
      [96.8, 667],
      [113.5, 693],
      [130.2, 715.33],
      [146.8, 734.33],
      [163.5, 750],
      [180.2, 763],
      [196.8, 773.33],
      [213.5, 781.67],
      [230.2, 788],
      [246.8, 793],
      [263.5, 796.67],
      [280.2, 799.33],
      [296.8, 801.33],
      [313.5, 802.67],
      [330.2, 803.67],
      [346.8, 804],
    ],
  },
  // 290 pt of pan past page 0 (114.33 pt shown), released at rest.
  overscrollReturn: {
    from: -114.33,
    to: 0,
    frames: [
      [0, -114.33],
      [10.6, -113],
      [27.3, -105.67],
      [43.9, -95.33],
      [60.6, -83.33],
      [77.3, -71],
      [93.9, -59.33],
      [110.6, -48.67],
      [127.3, -39.33],
      [143.9, -31.33],
      [160.6, -24.67],
      [177.3, -19],
      [193.9, -14.33],
      [210.6, -10.67],
      [227.3, -7.67],
      [243.9, -5.33],
      [260.6, -3.67],
      [277.3, -2.33],
      [293.9, -1.33],
      [310.6, -0.67],
      [327.3, -0.33],
      [343.9, 0],
    ],
  },
};

/** `setContentOffset(_:animated:)` per frame from its first frame (ms, px). */
const ANIMATED: Record<string, {from: number; to: number; frames: number[][]}> =
  {
    twoPages: {
      from: 402,
      to: 1206,
      frames: [
        [0, 402],
        [16.7, 408],
        [33.3, 426.33],
        [50, 456],
        [66.7, 496],
        [83.3, 545.67],
        [100, 603],
        [116.7, 666.67],
        [133.3, 734.33],
        [150, 804],
        [166.7, 873.67],
        [183.3, 941.33],
        [200, 1005],
        [216.7, 1062.33],
        [233.3, 1112],
        [250, 1152],
        [266.7, 1181.67],
        [283.3, 1200],
        [300, 1206],
      ],
    },
    fivePages: {
      from: 0,
      to: 2010,
      frames: [
        [0, 0],
        [16.7, 15.33],
        [33.3, 60.67],
        [50, 134.67],
        [66.7, 235],
        [83.3, 359],
        [100, 502.67],
        [116.7, 661.33],
        [133.3, 830.33],
        [150, 1005],
        [166.7, 1179.67],
        [183.3, 1348.67],
        [200, 1507.67],
        [216.7, 1651],
        [233.3, 1775],
        [250, 1875.33],
        [266.7, 1949.33],
        [283.3, 1994.67],
        [300, 2010],
      ],
    },
  };

/**
 * Residuals of a curve against recorded frames. The paging integrator runs
 * floor(elapsed ms) steps on each frame, so the state UIKit shows on a frame
 * is the curve after the cumulative floored steps since the start (`steps`);
 * a timed curve (the animated scroll) is read at the frame times (`time`).
 */
function errors(
  curve: {at(t: number): number},
  frames: number[][],
  clock: 'steps' | 'time',
): {rms: number; max: number} {
  let steps = 0;
  const residuals = frames.map(([ms, x], i) => {
    if (clock === 'steps' && i > 0) {
      steps += Math.floor(ms - frames[i - 1][0] + 1e-6);
    }
    const t =
      clock === 'steps' ? steps / paging.integrator.stepsPerSecond : ms / 1000;
    return curve.at(t) - x;
  });
  const rms = Math.sqrt(
    residuals.reduce((sum, r) => sum + r * r, 0) / residuals.length,
  );
  return {rms, max: Math.max(...residuals.map(Math.abs))};
}

describe('pagingSettleVelocity: the floor on the one release velocity (spec:AST-100 FR3)', () => {
  it('zeroes a release velocity below the floor, either way', () => {
    expect(pagingSettleVelocity(200)).toBe(0);
    expect(pagingSettleVelocity(-200)).toBe(0);
  });

  it('keeps a velocity at or above the floor: UIKit keeps a steady 249 pt/s release (0.249 pt/ms)', () => {
    expect(pagingSettleVelocity(249)).toBe(249);
    expect(pagingSettleVelocity(-260)).toBe(-260);
  });
});

describe("solvePaging: UIKit's paging settle, frame by frame", () => {
  it.each(Object.entries(SETTLES))(
    'reproduces the recorded %s within a pixel',
    (_, {from, velocity = 0, to, frames}) => {
      const curve = solvePaging({from, velocity, to});
      const {rms, max} = errors(curve, frames, 'steps');
      expect(rms).toBeLessThan(0.35);
      expect(max).toBeLessThan(0.8);
    },
  );

  it('ends exactly on the page about 0.33 s after a release at rest', () => {
    const curve = solvePaging({from: 633.33, velocity: 0, to: 804});
    expect(curve.at(curve.duration)).toBe(804);
    expect(curve.velocity(curve.duration)).toBe(0);
    expect(curve.duration).toBeGreaterThan(0.3);
    expect(curve.duration).toBeLessThan(0.36);
  });

  it("starts at the release position with UIKit's step velocity", () => {
    const curve = solvePaging({from: 500, velocity: 1000, to: 804});
    expect(curve.at(0)).toBe(500);
    // 1000 px/s enters as 1 px per step; 960 steps a second.
    expect(curve.velocity(0)).toBeCloseTo(960, 6);
  });

  it('is continuous and monotonic for a release at rest', () => {
    const curve = solvePaging({from: 589, velocity: 0, to: 402});
    let previous = curve.at(0);
    for (let t = 0.001; t <= curve.duration; t += 0.001) {
      const value = curve.at(t);
      expect(value).toBeLessThanOrEqual(previous + 1e-9);
      expect(Math.abs(value - previous)).toBeLessThan(3);
      previous = value;
    }
  });

  it('carries a forward flick on with a small overshoot-free approach', () => {
    const curve = solvePaging({from: 450, velocity: 600, to: 804});
    // The pull is underdamped (ζ ≈ 0.88): it may pass the page by a hair.
    let maxValue = -Infinity;
    for (let t = 0; t <= curve.duration; t += 0.004) {
      maxValue = Math.max(maxValue, curve.at(t));
    }
    expect(maxValue).toBeLessThan(804 + 2);
    expect(curve.at(curve.duration)).toBe(804);
  });

  it('settles at once when already on the page and at rest', () => {
    const curve = solvePaging({from: 804, velocity: 0, to: 804});
    expect(curve.steps).toBe(0);
    expect(curve.duration).toBe(0);
    expect(curve.at(0.1)).toBe(804);
  });

  it('runs the documented integrator', () => {
    const {springPull, friction} = paging.integrator;
    const curve = solvePaging({from: 0, velocity: 0, to: 100});
    // One step from rest: v = (0 + 100·pull)·friction.
    const oneStep = 100 * springPull * friction;
    expect(curve.at(1 / paging.integrator.stepsPerSecond)).toBeCloseTo(
      oneStep,
      9,
    );
  });
});

describe('solveAnimatedPageScroll: setContentOffset(_:animated:)', () => {
  it.each(Object.entries(ANIMATED))(
    'reproduces the recorded %s',
    (_, {from, to, frames}) => {
      const curve = solveAnimatedPageScroll({from, to});
      const {rms, max} = errors(curve, frames, 'time');
      expect(rms).toBeLessThan(0.5);
      expect(max).toBeLessThan(1.2);
    },
  );

  it('lasts 0.3 s whatever the distance and ends at rest', () => {
    for (const distance of [402, 804, 2010]) {
      const curve = solveAnimatedPageScroll({from: 0, to: distance});
      expect(curve.duration).toBe(0.3);
      expect(curve.at(0.3)).toBe(distance);
      expect(curve.velocity(0.3)).toBe(0);
      expect(curve.velocity(0)).toBe(0);
    }
  });

  it('peaks at π/2 times the average speed halfway', () => {
    const curve = solveAnimatedPageScroll({from: 0, to: 402});
    expect(curve.velocity(0.15)).toBeCloseTo((Math.PI / 2) * (402 / 0.3), 6);
  });
});
