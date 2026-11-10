// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file gestureCounter.ts
 * @input Pointer, touch and context-menu events through the shared input
 *   stream; keydown and click on the document
 * @output Exports the gesture identity, whether its click has run, whether a
 *   press is down, the press claims (claimPress, claimContextMenuPress) and
 *   the pan guard of an open auto layer (keepPansFromLightDismissing)
 * @position Internal to the package, not exported. useLayer reads it to tell
 *   a click that belongs to a dismissing press from a fresh one.
 *   useTouchTrigger, useMenuPress, ContextMenu and DropdownMenu read the
 *   gesture too. A layer or a menu that opens on a press claims that press
 *   here, and an open auto layer guards its light dismiss from pans here
 *
 * A browser light-dismiss and the trigger's own click come from ONE press, and
 * which of them React sees first is a race. Comparing timestamps against a
 * window guesses; counting gestures does not. The counter advances on every
 * new press or keystroke, so "the click from the gesture that dismissed the
 * layer" is exactly "the click while the counter still reads what it read at
 * the dismissal", no matter how long the main thread was blocked in between.
 */

import {UIKIT_PAN} from '../motion/uikit/gestures';
import {subscribeInput} from '../utils/inputStream';
import {sharedState, sharedWeakMap} from '../utils/sharedRealm';

const state = sharedState('layer/gesture-counter/state', 1, () => ({
  gesture: 0,
  clickedGesture: null as number | null,
  contextMenuGesture: null as number | null,
  pressPointerId: null as number | null,
  claimedPress: null as {
    layer: HTMLElement;
    pointerId: number;
    gesture: number;
  } | null,
  isListening: false,
  unsubscribePress: null as (() => void) | null,
}));

function advance() {
  state.gesture += 1;
}

// The page listens for a press's end and its context menu only while a press
// is down, so at rest it keeps no pointerup listener of its own.
function startPress(event: PointerEvent) {
  advance();
  state.pressPointerId = event.pointerId;
  const view = event.view ?? document.defaultView;
  if (state.unsubscribePress != null || view == null) {
    return;
  }
  const unsubscribes = [
    subscribeInput(view, 'pointerup', endPress, {first: true}),
    subscribeInput(view, 'pointercancel', endPress, {first: true}),
    subscribeInput(view, 'contextmenu', markContextMenu, {first: true}),
  ];
  state.unsubscribePress = () => {
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
  };
}

function endPress() {
  state.pressPointerId = null;
  state.unsubscribePress?.();
  state.unsubscribePress = null;
}

function markContextMenu() {
  state.contextMenuGesture = state.gesture;
}

function markClicked() {
  state.clickedGesture = state.gesture;
}

function listen() {
  if (state.isListening || typeof document === 'undefined') {
    return;
  }
  state.isListening = true;
  // Capture phase: the count must advance before any handler reads it.
  const view = document.defaultView;
  if (view != null) {
    subscribeInput(view, 'pointerdown', startPress, {first: true});
  }
  document.addEventListener('keydown', advance, true);
  // Capture phase observes the click even when a consumer stops propagation.
  document.addEventListener('click', markClicked, true);
}

/**
 * Identifies the user gesture in flight. Two reads returning the same value
 * happened within one press (or one keystroke).
 */
export function currentGesture(): number {
  listen();
  return state.gesture;
}

/** Whether the click belonging to the current gesture already bubbled. */
export function currentGestureHasClicked(): boolean {
  listen();
  return state.clickedGesture === state.gesture;
}

/** Whether a press is down, its release not yet seen by the page. */
export function isPressInFlight(): boolean {
  listen();
  return state.pressPointerId !== null;
}

/**
 * Keeps the release of the press in flight from dismissing `layer`. The
 * browser's light dismiss reads a release outside every open popover as a
 * dismissal, also the release of the press that opened the popover. While the
 * pointer is outside the layer, the layer captures it, so a release there
 * lands on the layer. Over the layer the capture lets go, so hover works and a
 * release there is inside anyway. The claim ends at that press's release, or
 * when the layer closes; a later press dismisses as usual. A second claim of
 * the same press for the same layer does nothing.
 *
 * `releaseTarget` is the control the press began on, which the caller keeps
 * as the popover's invoker. It holds the pointer while the pointer is over
 * it, so its own pointerup and click still reach it. It still gets them when
 * it moves away under a pointer that stays still.
 */
export function claimPress(
  layer: HTMLElement,
  {releaseTarget = null}: {releaseTarget?: HTMLElement | null} = {},
): void {
  listen();
  const pointerId = state.pressPointerId;
  const view = layer.ownerDocument.defaultView;
  if (pointerId === null || view == null) {
    return;
  }
  if (
    state.claimedPress !== null &&
    state.claimedPress.layer === layer &&
    state.claimedPress.pointerId === pointerId &&
    state.claimedPress.gesture === state.gesture
  ) {
    return;
  }
  const claim = {layer, pointerId, gesture: state.gesture};
  state.claimedPress = claim;
  // Gives the pointer to `holder`, or lets it go when `holder` is null.
  const holdCapture = (holder: HTMLElement | null) => {
    try {
      if (holder !== null) {
        holder.setPointerCapture(pointerId);
        return;
      }
      for (const element of [layer, releaseTarget]) {
        if (element?.hasPointerCapture(pointerId) === true) {
          element.releasePointerCapture(pointerId);
        }
      }
    } catch {
      // The pointer is no longer active (its release did not reach the
      // page), so no release can dismiss the layer.
    }
  };
  // The press began on the release target, so the pointer is over it now.
  holdCapture(releaseTarget ?? layer);
  // A move of the pointer reads no layout. The claim reads the layer's box,
  // and the box of each popover open in it (a sub-menu), once. It reads them
  // again only after a scroll, a resize or a toggle in the layer.
  let boxes: DOMRect[] | null = null;
  const readBoxes = (): DOMRect[] => {
    let nested: HTMLElement[] = [];
    try {
      nested = [...layer.querySelectorAll<HTMLElement>(':popover-open')];
    } catch {
      // An engine without `:popover-open` has no nested popover to read.
    }
    return [layer, ...nested].map(el => el.getBoundingClientRect());
  };
  const isOverLayer = (x: number, y: number): boolean => {
    boxes ??= readBoxes();
    return boxes.some(
      box => x >= box.left && x < box.right && y >= box.top && y < box.bottom,
    );
  };
  let targetBox: DOMRect | null = null;
  const isOverTarget = (x: number, y: number): boolean => {
    targetBox ??= releaseTarget?.getBoundingClientRect() ?? null;
    if (targetBox === null) {
      return false;
    }
    return (
      x >= targetBox.left &&
      x < targetBox.right &&
      y >= targetBox.top &&
      y < targetBox.bottom
    );
  };
  const invalidate = () => {
    boxes = null;
    targetBox = null;
  };
  const followPointer = (event: PointerEvent) => {
    if (event.pointerId === pointerId) {
      const {clientX: x, clientY: y} = event;
      if (isOverLayer(x, y)) {
        holdCapture(null);
      } else if (releaseTarget !== null && isOverTarget(x, y)) {
        holdCapture(releaseTarget);
      } else {
        holdCapture(layer);
      }
    }
  };
  const unsubscribes: (() => void)[] = [];
  const stop = () => {
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
    unsubscribes.length = 0;
    if (state.claimedPress === claim) {
      state.claimedPress = null;
    }
  };
  const endClaim = (event: PointerEvent) => {
    if (event.pointerId === pointerId) {
      stop();
    }
  };
  // A layer that closes while the button is still down lets the pointer go,
  // so the page under it hovers again.
  const onToggle = (event: Event) => {
    if (
      event.target === layer &&
      (event as Event & {newState?: string}).newState === 'closed'
    ) {
      holdCapture(null);
      stop();
      return;
    }
    invalidate();
  };
  layer.addEventListener('toggle', onToggle, true);
  unsubscribes.push(
    subscribeInput(view, 'pointermove', followPointer),
    subscribeInput(view, 'pointerup', endClaim),
    subscribeInput(view, 'pointercancel', endClaim),
    subscribeInput(view, 'scroll', invalidate),
    subscribeInput(view, 'resize', invalidate),
    () => layer.removeEventListener('toggle', onToggle, true),
  );
}

/**
 * Claims the press in flight for `layer` (`claimPress`) when that press opened
 * a context menu (a right click).
 */
export function claimContextMenuPress(layer: HTMLElement): void {
  listen();
  if (state.contextMenuGesture === state.gesture) {
    claimPress(layer);
  }
}

/** The touch that a pan guard follows, from its start to its lift. */
interface FollowedTouch {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly startedOutside: boolean;
  hasPanned: boolean;
}

interface PanGuard {
  /** Each guarded layer, with the function that stops its guard. */
  readonly layers: Map<HTMLElement, () => void>;
  touch: FollowedTouch | null;
  readonly unsubscribe: () => void;
}

const panGuards = sharedWeakMap<Window, PanGuard>(
  'layer/gesture-counter/pan-guards',
  1,
);

function isShownLayer(layer: HTMLElement): boolean {
  if (!layer.isConnected) {
    return false;
  }
  try {
    return layer.matches(':popover-open');
  } catch {
    // An engine without `:popover-open` has no light dismiss to guard.
    return true;
  }
}

function findTouch(touches: TouchList, id: number): Touch | null {
  for (const touch of Array.from(touches)) {
    if (touch.identifier === id) {
      return touch;
    }
  }
  return null;
}

function hasTravelledToPan(start: FollowedTouch, point: Touch): boolean {
  return (
    Math.max(
      Math.abs(point.clientX - start.x),
      Math.abs(point.clientY - start.y),
    ) >= UIKIT_PAN.hysteresis.value
  );
}

function createPanGuard(view: Window): PanGuard {
  const followStart = (event: TouchEvent) => {
    for (const [layer, stopGuard] of guard.layers) {
      if (!isShownLayer(layer)) {
        stopGuard();
      }
    }
    if (panGuards.get(view) !== guard || event.touches.length !== 1) {
      guard.touch = null;
      return;
    }
    const point = event.changedTouches[0];
    const path = event.composedPath();
    guard.touch = {
      id: point.identifier,
      x: point.clientX,
      y: point.clientY,
      startedOutside: [...guard.layers.keys()].some(
        layer => !path.includes(layer),
      ),
      hasPanned: false,
    };
  };
  const followMove = (event: TouchEvent) => {
    const touch = guard.touch;
    if (touch === null || touch.hasPanned) {
      return;
    }
    const point = findTouch(event.changedTouches, touch.id);
    if (point !== null && hasTravelledToPan(touch, point)) {
      touch.hasPanned = true;
    }
  };
  // A browser can read a finger that pans as a tap, for example when its
  // main thread is late. The tap then light-dismisses every auto popover,
  // and the page sees no pointercancel. A cancelled lift makes no tap, so
  // no click and no light dismiss. A lift that ends a scroll is not
  // cancelable, and a cancelled lift does not stop a fling.
  const judgeLift = (event: TouchEvent) => {
    const touch = guard.touch;
    const point = touch && findTouch(event.changedTouches, touch.id);
    if (touch == null || point == null) {
      return;
    }
    guard.touch = null;
    if (
      touch.startedOutside &&
      event.cancelable &&
      (touch.hasPanned || hasTravelledToPan(touch, point))
    ) {
      event.preventDefault();
    }
  };
  const forget = () => {
    guard.touch = null;
  };
  const unsubscribes = [
    subscribeInput(view, 'touchstart', followStart),
    subscribeInput(view, 'touchmove', followMove),
    subscribeInput(view, 'touchend', judgeLift, {cancels: true}),
    subscribeInput(view, 'touchcancel', forget),
  ];
  const guard: PanGuard = {
    layers: new Map(),
    touch: null,
    unsubscribe: () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    },
  };
  return guard;
}

/**
 * Keeps a touch that pans from light-dismissing `layer`, an auto popover
 * that is open. A pan is not an outside press: only a touch that lifts
 * within the pan distance of its start dismisses the layer. The guard
 * listens to touches only while a guarded layer is open, and it ends when
 * the layer closes. A second guard of an open layer does nothing.
 */
export function keepPansFromLightDismissing(layer: HTMLElement): void {
  const view = layer.ownerDocument.defaultView;
  if (view == null) {
    return;
  }
  let guard = panGuards.get(view);
  if (guard?.layers.has(layer) === true) {
    return;
  }
  if (guard === undefined) {
    guard = createPanGuard(view);
    panGuards.set(view, guard);
  }
  const ownGuard = guard;
  const stopGuard = () => {
    layer.removeEventListener('toggle', stopOnClose);
    ownGuard.layers.delete(layer);
    if (ownGuard.layers.size === 0) {
      ownGuard.unsubscribe();
      if (panGuards.get(view) === ownGuard) {
        panGuards.delete(view);
      }
    }
  };
  const stopOnClose = (event: Event) => {
    if ((event as Event & {newState?: string}).newState === 'closed') {
      stopGuard();
    }
  };
  layer.addEventListener('toggle', stopOnClose);
  guard.layers.set(layer, stopGuard);
}
