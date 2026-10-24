// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file busy.ts
 * @input Uses a Playwright `Page`
 * @output `blockMainThread` — a synchronous busy loop on the page's main thread
 *   that reports exactly when it ran — and `busyWindowProof`, which reads frame
 *   evidence for that window.
 * @position The busy-main-thread proof: an animation that runs on the
 *   compositor keeps advancing at display rate while JavaScript holds the main
 *   thread; one driven from the main thread (rAF, style writes, layout
 *   properties) freezes for the whole block. Pair it with ./frames
 *   (`startScreencast` + `trackMarker`), which observes off the main thread.
 *
 * SYNC: Keep the README's busy-main-thread section equal to this contract.
 */

import type {Locator, Page} from '@playwright/test';
import {frameStats, type FrameStats, type TrackedFrame} from './frames';

export interface BusyWindow {
  /** Epoch ms when the loop started and ended, on the page's own clock. */
  readonly from: number;
  readonly to: number;
}

/**
 * Holds the page's main thread for `ms` (a synchronous loop: no task, frame,
 * rAF, event or microtask runs meanwhile). Resolves with the window it held.
 *
 * Block MID-FLIGHT only: start the gesture or animation first. A touch that
 * starts while the main thread is busy does not scroll or begin a gesture in
 * headless Chromium, even with only passive listeners, and an animation that
 * has not started cannot start (see `waitForAnimation`). Finger tracking
 * under a busy main thread is a simulator proof, not a Playwright one.
 *
 * With `during`, the page itself waits until an animation on that element (or
 * inside it) has run `minProgressMs`, then blocks in the same frame. A round
 * trip from the test would start the block later the busier the machine is,
 * leaving less of a short animation to judge.
 */
export async function blockMainThread(
  page: Page,
  ms: number,
  {
    during,
    minProgressMs = 16,
    timeout = 5_000,
  }: {during?: Locator; minProgressMs?: number; timeout?: number} = {},
): Promise<BusyWindow> {
  if (during == null) {
    return page.evaluate(duration => {
      const from = performance.timeOrigin + performance.now();
      const end = performance.now() + duration;
      let spins = 0;
      while (performance.now() < end) {
        spins += 1;
      }
      return {from, to: performance.timeOrigin + performance.now(), spins};
    }, ms);
  }
  return during.evaluate(
    (element, {duration, minProgress, wait}) =>
      new Promise<BusyWindow>((resolve, reject) => {
        const deadline = performance.now() + wait;
        const tick = () => {
          const running = element
            .getAnimations({subtree: true})
            .some(
              a =>
                a.playState === 'running' &&
                Number(a.currentTime ?? 0) >= minProgress,
            );
          if (running) {
            // The same loop as above, in the frame that saw the animation.
            const from = performance.timeOrigin + performance.now();
            const end = performance.now() + duration;
            while (performance.now() < end) {
              // Busy: nothing else runs.
            }
            resolve({from, to: performance.timeOrigin + performance.now()});
          } else if (performance.now() > deadline) {
            reject(new Error('blockMainThread: no animation started'));
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    {duration: ms, minProgress: minProgressMs, wait: timeout},
  );
}

export interface BusyVerdict {
  readonly pass: boolean;
  /** Each criterion the window missed, with its measured value and limit. */
  readonly failures: readonly string[];
}

export interface BusyProof extends FrameStats {
  readonly window: BusyWindow;
  /** The part of the window judged: inside the margins, up to `settledWithin`. */
  readonly judged: {readonly from: number; readonly to: number};
  /**
   * The screencast's frame interval, from the frames around the window as well
   * as inside it (a short window has few intervals; a frozen one has none).
   */
  readonly cadenceMs: number;
  /**
   * Whole frame intervals in the window at the measured cadence: the frames
   * the display shows there at least (one more, depending on phase).
   */
  readonly expectedFrames: number;
  /**
   * Longest time inside the window with no presented change, the window's own
   * edges included. A frozen animation presents no new frame at all (nothing
   * on screen changed, so the compositor sends none): its stall is the whole
   * window.
   */
  readonly longestStallMs: number;
  /**
   * `longestStallMs` in screencast intervals, rounded: 1 is no frame missed,
   * 2 is one dropped frame. Rounding absorbs timestamp jitter.
   */
  readonly longestStallFrames: number;
  /**
   * Frames in the window that presented a new position (the first compared
   * with the last frame before the window).
   */
  readonly moved: number;
  /** `moved` over `expectedFrames`. */
  readonly movedFraction: number;
  /** The judgment against the limits (see `busyWindowProof`). */
  readonly verdict: BusyVerdict;
  /** One line with the raw numbers, for an annotation or a failure message. */
  readonly summary: string;
}

/**
 * Frame evidence for a busy window: how many frames the screencast presented
 * inside it, how many of them moved the tracked axis, and the longest stall.
 * The window is trimmed by `marginMs` at both ends so the frame the block
 * started on and the one it ended on are not counted.
 *
 * The verdict tolerates what a loaded machine does to a screencast (a dropped
 * frame or two) and nothing a main-thread animation does (it presents no
 * frame for the whole block). It passes when:
 * - the median interval between presented frames is at most
 *   `maxMedianFrameMs` (display rate);
 * - no stall spans more than `maxStallFrames` screencast intervals;
 * - at least `minMovedFraction` of the frames the window should present at
 *   that cadence moved the tracked axis (a short window may still miss one).
 */
export function busyWindowProof(
  tracked: readonly TrackedFrame[],
  window: BusyWindow,
  {
    axis = 'y',
    marginMs = 20,
    settledWithin,
    maxMedianFrameMs = 20,
    maxStallFrames = 3,
    minMovedFraction = 0.9,
  }: {
    axis?: 'x' | 'y' | 'width' | 'height';
    marginMs?: number;
    /** Display rate: the most the median frame interval may be, ms. */
    maxMedianFrameMs?: number;
    /** The most screencast intervals one stall may span (3 = two dropped frames). */
    maxStallFrames?: number;
    /**
     * The least fraction of the expected frames that must move. One missed
     * frame is always allowed, so a window of under ten frames is not judged
     * stricter than a long one.
     */
    minMovedFraction?: number;
    /**
     * Stop judging once the value is within this many px of where it ends.
     * The screencast reports whole CSS pixels, so an easing tail that still
     * moves shows plateaus (26, 26, 26 against a final 24) that would read
     * as a stall: 2 is the usual value.
     */
    settledWithin?: number;
  } = {},
): BusyProof {
  let end = window.to - marginMs;
  if (settledWithin != null) {
    const valued = tracked.flatMap(f =>
      f.box == null ? [] : [{t: f.t, value: f.box[axis]}],
    );
    const final = valued.length > 0 ? valued[valued.length - 1].value : null;
    const arrived = valued.find(
      f =>
        f.t >= window.from &&
        final != null &&
        Math.abs(f.value - final) <= settledWithin,
    );
    if (arrived != null) {
      end = Math.min(end, arrived.t);
    }
  }
  const inner = {from: window.from + marginMs, to: end};
  const stats = frameStats(
    tracked.map(f => ({t: f.t, value: f.box == null ? null : f.box[axis]})),
    inner,
  );
  const values = tracked
    .filter(f => f.t >= inner.from && f.t <= inner.to)
    .map(f => ({t: f.t, value: f.box == null ? null : f.box[axis]}));
  const before = [...tracked].reverse().find(f => f.t < inner.from);
  let previous: number | null = before?.box == null ? null : before.box[axis];
  const changes: number[] = [];
  for (const v of values) {
    if (
      v.value != null &&
      previous != null &&
      Math.abs(v.value - previous) > 0.25
    ) {
      changes.push(v.t);
    }
    if (v.value != null) {
      previous = v.value;
    }
  }
  const edges = [inner.from, ...changes, inner.to];
  const longestStallMs = Math.max(
    ...edges.slice(1).map((t, i) => t - edges[i]),
  );
  const around = tracked
    .filter(f => f.t >= inner.from - 250 && f.t <= inner.to + 250)
    .map(f => f.t);
  const intervals = around
    .slice(1)
    .map((t, i) => t - around[i])
    .sort((a, b) => a - b);
  const cadence =
    intervals.length >= 4
      ? intervals[Math.floor(intervals.length / 2)]
      : stats.medianFrameMs || 1000 / 60;
  const expectedFrames = Math.floor((inner.to - inner.from) / cadence);
  const longestStallFrames = Math.round(longestStallMs / cadence);
  const moved = changes.length;
  const movedFraction = moved / Math.max(1, expectedFrames);
  const failures: string[] = [];
  if (stats.frames === 0 || stats.medianFrameMs > maxMedianFrameMs) {
    failures.push(
      `median frame interval ${stats.medianFrameMs.toFixed(1)} ms > ${maxMedianFrameMs} ms (${stats.frames} frames presented)`,
    );
  }
  if (longestStallFrames > maxStallFrames) {
    failures.push(
      `longest stall ${longestStallMs.toFixed(1)} ms = ${longestStallFrames} intervals > ${maxStallFrames}`,
    );
  }
  const allowedMisses = Math.max(
    1,
    Math.floor((1 - minMovedFraction) * expectedFrames + 1e-9),
  );
  if (expectedFrames - moved > allowedMisses) {
    failures.push(
      `${moved} of ${expectedFrames} expected frames moved (${(movedFraction * 100).toFixed(0)}% < ${(minMovedFraction * 100).toFixed(0)}%)`,
    );
  }
  const summary =
    `${(inner.to - inner.from).toFixed(0)} ms judged at ${cadence.toFixed(1)} ms/frame: ${stats.frames} frames presented, ` +
    `${moved}/${expectedFrames} moved (${(movedFraction * 100).toFixed(0)}%), ` +
    `median ${stats.medianFrameMs.toFixed(1)} ms, ` +
    `longest stall ${longestStallMs.toFixed(1)} ms (${longestStallFrames} intervals), ` +
    `${stats.monotonic ? 'monotonic' : 'not monotonic'}`;
  return {
    ...stats,
    window,
    judged: inner,
    cadenceMs: cadence,
    longestStallMs,
    expectedFrames,
    longestStallFrames,
    moved,
    movedFraction,
    verdict: {pass: failures.length === 0, failures},
    summary,
  };
}
