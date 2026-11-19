// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file liftFromTriggerGeometry.ts
 * @input A source's box, the viewport and the layer runtime's gutter, and
 *   the caller's scale rule and gap
 * @output liftFromTriggerScale, liftFromTriggerRect, surfaceAnchorRect and
 *   surfacePlacement: a lifted source's growth, its rect where it is, the box
 *   a surface is placed against, and a surface's side
 * @position The geometry of the lift presentation (liftFromTrigger.ts);
 *   internal to core. A source grows about its center by the caller's rule,
 *   as UIKit's preview platter does, and never moves
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
  /** The side of the lifted source the surface opens on; `start` and `end` are beside it, logical. */
  readonly side: 'above' | 'below' | 'start' | 'end';
  readonly alignment: 'start' | 'center' | 'end';
  /**
   * The surface's largest block size, CSS px, when it does not fit whole on
   * its side: it scrolls what does not fit. Absent when it fits whole.
   */
  readonly maxBlockSize?: number;
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
 * The lifted source's rect: `source` scaled by `liftFromTriggerScale` about
 * its center. The source never moves: at an edge it grows across the gutter.
 */
export function liftFromTriggerRect(
  source: MorphRect,
  viewport: LiftFromTriggerViewport,
  rule: LiftFromTriggerScaleRule,
): MorphRect {
  const scale = liftFromTriggerScale(
    source.width,
    source.height,
    viewport,
    rule,
  );
  const width = source.width * scale;
  const height = source.height * scale;
  return {
    x: source.x + source.width / 2 - width / 2,
    y: source.y + source.height / 2 - height / 2,
    width,
    height,
  };
}

/**
 * The box a surface is placed against: the lifted source's rect, its inline
 * extent kept inside the gutter. The source never moves, so at an edge it can
 * grow past the gutter. A surface aligned with this box keeps the gutter, and
 * it still clears the source on the block axis.
 */
export function surfaceAnchorRect(
  lifted: MorphRect,
  viewport: LiftFromTriggerViewport,
): MorphRect {
  const {inline} = viewport.gutter;
  const startClip = Math.max(0, inline - lifted.x);
  const endClip = Math.max(
    0,
    lifted.x + lifted.width - (viewport.width - inline),
  );
  if (startClip === 0 && endClip === 0) {
    return lifted;
  }
  return {
    x: startClip > 0 ? inline : lifted.x,
    y: lifted.y,
    width: Math.max(0, lifted.width - startClip - endClip),
    height: lifted.height,
  };
}

/**
 * A surface's place against the lifted source, which never moves, so the
 * surface never covers it. It goes below when `surfaceHeight` fits between
 * the source, `gap` and the bottom gutter, else above when it fits under the
 * top gutter. Else it goes beside the source, at the inline end first, where
 * `surfaceWidth` fits there; it is capped to the room between the block
 * gutters. Else it takes the side with more room, capped to that room, and
 * scrolls the rest. Above or below, it centers on the source, or sits flush
 * with the source's edge when the source reaches the gutter at a side of the
 * viewport.
 */
export function surfacePlacement(
  lifted: MorphRect,
  surfaceHeight: number,
  viewport: LiftFromTriggerViewport,
  gap: number,
  surfaceWidth = Number.POSITIVE_INFINITY,
): SurfacePlacement {
  const {gutter} = viewport;
  const isRtl = viewport.direction === 'rtl';
  const bottom = viewport.height - gutter.bottom;
  const roomBelow = bottom - (lifted.y + lifted.height + gap);
  const roomAbove = lifted.y - gap - gutter.top;
  const epsilon = 0.5;
  const atLeft = lifted.x <= gutter.inline + epsilon;
  const atRight =
    lifted.x + lifted.width >= viewport.width - gutter.inline - epsilon;
  // Flush with the edge the source is held against; the alignment is
  // logical, so a right-to-left page swaps the physical sides.
  const alignment = atLeft
    ? isRtl
      ? 'end'
      : 'start'
    : atRight
      ? isRtl
        ? 'start'
        : 'end'
      : 'center';
  if (surfaceHeight <= roomBelow) {
    return {side: 'below', alignment};
  }
  if (surfaceHeight <= roomAbove) {
    return {side: 'above', alignment};
  }
  const roomRight =
    viewport.width - gutter.inline - (lifted.x + lifted.width + gap);
  const roomLeft = lifted.x - gap - gutter.inline;
  const roomEnd = isRtl ? roomLeft : roomRight;
  const roomStart = isRtl ? roomRight : roomLeft;
  const blockRoom = viewport.height - gutter.top - gutter.bottom;
  // A cap is a pixel under its room, so rounding never puts the surface past
  // the gutter.
  const cap = (room: number) => Math.max(0, room - 1);
  const beside = (side: 'start' | 'end'): SurfacePlacement =>
    surfaceHeight > blockRoom
      ? {side, alignment: 'start', maxBlockSize: cap(blockRoom)}
      : {side, alignment: 'start'};
  if (surfaceWidth <= roomEnd) {
    return beside('end');
  }
  if (surfaceWidth <= roomStart) {
    return beside('start');
  }
  return roomBelow >= roomAbove
    ? {side: 'below', alignment, maxBlockSize: cap(roomBelow)}
    : {side: 'above', alignment, maxBlockSize: cap(roomAbove)};
}
