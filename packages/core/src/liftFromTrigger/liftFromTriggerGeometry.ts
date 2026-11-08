// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file liftFromTriggerGeometry.ts
 * @input A source's box, the viewport and the layer runtime's gutter, and
 *   the caller's scale rule and gap
 * @output liftFromTriggerScale, liftFromTriggerRect and surfacePlacement: a
 *   lifted source's growth, its place inside the gutter, and a surface's side
 * @position The geometry of the lift presentation (liftFromTrigger.ts);
 *   internal to core. A source grows about its center by the caller's rule,
 *   as UIKit's preview platter does, then moves inside the gutter
 *
 * SYNC: When modified, update /packages/core/src/liftFromTrigger/liftFromTriggerGeometry.test.ts
 */

import type {MorphRect} from '../motion/rectMorph';

/**
 * The layer runtime's viewport gutter on each edge, in CSS px
 * (Layer/layerViewportInset.stylex.ts). It is the spacing step or the edge's
 * safe-area inset, whichever is larger. It adds the inset an app declares for
 * a bar over that edge.
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
  /**
   * `none` when the surface fits on neither side: the caller then leaves it to
   * the layer runtime's own fallback.
   */
  readonly side: 'above' | 'below' | 'none';
  readonly alignment: 'start' | 'center' | 'end';
}

/**
 * The factor a `width` × `height` source grows by: up to `rule.maxScale`, by
 * `rule.scaleUpPoints` on its larger side. It is never wider or taller than
 * the viewport less its gutters, which can make the factor less than 1.
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
  const {gutter} = viewport;
  const fitsWidth =
    width > 0 ? (viewport.width - 2 * gutter.inline) / width : Infinity;
  const fitsHeight =
    height > 0
      ? (viewport.height - gutter.top - gutter.bottom) / height
      : Infinity;
  return Math.min(
    rule.maxScale,
    (side + rule.scaleUpPoints) / side,
    fitsWidth,
    fitsHeight,
  );
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
 * between it, `gap` and the bottom gutter. Else it goes above, when it fits
 * under the top gutter. With room on neither side it answers `none`. It
 * centers on the source, or sits flush with the source's edge when the source
 * is held against a side of the viewport.
 */
export function surfacePlacement(
  lifted: MorphRect,
  surfaceHeight: number,
  viewport: LiftFromTriggerViewport,
  gap: number,
): SurfacePlacement {
  const {gutter} = viewport;
  const bottom = viewport.height - gutter.bottom;
  const fitsBelow = lifted.y + lifted.height + gap + surfaceHeight <= bottom;
  const fitsAbove = lifted.y - gap - surfaceHeight >= gutter.top;
  const side = fitsBelow ? 'below' : fitsAbove ? 'above' : 'none';
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
