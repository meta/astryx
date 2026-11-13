// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file linearEasing.ts
 * @input A duration and the fraction of a move done at each time
 * @output Exports `linearEasing`, that curve as CSS `linear()` easing text,
 *   and `sampleCount`, how many samples cover a duration at 60 per second
 * @position Pure math under the motion helpers; no DOM, no React
 */

/** Samples per second of a sampled curve: one per frame at 60 Hz. */
const SAMPLES_PER_SECOND = 60;

/** How many samples cover `durationMs`, both ends included: at least 2. */
export function sampleCount(durationMs: number): number {
  return Math.max(2, Math.ceil((durationMs / 1000) * SAMPLES_PER_SECOND) + 1);
}

/**
 * The curve `done` traces over `durationMs` as CSS `linear()` easing text,
 * one stop per frame. `done(t)` is the fraction of the move done `t` ms in.
 * A CSS transition with this easing and duration follows the curve.
 */
export function linearEasing(
  durationMs: number,
  done: (t: number) => number,
): string {
  const count = sampleCount(durationMs);
  const stops: string[] = [];
  for (let i = 0; i < count; i++) {
    const value = done((i / (count - 1)) * durationMs);
    stops.push(String(Math.round(value * 10000) / 10000));
  }
  return `linear(${stops.join(', ')})`;
}
