// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file rectMorph.ts
 * @input An element laid out at rest in its box, the rects it grows out of
 *   and shrinks back into, a spring, the compositor animator and the
 *   progress helpers (progress.ts)
 * @output Exports `lerpPath` and `edgeGrowPath` (the rect an element shows at
 *   each progress), `morphCurves` (the curves that put it there) and
 *   `createRectMorph` (present and dismiss, each interrupting the other)
 * @position Motion foundation building block, internal to core: the one
 *   "grow out of a source rect, shrink back into it" that touch
 *   presentations share: an anchored menu, a popover, a context menu's
 *   lifted preview, a photo's zoom, a sub-menu's parent card
 *
 * A path names the rect an element shows at each progress: 0 on its source,
 * 1 at rest, beyond either end on a spring's overshoot. The element stays
 * laid out in the path's `box`; `translate` and `scale` about
 * `transform-origin: 0 0` put it on the path's rect every frame, scaling each
 * axis to the rect (`'axes'`) or both by the rect's width (`'uniform'`, which
 * keeps the element's aspect), and a companion opacity follows a progress of
 * its own or the same one. Only `translate`, `scale` and `opacity` move, on
 * the compositor (law M1).
 *
 * Two laws cover the presentations: `lerpPath`, a straight line from one rect
 * to another (position and size move together), and `edgeGrowPath`, UIKit's
 * popover, which grows out of a point on its edge facing the source with its
 * length along the axis away from the source growing with its scale.
 *
 * `createRectMorph` plays a path on its element (`present`) and back to the
 * source on a target the caller gives (`dismiss`): a copy placed where the
 * element stands, since the browser hides a closing popover at once, or the
 * element itself. Each interrupts the other: the new motion starts from the
 * rect the animator presents at that moment, on the path restarted there in
 * its own law (`restartFrom`), with the presented velocity projected on it
 * (progress.ts; laws M2, M3). Once a present settles nothing of the morph's
 * is left inline: iOS Safari will not scroll a finger through a popover that
 * keeps a `scale`, even at 1.
 *
 * Reduced Motion is the animator's (design:reduced-motion): on a coarse
 * pointer a present lands at rest and fades in, a dismissal fades out where
 * it stands, opacity only, in 200 ms; on any other pointer the change
 * completes at once.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/rectMorph.test.ts
 * - /packages/core/src/motion/README.md
 */

import {
  createAnimator,
  type AnimateOptions,
  type Animator,
  type AnimatorOptions,
  type MotionCurve,
  type MotionHandle,
  type MotionProperty,
  type MotionValues,
} from './animator';
import {
  mapProgress,
  presentedProgressVelocity,
  progressCurve,
  type ProgressChannel,
} from './progress';
import type {SpringDescription} from './spring';
import {resolveMotion} from './resolveMotion';

/**
 * A box in viewport px.
 */
export interface MorphRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * How the element is scaled onto a path's rect: each axis to the rect
 * (`'axes'`), or both by the rect's width (`'uniform'`, keeping the
 * element's aspect).
 */
export type MorphScale = 'axes' | 'uniform';

/**
 * The end of a path a restarted path heads for.
 */
export type MorphEnd = 'source' | 'rest';

/**
 * The rect an element shows at each progress of a presentation: 0 on its
 * source, 1 at rest.
 */
export interface MorphPath {
  /** The element's box as laid out: its rect with no transform. */
  readonly box: MorphRect;
  /** @default 'axes' */
  readonly scale?: MorphScale;
  /** The rect at progress `p`. */
  rectAt(p: number): MorphRect;
  /** The companion opacity at progress `p`; opacity is left alone without it. */
  opacityAt?(p: number): number;
  /**
   * The path from `rect`, shown at `opacity`, to this path's `end`, in its
   * own law: how an interrupted motion continues. A straight line to that
   * end without it.
   */
  restartFrom?(rect: MorphRect, opacity: number, end: MorphEnd): MorphPath;
}

// Exact at both ends, so a path that ends on its box ends on identity.
const lerp = (a: number, b: number, p: number) =>
  p === 0 ? a : p === 1 ? b : a + (b - a) * p;

/**
 * A straight line from `from` (progress 0) to `to` (progress 1): position and
 * size move together, as an anchored menu grows out of a square on its
 * control, a lifted preview grows to its box, a sub-menu's parent card
 * shrinks back.
 */
export function lerpPath(
  from: MorphRect,
  to: MorphRect,
  {
    box = to,
    scale = 'axes',
    opacity,
  }: {
    /** The element's box as laid out; `to` by default. */
    box?: MorphRect;
    scale?: MorphScale;
    /** The companion opacity at progress 0 and 1; none by default. */
    opacity?: readonly [number, number];
  } = {},
): MorphPath {
  return {
    box,
    scale,
    rectAt: p => ({
      x: lerp(from.x, to.x, p),
      y: lerp(from.y, to.y, p),
      width: lerp(from.width, to.width, p),
      height: lerp(from.height, to.height, p),
    }),
    ...(opacity != null
      ? {opacityAt: (p: number) => lerp(opacity[0], opacity[1], p)}
      : null),
  };
}

interface GrowState {
  /** The scale across the axis. */
  scale: number;
  /** The share of the full length along the axis, before `scale`. */
  length: number;
  opacity: number;
}

const GROWN: GrowState = {scale: 1, length: 1, opacity: 1};

function growPath(
  box: MorphRect,
  origin: {x: number; y: number},
  axis: 'x' | 'y',
  collapsed: GrowState,
  from: GrowState,
  to: GrowState,
): MorphPath {
  const stateAt = (p: number): GrowState => ({
    scale: lerp(from.scale, to.scale, p),
    length: lerp(from.length, to.length, p),
    opacity: lerp(from.opacity, to.opacity, p),
  });
  return {
    box,
    scale: 'axes',
    rectAt(p) {
      const state = stateAt(p);
      const along = state.scale * state.length;
      const scaleX = axis === 'x' ? along : state.scale;
      const scaleY = axis === 'y' ? along : state.scale;
      return {
        x: box.x + origin.x * (1 - scaleX),
        y: box.y + origin.y * (1 - scaleY),
        width: box.width * scaleX,
        height: box.height * scaleY,
      };
    },
    opacityAt: p => stateAt(p).opacity,
    restartFrom(rect, opacity, end) {
      const scaleX = box.width > 0 ? rect.width / box.width : 1;
      const scaleY = box.height > 0 ? rect.height / box.height : 1;
      const across = axis === 'x' ? scaleY : scaleX;
      const along = axis === 'x' ? scaleX : scaleY;
      return growPath(
        box,
        origin,
        axis,
        collapsed,
        {scale: across, length: across > 0 ? along / across : 1, opacity},
        end === 'rest' ? GROWN : collapsed,
      );
    },
  };
}

/**
 * UIKit's popover (UIPopoverPresentationController, iOS 26.2): it grows out of
 * `origin`, the point of its edge facing the source, from a uniform
 * `collapsedScale` and `collapsedLength` of its own length along `axis` (the
 * axis pointing away from the source). At progress p its scale is
 * s = s₀ + (1 − s₀)·p across the axis and s·(L₀ + (1 − L₀)·p) along it,
 * about `origin`, and its opacity p, so it widens before it lengthens. An
 * interrupted motion continues from the scale and length on screen.
 */
export function edgeGrowPath({
  box,
  origin,
  axis,
  collapsedScale,
  collapsedLength,
}: {
  /** The element's box as laid out, at rest. */
  box: MorphRect;
  /** The point it grows out of, px from the box's top-left corner. */
  origin: {x: number; y: number};
  /** The axis pointing away from the source: `y` above or below it. */
  axis: 'x' | 'y';
  /** The uniform scale it grows out of. */
  collapsedScale: number;
  /** The share of its own length along `axis` it grows out of. */
  collapsedLength: number;
}): MorphPath {
  const collapsed = {
    scale: collapsedScale,
    length: collapsedLength,
    opacity: 0,
  };
  return growPath(box, origin, axis, collapsed, collapsed, GROWN);
}

type TravelProperty = 'x' | 'y' | 'scaleX' | 'scaleY';

/** The transform that puts an element laid out in `path.box` on its rect. */
function travelAt(path: MorphPath, p: number): Record<TravelProperty, number> {
  const rect = path.rectAt(p);
  const {box} = path;
  const scaleX = box.width > 0 ? rect.width / box.width : 1;
  const scaleY =
    path.scale === 'uniform'
      ? scaleX
      : box.height > 0
        ? rect.height / box.height
        : 1;
  return {x: rect.x - box.x, y: rect.y - box.y, scaleX, scaleY};
}

/**
 * Curves for `Animator.play` that put an element laid out in `path.box`, with
 * `transform-origin: 0 0`, on the path's rect as `progress` moves, and its
 * opacity on `path.opacityAt` as `fade` moves (`progress` by default).
 */
export function morphCurves(
  path: MorphPath,
  progress: MotionCurve,
  fade: MotionCurve = progress,
): Partial<Record<MotionProperty, MotionCurve>> {
  const travel = (property: TravelProperty) =>
    mapProgress(progress, p => travelAt(path, p)[property]);
  const curves: Partial<Record<MotionProperty, MotionCurve>> = {
    x: travel('x'),
    y: travel('y'),
    scaleX: travel('scaleX'),
    scaleY: travel('scaleY'),
  };
  const {opacityAt} = path;
  if (opacityAt != null) {
    curves.opacity = mapProgress(fade, p => opacityAt(p));
  }
  return curves;
}

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
 * How a present or a dismissal plays.
 */
export interface RectMorphPlayOptions {
  /**
   * Progress per second to start with (a finger's release). By default the
   * velocity of what is on screen, projected on the path.
   */
  velocity?: number;
  /**
   * A spring of its own for the companion opacity (a zoom's closing fade);
   * the frame's spring by default.
   */
  fadeSpring?: SpringDescription;
  /** For the animator's Reduced Motion: a touch drag's release starts it. */
  touchRelease?: AnimateOptions['touchRelease'];
  /** For the animator's Reduced Motion: what a cross-fade treats it as. */
  crossfadeAs?: AnimateOptions['crossfadeAs'];
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
   * Plays `path` on the element from its source to rest on `spring`. While a
   * dismissal or a present plays, it starts from the rect on screen instead,
   * restarted on `path` toward rest with the presented velocity.
   */
  present(
    path: MorphPath,
    spring: SpringDescription,
    options?: RectMorphPlayOptions,
  ): MotionHandle;
  /**
   * Plays `path` back to its source on `options.target` on `spring`, from the
   * rect the element presents now (or the dismissal in flight) with its
   * velocity. The element is left as laid out unless it is the target.
   */
  dismiss(
    path: MorphPath,
    spring: SpringDescription,
    options: RectMorphDismissOptions,
  ): MotionHandle;
  /** The rect on screen now (the dismissal's while one plays); null before any. */
  presentedRect(): MorphRect | null;
  /**
   * Ends every motion, takes a dismissal's target away and leaves the element
   * as laid out, with none of the morph's inline properties.
   */
  reset(): void;
  /** `reset`, then releases the element's animator. */
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
 * morph.present(path, springs.menuOpen);
 * // …on close, with a copy placed where the menu stands:
 * morph.dismiss(path, springs.menuClose, {target: copy});
 * ```
 */
export function createRectMorph(
  element: HTMLElement,
  options: Pick<AnimatorOptions, 'now'> = {},
): RectMorph {
  const now = options.now ?? defaultNow;
  const animator = createAnimator(element, options);
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

  // Leaves the element as laid out: identity, and none of the morph's inline
  // properties (an opacity only when a path animated it).
  const restoreElement = () => {
    animator.set(
      ownsOpacity
        ? {x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1}
        : {x: 0, y: 0, scaleX: 1, scaleY: 1},
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

  // Once a present settles on identity, nothing of the morph's stays inline.
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

  // A path with no opacity of its own gives the animator's Reduced Motion
  // cross-fade nothing to read, and it would start the motion on the source
  // rect and dip. Such a path says which way it goes, so the cross-fade
  // lands at rest on a present and fades out in place on a dismissal
  // (design:reduced-motion); a caller's own `crossfadeAs` still wins.
  const playOptions = (
    play: RectMorphPlayOptions,
    path: MorphPath,
    direction: 'entrance' | 'exit' = 'entrance',
  ): AnimateOptions => ({
    ...(play.touchRelease != null ? {touchRelease: play.touchRelease} : null),
    ...(play.crossfadeAs != null
      ? {crossfadeAs: play.crossfadeAs}
      : path.opacityAt == null
        ? {crossfadeAs: direction}
        : null),
  });

  // The springs go through `resolveMotion` on the element that plays them.
  // While the touch motion roles stay internal (spec:AST-094 DEC-11), a role
  // resolves to its table value and reads no style, so the morph plays the
  // table's spring as given, and a caller's bare spring likewise.
  const curvesFor = (
    on: Element,
    path: MorphPath,
    spring: SpringDescription,
    play: RectMorphPlayOptions,
    velocity: number,
  ) => {
    const progress = progressCurve(resolveMotion(on, spring), {velocity});
    const fade =
      play.fadeSpring != null
        ? progressCurve(resolveMotion(on, play.fadeSpring), {velocity})
        : progress;
    return morphCurves(path, progress, fade);
  };

  const present: RectMorph['present'] = (path, spring, play = {}) => {
    const at = now();
    const from =
      exiting ?? (presenting != null && box != null ? {animator, box} : null);
    let start = path;
    let velocity = play.velocity ?? 0;
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
    element.style.setProperty('transform-origin', '0px 0px');
    animator.set(startValues(start, opacity));
    const handle = animator.play(
      curvesFor(element, start, spring, play, velocity),
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

  const dismiss: RectMorph['dismiss'] = (path, spring, play) => {
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
    const velocity =
      play.velocity ??
      presentedProgressVelocity(from.animator, channelsOf(back), at);
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
      box = back.box;
      ownsOpacity ||= back.opacityAt != null;
    } else {
      // The element is hidden as it closes: leave it as laid out.
      restoreElement();
    }
    const closing = onElement
      ? animator
      : (continuing?.animator ?? createAnimator(target, options));
    target.style.setProperty('transform-origin', '0px 0px');
    // The copy starts as the element shows now, whatever its clone kept.
    closing.set(startValues(back, opacity));
    const handle = closing.play(
      curvesFor(target, back, spring, play, velocity),
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
      animator.dispose();
    },
  };
}
