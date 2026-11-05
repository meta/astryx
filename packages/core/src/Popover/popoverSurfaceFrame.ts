// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file popoverSurfaceFrame.ts
 * @input The popover's box and its source's, and UIKit's popover values
 * @output Exports `popoverCollapsedState`, where the popover grows from and
 *   the shape it starts as. Exports `popoverFrame`, the surface at a progress
 *   of the growth. Also exports the theme tokens that time the motion, the
 *   frame helpers, and their types.
 * @position Internal to Popover: the pure geometry of the touch
 *   presentation, with no DOM and no animator. A browser proof imports it on
 *   its own, and popoverSurfaceMotion.ts plays it.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Popover/popoverSurfaceMotion.ts
 * - /packages/core/src/Popover/popoverSurfaceMotion.test.ts
 */

import type {LayerExitBox} from '../Layer/layerExitCopy';
import type {ThemeTimingTokens} from '../motion/themeTiming';
import {popover} from '../motion/uikit/popover';

/**
 * The growth plays `--duration-medium-min`, which in the Storybook theme is
 * the step nearest iOS's measured growth (`popover.growMs`), with the
 * entrance easing. A tap opens the popover, and a tap has no velocity, so no
 * spring plays.
 */
export const POPOVER_ENTRANCE_TOKENS: ThemeTimingTokens = {
  duration: '--duration-medium-min',
  easing: '--ease-entrance',
};

/**
 * The shrink plays the theme's exit duration and easing, which every overlay
 * shares; iOS's measured shrink (`popover.shrinkMs`) is only a reference. A
 * theme that sets no exit duration gets the fast duration, which is the exit
 * duration's default.
 */
export const POPOVER_EXIT_TOKENS: ThemeTimingTokens = {
  duration: '--duration-exit',
  easing: '--ease-exit',
};

/** A box in viewport px. */
export type PopoverSurfaceRect = LayerExitBox;

/** Where the popover sits and what it hangs off, in viewport px. */
export interface PopoverSurfaceGeometry {
  /** The layer element's border box once positioned, at full size. */
  surface: PopoverSurfaceRect;
  /** The box of the source the popover is anchored to. */
  source: PopoverSurfaceRect;
}

/** Where the popover grows from, and the shape it starts as. */
export interface PopoverCollapsedState {
  /** Transform origin, px from the surface's top-left corner. */
  originX: number;
  originY: number;
  /**
   * The scale axis that also carries the length: the axis pointing away
   * from the source (`y` for a popover above or below it).
   */
  axis: 'x' | 'y';
  /** The uniform scale it grows from. */
  scale: number;
  /** The share of its own length along `axis` it grows from, at most 1. */
  length: number;
}

/** The transform and opacity of the surface. */
export interface PopoverFrame {
  scaleX: number;
  scaleY: number;
  opacity: number;
}

/** How far the edges may sit apart and still count as touching, px. */
const EDGE_TOLERANCE = 1;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * Where the popover meets its source, and the shape it grows from. The point
 * is the middle of the source on the popover's edge facing it (the arrow's
 * tip), kept on that edge.
 */
export function popoverCollapsedState({
  surface,
  source,
}: PopoverSurfaceGeometry): PopoverCollapsedState {
  const gaps = {
    below: surface.top - (source.top + source.height),
    above: source.top - (surface.top + surface.height),
    right: surface.left - (source.left + source.width),
    left: source.left - (surface.left + surface.width),
  };
  // The side with the widest gap is the one the popover was placed on. A
  // popover that overlaps its source grows from below, as the default.
  let side: keyof typeof gaps = 'below';
  for (const candidate of ['above', 'right', 'left'] as const) {
    if (gaps[candidate] > gaps[side]) {
      side = candidate;
    }
  }
  if (gaps[side] < -EDGE_TOLERANCE) {
    side = 'below';
  }
  const centerX = clamp(
    source.left + source.width / 2 - surface.left,
    0,
    surface.width,
  );
  const centerY = clamp(
    source.top + source.height / 2 - surface.top,
    0,
    surface.height,
  );
  const vertical = side === 'below' || side === 'above';
  const fullLength = vertical ? surface.height : surface.width;
  return {
    originX: vertical ? centerX : side === 'right' ? 0 : surface.width,
    originY: vertical ? (side === 'below' ? 0 : surface.height) : centerY,
    axis: vertical ? 'y' : 'x',
    scale: popover.collapsedScale,
    length:
      fullLength > 0 ? Math.min(1, popover.collapsedLengthPx / fullLength) : 1,
  };
}

export interface SurfaceState {
  scale: number;
  /** Share of the full length along the axis. */
  length: number;
  opacity: number;
}

export const PRESENTED: SurfaceState = {scale: 1, length: 1, opacity: 1};

export function frameOf(state: SurfaceState, axis: 'x' | 'y'): PopoverFrame {
  const along = state.scale * state.length;
  return {
    scaleX: axis === 'x' ? along : state.scale,
    scaleY: axis === 'y' ? along : state.scale,
    opacity: state.opacity,
  };
}

/**
 * The surface at progress `p` of the growth: the frame UIKit's popover view
 * shows on its path at that progress.
 */
export function popoverFrame(
  state: PopoverCollapsedState,
  p: number,
): PopoverFrame {
  return frameOf(
    {
      scale: state.scale + (1 - state.scale) * p,
      length: state.length + (1 - state.length) * p,
      opacity: p,
    },
    state.axis,
  );
}
