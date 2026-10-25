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
 * so its `touch-action` is in place before the browser can see a finger.
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
   * Live toggle. Turning it off mid-gesture ends the gesture without calling
   * the listener: the handler that turned it off owns that end. A handler
   * that wants UIKit's `.cancelled` calls `recognizer.setEnabled(false)`
   * itself, which reports it at once. @default true
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
  useIsomorphicLayoutEffect(() => {
    onGestureRef.current = onGesture;
  });
  const {isEnabled = true, manageStyle = true} = options;
  // True while the isEnabled sync below runs: the listener stays quiet.
  const isSyncingRef = useRef(false);

  // Synchronizes the consumer's listener with the recognizer, an external
  // object driven by the document's input events: the listener runs inside
  // those events, never in a render or an Effect.
  useEffect(
    () =>
      recognizer.addListener(current => {
        if (!isSyncingRef.current) {
          onGestureRef.current?.(current);
        }
      }),
    [recognizer],
  );

  // Synchronizes the document's gesture host (an external system) with the
  // element behind `ref`.
  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (element == null) {
      return undefined;
    }
    return getGestureHost(element.ownerDocument).attach(element, recognizer, {
      manageStyle,
    });
  }, [ref, recognizer, manageStyle]);

  // Synchronizes the recognizer's `isEnabled` with the prop. Turning it off
  // mid-gesture ends the gesture, but this Effect calls no consumer callback
  // (architecture:react-component-runtime INV2): the handler that turned it
  // off owns the end, or calls `recognizer.setEnabled(false)` itself to hear
  // `cancelled` from that handler, and then this has nothing left to do.
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
 * callbacks are read through a ref, like a recognizer's listener.
 */
export function usePressTracker(
  ref: RefObject<Element | null>,
  options: UsePressTrackerOptions = {},
): PressTracker {
  const optionsRef = useRef(options);
  useIsomorphicLayoutEffect(() => {
    optionsRef.current = options;
  });
  const {trackingExpansion, highlightDelay, cancelTravel, quickTapFlash} =
    options;
  // The tracker reads these four when it is built: a change rebuilds it, and
  // the new values apply from the next touch. The callbacks, the brake
  // included, are read through the ref on every touch.
  const tracker = useMemo(
    () =>
      new PressTracker({
        getBounds: () => ref.current?.getBoundingClientRect() ?? null,
        get view() {
          return ref.current;
        },
        onControlEvent: (event, touch) =>
          optionsRef.current.onControlEvent?.(event, touch),
        onHighlightChange: isHighlighted =>
          optionsRef.current.onHighlightChange?.(isHighlighted),
        trackingExpansion,
        highlightDelay,
        cancelTravel,
        quickTapFlash,
        vetoesAncestorRecognizer: recognizer =>
          optionsRef.current.vetoesAncestorRecognizer?.(recognizer) ??
          defaultVeto(recognizer),
        isEnabled: () => optionsRef.current.isEnabled?.() ?? true,
        isBraking: touch => optionsRef.current.isBraking?.(touch) === true,
      }),
    [ref, trackingExpansion, highlightDelay, cancelTravel, quickTapFlash],
  );

  // Synchronizes the document's gesture host (an external system) with the
  // element behind `ref`; a tracker replaced by an option change is disposed.
  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (element == null) {
      return undefined;
    }
    const detach = getGestureHost(element.ownerDocument).attachConsumer(
      element,
      tracker,
    );
    return () => {
      detach();
      tracker.dispose();
    };
  }, [ref, tracker]);

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
