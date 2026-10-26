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
 * The callbacks and the profile are read through refs: one tracker serves
 * the component's life, so a profile change applies from the tracker's next
 * read and never ends a press in progress. After unmount the tracker calls
 * nothing back.
 *
 * SYNC: When modified, update useGestureRecognizer.test.tsx and README.md.
 */

import {useMemo, useRef, useState, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import {getGestureHost} from './GestureHost';
import type {GestureRecognizer} from './GestureRecognizer';
import {PressTracker, type PressTrackerOptions} from './PressTracker';
import {useAttachment, useIsUnmountedRef} from './useAttachment';

export type UsePressTrackerOptions = Omit<
  PressTrackerOptions,
  'getBounds' | 'view'
> & {
  /**
   * The control paints press feedback per event, so its tracker attaches
   * even where the primary pointer is fine, with no warning (an FR19
   * exception for press feedback only, pending in `spec:AST-094`'s
   * amendment): there a finger's press is painted and nothing else (no
   * control event, nothing kept), and a mouse or pen press is not taken.
   * @default false
   */
  perEventPointer?: boolean;
};

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
  // The ref is read through a ref too: a caller may pass a new ref object
  // on a render, and the one tracker must follow it.
  const refRef = useRef(ref);
  useIsomorphicLayoutEffect(() => {
    optionsRef.current = options;
    refRef.current = ref;
  });
  const isUnmountedRef = useIsUnmountedRef();
  const {perEventPointer = false} = options;
  // One tracker for the component's life, reading its profile through the
  // options ref: a profile change never rebuilds it, so a press in progress
  // survives it (the change applies from the tracker's next read).
  // `keepsTouch` is the exception, fixed when the tracker is created: it
  // decides whether the host gives the element a blocking touchmove.
  const [tracker] = useState(
    () =>
      new PressTracker({
        getBounds: () =>
          refRef.current.current?.getBoundingClientRect() ?? null,
        get view() {
          return refRef.current.current;
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
        trackingExpansion: options.trackingExpansion,
        get highlightDelay() {
          return optionsRef.current.highlightDelay;
        },
        get cancelTravel() {
          return optionsRef.current.cancelTravel;
        },
        get quickTapFlash() {
          return optionsRef.current.quickTapFlash;
        },
        keepsTouch: options.keepsTouch,
        get selectionLock() {
          return optionsRef.current.selectionLock;
        },
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
          const element = refRef.current.current;
          return (
            element != null &&
            getGestureHost(element.ownerDocument).isScrollBraking(element)
          );
        },
      }),
  );
  const {trackingExpansion} = options;
  useIsomorphicLayoutEffect(() => {
    tracker.trackingExpansion =
      trackingExpansion ?? UIKIT_GESTURES.control.trackingExpansion.value;
  }, [tracker, trackingExpansion]);

  // Releasing the element (a replaced node, unmount) disposes the press,
  // which un-highlights a control it was holding; a changed perEventPointer
  // re-attaches it.
  const attachment = useMemo(
    () => ({tracker, perEventPointer}),
    [tracker, perEventPointer],
  );
  useAttachment(
    ref,
    element => {
      const detach = getGestureHost(element.ownerDocument).attachConsumer(
        element,
        attachment.tracker,
        {perEventPointer: attachment.perEventPointer},
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
    attachment,
  );

  // The enabled state can change with any render: the host listens only
  // while an enabled control is attached (spec:AST-094 FR24).
  useIsomorphicLayoutEffect(() => {
    const element = refRef.current.current;
    if (element != null) {
      getGestureHost(element.ownerDocument).update(element);
    }
  });

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
