// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useActionGroupTracking.ts
 * @input A ref to a group of sibling actions, the actions' selector, and the
 *   component's tracking constants
 * @output Exports useActionGroupTracking and ActionGroupTrackingOptions
 * @position Internal hook, not exported from the hooks entry. A long press
 *   drives the shared action-group tracker (hooks/actionGroupTracker.ts) for
 *   a group that a held pointer slides across. AlertDialog consumes it.
 *
 * SYNC: When modified, update useActionGroupTracking.test.tsx
 */

import {useEffect, useRef, useState, type RefObject} from 'react';
import {isActive} from '../gestures/GestureRecognizer';
import {LongPressGestureRecognizer} from '../gestures/LongPressGestureRecognizer';
import {lockSelection} from '../utils/selectionLock';
import type {GestureTouch, PointerKind} from '../gestures/types';
import {useGestureRecognizer} from '../gestures/useGestureRecognizer';
import {UIKIT_PRESS} from '../motion/uikit/gestures';
import {isIosWebKit} from '../utils/touchQueries';
import {createActionGroupTracker} from './actionGroupTracker';
import {useIsomorphicLayoutEffect} from './useIsomorphicLayoutEffect';

export interface ActionGroupTrackingOptions {
  /** Selects the actions inside the tracked element. */
  itemSelector: string;
  /** How long after touch-down the touched action highlights, ms. */
  highlightOnsetMs: number;
  /**
   * How far outside an action a finger keeps it highlighted, px. A mouse or a
   * pen hit-tests the actions' exact rects.
   */
  highlightExpansion: number;
  /** Pointers that are tracked; others keep the browser's click. @default every pointer */
  pointerTypes?: ReadonlyArray<PointerKind>;
  /** A press whose target this rejects is not tracked. */
  shouldTrack?: (target: unknown) => boolean;
  /** Off, nothing is attached and nothing is tracked. @default true */
  isEnabled?: boolean;
  /**
   * Let the gesture host write the group's `touch-action` and refuse a text
   * selection while a finger or a pen holds it.
   * @default true
   */
  manageStyle?: boolean;
  /** Runs the action under the finger at the lift. @default its own click */
  onActivate?: (item: HTMLElement) => void;
}

const PRESS = UIKIT_PRESS;

/** The ref handed to the recognizer while tracking is off: no element. */
const DETACHED: RefObject<Element | null> = {current: null};

const EVERY_POINTER: ReadonlyArray<PointerKind> = ['touch', 'pen', 'mouse'];

/**
 * The group's press: a long press that a second finger on the group ends with
 * nothing acting. A plain long press ignores a second finger.
 */
class ActionGroupPress extends LongPressGestureRecognizer {
  protected override acceptsTouch(touch: GestureTouch): boolean {
    if (isActive(this.state)) {
      this.setState('cancelled');
      return false;
    }
    return super.acceptsTouch(touch);
  }
}

/**
 * Track a held pointer on the group behind `ref` across the actions inside
 * it, through the shared action-group tracker.
 */
export function useActionGroupTracking(
  ref: RefObject<HTMLElement | null>,
  options: ActionGroupTrackingOptions,
): ActionGroupPress {
  const optionsRef = useRef(options);
  // Keeps the recognizer's delegate and the tracker, which run outside
  // render, reading the latest options.
  useIsomorphicLayoutEffect(() => {
    optionsRef.current = options;
  });
  // The pointer that started the current press. Only a finger gets the hit
  // expansion; a mouse or a pen hit-tests the actions' exact rects.
  const pointerRef = useRef<PointerKind>('touch');
  const landedRef = useRef<Node | null>(null);
  const [tracker] = useState(() =>
    createActionGroupTracker(() => ({
      roots: () => [ref.current],
      itemSelector: optionsRef.current.itemSelector,
      highlightExpansion:
        pointerRef.current === 'touch'
          ? optionsRef.current.highlightExpansion
          : 0,
      onActivate: optionsRef.current.onActivate,
      // The browser's own click for a press the group ran is taken, so the
      // action runs once. The gesture host swallows it for a press it claims.
      // This covers one it does not claim, a mouse under a coarse pointer.
      swallowsNativeClick: true,
    })),
  );
  const isEnabled = options.isEnabled ?? true;
  // Synchronizes the tracker with tracking on and mounted. Turning tracking
  // off, or unmounting, drops a tracked press and ends its release fades.
  // The host reports no cancellation to a disabled recognizer, and the lift
  // that runs an action often closes the owner before its fade ends.
  useEffect(
    () => () => {
      tracker.cancel();
      tracker.dispose();
    },
    [tracker, isEnabled],
  );

  return useGestureRecognizer(
    isEnabled ? ref : DETACHED,
    () =>
      new ActionGroupPress({
        name: 'ActionGroupTracking',
        minimumPressDuration: options.highlightOnsetMs,
        allowableMovement: Number.POSITIVE_INFINITY,
        allowedPointerTypes: options.pointerTypes ?? EVERY_POINTER,
        delaysTouchesBegan: true,
        // The hold picks an action, so a held finger or pen starts no text
        // selection and opens no callout while down. A long press brings this
        // lock by default; this hold has no minimum duration, so it names it.
        selectionLock: lockSelection,
        shouldReceiveTouch: (recognizer, touch) => {
          if (recognizer.numberOfTouches === 0) {
            pointerRef.current = touch.pointerType;
            const target = touch.target as Node | null;
            landedRef.current =
              typeof target?.nodeType === 'number' ? target : null;
          }
          return receiveTouch(recognizer, touch, optionsRef.current);
        },
      }),
    recognizer => {
      switch (recognizer.state) {
        case 'began': {
          const {x, y} = recognizer.location();
          tracker.begin(x, y, {landed: landedRef.current});
          break;
        }
        case 'changed': {
          const {x, y} = recognizer.location();
          tracker.move(x, y);
          break;
        }
        case 'ended': {
          const doc = ref.current?.ownerDocument;
          const focusedBefore = doc?.activeElement ?? null;
          const beganOn = tracker.beganOn;
          // Whether a click on the lifted action would focus it. A mouse's or
          // a pen's pointerdown already gave the engine's answer, on the action
          // it began on. A tap focuses on a later mousedown, which the claimed
          // touch cancels, so the platform answers for a finger.
          // iOS WebKit focuses no tapped button; Chromium and Firefox do.
          const clickFocuses =
            pointerRef.current === 'touch'
              ? !isIosWebKit(doc?.defaultView)
              : beganOn != null && focusedBefore === beganOn;
          const lifted = tracker.end();
          // The lift runs the action's own click(), which moves no focus. So
          // focus moves to the lifted action, unless its click moved focus.
          if (
            clickFocuses &&
            lifted != null &&
            lifted.isConnected &&
            doc?.activeElement === focusedBefore &&
            focusedBefore !== lifted
          ) {
            lifted.focus({preventScroll: true, focusVisible: false});
          }
          break;
        }
        case 'cancelled':
          tracker.cancel();
          break;
        case 'possible':
        case 'failed':
          // Listeners are not called for these.
          break;
      }
    },
    {
      isEnabled,
      manageStyle: options.manageStyle ?? true,
      actionGroup: true,
    },
  );
}

/**
 * The recognizer's should-receive delegate. It also picks the press's clock.
 * Inside a scroller the press waits the content-touch delay and fails past
 * the slop, so the scroller takes a flick. Elsewhere it begins at once, with
 * no movement limit.
 */
function receiveTouch(
  recognizer: LongPressGestureRecognizer,
  touch: GestureTouch,
  options: ActionGroupTrackingOptions,
): boolean {
  if (options.shouldTrack?.(touch.target) === false) {
    return false;
  }
  if (recognizer.numberOfTouches === 0) {
    const isInsideScroller = touch.scroll?.isInsideScroller === true;
    recognizer.minimumPressDuration = isInsideScroller
      ? PRESS.contentTouchDelay.value
      : options.highlightOnsetMs;
    recognizer.allowableMovement = isInsideScroller
      ? PRESS.slop.value
      : Number.POSITIVE_INFINITY;
  }
  return true;
}
