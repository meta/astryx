// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useActionGroupTracking.ts
 * @input A ref to a group of sibling actions, the actions' selector, and the
 *   component's tracking constants
 * @output Exports useActionGroupTracking, ActionGroupTrackingOptions,
 *   resolveNearestAction, the finger resolution of a group whose targets grow,
 *   and measureNeighbours, the members that resolution must not reach into
 * @position Internal hook, not exported from the hooks entry. A long press
 *   drives the shared action-group tracker (hooks/actionGroupTracker.ts) for
 *   a group that a held pointer slides across. AlertDialog and
 *   useGroupPressTracking consume it, and Lab components through the internal
 *   touch entry.
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
import {INTERACTIVE_SELECTOR, resolveHitTarget} from '../utils/hitArea';
import {isIosWebKit} from '../utils/touchQueries';
import {
  createActionGroupTracker,
  DISABLED_SELECTOR,
  type ActionGroupTarget,
} from './actionGroupTracker';
import {useIsomorphicLayoutEffect} from './useIsomorphicLayoutEffect';

export interface ActionGroupTrackingOptions {
  /** Selects the actions inside the tracked element. */
  itemSelector: string;
  /** Keeps only the actions this accepts among those `itemSelector` selects. */
  isItem?: (element: HTMLElement) => boolean;
  /** How long after touch-down the touched action highlights, ms. */
  highlightOnsetMs: number;
  /**
   * How far outside an action a finger keeps it highlighted, px. A mouse or a
   * pen hit-tests the actions' exact rects.
   */
  highlightExpansion: number;
  /**
   * Picks the action under a finger, in place of the flat expansion. It gets
   * the actions measured when the press begins, and their neighbours: the
   * disabled actions and the members the group does not track. A mouse or a
   * pen hit-tests the exact rects.
   */
  resolveTarget?: (
    x: number,
    y: number,
    targets: ReadonlyArray<ActionGroupTarget>,
    neighbours: ReadonlyArray<ActionGroupTarget>,
  ) => HTMLElement | null;
  /** Pointers that are tracked; others keep the browser's click. @default every pointer */
  pointerTypes?: ReadonlyArray<PointerKind>;
  /** A press this rejects is not tracked, and its click stays the browser's. */
  shouldTrack?: (touch: GestureTouch) => boolean;
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
  /**
   * Paint the tracked action with the press attribute. Off, the group draws
   * its own highlight. @default true
   */
  paintsHighlight?: boolean;
  /** A press began at viewport (x, y) on `action` (null: none). */
  onPressBegin?: (x: number, y: number, action: HTMLElement | null) => void;
  /** The press moved to viewport (x, y), now on `action` (null: none). */
  onPressMove?: (x: number, y: number, action: HTMLElement | null) => void;
  /** The lift, before its action runs, with the tracked action (null: none). */
  onPressEnd?: (action: HTMLElement | null) => void;
  /**
   * The press ended with nothing acting: a cancel, a second finger, or
   * tracking turned off.
   */
  onPressCancel?: () => void;
}

const PRESS = UIKIT_PRESS;

const NO_TARGETS: ReadonlyArray<ActionGroupTarget> = [];

/**
 * The action under a finger: the nearest enabled action whose target, grown
 * toward 44 px, holds the point. A neighbour counts for nearness but
 * resolves to none. So nothing highlights over a disabled action, and no
 * grown target reaches into another member.
 */
export function resolveNearestAction(
  x: number,
  y: number,
  targets: ReadonlyArray<ActionGroupTarget>,
  neighbours: ReadonlyArray<ActionGroupTarget>,
): HTMLElement | null {
  const index = resolveHitTarget(
    x,
    y,
    neighbours.length === 0 ? targets : [...targets, ...neighbours],
  );
  return index >= 0 && index < targets.length ? targets[index].element : null;
}

/**
 * The members inside `root` that a finger must not reach through, with their
 * boxes: the disabled actions and every member the group does not track.
 */
export function measureNeighbours(
  root: HTMLElement | null,
  {
    itemSelector,
    isItem,
  }: Pick<ActionGroupTrackingOptions, 'itemSelector' | 'isItem'>,
): ReadonlyArray<ActionGroupTarget> {
  if (root == null) {
    return NO_TARGETS;
  }
  const isTracked = (element: HTMLElement) =>
    element.matches(itemSelector) && isItem?.(element) !== false;
  const neighbours: ActionGroupTarget[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(
    `${itemSelector}, ${INTERACTIVE_SELECTOR}`,
  )) {
    // A tracked action is a neighbour only when it is disabled. An untracked
    // member inside a tracked action is part of that action.
    const host = element.parentElement?.closest<HTMLElement>(itemSelector);
    const isNeighbour = isTracked(element)
      ? element.matches(DISABLED_SELECTOR)
      : host == null || !root.contains(host) || !isTracked(host);
    if (isNeighbour) {
      const {left, top, right, bottom} = element.getBoundingClientRect();
      neighbours.push({element, left, top, right, bottom});
    }
  }
  return neighbours;
}

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
  // A finger press's neighbours, read once when it begins, for the caller's
  // `resolveTarget`. Nothing is read per move.
  const neighboursRef = useRef(NO_TARGETS);
  const [tracker] = useState(() =>
    createActionGroupTracker(() => ({
      roots: () => [ref.current],
      itemSelector: optionsRef.current.itemSelector,
      isItem: optionsRef.current.isItem,
      highlightExpansion:
        pointerRef.current === 'touch'
          ? optionsRef.current.highlightExpansion
          : 0,
      ...fingerResolver(
        pointerRef.current,
        optionsRef.current.resolveTarget,
        neighboursRef.current,
      ),
      paintsHighlight: optionsRef.current.paintsHighlight,
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
  // that runs an action often closes the owner before its fade ends. The
  // group hears the dropped press as a cancel, so its own highlight goes out.
  useEffect(
    () => () => {
      const wasTracking = tracker.isTracking;
      tracker.cancel();
      tracker.dispose();
      if (wasTracking) {
        optionsRef.current.onPressCancel?.();
      }
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
          neighboursRef.current =
            pointerRef.current === 'touch' &&
            optionsRef.current.resolveTarget != null
              ? measureNeighbours(ref.current, optionsRef.current)
              : NO_TARGETS;
          tracker.begin(x, y, {landed: landedRef.current});
          optionsRef.current.onPressBegin?.(x, y, tracker.highlighted);
          break;
        }
        case 'changed': {
          const {x, y} = recognizer.location();
          tracker.move(x, y);
          optionsRef.current.onPressMove?.(x, y, tracker.highlighted);
          break;
        }
        case 'ended': {
          optionsRef.current.onPressEnd?.(tracker.highlighted);
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
          // The lifted action takes focus first, as a native press gives it
          // before the click. Then its click runs, so a click that moves focus
          // or selects text keeps its result.
          const toLift = tracker.highlighted;
          if (
            clickFocuses &&
            toLift != null &&
            toLift.isConnected &&
            !toLift.matches(DISABLED_SELECTOR) &&
            focusedBefore !== toLift
          ) {
            toLift.focus({preventScroll: true, focusVisible: false});
          }
          tracker.end();
          neighboursRef.current = NO_TARGETS;
          break;
        }
        case 'cancelled':
          neighboursRef.current = NO_TARGETS;
          tracker.cancel();
          optionsRef.current.onPressCancel?.();
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
 * A finger's resolver: the caller's `resolveTarget` with the press's
 * neighbours. Without one, and for a mouse or a pen, the tracker's own hit
 * test applies.
 */
function fingerResolver(
  pointer: PointerKind,
  resolve: ActionGroupTrackingOptions['resolveTarget'],
  neighbours: ReadonlyArray<ActionGroupTarget>,
): {
  resolveTarget?: (
    x: number,
    y: number,
    targets: ReadonlyArray<ActionGroupTarget>,
  ) => HTMLElement | null;
} {
  if (pointer !== 'touch' || resolve == null) {
    return {};
  }
  return {resolveTarget: (x, y, targets) => resolve(x, y, targets, neighbours)};
}

/**
 * The recognizer's should-receive delegate. It declines a press the caller
 * rejects. It also picks the press's clock. Inside a scroller a finger's or a
 * pen's press waits the content-touch delay and fails past the slop. So the
 * scroller takes a flick, and an iPad's Pencil scrolls a page too. A mouse, or
 * a press elsewhere, begins at once, with no movement limit.
 */
function receiveTouch(
  recognizer: LongPressGestureRecognizer,
  touch: GestureTouch,
  options: ActionGroupTrackingOptions,
): boolean {
  if (options.shouldTrack?.(touch) === false) {
    return false;
  }
  if (recognizer.numberOfTouches === 0) {
    const isInsideScroller =
      touch.pointerType !== 'mouse' && touch.scroll?.isInsideScroller === true;
    recognizer.minimumPressDuration = isInsideScroller
      ? PRESS.contentTouchDelay.value
      : options.highlightOnsetMs;
    recognizer.allowableMovement = isInsideScroller
      ? PRESS.slop.value
      : Number.POSITIVE_INFINITY;
  }
  return true;
}
