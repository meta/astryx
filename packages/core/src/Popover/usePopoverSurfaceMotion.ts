// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file usePopoverSurfaceMotion.ts
 * @input React, the shared touch resolver, the layer runtime's presentation
 *   hold and settled box, and popoverSurfaceMotion
 * @output Exports `usePopoverSurfaceMotion`, the calls Popover makes as it
 *   opens and as it starts to close. Under a finger they present and dismiss
 *   the popover the UIKit way; a mouse keeps the layer's own entrance.
 * @position Internal to Popover and DropdownMenu; glue between the
 *   component and popoverSurfaceMotion.ts
 *
 * The shared touch resolver decides as the popover opens. Under a finger (a
 * coarse primary pointer, on any touch device) the popover grows out of its
 * source. When the layer runtime reports that it starts to close, it shrinks
 * back into it. A fine primary pointer keeps the layer's own entrance. The
 * growth plays on the surface, the box that paints the popover, and not on
 * the layer. The layer is anchored, and Chromium lays an anchored element out
 * again each time it restyles it, as when an animation on it starts. The
 * motion is created for the surface the first time the popover opens and
 * follows it if the surface is replaced.
 *
 * DropdownMenu plays the same motion, with options Popover does not pass:
 * `holdUntilFirstFrame`, which holds taps from the open until the grow's
 * first frame, and a `present` call's `isTouch`, which decides from the
 * open's own input on any device.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Popover/Popover.tsx
 * - /packages/core/src/Popover/usePopoverSurfaceMotion.test.tsx
 * - /packages/core/src/DropdownMenu/DropdownMenu.tsx
 */

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {holdInput} from '../Layer/inputHold';
import {createPresentationHold} from '../Layer/presentationHold';
import {settledBox} from '../Layer/settledBox';
import {isCoarsePointer} from '../utils/coarsePointer';
import {
  createPopoverSurfaceMotion,
  type PopoverSurfaceMotion,
  type PopoverSurfaceRect,
} from './popoverSurfaceMotion';

// The growth needs where the surface ends and where its source is. Both
// boxes are read once, in the frame that starts it, before that frame writes.
function boxOf(rect: DOMRect): PopoverSurfaceRect {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export interface PopoverSurfaceMotionCalls {
  /**
   * Call as the popover opens, right after the browser shows it and before
   * it paints. `entrance` is the surface that carries the pointer
   * presentation's CSS entrance; the touch presentation turns it off there
   * and plays its growth on it. `isTouch`, when given, decides the touch
   * presentation in place of the primary pointer.
   */
  present: (
    layer: HTMLElement | null,
    source: HTMLElement | null,
    entrance?: HTMLElement | null,
    isTouch?: boolean,
  ) => void;
  /** Call as the popover starts to close, while the browser still shows it. */
  closeStart: () => void;
}

export interface PopoverSurfaceMotionOptions {
  /**
   * Holds taps from the open until the grow's first frame, where the grow's
   * own hold takes over.
   */
  holdUntilFirstFrame?: boolean;
}

/**
 * Holds input under a coarse primary pointer from now until the next frame,
 * where the grow takes its own hold. Frame callbacks run in the order they
 * were asked for, so call this after the grow's `enter`. Returns the early
 * release.
 */
function holdUntilNextFrame(surface: HTMLElement): () => void {
  const view = surface.ownerDocument.defaultView;
  if (!isCoarsePointer(view)) {
    return () => {};
  }
  const nextFrame = new Promise<void>(resolve => {
    if (typeof view?.requestAnimationFrame === 'function') {
      view.requestAnimationFrame(() => resolve());
    } else {
      resolve();
    }
  });
  return holdInput(surface, {until: nextFrame, scope: 'viewport'});
}

export function usePopoverSurfaceMotion({
  holdUntilFirstFrame = false,
}: PopoverSurfaceMotionOptions = {}): PopoverSurfaceMotionCalls {
  const motionRef = useRef<{
    element: HTMLElement;
    entrance: HTMLElement | null;
    motion: PopoverSurfaceMotion;
  } | null>(null);
  // Whether the presentation in progress is the touch one, held from the
  // open until its close begins (Layer/presentationHold).
  const [touchHold] = useState(() => createPresentationHold<boolean>());
  const tapHoldUntilFirstFrameRef = useRef<(() => void) | null>(null);
  const endTapHoldUntilFirstFrame = useCallback(() => {
    tapHoldUntilFirstFrameRef.current?.();
    tapHoldUntilFirstFrameRef.current = null;
  }, []);

  const release = useCallback(() => {
    motionRef.current?.motion.dispose();
    motionRef.current = null;
  }, []);

  const motionFor = useCallback(
    (element: HTMLElement, entrance: HTMLElement | null) => {
      const current = motionRef.current;
      if (current?.element === element && current.entrance === entrance) {
        return current.motion;
      }
      current?.motion.dispose();
      const motion = createPopoverSurfaceMotion(element, {entrance});
      motionRef.current = {element, entrance, motion};
      return motion;
    },
    [],
  );

  // Effect: releases the motion's compositor animations, any exit copy still
  // on screen and the hold until the grow's first frame, at unmount.
  useEffect(
    () => () => {
      release();
      endTapHoldUntilFirstFrame();
    },
    [endTapHoldUntilFirstFrame, release],
  );

  const present = useCallback(
    (
      layer: HTMLElement | null,
      source: HTMLElement | null,
      entrance: HTMLElement | null = null,
      touch?: boolean,
    ) => {
      endTapHoldUntilFirstFrame();
      if (layer == null) {
        return;
      }
      const isTouch =
        source != null &&
        (touch ?? isCoarsePointer(layer.ownerDocument.defaultView));
      touchHold.take(isTouch);
      if (!isTouch || source == null) {
        // A fine pointer animates nothing here, so nothing is created for
        // it, and nothing is promoted to the compositor. A motion this layer
        // already has (the pointer changed, or a touch presentation is on
        // screen) is released.
        release();
        return;
      }
      const surface = entrance ?? layer;
      motionFor(surface, entrance).enter(() => ({
        surface: boxOf(surface.getBoundingClientRect()),
        // A press scales its trigger. The growth starts from the trigger's
        // box without that transform.
        source: boxOf(settledBox(source)),
      }));
      if (holdUntilFirstFrame) {
        tapHoldUntilFirstFrameRef.current = holdUntilNextFrame(surface);
      }
    },
    [
      endTapHoldUntilFirstFrame,
      holdUntilFirstFrame,
      motionFor,
      release,
      touchHold,
    ],
  );

  const closeStart = useCallback(() => {
    endTapHoldUntilFirstFrame();
    if (touchHold.current() === true) {
      motionRef.current?.motion.exit();
    }
    touchHold.release();
  }, [endTapHoldUntilFirstFrame, touchHold]);

  return useMemo(() => ({present, closeStart}), [present, closeStart]);
}
