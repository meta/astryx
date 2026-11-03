// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file menuSurfaceMotion.ts
 * @input An anchored menu's popover element, the control it hangs off, the
 *   motion foundation (compositor animator, spring math) and the UIKit table
 * @output Exports `menuCollapsedState` (the transform that shrinks the
 *   surface to UIMenu's collapsed square on its anchor), `menuSpring`,
 *   `menuExitDurationMs` and `createMenuSurfaceMotion` (the touch
 *   presentation's open and close)
 * @position Internal to DropdownMenu, imported only through its touch layer
 *   (DropdownMenuTouch.ts): the touch presentation of an anchored menu opens
 *   and closes the way UIMenu does
 *
 * SYNC: When modified, update:
 * - /packages/core/src/DropdownMenu/menuSurfaceMotion.test.ts
 * - /packages/core/src/DropdownMenu/DropdownMenu.tsx
 */

import {placeMenuExitCopy} from '../privateAttributes/menuExit.stylex';
import {
  createAnimator,
  type Animator,
  type AnimatorOptions,
  type MotionHandle,
} from '../motion/animator';
import {
  settlingDuration,
  toSpring,
  type SpringDescription,
} from '../motion/spring';
import {reducedMotionFade} from '../motion/reducedMotion';
import {resolveMotion} from '../motion/resolveMotion';
import {menu} from '../motion/uikit/menu';
import {MENU_CLOSE_SPRING, MENU_OPEN_SPRING} from '../motion/uikit/springs';

/** A box in viewport px. */
export interface MenuSurfaceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where the menu sits and where it grows from, in viewport px. */
export interface MenuSurfaceGeometry {
  /** The popover element's border box once positioned, at full size. */
  surface: MenuSurfaceRect;
  /** The point the menu grows out of: the center of its control. */
  anchor: {x: number; y: number};
}

/** The collapsed transform: scale factors and the origin they act about. */
export interface MenuCollapsedState {
  scaleX: number;
  scaleY: number;
  /** Transform origin, px from the surface's top-left corner. */
  originX: number;
  originY: number;
}

/**
 * The transform that shows the surface as UIMenu's collapsed square centered
 * on the anchor. Its origin keeps every later frame of the scale on UIKit's
 * path (see `createMenuSurfaceMotion`). `null` when the surface is no
 * larger than the square, where there is nothing to grow.
 */
export function menuCollapsedState(
  {surface, anchor}: MenuSurfaceGeometry,
  collapsedSize: number = menu.collapsedSize,
): MenuCollapsedState | null {
  if (surface.width <= collapsedSize || surface.height <= collapsedSize) {
    return null;
  }
  const scaleX = collapsedSize / surface.width;
  const scaleY = collapsedSize / surface.height;
  const anchorX = anchor.x - surface.left;
  const anchorY = anchor.y - surface.top;
  return {
    scaleX,
    scaleY,
    originX: (anchorX - (surface.width / 2) * scaleX) / (1 - scaleX),
    originY: (anchorY - (surface.height / 2) * scaleY) / (1 - scaleY),
  };
}

/** The spring that times the open or the close: UIKit's menu springs. */
export function menuSpring(direction: 'open' | 'close'): SpringDescription {
  return direction === 'open' ? MENU_OPEN_SPRING : MENU_CLOSE_SPRING;
}

/**
 * How long the close stays on screen, in ms. It is the close spring as the
 * animator reads it (`springs.menuClose`, an internal motion role, so its
 * table value). Under reduced motion it is the fade the animator plays
 * instead.
 */
export function menuExitDurationMs(element: Element | null): number {
  const fade = reducedMotionFade(element);
  if (fade != null) {
    return fade.duration;
  }
  return Math.ceil(
    settlingDuration(toSpring(resolveMotion(element, menuSpring('close')))) *
      1000,
  );
}

export interface MenuSurfaceMotion {
  /**
   * The menu has just opened in its touch presentation: grow it out of its
   * anchor. `measure` reads the geometry; it runs with the element at its
   * full size (layout reads see the scaled box otherwise). During a close,
   * the menu grows back from where the close has it, about the same origin.
   */
  enter(measure: () => MenuSurfaceGeometry): void;
  /**
   * The menu is closing (its `beforetoggle` to closed, while it is still
   * shown): collapse it into its anchor. Does nothing unless the last open
   * was a touch presentation.
   */
  exit(): void;
  /**
   * The menu opened in a presentation that does not use this motion: leave
   * the element exactly as the component styles it.
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
 * UIMenu's grow and collapse for a menu surface's popover element.
 *
 * UIMenu on iOS 26.2 grows out of a small square centered on its button and
 * collapses back into it (`menu.collapsedSize`). Its width and height run on
 * one spring from that square to the menu's size (`springs.menuOpen`, back
 * on `springs.menuClose`). Its center travels on the same spring from the
 * button to the menu's center, and its content fades with the same progress.
 *
 * Here the popover element is scaled about a transform origin chosen so that
 * those three hold exactly. At the start the surface is a `collapsedSize`
 * square centered on the anchor. At any progress p its size is
 * square + (size − square)·p and its center anchor + (center − anchor)·p.
 * Scale about an origin O moves the center to O + (center − O)·s. Let
 * s = s₀ + (1 − s₀)·p. Choosing O = (anchor − center·s₀) / (1 − s₀) per axis
 * makes that the straight line from the anchor.
 *
 * Only `scale` and `opacity` move, on the compositor, through the motion
 * foundation's animator. It also reads the presentation value back. So a
 * close during the open, or an open during the close, continues from what is
 * on screen with its velocity.
 *
 * The close outlives the popover: the browser hides a popover the moment it
 * closes (a pick, Escape, or its own light dismiss). So the close plays on
 * the layer runtime's exit copy (`placeLayerExitCopy`), taken as it closes.
 * The copy has the same place, size and inherited theme, in the top layer. It
 * is `inert`, hidden from assistive technology and takes no pointer events,
 * and goes when the spring settles. Nothing on the main thread runs per frame
 * while it collapses: a discrete `display` transition would restyle the
 * element every frame. The hidden popover rests at full size, unpromoted and
 * detached from its animator until the next open. So no style write lands on
 * it during the close.
 *
 * Under reduced motion the animator's policy applies. The menu lands at its
 * size and fades in, and fades out where it is: opacity only, in 200 ms
 * under a finger.
 */
export function createMenuSurfaceMotion(
  element: HTMLElement,
  options: Pick<AnimatorOptions, 'now'> = {},
): MenuSurfaceMotion {
  // Reduced Motion is the animator's: under it the open and the close fade in
  // place.
  const animator: Animator = createAnimator(element, options);
  // The collapsed state of the open in progress or last played; null while
  // the menu is in a presentation this motion does not drive.
  let collapsed: MenuCollapsedState | null = null;
  // The geometry the open measured, and whether its spring is still running
  // (the element's box then includes a scale only the animation knows).
  let measured: MenuSurfaceGeometry | null = null;
  let openHandle: MotionHandle | null = null;
  // The close in progress: its copy and the copy's animator.
  let exiting: {ghost: HTMLElement; animator: Animator} | null = null;

  const endExit = () => {
    if (exiting == null) {
      return;
    }
    exiting.animator.dispose();
    exiting.ghost.remove();
    exiting = null;
  };

  const enter = (measure: () => MenuSurfaceGeometry) => {
    // A close detached the surface (exit); the open writes to it again.
    if (animator.element !== element) {
      animator.attach(element);
    }
    const resumed = exiting != null && collapsed != null ? exiting : null;
    let from: {
      scaleX: number;
      scaleY: number;
      opacity: number;
      velocity: {scaleX: number; scaleY: number; opacity: number};
    } | null = null;
    if (resumed != null) {
      // Reopened during the close: continue from the frame on screen.
      const {animator: closing} = resumed;
      from = {
        scaleX: closing.get('scaleX'),
        scaleY: closing.get('scaleY'),
        opacity: closing.get('opacity'),
        velocity: {
          scaleX: closing.getVelocity('scaleX'),
          scaleY: closing.getVelocity('scaleY'),
          opacity: closing.getVelocity('opacity'),
        },
      };
    }
    endExit();
    if (from == null) {
      // Full size and invisible for the read. The element's box must not
      // include a scale left over from the last close. Nor may it include the
      // first keyframe of the layer's CSS entrance, which belongs to the
      // pointer presentation; WebKit's box reads include it. Nothing paints
      // before the open below replaces these values.
      element.style.setProperty('animation-name', 'none');
      animator.set({scaleX: 1, scaleY: 1, opacity: 0});
    }
    // A close in progress keeps its origin, so the open continues from the
    // frame on screen instead of jumping to a new pivot.
    const geometry = from != null && measured != null ? measured : measure();
    const next = from != null ? collapsed : menuCollapsedState(geometry);
    if (next == null) {
      reset();
      return;
    }
    collapsed = next;
    measured = geometry;
    // The layer's own CSS entrance belongs to the pointer presentation.
    element.style.setProperty('animation-name', 'none');
    element.style.setProperty(
      'transform-origin',
      `${next.originX}px ${next.originY}px`,
    );
    if (from == null) {
      animator.set({scaleX: next.scaleX, scaleY: next.scaleY, opacity: 0});
    } else {
      animator.set({
        scaleX: from.scaleX,
        scaleY: from.scaleY,
        opacity: from.opacity,
      });
    }
    const handle = animator.animate(
      {scaleX: 1, scaleY: 1, opacity: 1},
      {
        spring: MENU_OPEN_SPRING,
        ...(from != null ? {velocity: from.velocity} : null),
      },
    );
    settleOpen(handle);
  };

  const settleOpen = (handle: MotionHandle) => {
    openHandle = handle;
    void handle.finished.then(() => {
      if (openHandle === handle) {
        openHandle = null;
        // Settled: the surface goes back to exactly what the component
        // styles. A scale left on the popover, even 1, makes it a transformed
        // box. WebKit on iOS then will not let a finger scroll the list inside
        // it.
        element.style.removeProperty('scale');
        element.style.removeProperty('opacity');
        element.style.removeProperty('transform-origin');
      }
    });
  };

  const exit = () => {
    const target = collapsed;
    if (target == null || exiting != null) {
      return;
    }
    const presented = {
      scaleX: animator.get('scaleX'),
      scaleY: animator.get('scaleY'),
      opacity: animator.get('opacity'),
    };
    const velocity = {
      scaleX: animator.getVelocity('scaleX'),
      scaleY: animator.getVelocity('scaleY'),
      opacity: animator.getVelocity('opacity'),
    };
    openHandle = null;
    // The layer runtime's one exit copy: in the top layer on the surface's
    // layout box, inert and hidden from assistive technology, its scroll
    // positions kept. Without a top layer
    // (no popover API) the close is immediate.
    const ghost = placeMenuExitCopy(element);
    if (ghost == null) {
      animator.set({scaleX: 1, scaleY: 1, opacity: 1}, {promote: false});
      animator.attach(null);
      return;
    }
    ghost.style.setProperty(
      'transform-origin',
      `${target.originX}px ${target.originY}px`,
    );
    const closing = createAnimator(ghost, options);
    closing.set(presented);
    const handle = closing.animate(
      {scaleX: target.scaleX, scaleY: target.scaleY, opacity: 0},
      {spring: MENU_CLOSE_SPRING, velocity},
    );
    exiting = {ghost, animator: closing};
    // The element itself is hidden by the browser now. Leave it at rest,
    // unpromoted, and detach it in this task. A promotion left from the open
    // would otherwise end with a style write on it while the copy is still
    // closing. The next open attaches it again.
    animator.set({scaleX: 1, scaleY: 1, opacity: 1}, {promote: false});
    animator.attach(null);
    void handle.finished.then(finished => {
      if (finished && exiting?.ghost === ghost) {
        endExit();
      }
    });
  };

  const reset = () => {
    collapsed = null;
    measured = null;
    openHandle = null;
    endExit();
    animator.set({scaleX: 1, scaleY: 1, opacity: 1});
    for (const property of MOTION_STYLE_PROPERTIES) {
      element.style.removeProperty(property);
    }
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
