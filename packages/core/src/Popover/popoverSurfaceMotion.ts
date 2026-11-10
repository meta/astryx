// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file popoverSurfaceMotion.ts
 * @input A Popover's surface (the box that paints it, inside its layer),
 *   the source it hangs off and the compositor animator. Also the theme's duration and easing tokens, and
 *   the layer runtime's exit copy and input hold
 * @output Exports `popoverCollapsedState`, `popoverFrame` and
 *   `createPopoverSurfaceMotion`, the touch presentation's present and
 *   dismiss.
 * @position Internal to Popover. Under a finger the popover grows out of its
 *   source and shrinks back into it, as a UIKit popover does.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Popover/popoverSurfaceFrame.ts
 * - /packages/core/src/Popover/popoverSurfaceMotion.test.ts
 * - /packages/core/src/Popover/Popover.tsx
 */

import {
  createMotionEngine,
  type Animator,
  type AnimatorOptions,
  type MotionCurve,
  type MotionHandle,
} from '../motion/animator';
import {holdInput} from '../Layer/inputHold';
import {ENTRANCE_OPACITY_FLOOR} from '../motion/opacityFloor';
import {mapProgress, mapRange} from '../motion/progress';
import {
  easedProgress,
  readThemeTiming,
  type ThemeTimingTokens,
} from '../motion/themeTiming';
import {placePopoverExitCopy} from '../privateAttributes/popoverExit.stylex';
import {
  frameOf,
  popoverCollapsedState,
  POPOVER_ENTRANCE_TOKENS,
  POPOVER_EXIT_TOKENS,
  PRESENTED,
  type PopoverCollapsedState,
  type PopoverSurfaceGeometry,
  type SurfaceState,
} from './popoverSurfaceFrame';

export {popoverCollapsedState, popoverFrame} from './popoverSurfaceFrame';
export type {
  PopoverCollapsedState,
  PopoverFrame,
  PopoverSurfaceGeometry,
  PopoverSurfaceRect,
} from './popoverSurfaceFrame';

/**
 * The curves from `from` to `to` as `progress` moves from 0 to 1. The scale
 * and the length move together, so the scale along the axis is their product.
 */
function surfaceCurves(
  from: SurfaceState,
  to: SurfaceState,
  axis: 'x' | 'y',
  progress: MotionCurve,
  opacityFloor = 0,
): Record<'scaleX' | 'scaleY' | 'opacity', MotionCurve> {
  // Unclamped, so an easing that overshoots carries the channels with it.
  const lerp = (a: number, b: number) =>
    mapRange([0, 1], [a, b], {clamp: false});
  const scale = lerp(from.scale, to.scale);
  const length = lerp(from.length, to.length);
  const opacity = lerp(from.opacity, to.opacity);
  const across = mapProgress(progress, scale);
  const along = mapProgress(progress, p => scale(p) * length(p));
  return {
    scaleX: axis === 'x' ? along : across,
    scaleY: axis === 'y' ? along : across,
    opacity: mapProgress(progress, p => Math.max(opacityFloor, opacity(p))),
  };
}

/** A theme timing that does not resolve plays no motion. */
function timingOn(element: Element, tokens: ThemeTimingTokens): MotionCurve {
  return readThemeTiming(element, tokens) ?? easedProgress(0, x => x);
}

/** What `animator` shows now, split back into scale and length. */
function readState(animator: Animator, axis: 'x' | 'y'): SurfaceState {
  const across = animator.get(axis === 'x' ? 'scaleY' : 'scaleX');
  const along = animator.get(axis === 'x' ? 'scaleX' : 'scaleY');
  return {
    scale: across,
    length: across > 0 ? along / across : 1,
    opacity: animator.get('opacity'),
  };
}

export interface PopoverSurfaceMotion {
  /**
   * The popover has just been shown in its touch presentation: grow it out
   * of its source, from the next animation frame, before it paints.
   * `measure` reads the geometry there, before that frame writes anything,
   * with the element at its full size. During a dismissal, the popover grows
   * back from where the dismissal has it, about the same point, at once: it
   * does not call `measure`.
   */
  enter(measure: () => PopoverSurfaceGeometry): void;
  /**
   * The popover is closing (its `beforetoggle` to closed, while it is still
   * shown): shrink it back into its source. Does nothing unless the last
   * presentation was a touch one.
   */
  exit(): void;
  /**
   * The popover opened in a presentation that does not use this motion:
   * leave the element exactly as the component styles it.
   */
  reset(): void;
  /** Cancels everything and restores the element. */
  dispose(): void;
}

const MOTION_STYLE_PROPERTIES = [
  'scale',
  'opacity',
  'transform-origin',
  'animation-name',
] as const;

/**
 * The popover is scaled about the point where it meets its source. Across
 * the source's edge its scale is s = s₀ + (1 − s₀)·p. Along the axis away
 * from the source it is s·f, with f = f₀ + (1 − f₀)·p, the share of its
 * full length. Both follow one eased progress p, so they play as curves on
 * the compositor. A dismissal during the growth, or a growth during the
 * dismissal, turns back from the frame on screen.
 *
 * A fresh presentation writes and reads nothing until the next animation
 * frame, which runs before that frame paints. In the task that opens the
 * popover, its style writes and box reads would lay the page out. The
 * layer's own CSS entrance goes off once the script that opened the popover
 * returns.
 *
 * The browser hides a popover as it closes, so the dismissal plays on the
 * layer runtime's exit copy, which is removed when its motion ends.
 *
 * While the popover grows, the layer runtime's input hold takes every touch,
 * as UIKit ignores touches while it presents a popover. A tap outside does
 * not dismiss it and reaches nothing under it. A pinch still zooms the page.
 * The browser's light dismiss cannot be cancelled from an event, so the
 * hold's shield covers the viewport from inside the layer. A tap on the
 * shield is then a tap inside the popover, which the browser leaves open.
 * The hold starts with the growth, in its frame. Holding from the open
 * would lay the page out twice in the opening task, since the shield's
 * `showPopover()` lays it out. A touch that starts in the frame before the
 * hold reaches the page.
 *
 * Under Reduce Motion the animator's policy applies. On a coarse pointer the
 * popover lands at its full size and cross-fades in, and it cross-fades out
 * where it stands.
 */
export function createPopoverSurfaceMotion(
  element: HTMLElement,
  {
    requestFrame,
    cancelFrame,
    entrance = null,
    ...animatorOptions
  }: Pick<AnimatorOptions, 'now'> & {
    /** Schedules the presentation's read (default: the window's animation frame). */
    requestFrame?: (callback: () => void) => number;
    /** Cancels a read that `requestFrame` scheduled. */
    cancelFrame?: (handle: number) => void;
    /**
     * The surface inside the layer, where the pointer presentation's CSS
     * entrance runs. The touch presentation turns that entrance off there
     * as on the element.
     */
    entrance?: HTMLElement | null;
  } = {},
): PopoverSurfaceMotion {
  const animator = createMotionEngine(element, animatorOptions);
  const view = element.ownerDocument.defaultView;
  const scheduleFrame =
    requestFrame ??
    ((callback: () => void) =>
      typeof view?.requestAnimationFrame === 'function'
        ? view.requestAnimationFrame(() => callback())
        : (callback(), 0));
  const unscheduleFrame =
    cancelFrame ??
    ((handle: number) => {
      if (typeof view?.cancelAnimationFrame === 'function') {
        view.cancelAnimationFrame(handle);
      }
    });
  let pendingPresentFrame: number | null = null;
  const cancelPending = () => {
    if (pendingPresentFrame != null) {
      unscheduleFrame(pendingPresentFrame);
      pendingPresentFrame = null;
    }
  };
  // The presentation in progress or last played; null while the popover is
  // in a presentation this motion does not drive.
  let collapsed: PopoverCollapsedState | null = null;
  // The geometry the presentation measured. While the growth runs, the
  // element's box includes a scale that only the curve knows.
  let measured: PopoverSurfaceGeometry | null = null;
  let presentHandle: MotionHandle | null = null;
  let exiting: {copy: HTMLElement; animator: Animator} | null = null;
  // Releases the hold that takes every touch while the popover grows.
  let releaseHold: (() => void) | null = null;

  const endHold = () => {
    releaseHold?.();
    releaseHold = null;
  };

  const endExit = () => {
    if (exiting == null) {
      return;
    }
    exiting.animator.dispose();
    exiting.copy.remove();
    exiting = null;
  };

  // The CSS entrance belongs to the pointer presentation. This presentation
  // plays its own growth instead.
  const holdEntrance = () => {
    element.style.setProperty('animation-name', 'none');
    entrance?.style.setProperty('animation-name', 'none');
  };

  const reset = () => {
    cancelPending();
    collapsed = null;
    measured = null;
    presentHandle = null;
    endHold();
    endExit();
    animator.set({scaleX: 1, scaleY: 1, opacity: 1});
    for (const property of MOTION_STYLE_PROPERTIES) {
      element.style.removeProperty(property);
    }
    entrance?.style.removeProperty('animation-name');
  };

  const enter = (measure: () => PopoverSurfaceGeometry) => {
    cancelPending();
    if (exiting != null && collapsed != null && measured != null) {
      // Shown again during the dismissal: turn back from the frame on
      // screen, about the same point. Both reads come before this task's
      // first write.
      const from = readState(exiting.animator, collapsed.axis);
      const timing = timingOn(element, POPOVER_ENTRANCE_TOKENS);
      // A dismissal let the element go (exit, below).
      animator.attach(element);
      endExit();
      present(from, measured, timing);
      return;
    }
    animator.attach(element);
    endExit();
    let presented = false;
    const frame = scheduleFrame(() => {
      presented = true;
      pendingPresentFrame = null;
      // One read pass before this frame's first write. The box is already
      // at full size: the opening task took the CSS entrance off, and a
      // dismissal leaves the element unscaled.
      const geometry = measure();
      const timing = timingOn(element, POPOVER_ENTRANCE_TOKENS);
      present(null, geometry, timing);
    });
    // Without animation frames the presentation has already run: no frame
    // is left to wait for, so a close plays the shrink.
    if (!presented) {
      pendingPresentFrame = frame;
      // The layer's CSS entrance goes off in a microtask, once the script
      // that opened the popover returns. That script's own reads come first,
      // so the write costs them no layout. A style read after it then starts
      // no entrance for the frame to cancel.
      queueMicrotask(() => {
        if (pendingPresentFrame === frame) {
          holdEntrance();
        }
      });
    }
  };

  const present = (
    from: SurfaceState | null,
    geometry: PopoverSurfaceGeometry,
    timing: MotionCurve,
  ) => {
    const next =
      from != null && collapsed != null
        ? collapsed
        : popoverCollapsedState(geometry);
    collapsed = next;
    measured = geometry;
    const start = from ?? {scale: next.scale, length: next.length, opacity: 0};
    // The start frame goes first. The motion engine may read the element's
    // will-change as it sets it, before any write of ours.
    animator.set(frameOf(start, next.axis));
    holdEntrance();
    element.style.setProperty(
      'transform-origin',
      `${next.originX}px ${next.originY}px`,
    );
    // The growth fades in from the floor, so Chromium draws its first frame.
    // The start values keep opacity 0. Reduce Motion replaces this curve with a
    // cross-fade, which then starts from transparent.
    const handle = animator.play(
      surfaceCurves(
        start,
        PRESENTED,
        next.axis,
        timing,
        ENTRANCE_OPACITY_FLOOR,
      ),
    );
    presentHandle = handle;
    endHold();
    releaseHold = holdInput(element, {until: handle, scope: 'viewport'});
    void handle.finished.then(() => {
      if (presentHandle === handle) {
        presentHandle = null;
        endHold();
      }
    });
  };

  const exit = () => {
    endHold();
    if (pendingPresentFrame != null) {
      // Closed before the frame that would have presented it: nothing is on
      // screen to dismiss. The element is hidden now, so it is left as the
      // component styles it, with no compositing layer. A promotion would
      // leave `will-change` on it and a timer to end it, a style write on an
      // element that no longer paints.
      cancelPending();
      collapsed = null;
      measured = null;
      presentHandle = null;
      animator.set({scaleX: 1, scaleY: 1, opacity: 1}, {promote: false});
      for (const property of MOTION_STYLE_PROPERTIES) {
        element.style.removeProperty(property);
      }
      entrance?.style.removeProperty('animation-name');
      return;
    }
    const target = collapsed;
    if (target == null || exiting != null) {
      return;
    }
    const from = readState(animator, target.axis);
    const timing = timingOn(element, POPOVER_EXIT_TOKENS);
    presentHandle = null;
    // The copy stands where the surface is drawn, the growth's frame
    // included.
    const copy = placePopoverExitCopy(element);
    if (copy == null) {
      // No top layer for a copy: the close is immediate.
      animator.set({scaleX: 1, scaleY: 1, opacity: 1});
      return;
    }
    copy.style.setProperty(
      'transform-origin',
      `${target.originX}px ${target.originY}px`,
    );
    const closing = createMotionEngine(copy, animatorOptions);
    closing.set(frameOf(from, target.axis));
    const handle = closing.play(
      surfaceCurves(
        from,
        {scale: target.scale, length: target.length, opacity: 0},
        target.axis,
        timing,
      ),
    );
    exiting = {copy, animator: closing};
    // The browser hides the element now. Leave it at rest, and let go of the
    // layer its growth promoted in this task. Kept, the promotion would end
    // inside the dismissal, a style write on an element that no longer
    // paints (a Layout in the dismissal's frames). The next presentation
    // attaches the element again.
    animator.set({scaleX: 1, scaleY: 1, opacity: 1}, {promote: false});
    animator.attach(null);
    void handle.finished.then(finished => {
      if (finished && exiting?.copy === copy) {
        endExit();
      }
    });
  };

  return {
    enter,
    exit,
    reset,
    dispose() {
      reset();
      animator.dispose();
    },
  };
}
