// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file usePopoverSurfaceMotion.ts
 * @input React, the shared touch resolver and popoverSurfaceMotion
 * @output Exports `usePopoverSurfaceMotion`, the calls Popover makes as it
 *   opens and as it starts to close. Under a finger they present and dismiss
 *   the popover the UIKit way; a mouse keeps the layer's own entrance.
 * @position Internal to Popover; glue between the component and
 *   popoverSurfaceMotion.ts
 *
 * The shared touch resolver decides as the popover opens. Under a finger (a
 * coarse primary pointer, on any touch device) the popover grows out of its
 * source. When the layer runtime reports that it starts to close, it shrinks
 * back into it. A fine primary pointer keeps the layer's own entrance. The
 * motion is created for the popover element the first time it opens and
 * follows it if the element is replaced.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Popover/Popover.tsx
 * - /packages/core/src/Popover/usePopoverSurfaceMotion.test.tsx
 */

import {useCallback, useEffect, useMemo, useRef} from 'react';
import {isCoarsePointer} from '../utils/coarsePointer';
import {
  createPopoverSurfaceMotion,
  type PopoverSurfaceMotion,
  type PopoverSurfaceRect,
} from './popoverSurfaceMotion';

function boxOf(element: Element): PopoverSurfaceRect {
  const rect = element.getBoundingClientRect();
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
   * it paints.
   */
  present: (layer: HTMLElement | null, source: HTMLElement | null) => void;
  /** Call as the popover starts to close, while the browser still shows it. */
  closeStart: () => void;
}

export function usePopoverSurfaceMotion(): PopoverSurfaceMotionCalls {
  const motionRef = useRef<{
    element: HTMLElement;
    motion: PopoverSurfaceMotion;
  } | null>(null);
  const isTouchPresentationRef = useRef(false);

  const release = useCallback(() => {
    motionRef.current?.motion.dispose();
    motionRef.current = null;
  }, []);

  const motionFor = useCallback((element: HTMLElement) => {
    const current = motionRef.current;
    if (current?.element === element) {
      return current.motion;
    }
    current?.motion.dispose();
    const motion = createPopoverSurfaceMotion(element);
    motionRef.current = {element, motion};
    return motion;
  }, []);

  // Releases the motion's compositor animations, and any exit copy still on
  // screen, at unmount.
  useEffect(() => release, [release]);

  const present = useCallback(
    (layer: HTMLElement | null, source: HTMLElement | null) => {
      if (layer == null) {
        return;
      }
      const isTouch =
        source != null && isCoarsePointer(layer.ownerDocument.defaultView);
      isTouchPresentationRef.current = isTouch;
      if (!isTouch || source == null) {
        // A fine pointer animates nothing here, so nothing is created for
        // it, and nothing is promoted to the compositor. A motion this layer
        // already has (the pointer changed, or a touch presentation is on
        // screen) is released.
        release();
        return;
      }
      motionFor(layer).enter(() => ({
        surface: boxOf(layer),
        source: boxOf(source),
      }));
    },
    [motionFor, release],
  );

  const closeStart = useCallback(() => {
    if (isTouchPresentationRef.current) {
      motionRef.current?.motion.exit();
    }
  }, []);

  return useMemo(() => ({present, closeStart}), [present, closeStart]);
}
