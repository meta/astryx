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
import {useAttachment, useIsUnmountedRef} from './useAttachment';

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
  /**
   * The recognizer reads each event's pointer itself (`spec:AST-057`'s row
   * swipe), so it attaches even where the primary pointer is fine; see the
   * host's AttachOptions. @default false
   */
  perEventPointer?: boolean;
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
/**
 * How many hooks are syncing a recognizer's `isEnabled` right now. That sync
 * runs in an Effect, and the arena pass it starts can reach other
 * recognizers (one that required the disabled one to fail recognizes in it),
 * so while it runs no hook's listener calls its caller's callback
 * (react-component-runtime INV2). Their later transitions report from the
 * input events that cause them.
 */
let syncingDepth = 0;

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
  const {
    isEnabled = true,
    manageStyle = true,
    perEventPointer = false,
  } = options;
  const isUnmountedRef = useIsUnmountedRef();

  // The listener runs inside input events, never during a render or an
  // Effect, and goes quiet once the component unmounts.
  useEffect(
    () =>
      recognizer.addListener(current => {
        if (!isUnmountedRef.current && syncingDepth === 0) {
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
        perEventPointer,
      }),
    `${manageStyle}:${perEventPointer}`,
  );

  useIsomorphicLayoutEffect(() => {
    syncingDepth += 1;
    try {
      recognizer.setEnabled(isEnabled);
    } finally {
      syncingDepth -= 1;
    }
  }, [recognizer, isEnabled]);

  return recognizer;
}
