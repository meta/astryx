// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file morphPath.ts
 * @input The progress helpers (progress.ts) and the animator's curve types
 * @output Exports `lerpPath` and `edgeGrowPath` (the rect an element shows at
 *   each progress), `morphCurves` (the curves that put it there) and
 *   `travelAt` (the transform for one progress, for the rect morph's player)
 * @position Motion foundation building block, internal to core: the geometry
 *   of "grow out of a source rect, shrink back into it" that touch
 *   presentations share (an anchored menu, a popover, a context menu's
 *   lifted preview, a photo's zoom, a sub-menu's parent card), which a rect
 *   morph plays
 *
 * A path names the rect an element shows at each progress: 0 on its source,
 * 1 at rest, beyond either end on a spring's overshoot. The element stays
 * laid out in the path's `box`; `translate` and `scale` about
 * `transform-origin: 0 0` put it on the path's rect every frame, scaling each
 * axis to the rect (`'axes'`) or both by the rect's width (`'uniform'`, which
 * keeps the element's aspect), and a companion opacity follows a progress of
 * its own or the same one. Only `translate`, `scale` and `opacity` move, on
 * the compositor (`spec:AST-094` FR5).
 *
 * Two laws cover the presentations: `lerpPath`, a straight line from one rect
 * to another (position and size move together), and `edgeGrowPath`, UIKit's
 * popover, which grows out of a point on its edge facing the source with its
 * length along the axis away from the source growing with its scale. A path
 * also says how an interrupted motion continues in its own law
 * (`restartFrom`), so a popover turning around keeps its edge growth.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/morphPath.test.ts
 * - /packages/core/src/motion/README.md
 */

import type {MotionCurve, MotionProperty} from './animator';
import {mapProgress} from './progress';

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

/** The transform channels a path drives. */
export type TravelProperty = 'x' | 'y' | 'scaleX' | 'scaleY';

/**
 * The transform that puts an element laid out in `path.box` on its rect.
 *
 * @internal Read by the rect morph's player for its start
 *   values and its velocity projection; not exported from the package.
 */
export function travelAt(
  path: MorphPath,
  p: number,
): Record<TravelProperty, number> {
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
