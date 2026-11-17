// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file edgeAutoscroll.ts
 * @input How far to scroll on the next tick, and a way to scroll that far
 * @output `edgeAutoscroll`: the timer behind an edge autoscroll. While a
 *   pointer rests near a scroll edge, the content scrolls toward it one step
 *   per tick, until the step is 0 or an edge stops it
 * @position Shared by the menu press model (hooks/useMenuPress.ts, its edge
 *   autoscroll) and anything else that scrolls under a held pointer
 *
 * The caller owns the geometry: `step` reads where the pointer is and
 * answers how far to scroll (0 when it is out of the edge zone), and
 * `apply` scrolls and answers how far the content actually moved, so the
 * caller can re-read what is under the pointer by exactly that much. An edge
 * stops the timer (`apply` answers 0); nothing latches, so the next `update`
 * starts it again whenever `step` is not 0.
 */

/** Options of `edgeAutoscroll`. */
export interface EdgeAutoscrollOptions {
  /** Milliseconds between ticks. */
  readonly intervalMs: number;
  /**
   * The signed distance to scroll on the next tick (positive toward the end),
   * read at every tick and by `update`; 0 stops the timer.
   */
  readonly step: () => number;
  /**
   * Scrolls by `delta` and returns how far the content actually moved; 0 (an
   * edge) stops the timer.
   */
  readonly apply: (delta: number) => number;
  /** Ticks once as the timer starts, rather than one interval later. @default false */
  readonly immediate?: boolean;
  /**
   * Keeps to the interval's clock: a late timer catches up by one tick, a
   * longer stall is skipped, as a run loop's missed timer fires are.
   * @default false
   */
  readonly catchUp?: boolean;
  /** The clock, in milliseconds. @default performance.now */
  readonly now?: () => number;
}

/** A running or idle edge autoscroll. */
export interface EdgeAutoscroll {
  /** Starts the timer when `step` is not 0, and stops it when it is. */
  update(): void;
  /** Stops the timer. */
  stop(): void;
  /** Whether the timer runs. */
  readonly isRunning: boolean;
}

/** An edge autoscroll; idle until `update` finds a step. */
export function edgeAutoscroll(options: EdgeAutoscrollOptions): EdgeAutoscroll {
  const {intervalMs, immediate = false, catchUp = false} = options;
  const now = options.now ?? (() => performance.now());
  let timer: ReturnType<typeof setInterval> | null = null;
  let base = 0;
  let ticks = 0;

  const stop = () => {
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
  };

  // `onClock` is false for the tick `immediate` adds as the timer starts: it
  // is not one of the interval's ticks, so it leaves the catch-up count alone.
  const tick = (onClock: boolean) => {
    const step = options.step();
    if (step === 0) {
      stop();
      return;
    }
    let count = 1;
    if (catchUp && onClock) {
      const due = Math.floor((now() - base) / intervalMs);
      count = Math.max(1, Math.min(2, due - ticks));
      ticks = Math.max(ticks + count, due);
    }
    if (options.apply(step * count) === 0) {
      stop();
    }
  };

  return {
    update() {
      if (options.step() === 0) {
        stop();
        return;
      }
      if (timer != null) {
        return;
      }
      base = now();
      ticks = 0;
      timer = setInterval(() => tick(true), intervalMs);
      if (immediate) {
        tick(false);
      }
    },
    stop,
    get isRunning() {
      return timer != null;
    },
  };
}
