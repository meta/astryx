// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file VelocityTracker.ts
 * @input Timestamped positions of a moving contact
 * @output Exports VelocityTracker, the release-velocity estimator every
 *   continuous recognizer uses, and its strategy type
 * @position Pure math under packages/core/src/gestures; no DOM
 *
 * What a release hands to a spring or a deceleration: the finger's velocity
 * when it lifted, in px per SECOND (UIKit's unit for `velocity(in:)`).
 *
 * - `uikit` (default): UIPanGestureRecognizer's own filter, measured. Each
 *   event's instantaneous velocity is the position change over the timestamp
 *   change since the previous event (the touch-down counts as the first),
 *   and the velocity is 0.2 times the newest one plus 0.8 times the one
 *   before. Fitted to every value UIKit reported on six HID streams, exactly.
 *   It reacts a frame late to an acceleration, includes a hold before the
 *   first move, and never decays: a finger at rest sends no events, so a
 *   release after a pause reports the last moving value, as UIKit does.
 * - `lsq2`: a least-squares quadratic fit over the last 100 ms (20 samples at
 *   most), differentiated at the newest sample (Android's and Flutter's
 *   default). Smoother; not UIKit.
 * - `iosFling`: Flutter's `IOSScrollViewFlingVelocityTracker` (weights 0.6 /
 *   0.35 / 0.05 on the last three instantaneous velocities, oldest first).
 * - `window`: the two-point speed over the last 100 ms that BottomSheet's
 *   gesture used, kept for comparison.
 *
 * Feed the `uikit` filter one sample per input event (coalesced samples
 * would change its timing); the others take every sample.
 *
 * SYNC: When modified, update VelocityTracker.test.ts.
 */

import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import type {Point, TouchSample} from './types';

export type VelocityStrategy = 'uikit' | 'lsq2' | 'iosFling' | 'window';

export interface VelocityTrackerOptions {
  /** @default 'uikit' */
  strategy?: VelocityStrategy;
  /** Samples older than this (ms) relative to the newest are ignored. */
  horizon?: number;
  /** At most this many samples are kept. */
  maxSamples?: number;
  /** For `lsq2`: a gap this long (ms) between samples separates two motions. */
  assumeStopped?: number;
}

const ZERO: Point = {x: 0, y: 0};

export class VelocityTracker {
  readonly strategy: VelocityStrategy;
  private readonly horizon: number;
  private readonly maxSamples: number;
  private readonly assumeStopped: number;
  private samples: TouchSample[] = [];

  constructor(options: VelocityTrackerOptions = {}) {
    this.strategy = options.strategy ?? 'uikit';
    this.horizon = options.horizon ?? UIKIT_GESTURES.velocity.horizon.value;
    this.maxSamples =
      options.maxSamples ?? UIKIT_GESTURES.velocity.maxSamples.value;
    this.assumeStopped =
      options.assumeStopped ?? UIKIT_GESTURES.velocity.assumeStopped.value;
  }

  /** Forget every sample (a new gesture). */
  reset(): void {
    this.samples = [];
  }

  /**
   * Record a position. Timestamps must not go backwards; a sample at the
   * same timestamp as the newest replaces it.
   */
  add(x: number, y: number, time: number): void {
    const newest = this.samples[this.samples.length - 1];
    if (newest != null && time <= newest.time) {
      if (time === newest.time) {
        this.samples[this.samples.length - 1] = {x, y, time};
      }
      return;
    }
    this.samples.push({x, y, time});
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  /** Record every sample in order. */
  addSamples(samples: ReadonlyArray<TouchSample>): void {
    for (const sample of samples) {
      this.add(sample.x, sample.y, sample.time);
    }
  }

  /** The newest sample, if any. */
  get lastSample(): TouchSample | null {
    return this.samples[this.samples.length - 1] ?? null;
  }

  /** The velocity in px/s at the newest sample. */
  velocity(): Point {
    const newest = this.samples[this.samples.length - 1];
    if (newest == null) {
      return ZERO;
    }
    switch (this.strategy) {
      case 'uikit':
        return uikitVelocity(this.samples);
      case 'iosFling':
        return iosFlingVelocity(this.recentSamples(newest));
      case 'window':
        return windowVelocity(this.samples, newest, this.horizon);
      case 'lsq2':
        return leastSquaresVelocity(this.recentSamples(newest), newest.time);
    }
  }

  /**
   * The samples that describe continuous recent motion: within the horizon
   * of the newest, and stopping at the first gap longer than the
   * assume-stopped window (motion before a rest is not this motion).
   */
  private recentSamples(newest: TouchSample): TouchSample[] {
    const recent: TouchSample[] = [];
    let previous = newest;
    for (let i = this.samples.length - 1; i >= 0; i--) {
      const sample = this.samples[i];
      if (
        newest.time - sample.time > this.horizon ||
        previous.time - sample.time > this.assumeStopped
      ) {
        break;
      }
      recent.unshift(sample);
      previous = sample;
    }
    return recent;
  }
}

/**
 * Least-squares fit of x(t) and y(t) by a polynomial of degree
 * min(2, n - 1), with t measured from the newest sample; the velocity is the
 * linear coefficient (the derivative at t = 0).
 */
function leastSquaresVelocity(
  samples: ReadonlyArray<TouchSample>,
  newestTime: number,
): Point {
  const n = samples.length;
  if (n < 2) {
    return ZERO;
  }
  const degree = Math.min(2, n - 1);
  const times = samples.map(sample => sample.time - newestTime);
  const vx = polynomialSlope(
    times,
    samples.map(sample => sample.x),
    degree,
  );
  const vy = polynomialSlope(
    times,
    samples.map(sample => sample.y),
    degree,
  );
  if (vx == null || vy == null) {
    // Degenerate timing (every sample at one instant): fall back to a line.
    const lx = degree > 1 ? polynomialSlope(times, xs(samples), 1) : null;
    const ly = degree > 1 ? polynomialSlope(times, ys(samples), 1) : null;
    return lx == null || ly == null ? ZERO : {x: lx * 1000, y: ly * 1000};
  }
  return {x: vx * 1000, y: vy * 1000};
}

function xs(samples: ReadonlyArray<TouchSample>): number[] {
  return samples.map(sample => sample.x);
}

function ys(samples: ReadonlyArray<TouchSample>): number[] {
  return samples.map(sample => sample.y);
}

/**
 * The coefficient of t in the least-squares polynomial of `degree` through
 * (t, v), by the normal equations with partial pivoting. Times are a few
 * hundred ms at most, so the system is well conditioned in doubles. Null when
 * the system is singular.
 */
function polynomialSlope(
  times: ReadonlyArray<number>,
  values: ReadonlyArray<number>,
  degree: number,
): number | null {
  const size = degree + 1;
  // Normal matrix A[i][j] = sum t^(i+j), right side b[i] = sum v * t^i.
  const matrix: number[][] = [];
  for (let i = 0; i < size; i++) {
    matrix.push(new Array<number>(size + 1).fill(0));
  }
  for (let k = 0; k < times.length; k++) {
    const t = times[k];
    const powers = [1];
    for (let p = 1; p <= 2 * degree; p++) {
      powers.push(powers[p - 1] * t);
    }
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        matrix[i][j] += powers[i + j];
      }
      matrix[i][size] += values[k] * powers[i];
    }
  }
  const solution = solveLinearSystem(matrix);
  return solution == null ? null : solution[1];
}

/** Gaussian elimination with partial pivoting on an augmented matrix. */
function solveLinearSystem(matrix: number[][]): number[] | null {
  const size = matrix.length;
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) {
        pivot = row;
      }
    }
    if (Math.abs(matrix[pivot][column]) < 1e-9) {
      return null;
    }
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    for (let row = column + 1; row < size; row++) {
      const factor = matrix[row][column] / matrix[column][column];
      for (let k = column; k <= size; k++) {
        matrix[row][k] -= factor * matrix[column][k];
      }
    }
  }
  const solution = new Array<number>(size).fill(0);
  for (let row = size - 1; row >= 0; row--) {
    let sum = matrix[row][size];
    for (let k = row + 1; k < size; k++) {
      sum -= matrix[row][k] * solution[k];
    }
    solution[row] = sum / matrix[row][row];
  }
  return solution;
}

const UIKIT_CURRENT_WEIGHT = UIKIT_GESTURES.velocity.currentWeight.value;

/** UIPanGestureRecognizer's filter: 0.2 x newest + 0.8 x previous event velocity. */
function uikitVelocity(samples: ReadonlyArray<TouchSample>): Point {
  const n = samples.length;
  if (n < 2) {
    return ZERO;
  }
  const current = pairVelocity(samples[n - 2], samples[n - 1]);
  if (n === 2) {
    // One interval so far: UIKit reports it whole (a pinch's first value).
    return current;
  }
  const previous = pairVelocity(samples[n - 3], samples[n - 2]);
  return {
    x:
      UIKIT_CURRENT_WEIGHT * current.x +
      (1 - UIKIT_CURRENT_WEIGHT) * previous.x,
    y:
      UIKIT_CURRENT_WEIGHT * current.y +
      (1 - UIKIT_CURRENT_WEIGHT) * previous.y,
  };
}

/** Instantaneous velocity (px/s) between two samples, zero across no time. */
function pairVelocity(start: TouchSample, end: TouchSample): Point {
  const dt = end.time - start.time;
  if (dt <= 0) {
    return ZERO;
  }
  return {
    x: ((end.x - start.x) / dt) * 1000,
    y: ((end.y - start.y) / dt) * 1000,
  };
}

/**
 * Flutter's IOSScrollViewFlingVelocityTracker: 0.6 x the velocity two pairs
 * back, 0.35 x one pair back, 0.05 x the newest pair. A pair that does not
 * exist contributes zero, as it does there.
 */
function iosFlingVelocity(samples: ReadonlyArray<TouchSample>): Point {
  const n = samples.length;
  const pair = (back: number): Point => {
    const end = samples[n - 1 - back];
    const start = samples[n - 2 - back];
    return end == null || start == null ? ZERO : pairVelocity(start, end);
  };
  const older = pair(2);
  const previous = pair(1);
  const latest = pair(0);
  return {
    x: older.x * 0.6 + previous.x * 0.35 + latest.x * 0.05,
    y: older.y * 0.6 + previous.y * 0.35 + latest.y * 0.05,
  };
}

/**
 * BottomSheet's former estimator: displacement from the oldest sample still
 * inside the window (keeping at least one partner) over the elapsed time,
 * with a lone partner older than the window read as if it took the window.
 */
function windowVelocity(
  samples: ReadonlyArray<TouchSample>,
  newest: TouchSample,
  horizon: number,
): Point {
  if (samples.length < 2) {
    return ZERO;
  }
  let first = samples.length - 2;
  while (first > 0 && newest.time - samples[first - 1].time <= horizon) {
    first--;
  }
  const oldest = samples[first];
  const span = Math.min(newest.time - oldest.time, horizon);
  if (span <= 0) {
    return ZERO;
  }
  return {
    x: ((newest.x - oldest.x) / span) * 1000,
    y: ((newest.y - oldest.y) / span) * 1000,
  };
}
