// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file liftFromTriggerGeometry.ts
 * @input A source's box, the viewport and the layer runtime's gutter, and
 *   the caller's scale rule and gap
 * @output Exports liftFromTriggerScale, liftFromTriggerRect and surfacePlacement: how far a
 *   lifted source grows, where it lands inside the gutter, and which side of
 *   it a surface (a menu) takes
 * @position The geometry of the lift presentation (liftFromTrigger.ts); internal to
 *   core
 *
 * A lifted source grows about its center by the caller's rule (UIKit's
 * preview platter: up to a factor, by a number of points on its larger
 * side, and never wider than the screen less the gutter), then moves inside
 * the layer runtime's viewport gutter (spec:AST-059) if it crosses it. A
 * surface sits a gap away: below the source when it fits above the bottom
 * gutter, else above; centered on the source, or flush with the edge the
 * source is held against.
 *
 * SYNC: When modified, update /packages/core/src/liftFromTrigger/liftFromTriggerGeometry.test.ts
 */

import type {MorphRect} from '../motion/rectMorph';

/**
 * The layer runtime's viewport gutter on each edge, CSS px
 * (Layer/layerViewportInset.stylex.ts, spec:AST-059): the spacing step or the
 * edge's safe-area inset, whichever is larger, plus the inset an app declares
 * for a bar floating over that edge.
 */
export interface LiftFromTriggerGutter {
  readonly top: number;
  readonly bottom: number;
  readonly inline: number;
}

/**
 * The viewport a source lifts in, CSS px, the layer runtime's gutter, and the
 * page's direction (a surface's alignment is logical).
 */
export interface LiftFromTriggerViewport {
  readonly width: number;
  readonly height: number;
  readonly gutter: LiftFromTriggerGutter;
  readonly direction?: 'ltr' | 'rtl';
}

/** How far a lifted source grows. */
export interface LiftFromTriggerScaleRule {
  /** The largest factor it grows by. */
  readonly maxScale: number;
  /** Below `maxScale`, it grows by this many px on its larger side. */
  readonly scaleUpPoints: number;
}

/** Where a surface sits against the lifted source. */
export interface SurfacePlacement {
  readonly side: 'above' | 'below';
  readonly alignment: 'start' | 'center' | 'end';
}

/**
 * The factor a `width` × `height` source grows by: up to `rule.maxScale`, by
 * `rule.scaleUpPoints` on its larger side, and never wider than the viewport
 * less its gutter (which can make it smaller than 1).
 */
export function liftFromTriggerScale(
  width: number,
  height: number,
  viewport: LiftFromTriggerViewport,
  rule: LiftFromTriggerScaleRule,
): number {
  const side = Math.max(width, height);
  if (side <= 0) {
    return 1;
  }
  const fitsWidth =
    width > 0
      ? (viewport.width - 2 * viewport.gutter.inline) / width
      : Infinity;
  return Math.min(rule.maxScale, (side + rule.scaleUpPoints) / side, fitsWidth);
}

/**
 * The lifted source's rect: `source` scaled by `liftFromTriggerScale` about its center,
 * then moved inside the viewport's gutter if it crosses it.
 */
export function liftFromTriggerRect(
  source: MorphRect,
  viewport: LiftFromTriggerViewport,
  rule: LiftFromTriggerScaleRule,
): MorphRect {
  const {gutter} = viewport;
  const scale = liftFromTriggerScale(
    source.width,
    source.height,
    viewport,
    rule,
  );
  const width = source.width * scale;
  const height = source.height * scale;
  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), Math.max(min, max));
  const top = gutter.top;
  const bottom = viewport.height - gutter.bottom;
  return {
    x: clamp(
      source.x + source.width / 2 - width / 2,
      gutter.inline,
      viewport.width - gutter.inline - width,
    ),
    y: clamp(source.y + source.height / 2 - height / 2, top, bottom - height),
    width,
    height,
  };
}

/**
 * A surface's place: below the lifted source when `surfaceHeight` fits
 * between it, `gap` and the bottom gutter, else above; centered on the
 * source, or flush with the source's edge when the source is held against a
 * side of the viewport.
 */
export function surfacePlacement(
  lifted: MorphRect,
  surfaceHeight: number,
  viewport: LiftFromTriggerViewport,
  gap: number,
): SurfacePlacement {
  const {gutter} = viewport;
  const bottom = viewport.height - gutter.bottom;
  const side =
    lifted.y + lifted.height + gap + surfaceHeight <= bottom
      ? 'below'
      : 'above';
  const epsilon = 0.5;
  const atLeft = lifted.x <= gutter.inline + epsilon;
  const atRight =
    lifted.x + lifted.width >= viewport.width - gutter.inline - epsilon;
  // Flush with the edge the source is held against; the alignment is
  // logical, so a right-to-left page swaps the physical sides.
  const isRtl = viewport.direction === 'rtl';
  const alignment = atLeft
    ? isRtl
      ? 'end'
      : 'start'
    : atRight
      ? isRtl
        ? 'start'
        : 'end'
      : 'center';
  return {side, alignment};
}
