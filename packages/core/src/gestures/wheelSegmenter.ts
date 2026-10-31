// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file wheelSegmenter.ts
 * @input A wheel stream's deltas along one axis, with their event times
 * @output Exports WheelSegmenter: splits the stream into gestures and reads
 *   a trackpad's lift (the onset of momentum)
 * @position Scratch for the #8676 preview (not for merge as is): the web
 *   reports no trackpad contact or phase, so both are inferred.
 *
 * A trackpad gesture has a finger phase (deltas while the fingers move,
 * possibly with pauses when they move slowly) and, after a fling, a momentum
 * phase (deltas at frame rate that shrink smoothly). The lift is read as the
 * start of a run of shrinking deltas that has lost a fifth of its size. In
 * the finger phase, a pause of `idleMs` ends the gesture. In the momentum
 * phase, a reversal, a jump up against the decay, or a pause of 50 ms starts
 * a new gesture: momentum never pauses, reverses or grows.
 */

export type WheelBoundary = 'first' | 'idle' | 'reversal' | 'jump' | 'gap';
export type WheelPhase = 'finger' | 'momentum';

export interface WheelSegment {
  /** Why this event starts a new gesture, or null when it continues one. */
  readonly boundary: WheelBoundary | null;
  readonly phase: WheelPhase;
  /** The gesture's number, counting from 1. */
  readonly gesture: number;
  /** This event is where the fingers lifted (momentum begins with it). */
  readonly liftNow: boolean;
  /** This event shrank, so it may be momentum: hold it until known. */
  readonly decaying: boolean;
}

/** Momentum arrives at frame rate: a pause this long ends it. */
const MOMENTUM_GAP_MS = 50;
/** Shrinking deltas in a row before the lift is read. */
const LIFT_RUN = 4;
/** And how much of its size the run has lost by then. */
const LIFT_DECAY = 0.8;

export class WheelSegmenter {
  gesture = 0;
  phase: WheelPhase = 'finger';
  private last = -Infinity;
  private previous = 0;
  private sign = 0;
  private count = 0;
  private run = 0;
  private runStart = 0;

  push(time: number, delta: number, idleMs: number): WheelSegment {
    const size = Math.abs(delta);
    const sign = Math.sign(delta);
    const gap = time - this.last;
    let boundary: WheelBoundary | null = null;
    if (this.count === 0) {
      boundary = this.gesture === 0 ? 'first' : 'idle';
    } else if (this.phase === 'finger' && gap >= idleMs) {
      boundary = 'idle';
    } else if (this.phase === 'momentum') {
      if (sign !== 0 && this.sign !== 0 && sign !== this.sign) {
        boundary = 'reversal';
      } else if (gap >= MOMENTUM_GAP_MS) {
        boundary = 'gap';
      } else if (size >= 2 && size > this.previous * 1.3 + 0.5) {
        boundary = 'jump';
      }
    }
    if (boundary != null) {
      this.gesture += 1;
      this.phase = 'finger';
      this.count = 0;
      this.run = 0;
    }
    let liftNow = false;
    let decaying = false;
    if (this.phase === 'finger' && this.count >= 3 && size > 0) {
      decaying = size <= this.previous * 0.995 && size >= this.previous * 0.5;
      if (decaying) {
        if (this.run === 0) {
          this.runStart = this.previous;
        }
        this.run += 1;
      } else {
        this.run = 0;
      }
      if (this.run >= LIFT_RUN && size <= this.runStart * LIFT_DECAY) {
        this.phase = 'momentum';
        liftNow = true;
      }
    }
    this.count += 1;
    this.previous = size;
    if (sign !== 0) {
      this.sign = sign;
    }
    this.last = time;
    return {
      boundary,
      phase: this.phase,
      gesture: this.gesture,
      liftNow,
      decaying: decaying && !liftNow,
    };
  }

  /** The gesture ended on its own (its timer): the next event starts one. */
  end(): void {
    this.count = 0;
  }
}
