// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useGestureRecognizer.ts
 * @input An element ref, a recognizer factory and a gesture listener
 * @output Exports useGestureRecognizer (usePressTracker lives in
 *   usePressTracker.ts, so a gesture-only component never imports the press
 *   tracker)
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

import {useEffect, useRef, useState, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {getGestureHost} from './GestureHost';
import type {GestureRecognizer} from './GestureRecognizer';
import {
  isSyncingGestures,
  syncingGestures,
  useAttachment,
  useIsUnmountedRef,
} from './useAttachment';
import {internals} from './recognizerInternals';

export interface UseGestureRecognizerOptions {
  /**
   * Live toggle; turning it off mid-gesture cancels the gesture. That cancel
   * does not call `onGesture`: it comes from the render that turned the
   * recognizer off, and the code that turned it off already knows. A
   * recognizer that required this one to fail resolves just after that
   * render and reports as usual.
   * @default true
   */
  isEnabled?: boolean;
  /** Let the host set touch-action (and long-press callout) styles. @default true */
  manageStyle?: boolean;
  /**
   * Accepted and ignored: every attachment reads each event's pointer
   * (`spec:AST-094` FR43). Kept so callers written before FR43 compile.
   * @deprecated
   */
  perEventPointer?: boolean;
  /**
   * The element is an action group, sibling actions a held pointer slides
   * across (`family:action-groups` FR5): the host serves it where the
   * primary pointer is fine too (`AttachOptions.actionGroup`).
   * @default false
   */
  actionGroup?: boolean;
}

/**
 * Runs `body` with the recognizer's arena leaving what it unblocks to the
 * next pass, outside the Effect (GestureArena.deferResolution). A recognizer
 * that has met no touch has no arena, and nothing waits on it.
 */
function deferringResolution(
  recognizer: GestureRecognizer,
  body: () => void,
): void {
  const {arena} = internals(recognizer);
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
  // Syncs the listener's ref with the caller's newest callback.
  useIsomorphicLayoutEffect(() => {
    onGestureRef.current = onGesture;
  });
  const {
    isEnabled = true,
    manageStyle = true,
    perEventPointer = false,
    actionGroup = false,
  } = options;
  const isUnmountedRef = useIsUnmountedRef();

  // Syncs the recognizer's target-action listener with this component. The
  // listener runs inside input events, never during a render or an Effect,
  // and goes quiet once the component unmounts.
  useEffect(
    () =>
      recognizer.addListener(current => {
        if (!isUnmountedRef.current && !isSyncingGestures()) {
          onGestureRef.current?.(current);
        }
      }),
    [recognizer, isUnmountedRef],
  );

  // Syncs the recognizer's `isEnabled` with the option. It runs first,
  // under the guard, so disabling cancels a gesture in flight before its
  // attachment goes.
  useIsomorphicLayoutEffect(() => {
    syncingGestures(() => {
      deferringResolution(recognizer, () => {
        recognizer.setEnabled(isEnabled);
      });
    });
  }, [recognizer, isEnabled]);

  // Syncs the document's gesture host with the element behind `ref`. A
  // disabled gesture is not attached at all: no listener and no
  // `touch-action` of its own on the element (spec:AST-094 FR24). A replaced
  // node is released and the new one attached; detaching cancels a gesture in
  // progress from a layout effect, and that cancel reaches no caller callback
  // (react-component-runtime INV2, INV3).
  useAttachment(
    ref,
    element => {
      if (!isEnabled) {
        return () => {};
      }
      const detach = getGestureHost(element.ownerDocument).attach(
        element,
        recognizer,
        {manageStyle, perEventPointer, actionGroup},
      );
      return () => {
        syncingGestures(() => deferringResolution(recognizer, detach));
      };
    },
    `${manageStyle}:${perEventPointer}:${isEnabled}:${actionGroup}`,
  );

  return recognizer;
}
