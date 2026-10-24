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

import {useEffect, useRef, useState, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {getGestureHost} from './GestureHost';
import type {GestureRecognizer} from './GestureRecognizer';
import {PressTracker, type PressTrackerOptions} from './PressTracker';

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

  useEffect(
    () =>
      recognizer.addListener(current => {
        onGestureRef.current?.(current);
      }),
    [recognizer],
  );

  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (element == null) {
      return undefined;
    }
    return getGestureHost(element.ownerDocument).attach(element, recognizer, {
      manageStyle,
    });
  }, [ref, recognizer, manageStyle]);

  useIsomorphicLayoutEffect(() => {
    recognizer.setEnabled(isEnabled);
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
  const [tracker] = useState(
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
        trackingExpansion: options.trackingExpansion,
        highlightDelay: options.highlightDelay,
        cancelTravel: options.cancelTravel,
        quickTapFlash: options.quickTapFlash,
        vetoesAncestorRecognizer: recognizer =>
          optionsRef.current.vetoesAncestorRecognizer?.(recognizer) ??
          defaultVeto(recognizer),
        isEnabled: () => optionsRef.current.isEnabled?.() ?? true,
      }),
  );

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
