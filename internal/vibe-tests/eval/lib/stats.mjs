// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Interval statistics for pass rates.
 * @input pass counts and trial counts
 * @output Wilson score intervals and Newcombe difference intervals
 * @position Pure helpers used by the vibe eval report
 */

const Z_95 = 1.959964;

/**
 * @param {number} passes
 * @param {number} trials
 * @param {number} [z]
 * @returns {{rate: number | null, low: number | null, high: number | null}}
 */
export function wilsonInterval(passes, trials, z = Z_95) {
  if (!Number.isInteger(passes) || !Number.isInteger(trials)) {
    throw new TypeError('passes and trials must be integers');
  }
  if (passes < 0 || trials < 0 || passes > trials) {
    throw new RangeError('expected 0 <= passes <= trials');
  }
  if (trials === 0) return {rate: null, low: null, high: null};
  const rate = passes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (rate + z2 / (2 * trials)) / denominator;
  const margin =
    (z * Math.sqrt((rate * (1 - rate)) / trials + z2 / (4 * trials * trials))) /
    denominator;
  return {
    rate,
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
}

/**
 * Newcombe hybrid score interval for the difference of two proportions (a - b).
 * @returns {{difference: number | null, low: number | null, high: number | null}}
 */
export function differenceInterval(passesA, trialsA, passesB, trialsB, z = Z_95) {
  const a = wilsonInterval(passesA, trialsA, z);
  const b = wilsonInterval(passesB, trialsB, z);
  if (a.rate === null || b.rate === null) {
    return {difference: null, low: null, high: null};
  }
  const difference = a.rate - b.rate;
  const low =
    difference - Math.sqrt((a.rate - a.low) ** 2 + (b.high - b.rate) ** 2);
  const high =
    difference + Math.sqrt((a.high - a.rate) ** 2 + (b.rate - b.low) ** 2);
  return {difference, low: Math.max(-1, low), high: Math.min(1, high)};
}

/**
 * @param {number[]} values
 * @returns {{mean: number | null, min: number | null, max: number | null}}
 */
export function summarize(values) {
  const finite = values.filter(value => Number.isFinite(value));
  if (finite.length === 0) return {mean: null, min: null, max: null};
  const total = finite.reduce((sum, value) => sum + value, 0);
  return {
    mean: total / finite.length,
    min: Math.min(...finite),
    max: Math.max(...finite),
  };
}
