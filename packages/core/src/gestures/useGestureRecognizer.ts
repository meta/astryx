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
import {
  createPressTracker,
  vetoesSingleTap,
  type PressTracker,
  type PressTrackerOptions,
} from './PressTracker';

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
 * How many Effects are driving the gesture system right now (an `isEnabled`
 * sync, a detach, a press tracker's release or host update). While one runs
 * no hook calls its caller back (react-component-runtime INV2, INV3): the
 * recognizer it stops is cancelled silently, and what that stop unblocks (a
 * recognizer that required it to fail) resolves in the arena's next pass, a
 * microtask later, where its listener reports as usual
 * (`deferringResolution`).
 */
let effectDepth = 0;

/** Runs `drive` as an Effect's work on the gesture system (see effectDepth). */
function driveFromEffect(drive: () => void): void {
  effectDepth += 1;
  try {
    drive();
  } finally {
    effectDepth -= 1;
  }
}

/**
 * Runs `body`, which stops `recognizer` from an Effect, with its arena leaving
 * what the stop unblocks to a pass a microtask later
 * (GestureArena.deferResolution): a recognizer that required the stopped one
 * to fail recognizes there, outside the Effect, and its listener reports as
 * usual. A recognizer that has met no touch has no arena, and nothing waits on
 * it.
 */
function deferringResolution(
  recognizer: GestureRecognizer,
  body: () => void,
): void {
  const arena = recognizer.arena;
  if (arena == null) {
    body();
    return;
  }
  arena.deferResolution(body);
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
        if (effectDepth === 0) {
          onGestureRef.current?.(current);
        }
      }),
    [recognizer],
  );

  // Syncs the recognizer's `isEnabled` (UIKit's). It runs first, so disabling
  // cancels a gesture in flight before its attachment goes, and that cancel,
  // with whatever it settles in the arena, reaches no caller callback.
  useIsomorphicLayoutEffect(() => {
    driveFromEffect(() =>
      deferringResolution(recognizer, () => recognizer.setEnabled(isEnabled)),
    );
  }, [recognizer, isEnabled]);

  // Syncs the document's gesture host with the element behind `ref`: attached
  // while enabled, re-attached when the node is replaced. A disabled gesture
  // is not attached at all: no listener and no `touch-action` of its own on
  // the element (spec:AST-094 FR24). Detaching (an unmount, a replaced node)
  // cancels a gesture in flight, and that cancel, run in an Effect, reaches
  // no caller callback (react-component-runtime INV2).
  useNodeAttachment(
    ref,
    element => {
      if (!isEnabled) {
        return null;
      }
      const detach = getGestureHost(element.ownerDocument).attach(
        element,
        recognizer,
        {manageStyle},
      );
      return () =>
        driveFromEffect(() => deferringResolution(recognizer, detach));
    },
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
  useIsomorphicLayoutEffect(() => {
    optionsRef.current = options;
  });
  const {trackingExpansion, highlightDelay, cancelTravel, quickTapFlash} =
    options;
  // The tracker reads these four when it is built: a change rebuilds it (the
  // attachment below moves to the new one and disposes the old), and the new
  // values apply from the next touch. The callbacks, the brake included, are
  // read through the ref on every touch.
  const tracker = useMemo(
    () =>
      createPressTracker({
        getBounds: () => ref.current?.getBoundingClientRect() ?? null,
        get view() {
          return ref.current;
        },
        onControlEvent: (event, touch) => {
          if (effectDepth === 0) {
            optionsRef.current.onControlEvent?.(event, touch);
          }
        },
        onHighlightChange: isHighlighted => {
          if (effectDepth === 0) {
            optionsRef.current.onHighlightChange?.(isHighlighted);
          }
        },
        trackingExpansion,
        highlightDelay,
        cancelTravel,
        quickTapFlash,
        // The caller's veto, read on every touch, else the tracker's own.
        vetoesAncestorRecognizer: recognizer =>
          (optionsRef.current.vetoesAncestorRecognizer ?? vetoesSingleTap)(
            recognizer,
          ),
        isEnabled: () => optionsRef.current.isEnabled?.() ?? true,
        // A finger that brakes a scroll it set moving presses nothing
        // (GestureHost.isScrollBraking), unless the caller decides; the tracker
        // asks only for a finger (spec:AST-094 FR11).
        isBraking: touch => {
          const element = ref.current;
          return (
            optionsRef.current.isBraking?.(touch) ??
            (element != null &&
              getGestureHost(element.ownerDocument).isScrollBraking(element))
          );
        },
      }),
    [ref, trackingExpansion, highlightDelay, cancelTravel, quickTapFlash],
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
      return () =>
        driveFromEffect(() => {
          detach();
          tracker.dispose();
        });
    },
    [tracker],
  );

  // Syncs the host's listeners with the tracker's enabled state, which can
  // change with any render: the host listens only while an enabled control
  // is attached (spec:AST-094 FR24).
  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (element != null) {
      driveFromEffect(() =>
        getGestureHost(element.ownerDocument).update(element),
      );
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
