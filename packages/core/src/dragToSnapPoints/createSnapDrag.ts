// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createSnapDrag.ts
 * @input An element, its snap points, and options only Core passes: the
 *   pan's options, a custom property to draw into, and a model of the drag
 * @output Exports createSnapDrag and its types: the snap-point drag under the
 *   public `createDragToSnapPoints`
 * @position Internal to core, with `createDragToSnapPoints` as its public
 *   face. A Core component whose drag needs more than the public options
 *   uses it directly.
 *
 * A model replaces either half of the default. `move` says where a drag
 * draws the element, and `release` says where a release lands.
 */

import type {PanGestureRecognizerOptions} from '../gestures/PanGestureRecognizer';
import {createPan, type PanInput} from '../gestures/createPan';
import {
  createMotionAnimator,
  type Animator,
  type AnimatorOptions,
  type MotionHandle,
} from '../motion/animator';
import {resolveSnapPoint} from '../motion/resolveSnapPoint';
import type {SpringDescription} from '../motion/spring';
import {registerSpringsTable, springs} from '../motion/uikit/springs';
import {devWarn} from '../utils/devWarning';

/** The document timeline's clock, which the animator runs on. */
const now = (): number => performance.now();

/**
 * The release speed, in px/s, above which a drag carries to the next snap
 * point: the flick speed measured for UIKit's sheet on iOS 26.2.
 */
export const DEFAULT_FLICK_THRESHOLD = 1008;

/** A drag in progress, along the axis, as a model reads it. */
export interface SnapDragMove {
  /** Where the element was drawn when the drag began (it was caught there). */
  start: number;
  /** Travel since the drag began, px: the pan's claim is not part of it. */
  translation: number;
  /** Travel since the touch began, px, the pan's claim included. */
  total: number;
  /** What drives the drag. */
  input: PanInput;
}

/** A release, along the axis, as a model reads it. */
export interface SnapDragRelease extends SnapDragMove {
  /** The release velocity, px/s (0 when the contact rested). */
  velocity: number;
}

/** Where a model draws the element during a drag. */
export interface SnapDragTarget {
  /** The offset along the axis. */
  offset: number;
  /**
   * Follows on this spring from where the element is drawn, keeping its
   * velocity; without one the element is set there, one for one.
   */
  spring?: SpringDescription;
}

/** Where a model lands a release. */
export interface SnapDragLanding {
  /** The snap point the element settles on. */
  index: number;
  /**
   * The settle's starting velocity along the axis, px/s; without one it
   * starts from the velocity the element is drawn with.
   */
  velocity?: number;
  /** The settle's spring; the settle spring without one. */
  spring?: SpringDescription;
}

/** A drag's model: where it draws the element and where a release lands. */
export interface SnapDragModel {
  /**
   * A drag began where the element is drawn (`start`). Returns false to
   * leave the element as it is for this drag: it moves nothing and its
   * release lands nothing.
   */
  begin?(drag: SnapDragMove): boolean;
  /**
   * Where the drag draws the element; null leaves it as it is (inside a dead
   * zone: a settle under it carries on). The first target catches the
   * element where it is drawn. One for one from `start` when absent.
   */
  move?(drag: SnapDragMove): SnapDragTarget | null;
  /**
   * Where the release lands; null leaves the element as it is (the model
   * may settle it itself). Core's one release policy when absent.
   */
  release?(drag: SnapDragRelease): SnapDragLanding | null;
  /**
   * Where a cancelled drag lands (the browser took the touch); null leaves
   * the element as it is. Back to where the drag started when absent.
   */
  cancel?(drag: SnapDragMove): SnapDragLanding | null;
}

/** Options of `createSnapDrag`. */
export interface SnapDragOptions {
  /** The axis the element moves along. */
  axis: 'x' | 'y';
  /**
   * Offsets in px along `axis` from the element's resting position, sorted
   * before use (`onSettle` and `settleTo` count in that order).
   */
  snapPoints: ReadonlyArray<number>;
  /** A release faster than this, px/s, carries to the next point. Default 1008. */
  flickThreshold?: number;
  /** Called with the snap point's index once the element settles on it. */
  onSettle: (index: number) => void;
  /** The pan's own options: which pointers and scrolls start it, its claim, a begin gate. */
  pan?: Omit<PanGestureRecognizerOptions, 'direction'>;
  /**
   * Draws the axis into this custom property instead of `translate`, with
   * an optional companion drawn from it in the same animation.
   */
  customProperty?: AnimatorOptions['customProperty'];
  /** The drag's model; the public one without it. */
  model?: SnapDragModel;
}

/** How `settleTo` settles. */
export interface SettleOptions {
  /** Starting velocity, px/s; the one the element is drawn with without it. */
  velocity?: number;
  /** The spring; the settle spring without one. */
  spring?: SpringDescription;
  /** Whether a touch drag's release starts it (Reduce Motion cross-fades). */
  touchRelease?: boolean;
  /**
   * Calls `call` once, on the first animation frame whose presented value
   * is past `offset` in `direction`. The value is read on the settle's own
   * curve at that frame's time. Direction 1 means at or above the offset,
   * and -1 means at or below it. If the element is past it already, the
   * call comes on the next frame. It never comes for a settle that lands
   * short, that another settle or a drag replaces first, or that a destroy
   * ends. The caller reads a crossing during a drag from the drag itself.
   */
  onPass?: {offset: number; direction: 1 | -1; call: () => void};
}

/** What `createSnapDrag` returns. */
export interface SnapDrag {
  /**
   * Settles the element on the snap point at `index`, then calls
   * `onSettle`; returns the settle's motion (null when it does nothing).
   */
  settleTo(index: number, options?: SettleOptions): MotionHandle | null;
  /** Replaces the snap points (a layout change); the element stays where it is. */
  setSnapPoints(snapPoints: ReadonlyArray<number>): void;
  /** The snap points, ascending. */
  snapPoints(): ReadonlyArray<number>;
  /** The animator that draws the element (presentation values, curves). */
  readonly animator: Animator;
  /** Removes every listener and stops the element where it is. */
  destroy(): void;
}

/**
 * Where `element` is drawn now, read from the inline value an animator left
 * on it. A drag destroyed and created again leaves it where it stopped. An
 * axis it does not set reads 0.
 */
function drawnAt(
  element: HTMLElement,
  customProperty: string | undefined,
): {x: number; y: number} {
  if (customProperty != null) {
    const value = Number.parseFloat(
      element.style.getPropertyValue(customProperty),
    );
    return {x: Number.isFinite(value) ? value : 0, y: 0};
  }
  const [x = 0, y = 0] = element.style
    .getPropertyValue('translate')
    .trim()
    .split(/\s+/)
    .map(part => Number.parseFloat(part))
    .map(value => (Number.isFinite(value) ? value : 0));
  return {x, y};
}

/** The usable snap points, ascending: `snapPoints` is sorted before use. */
function sortedSnapPoints(snapPoints: ReadonlyArray<number>): number[] {
  const usable = snapPoints.filter(point => Number.isFinite(point));
  if (usable.length < snapPoints.length) {
    devWarn(
      'createDragToSnapPoints',
      'snapPoints must be numbers; the others are ignored.',
    );
  }
  return usable.sort((a, b) => a - b);
}

/** Lets a drag move `element` along `axis` and settles it on its snap points. */
export function createSnapDrag(
  element: HTMLElement,
  options: SnapDragOptions,
): SnapDrag {
  const {axis, onSettle, model} = options;
  const flickThreshold = options.flickThreshold ?? DEFAULT_FLICK_THRESHOLD;
  let points = sortedSnapPoints(options.snapPoints);
  // It starts where the element is drawn, so a drag created again to change
  // its options moves on from there instead of jumping.
  const drawn = drawnAt(element, options.customProperty?.name);
  const animator = createMotionAnimator(element, {
    initial: drawn,
    ...(options.customProperty != null
      ? {customProperty: options.customProperty}
      : {}),
  });
  // The snap point the element rests on, or is settling toward.
  let targetIndex =
    points.length === 0
      ? 0
      : resolveSnapPoint({
          points,
          position: drawn[axis],
          velocity: 0,
          flickThreshold,
        }).index;
  // Each settle and each drag takes a turn; only the latest settle reports.
  let turn = 0;
  let drag: {
    start: number;
    startIndex: number;
    input: PanInput;
    /** The drag has drawn the element: it caught any settle in flight. */
    caught: boolean;
  } | null = null;
  let destroyed = false;

  const settle = (
    target: number,
    settleOptions: SettleOptions,
  ): MotionHandle => {
    registerSpringsTable();
    targetIndex = target;
    const mine = ++turn;
    const {velocity} = settleOptions;
    const handle = animator.animate(
      {[axis]: points[target]},
      {
        spring: settleOptions.spring ?? springs.settle,
        ...(velocity != null && velocity !== 0
          ? {velocity: {[axis]: velocity}}
          : {}),
      },
      {touchRelease: settleOptions.touchRelease === true},
    );
    let finished = false;
    void handle.finished.then(arrived => {
      finished = true;
      if (arrived && mine === turn && !destroyed) {
        onSettle(targetIndex);
      }
    });
    const {onPass} = settleOptions;
    if (onPass != null && typeof requestAnimationFrame === 'function') {
      // Read on the settle's own curve at each frame's time, with no timer.
      // The first frame past the offset calls back. A settle that ends, is
      // replaced or is destroyed before that never calls back.
      const {direction} = onPass;
      const check = (time: number) => {
        if (destroyed || mine !== turn) {
          return;
        }
        if ((animator.get(axis, time) - onPass.offset) * direction >= 0) {
          onPass.call();
          return;
        }
        if (!finished) {
          requestAnimationFrame(check);
        }
      };
      requestAnimationFrame(check);
    }
    return handle;
  };

  /** Lands a model's landing (null: the element stays as it is). */
  const land = (landing: SnapDragLanding | null, touchRelease: boolean) => {
    if (landing != null) {
      settle(landing.index, {
        velocity: landing.velocity,
        spring: landing.spring,
        touchRelease,
      });
    }
  };

  const pan = createPan(element, {
    axis,
    recognizer: options.pan,
    onPan: ({state, translation, totalTranslation, velocity, input}) => {
      if (destroyed || points.length === 0) {
        return;
      }
      const moved = {
        translation: translation[axis],
        total: totalTranslation[axis],
        input,
      };
      if (state === 'began') {
        drag = {
          start: animator.get(axis),
          startIndex: targetIndex,
          input,
          caught: false,
        };
        if (model?.begin?.({start: drag.start, ...moved}) === false) {
          drag = null;
          return;
        }
      }
      if (drag == null) {
        return;
      }
      const reading = {start: drag.start, ...moved, input: drag.input};
      if (state === 'began' || state === 'changed') {
        const target =
          model?.move != null
            ? model.move(reading)
            : {offset: drag.start + moved.translation};
        if (target == null) {
          return;
        }
        if (!drag.caught) {
          // Catch a settle in flight where it is on screen: it reports
          // nothing now.
          drag.caught = true;
          turn += 1;
        }
        if (target.spring == null) {
          animator.set({[axis]: target.offset});
        } else {
          registerSpringsTable();
          // On the drag's own clock, now. A target that waited for the
          // browser's start would be replaced by the next move before WebKit
          // starts it. Each would restart from rest, so the element would
          // stand still until the drag paused.
          void animator.animate(
            {[axis]: target.offset},
            {spring: target.spring},
            {at: now()},
          );
        }
        return;
      }
      const {startIndex, start} = drag;
      drag = null;
      // Only a touch drag's release cross-fades under Reduce Motion. Any other
      // release lands at once on a fine primary pointer.
      const touchRelease = reading.input === 'touch';
      if (state === 'cancelled') {
        if (model?.cancel != null) {
          land(model.cancel(reading), touchRelease);
        } else {
          settle(startIndex, {velocity: 0, touchRelease});
        }
        return;
      }
      const release = velocity[axis];
      if (model?.release != null) {
        land(model.release({...reading, velocity: release}), touchRelease);
        return;
      }
      // Core's one release policy. The drag's start lets a release that moves
      // back return to the snap point it started from.
      const {index: target} = resolveSnapPoint({
        points,
        position: animator.get(axis),
        velocity: release,
        flickThreshold,
        start,
      });
      settle(target, {velocity: release, touchRelease});
    },
  });

  return {
    settleTo(target, settleOptions = {}) {
      if (destroyed) {
        return null;
      }
      if (!Number.isInteger(target) || target < 0 || target >= points.length) {
        devWarn(
          'createDragToSnapPoints',
          `settleTo(${target}) is outside the ${points.length} snap points, so it does nothing.`,
        );
        return null;
      }
      drag = null;
      return settle(target, {velocity: 0, ...settleOptions});
    },
    setSnapPoints(snapPoints) {
      points = sortedSnapPoints(snapPoints);
    },
    snapPoints() {
      return points;
    },
    animator,
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      pan.destroy();
      // Held where it is: disposing cancels a running settle, which would
      // otherwise leave the element where that settle began.
      animator.stop();
      animator.dispose();
    },
  };
}
