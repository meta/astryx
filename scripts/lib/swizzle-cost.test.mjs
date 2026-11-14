// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for swizzle-cost.mjs: a slice's cost by the record's model,
 * the model fitted from the slices' summary lines, and the slow slices.
 */

import {describe, expect, it} from 'vitest';

import {
  fitSwizzleModel,
  sliceCost,
  slowSlices,
  swizzleSamples,
} from './swizzle-cost.mjs';

const MODEL = {setupSeconds: 28, proveBaseSeconds: 97, perTargetSeconds: 4};

/** A slice summary: `setup` seconds of setup, `prove` seconds of proving. */
const sample = (affected, setup, prove, slice = '1/8') => ({
  slice,
  affected,
  timings: {list: 1000, eject: (setup - 3) * 1000, affected: 2000},
  totalMs: (setup + prove) * 1000,
});

describe('a swizzle-proof slice cost', () => {
  it('is its setup alone when it holds no affected target', () => {
    expect(sliceCost(MODEL, 0)).toBe(28);
  });

  it('adds the proof setup once, then each target', () => {
    expect(sliceCost(MODEL, 1)).toBe(129);
    expect(sliceCost(MODEL, 16)).toBe(189);
  });

  it('never exceeds the slice’s recorded time', () => {
    expect(sliceCost(MODEL, 21, 180.3)).toBe(180.3);
  });
});

describe('summary lines', () => {
  it('reads each slice’s summary from a run log, with job columns and colour codes', () => {
    const line = JSON.stringify(sample(3, 20, 100));
    const log = [
      `test-node (2)\tRun\t2026-11-14T00:00:00.0Z \u001b[33mSWIZZLE_PROOF ${line}`,
      `test-node (3)\tRun\t2026-11-14T00:00:00.0Z SWIZZLE_PROOF ${line}`,
      'SWIZZLE_PROOF {"slice":"9/8",',
      'unrelated output',
    ].join('\n');
    expect(swizzleSamples(log)).toEqual([
      sample(3, 20, 100),
      sample(3, 20, 100),
    ]);
  });
});

describe('the fitted model', () => {
  it('takes the median setup and a straight line through the proving time', () => {
    const samples = [
      sample(0, 18, 0),
      sample(1, 30, 101),
      sample(4, 26, 113),
      sample(16, 28, 161),
      sample(3, 40, 109),
    ];
    expect(fitSwizzleModel(samples)).toEqual({
      setupSeconds: 28,
      proveBaseSeconds: 97,
      perTargetSeconds: 4,
    });
  });

  it('keeps the earlier line when the samples hold fewer than three affected counts', () => {
    const samples = [sample(2, 30, 120), sample(2, 30, 140), sample(0, 20, 0)];
    expect(fitSwizzleModel(samples, MODEL)).toEqual({
      ...MODEL,
      setupSeconds: 30,
    });
    expect(fitSwizzleModel(samples)).toBeUndefined();
  });

  it('keeps the earlier model when there is no sample', () => {
    expect(fitSwizzleModel([], MODEL)).toBe(MODEL);
  });
});

describe('slow slices', () => {
  it('names a slice past the model by the ratio and the margin, after the leg factor', () => {
    const samples = [
      sample(1, 28, 101, '1/8'),
      sample(1, 60, 250, '2/8'),
      sample(0, 90, 0, '3/8'),
    ];
    expect(slowSlices(samples, MODEL, {ratio: 1.5, margin: 60})).toEqual([
      {slice: '2/8', affected: 1, measured: 310, expected: 129},
      {slice: '3/8', affected: 0, measured: 90, expected: 28},
    ]);
    // A leg running 1.2 times slow: slice 3 is then within the margin.
    expect(
      slowSlices(samples, MODEL, {factor: 1.2, ratio: 1.5, margin: 60}),
    ).toEqual([{slice: '2/8', affected: 1, measured: 310, expected: 154.8}]);
  });
});
