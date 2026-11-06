// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file wheelStrip.ts
 * @input The touch wheel's strip (its flat rows in one element), its layout,
 *   and curves from wheelPhysics.ts
 * @output createWheelStrip: the one owner of a wheel's offset. It writes a
 *   drag's frames, plays and stops curves, ticks, and reports the nearest row
 * @position Glue of the touch picker wheel (PickerWheel.tsx) over the shared
 *   animator (motion/animator.ts)
 *
 * The strip is the one element that moves, on `translate`, so a motion plays
 * on the compositor with no layout or paint per frame.
 *
 * SYNC: When modified, update wheelStrip.test.ts and PickerWheel.tsx.
 */

import {canVibrate, playHaptic} from '../gestures/haptics';
import {createMotionEngine, type MotionCurve} from '../motion/animator';
import {reducedMotionFade} from '../motion/reducedMotion';
import {picker} from '../motion/uikit/picker';
import {
  nearestIndex,
  reachesRow,
  tickTimes,
  type WheelCurve,
  type WheelLayout,
} from './wheelPhysics';

/** How a motion ended: arrived on its row, or stopped before. */
export type WheelMotionOutcome = 'arrived' | 'stopped';

/** Options for one motion. */
export interface PlayOptions {
  /** Tick as rows reach the band (a drag's release); a tap's spin does not. */
  ticks?: boolean;
  /** Called once when the motion ends, either way. */
  onEnd?: (outcome: WheelMotionOutcome, offset: number) => void;
  /** Started by a touch drag's release, which cross-fades under Reduce Motion. */
  touchRelease?: boolean;
  /**
   * The momentum that continues a throw: a coast, and its bounce at an end.
   * It is direct movement, so it plays under Reduce Motion too, as scrolling
   * keeps decelerating under iOS Reduce Motion.
   */
  momentum?: boolean;
}

/** One picker column's offset and everything that moves it. */
export interface WheelStrip {
  /** The strip the offset moves (null detaches it). */
  attach(strip: HTMLElement | null): void;
  /** Update the rows (a new option list); keeps the offset. */
  setLayout(layout: WheelLayout): void;
  /**
   * Tell `listener` the position of the row nearest the band whenever it
   * changes. That is on a drag frame, where a motion stops or ends, and at
   * rest. A cross-fade's landing counts as an end. A motion itself reports
   * nothing until it ends, so the compositor plays it without the main thread
   * painting a mark per row.
   */
  onNearestChange(listener: ((position: number) => void) | null): void;
  /** Whether a motion is playing. */
  isMoving(): boolean;
  /**
   * The offset on screen at `time` (ms, the document timeline's clock; default
   * now). It is the animator's presentation value. So a motion that has not
   * started on screen yet shows its start.
   */
  offset(time?: number): number;
  /** Where the wheel will be at rest: the motion's end, or the offset now. */
  target(): number;
  /**
   * Show `offset` at once, stopping any motion: a drag frame or a park. A drag
   * frame passes `ticks`, which also keeps the strip on its own compositing
   * layer for the frames that follow.
   */
  setOffset(offset: number, options?: {ticks?: boolean}): void;
  /** Forget the previous drag frame (a new gesture starts). */
  resetDrag(): void;
  /**
   * Stop the motion where it was on screen at `time` (a finger landing on a
   * spinning wheel: its touch-down time). Returns that offset.
   */
  stop(time?: number): number;
  /** Play `curve` from the current offset; the strip ends at `curve.to`. */
  play(curve: WheelCurve, options?: PlayOptions): void;
  /**
   * Forget the row last reported nearest the band, so the next report names it
   * again even unchanged. A caller that clears its mark as a motion starts then
   * gets it back. That happens when the motion ends on the row it began on.
   */
  forgetNearest(): void;
  /** Stop everything; a motion still running ends as stopped. */
  dispose(): void;
}

interface Running {
  readonly curve: WheelCurve;
  readonly onEnd?: (outcome: WheelMotionOutcome, offset: number) => void;
  readonly timers: ReturnType<typeof setTimeout>[];
}

function now(): number {
  const time =
    typeof document !== 'undefined'
      ? (document.timeline?.currentTime as number | null | undefined)
      : null;
  return typeof time === 'number' ? time : performance.now();
}

/**
 * Creates a wheel's strip on a fresh animator. It uses the internal animator
 * for three jobs the public handle lacks:
 *
 * - It plays a closed-form curve on the compositor: a coast onto a row, a
 *   snap, a spin.
 * - It times haptic ticks on that curve's clock.
 * - It substitutes Reduce Motion's cross-fade for a move.
 *
 * A release's coast and its bounce at an end are momentum (`decay`), so they
 * keep their motion under Reduce Motion. Every other curve is a transition
 * (`play`). Under Reduce Motion the animator cross-fades it after a touch or
 * on a coarse pointer. Otherwise it lands at once.
 *
 * @example
 * ```
 * const strip = createWheelStrip({rowHeight: 28, rowCount: 60});
 * strip.attach(element);
 * strip.setOffset(30 * 28);
 * strip.play(planRelease(strip.offset(), 900, layout).curve, {ticks: true, momentum: true});
 * ```
 */
export function createWheelStrip(initialLayout: WheelLayout): WheelStrip {
  const animator = createMotionEngine(null);
  let layout = initialLayout;
  let running: Running | null = null;
  let nearestListener: ((position: number) => void) | null = null;
  let lastNearest: number | null = null;
  let lastTick = -Infinity;
  /** Last offset a drag frame showed, for its ticks. */
  let dragPrevious: number | null = null;

  const shown = (time?: number): number =>
    // The strip's top sits on the band's row: offset `o` is `translate` −o.
    -animator.get('y', time);

  const reportNearest = (offset: number): void => {
    const position = nearestIndex(offset, layout);
    if (position === lastNearest) {
      return;
    }
    lastNearest = position;
    nearestListener?.(position);
  };

  const tick = (time: number): void => {
    if (time - lastTick < picker.selectionTick.minimumIntervalMs) {
      return;
    }
    lastTick = time;
    playHaptic('selection');
  };

  const clear = (motion: Running): void => {
    for (const timer of motion.timers) {
      clearTimeout(timer);
    }
    motion.timers.length = 0;
    if (running === motion) {
      running = null;
    }
  };

  /**
   * The motion's timers, from `origin` (when it started on screen): its
   * ticks, a cross-fade's landing, and its end.
   */
  const schedule = (
    motion: Running,
    origin: number,
    {
      endMs,
      ticks,
      landingMs,
    }: {endMs: number; ticks: boolean; landingMs: number | null},
  ): void => {
    for (const timer of motion.timers) {
      clearTimeout(timer);
    }
    motion.timers.length = 0;
    const elapsed = now() - origin;
    if (ticks) {
      for (const t of tickTimes(motion.curve, layout.rowHeight)) {
        motion.timers.push(
          setTimeout(
            () => {
              if (running === motion) {
                tick(now());
              }
            },
            Math.max(0, t * 1000 - elapsed),
          ),
        );
      }
    }
    if (landingMs != null) {
      motion.timers.push(
        setTimeout(
          () => {
            if (running === motion) {
              reportNearest(motion.curve.to);
            }
          },
          Math.max(0, landingMs - elapsed),
        ),
      );
    }
    motion.timers.push(
      setTimeout(
        () => {
          if (running !== motion) {
            return;
          }
          clear(motion);
          reportNearest(motion.curve.to);
          motion.onEnd?.('arrived', motion.curve.to);
        },
        Math.max(0, endMs - elapsed),
      ),
    );
  };

  const stop = (time?: number): number => {
    const motion = running;
    if (motion == null) {
      return shown();
    }
    const offset = shown(time);
    clear(motion);
    // `set` ends the strip's animation and puts it where it was shown.
    animator.set({y: -offset});
    reportNearest(offset);
    motion.onEnd?.('stopped', offset);
    return offset;
  };

  return {
    attach(strip) {
      animator.attach(strip);
    },
    setLayout(next) {
      layout = next;
    },
    onNearestChange(listener) {
      nearestListener = listener;
      lastNearest = null;
    },
    isMoving() {
      return running != null;
    },
    offset(time) {
      return shown(time);
    },
    target() {
      return running?.curve.to ?? shown();
    },
    setOffset(offset, {ticks = false} = {}) {
      if (running != null) {
        stop();
      }
      if (
        ticks &&
        dragPrevious != null &&
        canVibrate() &&
        reachesRow(dragPrevious, offset, layout.rowHeight)
      ) {
        tick(now());
      }
      dragPrevious = offset;
      // A park is a one-off write: no layer for a strip at rest.
      animator.set({y: -offset}, {promote: ticks});
      reportNearest(offset);
    },
    resetDrag() {
      dragPrevious = null;
    },
    stop,
    play(
      curve,
      {ticks = false, onEnd, touchRelease = false, momentum = false} = {},
    ) {
      stop();
      dragPrevious = null;
      const element = animator.element;
      // What Reduce Motion makes of a transition: null while motion plays.
      // Momentum is never substituted.
      const fade = momentum ? null : reducedMotionFade(element, {touchRelease});
      const endMs = fade == null ? curve.duration * 1000 : fade.duration;
      if (!(endMs > 0)) {
        animator.set({y: -curve.to});
        reportNearest(curve.to);
        onEnd?.('arrived', curve.to);
        return;
      }
      const motionCurve: MotionCurve = {
        duration: curve.duration,
        at: t => -curve.value(t),
        velocity: t => -curve.velocity(t),
      };
      const handle = momentum
        ? animator.decay({y: motionCurve}, {touchRelease})
        : animator.play({y: motionCurve}, {touchRelease});
      const motion: Running = {curve, onEnd, timers: []};
      running = motion;
      const plan = {
        endMs,
        // A cross-fade has no travel to tick through.
        ticks: ticks && fade == null && canVibrate(),
        // A cross-fade lands its rows at its midpoint, faded out.
        landingMs: fade == null ? null : endMs / 2,
      };
      schedule(motion, now(), plan);
      // A busy main thread can hold a motion's first frame: its timers then
      // follow the start the browser gives it. The animator's start promise
      // only resolves, so nothing here waits on a rejection.
      void handle.started.then(start => {
        if (running === motion) {
          schedule(motion, start, plan);
        }
      });
    },
    forgetNearest() {
      lastNearest = null;
    },
    dispose() {
      stop();
      animator.dispose();
    },
  };
}
