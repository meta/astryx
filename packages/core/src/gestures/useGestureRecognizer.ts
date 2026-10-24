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

/** @experimental */
export interface UseGestureRecognizerOptions {
  /** Live toggle; turning it off mid-gesture cancels the gesture. @default true */
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
 * @experimental
 */
export function useGestureRecognizer<R extends GestureRecognizer>(
  ref: RefObject<Element | null>,
  create: () => R,
  onGesture?: (recognizer: R) => void,
  options: UseGestureRecognizerOptions = {},
): R {
  const [recognizer] = useState(create);
  const onGestureRef = useRef(onGesture);
  useIsomorphicLayoutEffect(() => {
    onGestureRef.current = onGesture;
  });
  const {isEnabled = true, manageStyle = true} = options;
  const isUnmountedRef = useIsUnmountedRef();

  // Synchronizes the consumer's listener with the recognizer (an external
  // object): it runs inside input events, never during a render, and goes
  // quiet once the component unmounts.
  useEffect(
    () =>
      recognizer.addListener(current => {
        if (!isUnmountedRef.current) {
          onGestureRef.current?.(current);
        }
      }),
    [recognizer, isUnmountedRef],
  );

  // Synchronizes the document's gesture host with the element behind `ref`,
  // whichever element that is at this commit: a node rendered later, or
  // swapped behind the same ref, is attached then.
  useAttachedElement(
    ref,
    element =>
      getGestureHost(element.ownerDocument).attach(element, recognizer, {
        manageStyle,
      }),
    [recognizer, manageStyle],
  );

  // Synchronizes the recognizer's `isEnabled` (UIKit's setter): turning it
  // off mid-gesture cancels the gesture, and the recognizer reports that
  // cancellation to its listener as UIKit sends `.cancelled`.
  useIsomorphicLayoutEffect(() => {
    recognizer.setEnabled(isEnabled);
  }, [recognizer, isEnabled]);

  return recognizer;
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
 * Keeps one attachment for the element behind `ref`, re-made on any commit
 * that finds another element there (or the dependencies changed), and
 * released on unmount.
 */
function useAttachedElement(
  ref: RefObject<Element | null>,
  attach: (element: Element) => () => void,
  dependencies: ReadonlyArray<unknown>,
): void {
  const attachedRef = useRef<{
    element: Element;
    dependencies: ReadonlyArray<unknown>;
    detach: () => void;
  } | null>(null);
  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    const attached = attachedRef.current;
    if (
      attached != null &&
      attached.element === element &&
      attached.dependencies.length === dependencies.length &&
      attached.dependencies.every((value, i) =>
        Object.is(value, dependencies[i]),
      )
    ) {
      return;
    }
    attached?.detach();
    attachedRef.current =
      element == null ? null : {element, dependencies, detach: attach(element)};
  });
  useIsomorphicLayoutEffect(
    () => () => {
      attachedRef.current?.detach();
      attachedRef.current = null;
    },
    [],
  );
}

/** @experimental */
export type UsePressTrackerOptions = Omit<
  PressTrackerOptions,
  'getBounds' | 'view'
>;

/**
 * Track presses on the element behind `ref` with UIControl semantics. The
 * callbacks are read through a ref, like a recognizer's listener.
 * @experimental
 */
export function usePressTracker(
  ref: RefObject<Element | null>,
  options: UsePressTrackerOptions = {},
): PressTracker {
  const optionsRef = useRef(options);
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
          if (!isUnmountedRef.current) {
            optionsRef.current.onControlEvent?.(event, touch);
          }
        },
        onHighlightChange: isHighlighted => {
          if (!isUnmountedRef.current) {
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

  // Synchronizes the document's gesture host with the element behind `ref`
  // (see useGestureRecognizer); a tracker replaced by an option change is
  // disposed, which un-highlights a control it was holding.
  useAttachedElement(
    ref,
    element => {
      const detach = getGestureHost(element.ownerDocument).attachConsumer(
        element,
        tracker,
      );
      return () => {
        detach();
        tracker.dispose();
      };
    },
    [tracker],
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
