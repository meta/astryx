// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file rectMorph.ts
 * @input An element laid out at rest in its box, a path it grows along
 *   (morphPath.ts), its timing (a duration and easing, or a spring), the
 *   compositor animator and the progress helpers (progress.ts)
 * @output Exports `createRectMorph` (present and dismiss, each interrupting
 *   the other), and re-exports the paths it plays (`lerpPath`,
 *   `edgeGrowPath`, `morphCurves`) from morphPath.ts
 * @position Motion building block, internal to core: grow out of a source
 *   rect and shrink back into it
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/rectMorph.test.ts
 * - /packages/core/src/motion/README.md
 * - /packages/core/src/motion/morphPath.ts (the paths it plays)
 */

import {
  createMotionEngine,
  type AnimateOptions,
  type Animator,
  type AnimatorOptions,
  type MotionHandle,
  type MotionValues,
} from './animator';
import {
  presentedProgressVelocity,
  progressCurve,
  timedCurve,
  type ProgressChannel,
} from './progress';
import {
  lerpPath,
  morphCurves,
  travelAt,
  type MorphEnd,
  type MorphPath,
  type MorphRect,
  type TravelProperty,
} from './morphPath';
import type {MotionCurvePoints} from './roles';
import type {SpringDescription} from './spring';
import {resolveMotion} from './resolveMotion';

export {edgeGrowPath, lerpPath, morphCurves} from './morphPath';
export type {MorphEnd, MorphPath, MorphRect, MorphScale} from './morphPath';

/** The path from what is on screen to `path`'s `end`. */
function restart(
  path: MorphPath,
  rect: MorphRect,
  opacity: number,
  end: MorphEnd,
): MorphPath {
  if (path.restartFrom != null) {
    return path.restartFrom(rect, opacity, end);
  }
  const p = end === 'rest' ? 1 : 0;
  const {opacityAt} = path;
  return lerpPath(rect, path.rectAt(p), {
    box: path.box,
    scale: path.scale,
    ...(opacityAt != null ? {opacity: [opacity, opacityAt(p)] as const} : null),
  });
}

/** The rect an animator shows for an element laid out in `box`, at `now`. */
function presentedRectOf(
  animator: Animator,
  box: MorphRect,
  now: number,
): MorphRect {
  return {
    x: box.x + animator.get('x', now),
    y: box.y + animator.get('y', now),
    width: box.width * animator.get('scaleX', now),
    height: box.height * animator.get('scaleY', now),
  };
}

/** The travel channels of `path`, weighted in px for the projection. */
function channelsOf(path: MorphPath): ProgressChannel[] {
  const at = (property: TravelProperty) => (p: number) =>
    travelAt(path, p)[property];
  return [
    {property: 'x', at: at('x')},
    {property: 'y', at: at('y')},
    {property: 'scaleX', at: at('scaleX'), weight: path.box.width},
    {property: 'scaleY', at: at('scaleY'), weight: path.box.height},
  ];
}

function startValues(path: MorphPath, opacity?: number): MotionValues {
  const values: MotionValues = {...travelAt(path, 0)};
  if (path.opacityAt != null) {
    values.opacity = opacity ?? path.opacityAt(0);
  }
  return values;
}

/** The morph's own inline properties, left on an element only while it moves. */
const INLINE_PROPERTIES = ['translate', 'scale', 'transform-origin'] as const;

/**
 * How a present or a dismissal is timed: a duration (ms) and easing, or a
 * spring. The timing follows the component's motion record. The morph has no
 * rule of its own about which input plays which.
 * Either starts at the velocity it is given (`RectMorphPlayOptions.velocity`),
 * so a new target keeps the current velocity.
 */
export type RectMorphMotion =
  | {readonly duration: number; readonly easing: MotionCurvePoints}
  | {readonly spring: SpringDescription};

/**
 * How a present or a dismissal plays.
 */
export interface RectMorphPlayOptions {
  /**
   * Progress per second to start with (a finger's release). By default the
   * velocity of what is on screen, projected on the path, so a motion that
   * interrupts another keeps its velocity.
   */
  velocity?: number;
  /**
   * A timing of its own for the companion opacity (a zoom's closing fade);
   * the frame's timing by default.
   */
  fade?: RectMorphMotion;
  /** For the animator's Reduced Motion: a touch drag's release starts it. */
  touchRelease?: AnimateOptions['touchRelease'];
  /**
   * For the animator's Reduced Motion: what a cross-fade treats it as. A path
   * with no opacity of its own is an entrance on a present and an exit on a
   * dismissal by default; `'move'` keeps the animator's own dip for an
   * element that stays visible and only moves (a sub-menu's parent card), so
   * it fades out, lands and fades back in instead of cutting out.
   */
  crossfadeAs?: AnimateOptions['crossfadeAs'] | 'move';
  /**
   * When the curves start: `'presented'` holds the element at its first
   * values until two frames have presented it, so a surface that appears
   * late plays the whole curve (the animator's `start`).
   */
  start?: AnimateOptions['start'];
}

/**
 * Where a dismissal plays.
 */
export interface RectMorphDismissOptions extends RectMorphPlayOptions {
  /**
   * The element the dismissal plays on: a copy of the element laid out in the
   * path's box (a closing popover is hidden at once), or the element itself.
   */
  target: HTMLElement;
  /**
   * Takes `target` away once the dismissal ends or a present interrupts it:
   * `target.remove()` by default, nothing when it is the element.
   */
  release?: (target: HTMLElement) => void;
}

/**
 * The present and the dismissal of one element.
 */
export interface RectMorph {
  /**
   * Plays `path` on the element from its source to rest on `motion`. While a
   * dismissal or a present plays, it starts from the rect on screen instead,
   * restarted on `path` toward rest with the presented velocity.
   */
  present(
    path: MorphPath,
    motion: RectMorphMotion,
    options?: RectMorphPlayOptions,
  ): MotionHandle;
  /**
   * Plays `path` back to its source on `options.target` on `motion`, from the
   * rect the element presents now (or the dismissal in flight) with its
   * velocity. The element is left as laid out unless it is the target.
   */
  dismiss(
    path: MorphPath,
    motion: RectMorphMotion,
    options: RectMorphDismissOptions,
  ): MotionHandle;
  /** The rect on screen now (the dismissal's while one plays); null before any. */
  presentedRect(): MorphRect | null;
  /**
   * Ends every motion, takes a dismissal's target away and leaves the element
   * as laid out, with none of the morph's inline properties.
   */
  reset(): void;
  /** `reset`, then releases the element's animator unless the caller handed it. */
  dispose(): void;
}

function defaultNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

/**
 * The rect morph of `element`.
 *
 * @example
 * ```
 * const morph = createRectMorph(menu);
 * const path = lerpPath(square, box, {opacity: [0, 1]});
 * // Each play takes the timing the component's motion record names.
 * morph.present(path, presentMotion);
 * // A dismissal onto a copy placed where the menu stands keeps its velocity.
 * morph.dismiss(path, dismissMotion, {target: copy, velocity});
 * ```
 *
 * An element that already has an animator (a zoom stage's pinch and pan)
 * hands it in `animator`: the morph plays on it, so the two share the
 * element's channels, and `dispose` leaves it to its owner.
 */
export function createRectMorph(
  element: HTMLElement,
  {
    animator: given,
    ...options
  }: Pick<AnimatorOptions, 'now' | 'requestFrame'> & {animator?: Animator} = {},
): RectMorph {
  const now = options.now ?? defaultNow;
  const animator = given ?? createMotionEngine(element, options);
  /** The box the element's transform is relative to, once it has one. */
  let box: MorphRect | null = null;
  let presenting: MotionHandle | null = null;
  /** Whether a path has animated the element's opacity. */
  let ownsOpacity = false;
  let exiting: {
    target: HTMLElement;
    animator: Animator;
    box: MorphRect;
    release: (target: HTMLElement) => void;
  } | null = null;

  const clearInline = () => {
    for (const property of INLINE_PROPERTIES) {
      element.style.removeProperty(property);
    }
  };

  // At rest the element needs no compositing layer, so set the values without
  // promoting it.
  const restoreElement = () => {
    animator.set(
      ownsOpacity
        ? {x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1}
        : {x: 0, y: 0, scaleX: 1, scaleY: 1},
      {promote: false},
    );
    clearInline();
    if (ownsOpacity) {
      element.style.removeProperty('opacity');
      ownsOpacity = false;
    }
    box = null;
  };

  const endExit = () => {
    if (exiting == null) {
      return;
    }
    const {target, animator: closing, release} = exiting;
    exiting = null;
    if (closing !== animator) {
      closing.dispose();
    }
    release(target);
  };

  // iOS Safari does not scroll a finger through an element that keeps a
  // `scale`, even at 1. Clear it once the present settles.
  const retire = () => {
    const at = now();
    const identity =
      Math.abs(animator.get('x', at)) < 1e-6 &&
      Math.abs(animator.get('y', at)) < 1e-6 &&
      Math.abs(animator.get('scaleX', at) - 1) < 1e-9 &&
      Math.abs(animator.get('scaleY', at) - 1) < 1e-9;
    if (identity) {
      clearInline();
    }
    if (ownsOpacity && Math.abs(animator.get('opacity', at) - 1) < 1e-9) {
      element.style.removeProperty('opacity');
      ownsOpacity = false;
    }
  };

  // A path with no opacity gives the Reduced Motion cross-fade nothing to
  // read. Treat it as an entrance on a present and an exit on a dismissal. A
  // caller's `crossfadeAs` wins, and `'move'` keeps the animator's dip.
  const playOptions = (
    play: RectMorphPlayOptions,
    path: MorphPath,
    direction: 'entrance' | 'exit' = 'entrance',
  ): AnimateOptions => ({
    ...(play.touchRelease != null ? {touchRelease: play.touchRelease} : null),
    ...(play.start != null ? {start: play.start} : null),
    ...(play.crossfadeAs === 'move'
      ? null
      : play.crossfadeAs != null
        ? {crossfadeAs: play.crossfadeAs}
        : path.opacityAt == null
          ? {crossfadeAs: direction}
          : null),
  });

  // A spring goes through `resolveMotion`. A motion role resolves to its
  // table value, and a bare spring comes back as given. `velocity` is
  // undefined when nothing was moving: a timed motion then plays its easing
  // as given.
  const progressFor = (
    on: Element,
    motion: RectMorphMotion,
    velocity: number | undefined,
  ) =>
    'spring' in motion
      ? progressCurve(resolveMotion(on, motion.spring), {velocity})
      : timedCurve({
          from: 0,
          to: 1,
          durationMs: motion.duration,
          easing: motion.easing,
          velocity,
        });

  const curvesFor = (
    on: Element,
    path: MorphPath,
    motion: RectMorphMotion,
    play: RectMorphPlayOptions,
    velocity: number | undefined,
  ) => {
    const progress = progressFor(on, motion, velocity);
    const fade =
      play.fade != null ? progressFor(on, play.fade, velocity) : progress;
    return morphCurves(path, progress, fade);
  };

  const present: RectMorph['present'] = (path, motion, play = {}) => {
    const at = now();
    const from =
      exiting ?? (presenting != null && box != null ? {animator, box} : null);
    let start = path;
    let velocity = play.velocity;
    let opacity: number | undefined;
    if (from != null) {
      opacity = from.animator.get('opacity', at);
      start = restart(
        path,
        presentedRectOf(from.animator, from.box, at),
        opacity,
        'rest',
      );
      velocity =
        play.velocity ??
        presentedProgressVelocity(from.animator, channelsOf(start), at);
    }
    endExit();
    box = start.box;
    ownsOpacity ||= start.opacityAt != null;
    // A dismissal on a copy let the element go (dismiss, below).
    animator.attach(element);
    element.style.setProperty('transform-origin', '0px 0px');
    animator.set(startValues(start, opacity));
    const handle = animator.play(
      curvesFor(element, start, motion, play, velocity),
      playOptions(play, start),
    );
    presenting = handle;
    void handle.finished.then(done => {
      if (done && presenting === handle) {
        presenting = null;
        retire();
      }
    });
    return handle;
  };

  const dismiss: RectMorph['dismiss'] = (path, motion, play) => {
    const {target} = play;
    const at = now();
    const from = exiting ?? {animator, box: box ?? path.box};
    const opacity = from.animator.get('opacity', at);
    const back = restart(
      path,
      presentedRectOf(from.animator, from.box, at),
      opacity,
      'source',
    );
    // A settled present is not moving: only a motion in flight hands its
    // velocity on.
    const inFlight = exiting != null || presenting != null;
    const velocity =
      play.velocity ??
      (inFlight
        ? presentedProgressVelocity(from.animator, channelsOf(back), at)
        : undefined);
    // The same copy handed again continues on it: it keeps its animator, and
    // its release runs once, when the dismissal still running ends. Any other
    // target ends the dismissal in flight first.
    const continuing =
      exiting != null && exiting.target === target ? exiting : null;
    if (continuing != null) {
      exiting = null;
    } else {
      endExit();
    }
    presenting = null;
    const onElement = target === element;
    if (onElement) {
      // A dismissal on a copy may have let the element go (below).
      animator.attach(element);
      box = back.box;
      ownsOpacity ||= back.opacityAt != null;
    } else {
      // The element is hidden as it closes: leave it as laid out, and let go
      // of the layer its presentation promoted, in this task. Otherwise the
      // promotion's linger ends later, with a style write inside the
      // dismissal's frames. The next present attaches the element again. A
      // handed-in animator stays on the element: its owner still drives it.
      restoreElement();
      if (given == null) {
        animator.attach(null);
      }
    }
    const closing = onElement
      ? animator
      : (continuing?.animator ?? createMotionEngine(target, options));
    target.style.setProperty('transform-origin', '0px 0px');
    // The copy starts as the element shows now, whatever its clone kept.
    closing.set(startValues(back, opacity));
    const handle = closing.play(
      curvesFor(target, back, motion, play, velocity),
      playOptions(play, back, 'exit'),
    );
    const current = {
      target,
      animator: closing,
      box: back.box,
      release:
        play.release ??
        (onElement ? () => {} : (copy: HTMLElement) => copy.remove()),
    };
    exiting = current;
    void handle.finished.then(() => {
      if (exiting === current) {
        endExit();
      }
    });
    return handle;
  };

  // `set` ends whatever still moves; nothing is frozen inline on the way.
  const reset = () => {
    endExit();
    presenting = null;
    restoreElement();
  };

  return {
    present,
    dismiss,
    presentedRect() {
      if (exiting != null) {
        return presentedRectOf(exiting.animator, exiting.box, now());
      }
      return box == null ? null : presentedRectOf(animator, box, now());
    },
    reset,
    dispose() {
      reset();
      if (given == null) {
        animator.dispose();
      }
    },
  };
}
