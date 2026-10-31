// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file decay.test.ts
 * @input vitest, the decay model
 * @output Checks the continuous coast against an independent per-millisecond
 *   simulation of UIScrollView's deceleration, against WWDC18's projection,
 *   and every derived time (settle, speed, reach)
 * @position Testing; validates decay.ts without a browser
 */

import {describe, expect, it} from 'vitest';
import {decayRestDistance, solveDecay} from './decay';
import {projectDistance} from './projection';
import {scroll} from './uikit/scroll';

/**
 * Independent reference: the deceleration rate applied literally, the
 * velocity multiplied by the rate once per millisecond and integrated
 * exactly over each millisecond step.
 */
function perMillisecond(
  from: number,
  velocity: number,
  rate: number,
  ms: number,
) {
  let x = from;
  let v = velocity / 1000; // units per ms
  const k = -Math.log(rate);
  for (let i = 0; i < ms; i++) {
    // Within one ms the speed falls from v to v·rate exponentially.
    x += (v * (1 - rate)) / k;
    v *= rate;
  }
  return {value: x, velocity: v * 1000};
}

describe('solveDecay', () => {
  for (const rate of [
    scroll.decelerationRate.normal,
    scroll.decelerationRate.fast,
  ]) {
    for (const velocity of [-3000, -400, 150, 2500, 8000]) {
      it(`matches a per-millisecond simulation (rate ${rate}, ${velocity} units/s)`, () => {
        const coast = solveDecay({from: 100, velocity, rate});
        for (const ms of [0, 1, 16, 100, 250, 600, 1500, 4000]) {
          const reference = perMillisecond(100, velocity, rate, ms);
          expect(coast.value(ms / 1000)).toBeCloseTo(reference.value, 6);
          expect(coast.velocity(ms / 1000)).toBeCloseTo(reference.velocity, 6);
        }
      });
    }
  }

  it('rests where the coast ends, 0.1 % past WWDC18\u2019s geometric projection', () => {
    const coast = solveDecay({from: 0, velocity: 2000});
    expect(coast.rest).toBeCloseTo(2000 / (-1000 * Math.log(0.998)), 9);
    expect(coast.value(60)).toBeCloseTo(coast.rest, 6);
    // −1 ÷ ln(0.998) = 499.5 ms against 0.998 ÷ 0.002 = 499 ms.
    expect(coast.rest / projectDistance(2000)).toBeCloseTo(499.5 / 499, 3);
    expect(decayRestDistance(2000)).toBeCloseTo(coast.rest, 9);
  });

  it('a fast rate stops sooner and shorter', () => {
    const normal = solveDecay({from: 0, velocity: 2000});
    const fast = solveDecay({
      from: 0,
      velocity: 2000,
      rate: scroll.decelerationRate.fast,
    });
    expect(fast.rest).toBeLessThan(normal.rest);
    expect(fast.settleTime(0.5)).toBeLessThan(normal.settleTime(0.5));
  });

  it('settleTime bounds every later distance to rest', () => {
    const coast = solveDecay({from: 0, velocity: -5000});
    for (const threshold of [5, 0.5, 0.01]) {
      const settle = coast.settleTime(threshold);
      expect(Math.abs(coast.value(settle) - coast.rest)).toBeCloseTo(
        threshold,
        9,
      );
      expect(Math.abs(coast.value(settle + 0.5) - coast.rest)).toBeLessThan(
        threshold,
      );
    }
    expect(solveDecay({from: 0, velocity: 0.1}).settleTime(0.5)).toBe(0);
  });

  it('timeToSpeed lands on the asked speed', () => {
    const coast = solveDecay({from: 0, velocity: 3000});
    const t = coast.timeToSpeed(100);
    expect(coast.velocity(t)).toBeCloseTo(100, 9);
    expect(coast.timeToSpeed(5000)).toBe(0);
    expect(coast.timeToSpeed(0)).toBe(Infinity);
  });

  it('timeToReach finds the crossing, or null when the coast never gets there', () => {
    const coast = solveDecay({from: 0, velocity: 2000});
    const t = coast.timeToReach(400);
    expect(t).not.toBeNull();
    expect(coast.value(t ?? 0)).toBeCloseTo(400, 9);
    expect(coast.timeToReach(-10)).toBeNull();
    expect(coast.timeToReach(coast.rest)).toBeNull();
    expect(coast.timeToReach(coast.rest + 1)).toBeNull();
    const back = solveDecay({from: 0, velocity: -2000});
    expect(back.value(back.timeToReach(-400) ?? 0)).toBeCloseTo(-400, 9);
    expect(solveDecay({from: 3, velocity: 0}).timeToReach(3)).toBe(0);
  });

  it('rejects a rate outside (0, 1)', () => {
    expect(() => solveDecay({from: 0, velocity: 1, rate: 1})).toThrow(
      RangeError,
    );
    expect(() => solveDecay({from: 0, velocity: 1, rate: 0})).toThrow(
      RangeError,
    );
  });
});
