// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file menuSurfaceMotion.ts
 * @input A DropdownMenu surface and the shared rect morph. The popover's
 *   grow geometry and timing tokens. The layer runtime's input hold and the
 *   menu's exit copy.
 * @output Exports `createMenuSurfaceMotion`: the touch presentation's grow
 *   out of the trigger and its shrink back into it
 * @position Internal to DropdownMenu, loaded on demand by
 *   useMenuSurfaceMotion.ts at the first touch on a trigger. Nothing else
 *   imports it, so a desktop page never loads it.
 *
 * The menu grows as a Popover does: out of the point of its edge that faces
 * the trigger, on UIKit's popover path (`edgeGrowPath`). The grow plays the
 * theme's entrance duration and easing, and the shrink its exit ones. Both
 * play on the shared rect morph. While it grows under a coarse primary pointer,
 * the layer runtime's input hold takes every touch.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/DropdownMenu/useMenuSurfaceMotion.ts
 * - /packages/core/src/DropdownMenu/__tests__/DropdownMenuTouchGrow.interaction.browser.spec.ts
 */

import {holdInput} from '../Layer/inputHold';
import {ENTRANCE_OPACITY_FLOOR} from '../motion/opacityFloor';
import {
  createRectMorph,
  edgeGrowPath,
  type MorphPath,
  type MorphRect,
  type RectMorphMotion,
} from '../motion/rectMorph';
import {readThemeTokens, type ThemeTimingTokens} from '../motion/themeTiming';
import {
  popoverCollapsedState,
  POPOVER_ENTRANCE_TOKENS,
  POPOVER_EXIT_TOKENS,
  type PopoverSurfaceRect,
} from '../Popover/popoverSurfaceFrame';
import {placeMenuExitCopy} from '../privateAttributes/menuExit.stylex';
import {isCoarsePointer} from '../utils/coarsePointer';

/** The boxes the grow is read from, in viewport px. */
export interface MenuSurfaceGeometry {
  readonly surface: PopoverSurfaceRect;
  readonly source: PopoverSurfaceRect;
}

export interface MenuSurfaceMotion {
  /**
   * Grows the surface out of its trigger. `measure` runs once, in the next
   * frame, before that frame writes.
   */
  enter(measure: () => MenuSurfaceGeometry): void;
  /** Shrinks the surface back into its trigger, on its exit copy. */
  exit(): void;
  /** Leaves the surface as laid out, with no motion in flight. */
  reset(): void;
  /** `reset`, then releases the surface's animator. */
  dispose(): void;
}

/** A timing token pair as the rect morph's timing. */
function timingOf(
  element: Element,
  tokens: ThemeTimingTokens,
): RectMorphMotion {
  const {ms, points} = readThemeTokens(element, tokens);
  return {duration: ms ?? 0, easing: points ?? [0, 0, 1, 1]};
}

function rectOf(box: PopoverSurfaceRect): MorphRect {
  return {x: box.left, y: box.top, width: box.width, height: box.height};
}

/**
 * The popover's grow path for a surface over its source. It fades in from
 * the floor, as the popover does, so Chromium draws its first frame.
 */
function pathOf({surface, source}: MenuSurfaceGeometry): MorphPath {
  const collapsed = popoverCollapsedState({surface, source});
  const path = edgeGrowPath({
    box: rectOf(surface),
    origin: {x: collapsed.originX, y: collapsed.originY},
    axis: collapsed.axis,
    collapsedScale: collapsed.scale,
    collapsedLength: collapsed.length,
  });
  return {
    ...path,
    opacityAt: p => Math.max(ENTRANCE_OPACITY_FLOOR, path.opacityAt?.(p) ?? 1),
  };
}

export function createMenuSurfaceMotion(
  surface: HTMLElement,
): MenuSurfaceMotion {
  const morph = createRectMorph(surface);
  const view = surface.ownerDocument.defaultView;
  let path: MorphPath | null = null;
  let pendingFrame: number | null = null;
  let releaseHold: (() => void) | null = null;

  const endHold = () => {
    releaseHold?.();
    releaseHold = null;
  };
  const cancelPending = () => {
    if (pendingFrame != null) {
      view?.cancelAnimationFrame(pendingFrame);
      pendingFrame = null;
    }
  };
  // The layer's CSS entrance belongs to the pointer presentation.
  const holdEntrance = () => {
    surface.style.setProperty('animation-name', 'none');
  };

  const present = (next: MorphPath) => {
    path = next;
    holdEntrance();
    const handle = morph.present(
      next,
      timingOf(surface, POPOVER_ENTRANCE_TOKENS),
    );
    endHold();
    // Under a fine primary pointer, as on a touchscreen laptop, the page stays
    // live while the menu grows.
    releaseHold = isCoarsePointer(view)
      ? holdInput(surface, {until: handle, scope: 'viewport'})
      : null;
    void handle.finished.then(() => {
      endHold();
    });
  };

  const reset = () => {
    cancelPending();
    endHold();
    path = null;
    morph.reset();
    surface.style.removeProperty('animation-name');
  };

  return {
    enter(measure) {
      cancelPending();
      if (path != null && morph.presentedRect() != null) {
        // Shown again while it shrinks: turn back from the rect on screen.
        present(path);
        return;
      }
      holdEntrance();
      if (view == null || typeof view.requestAnimationFrame !== 'function') {
        present(pathOf(measure()));
        return;
      }
      pendingFrame = view.requestAnimationFrame(() => {
        pendingFrame = null;
        present(pathOf(measure()));
      });
    },
    exit() {
      endHold();
      if (pendingFrame != null) {
        // Closed before the frame that would have grown it: nothing to shrink.
        reset();
        return;
      }
      if (path == null) {
        return;
      }
      const copy = placeMenuExitCopy(surface);
      if (copy == null) {
        reset();
        return;
      }
      morph.dismiss(path, timingOf(surface, POPOVER_EXIT_TOKENS), {
        target: copy,
      });
      path = null;
    },
    reset,
    dispose() {
      reset();
      morph.dispose();
    },
  };
}
