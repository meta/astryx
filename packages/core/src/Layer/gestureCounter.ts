// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file gestureCounter.ts
 * @input Pointer and context-menu events through the shared input stream;
 *   keydown and click on the document
 * @output Exports the gesture identity, whether its click has run, whether a
 *   press is down, and the press claims (claimPress, claimContextMenuPress)
 * @position Internal to the package, not exported. useLayer reads it to tell
 *   a click that belongs to a dismissing press from a fresh one.
 *   useTouchTrigger, useMenuPress, ContextMenu and DropdownMenu read the
 *   gesture too. A layer or a menu that opens on a press claims that press
 *   here
 *
 * A browser light-dismiss and the trigger's own click come from ONE press, and
 * which of them React sees first is a race. Comparing timestamps against a
 * window guesses; counting gestures does not. The counter advances on every
 * new press or keystroke, so "the click from the gesture that dismissed the
 * layer" is exactly "the click while the counter still reads what it read at
 * the dismissal", no matter how long the main thread was blocked in between.
 */

import {subscribeInput} from '../utils/inputStream';
import {sharedState} from '../utils/sharedRealm';

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
 * when the layer closes, or when another control takes the pointer; a later
 * press dismisses as usual. A second claim of the same press for the same
 * layer does nothing.
 *
 * `releaseTarget` is the control the press began on, which the caller keeps
 * as the popover's invoker. It holds the pointer while the pointer is over
 * it, so its own pointerup and click still reach it. It still gets them when
 * it moves away under a pointer that stays still.
 *
 * `onRelease` runs at the release of a claim that is still held then.
 */
export function claimPress(
  layer: HTMLElement,
  {
    releaseTarget = null,
    onRelease,
  }: {releaseTarget?: HTMLElement | null; onRelease?: () => void} = {},
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
  // A control that takes the pointer during the press keeps it, for example
  // a row that a swipe moves. The claim then ends, and it neither takes the
  // pointer back nor cancels the tap.
  const yieldToTaker = (event: PointerEvent) => {
    if (
      event.pointerId === pointerId &&
      event.target !== layer &&
      event.target !== releaseTarget
    ) {
      stop();
    }
  };
  const endClaim = (event: PointerEvent) => {
    if (event.pointerId === pointerId) {
      stop();
      if (event.type === 'pointerup') {
        onRelease?.();
      }
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
    subscribeInput(view, 'gotpointercapture', yieldToTaker),
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
