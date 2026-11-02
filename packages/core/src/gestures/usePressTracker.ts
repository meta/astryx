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
import {UIKIT_CONTROL} from '../motion/uikit/gestures';
import {getGestureHost} from './GestureHost';
import {
  createPressTracker,
  vetoesSingleTap,
  type PressTracker,
  type PressTrackerOptions,
} from './PressTracker';
import {useAttachment} from '../hooks/useAttachment';
import {
  isSyncingGestures,
  syncingGestures,
  useIsUnmountedRef,
} from './gestureSync';

export type UsePressTrackerOptions = Omit<
  PressTrackerOptions,
  'getBounds' | 'view'
> & {
  /**
   * Accepted and ignored: every attachment reads each event's pointer
   * (`spec:AST-094` FR43). Kept so callers written before FR43 compile.
   * @deprecated
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
  // Syncs the options and ref refs with the newest render.
  useIsomorphicLayoutEffect(() => {
    optionsRef.current = options;
    refRef.current = ref;
  });
  const isUnmountedRef = useIsUnmountedRef();
  const {perEventPointer = false} = options;
  // Calls a caller callback: never while an Effect releases the tracker or
  // after unmount. While any gesture hook's isEnabled sync runs (turning off
  // a recognizer the press waits on resolves the press in that arena pass,
  // inside the Effect), the call waits for a microtask after it, in order,
  // so the press still ends, un-highlighted, outside the Effect
  // (react-component-runtime INV2).
  const [deliver] = useState(() => (call: () => void) => {
    if (isReleasingRef.current || isUnmountedRef.current) {
      return;
    }
    if (!isSyncingGestures()) {
      call();
      return;
    }
    queueMicrotask(() => {
      if (!isUnmountedRef.current) {
        call();
      }
    });
  });
  // One tracker for the component's life, reading its profile through the
  // options ref: a profile change never rebuilds it, so a press in progress
  // survives it (the change applies from the tracker's next read).
  // `keepsTouch` is the exception, fixed when the tracker is created: it
  // decides whether the host gives the element a blocking touchmove.
  const [tracker] = useState(() =>
    createPressTracker({
      getBounds: () => {
        const element = refRef.current.current;
        return element == null
          ? null
          : getGestureHost(element.ownerDocument).presentedRect(element);
      },
      get view() {
        return refRef.current.current;
      },
      onControlEvent: (event, touch) =>
        deliver(() => optionsRef.current.onControlEvent?.(event, touch)),
      onHighlightChange: isHighlighted =>
        deliver(() => optionsRef.current.onHighlightChange?.(isHighlighted)),
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
      // The caller's veto, read on every touch, else the tracker's own.
      vetoesAncestorRecognizer: recognizer =>
        (optionsRef.current.vetoesAncestorRecognizer ?? vetoesSingleTap)(
          recognizer,
        ),
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
  // Syncs the tracker's tracking expansion with the option.
  useIsomorphicLayoutEffect(() => {
    tracker.trackingExpansion =
      trackingExpansion ?? UIKIT_CONTROL.trackingExpansion.value;
  }, [tracker, trackingExpansion]);

  // Syncs the host's press consumer with the element behind `ref`.
  // Releasing the element (a replaced node, unmount) disposes the press,
  // which un-highlights a control it was holding.
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

  // Syncs the host's listeners with the tracker's enabled state, which can
  // change with any render: the host listens only while an enabled control
  // is attached (spec:AST-094 FR24). A control disabled under a finger ends
  // that press here, inside the release guard: a disabled control tracks no
  // touch, and this Effect calls back no caller, whether the host stops
  // listening or another control keeps it listening.
  useIsomorphicLayoutEffect(() => {
    const element = refRef.current.current;
    isReleasingRef.current = true;
    try {
      if (tracker.isTracking && !(optionsRef.current.isEnabled?.() ?? true)) {
        tracker.dispose();
      }
      if (element != null) {
        // The update's arena pass can settle other recognizers and trackers
        // too: it runs as a gesture sync, so none calls its caller back from
        // this Effect.
        syncingGestures(() =>
          getGestureHost(element.ownerDocument).update(element),
        );
      }
    } finally {
      isReleasingRef.current = false;
    }
  });

  return tracker;
}
