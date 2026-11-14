// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What a swizzle-proof slice takes, by the record's model.
 * @input The record's `swizzleProof` model; the slices' summary lines
 *   (`SWIZZLE_PROOF {…}`, packages/cli/test/swizzle-proof/slice.mjs)
 * @output A slice's cost for the targets it holds; the model fitted from
 *   summary lines; the slices that ran past the model
 * @position Shared by the Node legs' split (scripts/vitest-shard-sequencer.mjs,
 *   which also records the model) and the drift check
 *   (.github/scripts/node-time-drift.mjs), so the cost the split uses is the
 *   cost the check judges
 */

/**
 * @typedef {{setupSeconds: number, proveBaseSeconds: number, perTargetSeconds: number}} SliceModel
 * @typedef {{slice?: string, affected: number, timings?: Record<string, number>, totalMs: number}} SliceSample
 */

/** The steps a slice takes before it proves anything. */
const SETUP_STEPS = ['list', 'eject', 'affected'];

/** @param {number} value */
const tenth = value => Math.round(value * 10) / 10;

/** @param {number[]} values */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * What one slice takes: its setup (listing, copying and sorting its
 * targets), and, when it holds an affected target, the proof's own setup
 * (type-check, bundle and render each start once) and each target's time.
 * Never more than `max`, the slice's recorded time.
 * @param {SliceModel} model
 * @param {number} held affected targets in the slice
 * @param {number} [max]
 */
export function sliceCost(model, held, max = Infinity) {
  const seconds =
    model.setupSeconds +
    (held > 0 ? model.proveBaseSeconds + model.perTargetSeconds * held : 0);
  return Math.min(max, tenth(seconds));
}

/**
 * The slices' summary lines in a log, as objects. A line that does not parse
 * is left out.
 * @param {string} text
 * @returns {SliceSample[]}
 */
export function swizzleSamples(text) {
  const plain = text.replace(/(?:\x1b|\^\[)\[[0-9;]*m/g, '');
  const samples = [];
  for (const [, json] of plain.matchAll(/SWIZZLE_PROOF (\{.*\})\s*$/gm)) {
    try {
      const sample = JSON.parse(json);
      if (Number.isFinite(sample.affected) && Number.isFinite(sample.totalMs))
        samples.push(sample);
    } catch {
      // A truncated line is not a sample.
    }
  }
  return samples;
}

/** @param {SliceSample} sample */
const setupMs = sample =>
  SETUP_STEPS.reduce((sum, step) => sum + (sample.timings?.[step] ?? 0), 0);

/**
 * The model the samples show: the median setup, and a straight line through
 * the proving time of the slices that proved something (its intercept is the
 * proof's own setup, its slope each target's time). A part the samples
 * cannot show keeps `previous`: no samples keep the setup, and fewer than
 * three different affected counts keep the line.
 * @param {SliceSample[]} samples
 * @param {SliceModel} [previous]
 * @returns {SliceModel | undefined}
 */
export function fitSwizzleModel(samples, previous) {
  if (samples.length === 0) return previous;
  const setupSeconds = tenth(median(samples.map(setupMs)) / 1000);
  const points = samples
    .filter(sample => sample.affected > 0)
    .map(sample => [
      sample.affected,
      (sample.totalMs - setupMs(sample)) / 1000,
    ]);
  const counts = new Set(points.map(([affected]) => affected));
  if (counts.size < 3) {
    return previous ? {...previous, setupSeconds} : undefined;
  }
  const meanX = points.reduce((sum, [x]) => sum + x, 0) / points.length;
  const meanY = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
  const slope =
    points.reduce((sum, [x, y]) => sum + (x - meanX) * (y - meanY), 0) /
    points.reduce((sum, [x]) => sum + (x - meanX) ** 2, 0);
  const perTargetSeconds = Math.max(0, slope);
  return {
    setupSeconds,
    proveBaseSeconds: tenth(Math.max(0, meanY - perTargetSeconds * meanX)),
    perTargetSeconds: tenth(perTargetSeconds),
  };
}

/**
 * The slices that ran past the model, after the leg's own slowdown is taken
 * out: more than `ratio` times the model's time and more than `margin`
 * seconds over it.
 * @param {SliceSample[]} samples
 * @param {SliceModel} model
 * @param {{factor?: number, ratio: number, margin: number}} limits
 * @returns {{slice: string, affected: number, measured: number, expected: number}[]}
 */
export function slowSlices(samples, model, {factor = 1, ratio, margin}) {
  return samples
    .map(sample => ({
      slice: sample.slice ?? '?',
      affected: sample.affected,
      measured: tenth(sample.totalMs / 1000),
      expected: tenth(sliceCost(model, sample.affected) * factor),
    }))
    .filter(
      ({measured, expected}) =>
        measured > expected * ratio && measured - expected > margin,
    );
}
