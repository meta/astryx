// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file wheelSegmenter.ts
 * @input A wheel stream's deltas along one axis, with their event times
 * @output Exports WheelSegmenter and isBunched. WheelSegmenter splits the
 *   stream into gestures and reads a trackpad's lift (the onset of momentum).
 *   isBunched tells one stall's merge from a frame.
 * @position Read by GestureHost.ts's wheel input: the web reports no
 *   trackpad contact or phase, so both are inferred.
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
  /** This event came so soon after the one before that it is a merge. */
  readonly bunched: boolean;
}

/** Momentum arrives at frame rate: a pause this long ends it. */
const MOMENTUM_GAP_MS = 50;
/**
 * A wheel this close to the one before, ms, is one stall's merge. Frames come
 * further apart at every display rate up to 500 Hz, which is 2 ms.
 */
const BUNCHED_MS = 1.5;
/** Shrinking deltas in a row before the lift is read. */
const LIFT_RUN = 4;
/** And how much of its size the run has lost by then. */
const LIFT_DECAY = 0.8;

/**
 * Whether a wheel `intervalMs` after the one before is one stall's merge, not
 * a frame. A stalled page receives the wheels it held back together, within
 * 1.5 ms of each other. The rule reads no history, so slow wheels never make
 * a real frame look like a merge.
 */
export function isBunched(intervalMs: number): boolean {
  return intervalMs <= BUNCHED_MS;
}

/**
 * A trackpad gesture has a finger phase and, after a fling, a momentum phase.
 * In the finger phase, deltas come while the fingers move, with pauses when
 * they move slowly. In the momentum phase, deltas come at frame rate and
 * shrink smoothly. The lift is the start of a run of shrinking deltas that
 * has lost a fifth of its size. In the finger phase, a pause of `idleMs`
 * ends the gesture. In the momentum phase, a reversal, a jump up against the
 * decay, or a pause of 50 ms starts a new gesture. A bunched wheel is never
 * a jump. The decay reads it by its last step. Momentum never pauses,
 * reverses or grows.
 */
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
    const bunched = this.count > 0 && isBunched(gap);
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
      } else if (!bunched && size >= 2 && size > this.previous * 1.3 + 0.5) {
        boundary = 'jump';
      }
    }
    // A bunched wheel carries the steps of the frames it merged. The decay
    // goes on from its last step, so the steps after it read as they are.
    const steps =
      boundary == null && bunched && this.previous > 0
        ? Math.max(1, Math.round(size / this.previous))
        : 1;
    if (boundary != null) {
      this.gesture += 1;
      this.phase = 'finger';
      this.count = 0;
      this.run = 0;
    }
    let liftNow = false;
    let decaying = false;
    if (this.phase === 'finger' && this.count >= 3 && size > 0) {
      // A bunched wheel is read by its last step, as the decay goes on from it.
      const step = size / steps;
      decaying = step <= this.previous * 0.995 && step >= this.previous * 0.5;
      if (decaying) {
        if (this.run === 0) {
          this.runStart = this.previous;
        }
        this.run += 1;
      } else {
        this.run = 0;
      }
      if (this.run >= LIFT_RUN && step <= this.runStart * LIFT_DECAY) {
        this.phase = 'momentum';
        liftNow = true;
      }
    }
    this.count += 1;
    this.previous = size / steps;
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
      bunched: boundary == null && bunched,
    };
  }

  /** The gesture ended on its own (its timer): the next event starts one. */
  end(): void {
    this.count = 0;
  }
}
