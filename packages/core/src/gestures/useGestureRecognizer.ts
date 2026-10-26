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

  // Syncs the recognizer's target-action listeners with the caller's
  // callback (read through a ref, so a new function re-subscribes nothing).
  useEffect(
    () =>
      recognizer.addListener(current => {
        onGestureRef.current?.(current);
      }),
    [recognizer],
  );

  // Syncs the recognizer's `isEnabled` (UIKit's): turning it off mid-gesture
  // cancels the gesture, which the listener above reports.
  useIsomorphicLayoutEffect(() => {
    recognizer.setEnabled(isEnabled);
  }, [recognizer, isEnabled]);

  // Syncs the document's gesture host with the element behind `ref`: attached
  // while enabled, re-attached when the node is replaced. A disabled gesture
  // is not attached at all: no listener and no `touch-action` of its own on
  // the element (spec:AST-094 FR24).
  useNodeAttachment(
    ref,
    element =>
      isEnabled
        ? getGestureHost(element.ownerDocument).attach(element, recognizer, {
            manageStyle,
          })
        : null,
    [recognizer, manageStyle, isEnabled],
  );

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
        // A touch that brakes a scroll the finger set moving presses nothing
        // (GestureHost.isScrollBraking), unless the caller decides.
        isBraking: touch => {
          const element = ref.current;
          return (
            optionsRef.current.isBraking?.(touch) ??
            (element != null &&
              getGestureHost(element.ownerDocument).isScrollBraking(element))
          );
        },
      }),
  );

  // Syncs the document's gesture host with the element behind `ref`: the
  // tracker is its press consumer, moved when the node is replaced, and a
  // press in progress ends with it.
  useNodeAttachment(
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

  // Syncs the host's listeners with the tracker's enabled state, which can
  // change with any render: the host listens only while an enabled control
  // is attached (spec:AST-094 FR24).
  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (element != null) {
      getGestureHost(element.ownerDocument).update(element);
    }
  });

  return tracker;
}

/**
 * Keeps `attach` applied to the element behind `ref`: checked after every
 * render, so a replaced node (a re-keyed or swapped element) is detached and
 * the new one attached, a removed one detached, and a change in `deps`
 * re-attaches (`architecture:react-component-runtime` INV6). Costs no render.
 * `attach` returns its detach, or null for nothing attached.
 */
function useNodeAttachment<T extends Element>(
  ref: RefObject<T | null>,
  attach: (element: T) => (() => void) | null,
  deps: ReadonlyArray<unknown>,
): void {
  const attachedRef = useRef<{
    element: T;
    deps: ReadonlyArray<unknown>;
    detach: (() => void) | null;
  } | null>(null);
  // Syncs the attachment with the DOM node the caller's ref holds after
  // this commit.
  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    const current = attachedRef.current;
    if (
      current != null &&
      current.element === element &&
      current.deps.length === deps.length &&
      current.deps.every((dep, index) => Object.is(dep, deps[index]))
    ) {
      return;
    }
    current?.detach?.();
    attachedRef.current =
      element == null ? null : {element, deps, detach: attach(element)};
  });
  // Detaches at unmount.
  useIsomorphicLayoutEffect(
    () => () => {
      attachedRef.current?.detach?.();
      attachedRef.current = null;
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
