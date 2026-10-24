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

import type {Page} from '@playwright/test';
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
 */
export async function blockMainThread(
  page: Page,
  ms: number,
): Promise<BusyWindow> {
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

export interface BusyProof extends FrameStats {
  readonly window: BusyWindow;
  /** Frames the display should have shown in the window at the measured cadence. */
  readonly expectedFrames: number;
  /**
   * Longest time inside the window with no presented change, the window's own
   * edges included. A frozen animation presents no new frame at all (nothing
   * on screen changed, so the compositor sends none): its stall is the whole
   * window.
   */
  readonly longestStallMs: number;
}

/**
 * Frame evidence for a busy window: how many frames the screencast presented
 * inside it, how many of them moved the tracked axis, and the longest stall.
 * The window is trimmed by `marginMs` at both ends so the frame the block
 * started on and the one it ended on are not counted.
 */
export function busyWindowProof(
  tracked: readonly TrackedFrame[],
  window: BusyWindow,
  {
    axis = 'y',
    marginMs = 20,
    settledWithin,
  }: {
    axis?: 'x' | 'y' | 'width' | 'height';
    marginMs?: number;
    /**
     * Stop judging once the value is within this many px of where it ends:
     * an easing tail moves less than a frame pixel per frame, and the
     * screencast resolves whole CSS pixels.
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
  const cadence = stats.medianFrameMs || 1000 / 60;
  return {
    ...stats,
    window,
    longestStallMs,
    expectedFrames: Math.floor((inner.to - inner.from) / cadence),
  };
}
