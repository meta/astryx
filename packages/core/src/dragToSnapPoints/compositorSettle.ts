// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file compositorSettle.ts
 * @input A spring curve of a drag's axis; the moving parts, each with its own
 *   offset at a value
 * @output playCompositorSettle: a settle as one compositor `translate`
 *   animation per part, with its callbacks timed from the same curve
 * @position Used by createSnapDrag (createDragToSnapPoints.ts) for the settles it plays on the
 *   compositor (its `compositorParts` option)
 *
 * The caller writes the settle's end on the drawn value first, so each part's
 * own style draws the end pose. Each part then plays a `translate` from its
 * offset at the start back to none. The browser composites these, so a busy
 * main thread cannot hold the element back or drop a part from a frame.
 */

import {motionNow, SETTLE_THRESHOLD} from '../motion/animator';
import type {SpringCurve} from '../motion/spring';

/** A moving part, and its own offset (px) at a value of the drag's axis. */
export interface CompositorPart {
  element: HTMLElement;
  offset: (value: number) => number;
  /**
   * The values of the axis where `offset` bends. The settle draws a
   * keyframe where the curve crosses each, so no frame cuts the corner.
   */
  bends?: ReadonlyArray<number>;
}

/** A settle in flight. */
export interface CompositorSettle {
  /** The value on screen now. */
  presented: () => number;
  /** The value's velocity on screen now (units/s). */
  velocity: () => number;
  /** Stops the settle where it is on screen, and returns that value. */
  stop: () => number;
}

/** Keyframes per second: twice a 60 Hz display's frame rate. */
const SAMPLE_HZ = 120;
/** The longest a settle plays (ms). */
const MAX_MS = 3000;

/**
 * Plays `curve` on `parts` from now. `onPass` runs on the first frame the
 * value is past its offset in its direction, and `onFinish` on the first
 * frame after the curve ends. A part with no Web Animations (a test DOM)
 * shows the end pose at once, and the callbacks keep the curve's times.
 */
export function playCompositorSettle({
  curve,
  parts,
  requestFrame,
  onPass,
  onFinish,
}: {
  curve: SpringCurve;
  parts: ReadonlyArray<CompositorPart>;
  requestFrame: (callback: () => void) => void;
  onPass?: {offset: number; direction: 1 | -1; call: () => void};
  onFinish: () => void;
}): CompositorSettle {
  const durationMs = Math.min(
    MAX_MS,
    // The animator's own rest threshold for a length.
    Math.max(0, curve.settleTime(SETTLE_THRESHOLD.x) * 1000),
  );
  const started = motionNow();
  let stopped = false;
  let passed = onPass == null;

  // The curve sampled on a fixed clock, plus each time it crosses a part's
  // bend. The last keyframe is the end itself.
  const valueAt = (ms: number) => curve.value(ms / 1000);
  const steps = Math.ceil((durationMs / 1000) * SAMPLE_HZ);
  const grid: number[] = [];
  for (let step = 0; step <= steps; step += 1) {
    grid.push(Math.min(durationMs, (step / SAMPLE_HZ) * 1000));
  }
  const times = [...grid];
  const bends = new Set(parts.flatMap(part => part.bends ?? []));
  for (const bend of bends) {
    for (let index = 0; index < grid.length - 1; index += 1) {
      let low = grid[index];
      let high = grid[index + 1];
      if ((valueAt(low) - bend) * (valueAt(high) - bend) >= 0) {
        continue;
      }
      for (let iteration = 0; iteration < 24; iteration += 1) {
        const middle = (low + high) / 2;
        if ((valueAt(low) - bend) * (valueAt(middle) - bend) <= 0) {
          high = middle;
        } else {
          low = middle;
        }
      }
      times.push((low + high) / 2);
    }
  }
  times.sort((a, b) => a - b);
  const values = times.map((ms, index) =>
    index === times.length - 1 ? curve.to : valueAt(ms),
  );
  const offsets = times.map(ms => (durationMs === 0 ? 1 : ms / durationMs));
  const animations =
    durationMs === 0
      ? []
      : parts
          .filter(part => typeof part.element.animate === 'function')
          .map(part => {
            const end = part.offset(curve.to);
            const animation = part.element.animate(
              values.map((value, index) => ({
                offset: offsets[index],
                translate: `${part.offset(value) - end}px 0px`,
              })),
              // Backwards: until the first frame paints, the part holds its
              // start pose, not the end its style already draws.
              {duration: durationMs, easing: 'linear', fill: 'backwards'},
            );
            // One clock for every part, from the call: a release continues
            // from where the finger left the element, with no held frame.
            animation.startTime = started;
            return animation;
          });

  const elapsedSeconds = () =>
    Math.min(durationMs, Math.max(0, motionNow() - started)) / 1000;
  const presented = () => curve.value(elapsedSeconds());
  const stop = () => {
    const value = presented();
    stopped = true;
    for (const animation of animations) {
      animation.cancel();
    }
    return value;
  };

  const frame = () => {
    if (stopped) {
      return;
    }
    const seconds = elapsedSeconds();
    if (!passed && onPass != null) {
      const value = curve.value(seconds);
      if ((value - onPass.offset) * onPass.direction >= 0) {
        passed = true;
        onPass.call();
        // The call may have started another settle, which stopped this one.
        if (stopped) {
          return;
        }
      }
    }
    if (seconds * 1000 >= durationMs) {
      stopped = true;
      for (const animation of animations) {
        animation.cancel();
      }
      onFinish();
      return;
    }
    requestFrame(frame);
  };
  requestFrame(frame);

  return {
    presented,
    velocity: () => curve.velocity(elapsedSeconds()),
    stop,
  };
}
