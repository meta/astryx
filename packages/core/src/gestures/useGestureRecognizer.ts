// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useGestureRecognizer.ts
 * @input An element ref, a recognizer factory and a gesture listener; or an
 *   element ref and press tracker options
 * @output Exports useGestureRecognizer and usePressTracker
 * @position React face of packages/core/src/gestures
 *
 * The recognizer is created once and keeps its identity for the life of the
 * component, so relationships set up at creation (`requireToFail`,
 * `recognizeSimultaneouslyWith`) hold. The listener is read through a ref:
 * passing a new function each render re-attaches nothing, and a gesture
 * costs no React render at all — the listener runs inside the input event
 * and writes to the DOM itself. The recognizer attaches in a layout effect,
 * so its `touch-action` is in place before the browser can see a finger, and
 * re-attaches on any commit that finds another element behind the ref. After
 * unmount neither hook calls the consumer back.
 *
 * SYNC: When modified, update useGestureRecognizer.test.tsx and README.md.
 */

import {useEffect, useMemo, useRef, useState, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {getGestureHost} from './GestureHost';
import type {GestureRecognizer} from './GestureRecognizer';
import {PressTracker, type PressTrackerOptions} from './PressTracker';

export interface UseGestureRecognizerOptions {
  /**
   * Live toggle; turning it off mid-gesture cancels the gesture. That cancel
   * does not call `onGesture`: it comes from the render that turned the
   * recognizer off, and the code that turned it off already knows.
   * @default true
   */
  isEnabled?: boolean;
  /** Let the host set touch-action (and long-press callout) styles. @default true */
  manageStyle?: boolean;
}

/**
 * Attach a recognizer to the element behind `ref`.
 *
 * @example
 * ```
 * const pan = useGestureRecognizer(
 *   ref,
 *   () => new PanGestureRecognizer({direction: 'vertical'}),
 *   recognizer => {
 *     ref.current.style.transform = `translateY(${recognizer.translation().y}px)`;
 *   },
 * );
 * ```
 */
export function useGestureRecognizer<R extends GestureRecognizer>(
  ref: RefObject<Element | null>,
  create: () => R,
  onGesture?: (recognizer: R) => void,
  options: UseGestureRecognizerOptions = {},
): R {
  const [recognizer] = useState(create);
  const onGestureRef = useRef(onGesture);
  // True while an Effect drives the recognizer, so a transition it causes
  // reaches no caller callback (react-component-runtime INV2, INV3).
  const isSyncingRef = useRef(false);
  useIsomorphicLayoutEffect(() => {
    onGestureRef.current = onGesture;
  });
  const {isEnabled = true, manageStyle = true} = options;
  const isUnmountedRef = useIsUnmountedRef();

  // The listener runs inside input events, never during a render or an
  // Effect, and goes quiet once the component unmounts.
  useEffect(
    () =>
      recognizer.addListener(current => {
        if (!isUnmountedRef.current && !isSyncingRef.current) {
          onGestureRef.current?.(current);
        }
      }),
    [recognizer, isUnmountedRef],
  );

  useAttachment(
    ref,
    element =>
      getGestureHost(element.ownerDocument).attach(element, recognizer, {
        manageStyle,
      }),
    manageStyle,
  );

  useIsomorphicLayoutEffect(() => {
    isSyncingRef.current = true;
    try {
      recognizer.setEnabled(isEnabled);
    } finally {
      isSyncingRef.current = false;
    }
  }, [recognizer, isEnabled]);

  return recognizer;
}

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
  const {trackingExpansion, highlightDelay, cancelTravel, quickTapFlash} =
    options;
  // A profile change after mount takes effect from the next touch: the
  // tracker is rebuilt with the new values.
  const tracker = useMemo(
    () =>
      new PressTracker({
        getBounds: () => ref.current?.getBoundingClientRect() ?? null,
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
    ],
  );

  // A tracker replaced by an option change is disposed, which un-highlights
  // a control it was holding.
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

/**
 * A flag that turns true when the component unmounts, before the cleanups of
 * the effects declared after it run, so nothing reports from those cleanups.
 */
function useIsUnmountedRef(): {readonly current: boolean} {
  const isUnmountedRef = useRef(false);
  useIsomorphicLayoutEffect(() => {
    isUnmountedRef.current = false;
    return () => {
      isUnmountedRef.current = true;
    };
  }, []);
  return isUnmountedRef;
}

/**
 * Keep `attach` bound to the element `ref` holds after each commit. A
 * replaced node is released and the new one attached, a changed `key`
 * re-attaches, and the last attachment is released on unmount; a commit that
 * changes neither does nothing (react-component-runtime INV3).
 */
function useAttachment(
  ref: RefObject<Element | null>,
  attach: (element: Element) => () => void,
  key: unknown,
): void {
  const attachmentRef = useRef<{
    element: Element;
    key: unknown;
    release: () => void;
  } | null>(null);

  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    const current = attachmentRef.current;
    if (current?.element === element && current?.key === key) {
      return;
    }
    current?.release();
    attachmentRef.current =
      element == null ? null : {element, key, release: attach(element)};
  });

  useIsomorphicLayoutEffect(
    () => () => {
      attachmentRef.current?.release();
      attachmentRef.current = null;
    },
    [],
  );
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
