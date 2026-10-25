// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file usePressTracker.ts
 * @input An element ref and press tracker options
 * @output Exports usePressTracker
 * @position React face of packages/core/src/gestures' PressTracker, in its
 *   own module so a component that only recognizes gestures never imports
 *   the press tracker
 *
 * The callbacks are read through a ref, like a recognizer's listener. A
 * profile change after mount takes effect from the next touch. After unmount
 * the tracker calls nothing back.
 *
 * SYNC: When modified, update useGestureRecognizer.test.tsx and README.md.
 */

import {useMemo, useRef, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {getGestureHost} from './GestureHost';
import type {GestureRecognizer} from './GestureRecognizer';
import {PressTracker, type PressTrackerOptions} from './PressTracker';
import {useAttachment, useIsUnmountedRef} from './useAttachment';

export type UsePressTrackerOptions = Omit<
  PressTrackerOptions,
  'getBounds' | 'view'
>;

/**
 * Track presses on the element behind `ref` with UIControl semantics. The
 * callbacks are read through a ref, like a recognizer's listener. Releasing
 * the element (unmount, or a replaced node) ends any press without calling
 * them: that release runs in an Effect, which never calls a caller's
 * callback (react-component-runtime INV2, INV3).
 */
export function usePressTracker(
  ref: RefObject<Element | null>,
  options: UsePressTrackerOptions = {},
): PressTracker {
  const optionsRef = useRef(options);
  // True while an Effect releases the tracker, so the press it ends reaches
  // no caller callback.
  const isReleasingRef = useRef(false);
  useIsomorphicLayoutEffect(() => {
    optionsRef.current = options;
  });
  const isUnmountedRef = useIsUnmountedRef();
  const {
    trackingExpansion,
    highlightDelay,
    cancelTravel,
    quickTapFlash,
    keepsTouch,
  } = options;
  // A profile change after mount takes effect from the next touch: the
  // tracker is rebuilt with the new values.
  const tracker = useMemo(
    () =>
      new PressTracker({
        getBounds: () => {
          const element = ref.current;
          return element == null
            ? null
            : getGestureHost(element.ownerDocument).presentedRect(element);
        },
        get view() {
          return ref.current;
        },
        onControlEvent: (event, touch) => {
          if (!isReleasingRef.current && !isUnmountedRef.current) {
            optionsRef.current.onControlEvent?.(event, touch);
          }
        },
        onHighlightChange: isHighlighted => {
          if (!isReleasingRef.current && !isUnmountedRef.current) {
            optionsRef.current.onHighlightChange?.(isHighlighted);
          }
        },
        trackingExpansion,
        highlightDelay,
        cancelTravel,
        quickTapFlash,
        keepsTouch,
        vetoesAncestorRecognizer: recognizer =>
          optionsRef.current.vetoesAncestorRecognizer?.(recognizer) ??
          defaultVeto(recognizer),
        isEnabled: () => optionsRef.current.isEnabled?.() ?? true,
        // The caller's brake, or the host's: a touch that stops a flick
        // presses nothing, as a UIKit control in a decelerating scroll view.
        isBraking: touch => {
          const own = optionsRef.current.isBraking;
          if (own != null) {
            return own(touch);
          }
          const element = ref.current;
          return (
            element != null &&
            getGestureHost(element.ownerDocument).isScrollBraking(element)
          );
        },
      }),
    [
      ref,
      isUnmountedRef,
      trackingExpansion,
      highlightDelay,
      cancelTravel,
      quickTapFlash,
      keepsTouch,
    ],
  );

  // Synchronizes the document's gesture host with the element behind `ref`
  // (see useGestureRecognizer); a tracker replaced by an option change is
  // disposed, which un-highlights a control it was holding.
  useAttachment(
    ref,
    element => {
      const detach = getGestureHost(element.ownerDocument).attachConsumer(
        element,
        tracker,
      );
      return () => {
        isReleasingRef.current = true;
        try {
          detach();
          tracker.dispose();
        } finally {
          isReleasingRef.current = false;
        }
      };
    },
    tracker,
  );

  return tracker;
}

/** PressTracker's own default: an ancestor's single-finger single tap. */
function defaultVeto(recognizer: GestureRecognizer): boolean {
  const tap = recognizer as GestureRecognizer & {
    numberOfTapsRequired?: number;
    numberOfTouchesRequired?: number;
  };
  return (
    recognizer.isDiscrete &&
    tap.numberOfTapsRequired === 1 &&
    tap.numberOfTouchesRequired === 1
  );
}
