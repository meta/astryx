// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressGesture.ts
 * @input A press gesture's current phase and one pointer, key or timer event
 * @output Exports the press state machine (pressGestureStep, idlePressGesture),
 *   its clocks (PRESS_ONSET_MS, PRESS_SLOP_PX, PRESS_FLASH_MS, PRESS_FADE_MS,
 *   PRESS_SCROLL_BRAKE_MS) and their types
 * @position Pure half of the touch press model; driven by pressFeedback.ts,
 *   tested by pressGesture.test.ts without a browser
 *
 * WHAT A FINGER MEANS, AS A STATE MACHINE.
 *
 * A native (UIKit) list delays a press by 0.15 s, cancels it the instant a
 * scroll claims the gesture, never brings it back inside that gesture, and
 * fades it only on release. CSS `:active` on iOS Safari does none of those
 * things: measured on iOS 26.2, it paints within 14 ms of the touch and was
 * still painted 1.6 s into a scroll. So on a coarse pointer the pressed state
 * is owned here, in JavaScript, and `:active` keeps only the mouse.
 *
 * The stylesheet drops `:active` by the PRIMARY pointer, so a mouse, trackpad
 * or Space key on such a device has lost `:active` too. Their presses come
 * here as `buttonDown`: painted at once, held through any travel, faded on
 * release like a finger's.
 *
 * Every constant below was measured against the real Settings and Contacts
 * apps on an iPhone simulator, driven with real HID touches at 60 fps, before
 * it was written down. The machine is deliberately ignorant of the DOM: it
 * takes what happened and answers with what should be painted, so
 * {@link pressGestureStep}'s table of cases IS the state diagram, one arm per
 * requirement.
 *
 * SYNC: When modified, update pressFeedback.ts (the controller) and
 * pressGesture.test.ts.
 */

import {pressConsts} from './interactionOverlay.stylex';

/**
 * How long a finger must stay put before the surface believes it.
 *
 * UIKit's own number: `UIScrollView.delaysContentTouches` holds a content
 * touch for 0.15 s. Measured rather than taken on faith: a 1.5 s hold on a
 * Settings row painted the native highlight for 1.34 s, a 1.2 s hold for
 * 1.24 s. It is the whole reason a flick paints nothing: the scroller claims
 * a fling about 30 ms in, which is inside this window.
 */
export const PRESS_ONSET_MS = 150;

/**
 * How far a finger may travel and still be a press, in CSS pixels.
 *
 * iOS Safari's own scroller claims the gesture at about this distance (the
 * measured slow drag got its `pointercancel` after ~12 px of travel).
 * Cancelling on the distance as well as on the claim keeps the two in step
 * when the scroller is slower to decide: a list already at its end, a
 * horizontal drag on a vertical scroller.
 */
export const PRESS_SLOP_PX = 10;

/**
 * How long a too-quick tap holds the paint at full strength before fading.
 *
 * A UIKit scroll view forwards the delayed touch and the release together
 * when the finger lifts early, so the cell highlights AT THE LIFT and the
 * paint is still there while the next screen slides over it. Without this
 * the most common interaction there is would answer with nothing at all.
 */
export const PRESS_FLASH_MS = 100;

/**
 * How long the paint takes to leave after a release: UIKit's deselect
 * crossfade. The one number, shared with the stylesheet: the release
 * animation in interactionOverlay.stylex.ts runs on the same constant, so the
 * timer that removes the attribute and the fade cannot drift apart.
 */
export const PRESS_FADE_MS: number = pressConsts.releaseMs;

/**
 * How recently a scroller must have moved for a touch on it to be a BRAKE
 * rather than a press.
 *
 * Measured: a touch landing on a list that was still decelerating stopped it
 * and highlighted nothing. On the web that touch ends the momentum, so no
 * further scroll event arrives to cancel the press, and without this the
 * paint would arrive 150 ms after a finger that was only stopping the list.
 */
export const PRESS_SCROLL_BRAKE_MS = 150;

/** What the surface should be painting. `fading` is the release's exit. */
export type PressPaint = 'none' | 'on' | 'fading';

/**
 * Where a gesture is.
 *
 * `dead` is the load-bearing one: a gesture that became a scroll stays dead
 * until the finger lifts and a new one starts, so a finger that stops moving,
 * or comes back to the control it started on, paints nothing. That is the
 * difference between this and `:active`.
 *
 * `buttonHeld` is a press made with a mouse button or the Space key. No
 * scroller can claim one, so it paints at once, travel does not end it, and
 * only the release does.
 */
export type PressPhase =
  'idle' | 'armed' | 'pressed' | 'buttonHeld' | 'flash' | 'fading' | 'dead';

export interface PressGesture {
  readonly phase: PressPhase;
  /** Where the finger landed, in client coordinates. */
  readonly originX: number;
  readonly originY: number;
}

export type PressEvent =
  | {kind: 'down'; x: number; y: number}
  /**
   * A mouse button or the Space key went down on the surface. The
   * controller sends this only where the stylesheet has dropped `:active`
   * (a coarse primary pointer), which would otherwise paint it.
   */
  | {kind: 'buttonDown'}
  /** A touch point moved. Coordinates are client-space, like the origin. */
  | {kind: 'move'; x: number; y: number}
  | {kind: 'up'}
  /** The platform took the gesture away: `pointercancel`, `touchcancel`, a scroll, a drag. */
  | {kind: 'cancel'}
  /** {@link PRESS_ONSET_MS} elapsed with the finger still down. */
  | {kind: 'onset'}
  /** {@link PRESS_FLASH_MS} elapsed on a too-quick tap. */
  | {kind: 'flashEnd'}
  /** {@link PRESS_FADE_MS} elapsed; the paint is gone. */
  | {kind: 'fadeEnd'};

export interface PressStep {
  readonly gesture: PressGesture;
  readonly paint: PressPaint;
  /**
   * The timer this step wants armed.
   *
   * `null` means "arm nothing NEW", which is not the same as "cancel what is
   * running": a step that returns `null` without changing phase is a
   * pass-through, and the phase it leaves running still owes its transition
   * (`armed` owes `onset`, `flash` owes `flashEnd`, `fading` owes `fadeEnd`).
   * The caller keeps a pending timer across such a step and drops it only
   * when the phase moves; `pressFeedback.ts` says what stranding one costs.
   */
  readonly timer: 'onset' | 'flash' | 'fade' | null;
}

const IDLE: PressGesture = {originX: 0, originY: 0, phase: 'idle'};

/** A finger that has gone this far is scrolling, not pressing. */
function travelled(gesture: PressGesture, x: number, y: number): boolean {
  return Math.hypot(x - gesture.originX, y - gesture.originY) > PRESS_SLOP_PX;
}

function step(
  gesture: PressGesture,
  phase: PressPhase,
  paint: PressPaint,
  timer: PressStep['timer'],
): PressStep {
  return {gesture: {...gesture, phase}, paint, timer};
}

/**
 * One event, one answer.
 *
 * The caller owns the DOM and the clock, and nothing here reads either, so a
 * test drives the whole contract by handing it events.
 */
export function pressGestureStep(
  gesture: PressGesture,
  event: PressEvent,
): PressStep {
  if (event.kind === 'down') {
    // A new touch always starts armed and painting nothing, whatever the last
    // gesture ended as. This is the only way out of `dead`.
    return {
      gesture: {originX: event.x, originY: event.y, phase: 'armed'},
      paint: 'none',
      timer: 'onset',
    };
  }
  if (event.kind === 'buttonDown') {
    // Nothing can turn a mouse button or a key into a scroll, so there is
    // nothing to wait for: paint now, as `:active` does on a desktop.
    return {
      gesture: {originX: 0, originY: 0, phase: 'buttonHeld'},
      paint: 'on',
      timer: null,
    };
  }

  switch (gesture.phase) {
    case 'armed':
      if (event.kind === 'move') {
        // Travel is a scroll. Nothing was painted, so nothing is removed; the
        // gesture is simply over.
        return travelled(gesture, event.x, event.y)
          ? step(gesture, 'dead', 'none', null)
          : {gesture, paint: 'none', timer: null};
      }
      // The scroller claimed it before the delay elapsed: the fling case, and
      // the reason a flick paints nothing at all.
      if (event.kind === 'cancel') {
        return step(gesture, 'dead', 'none', null);
      }
      // The finger stayed. Paint, instantly and completely.
      if (event.kind === 'onset') {
        return step(gesture, 'pressed', 'on', null);
      }
      // Too quick for the delay. UIKit forwards the held touch and the release
      // together, so the paint appears HERE, at the lift.
      if (event.kind === 'up') {
        return step(gesture, 'flash', 'on', 'flash');
      }
      return {gesture, paint: 'none', timer: null};

    case 'pressed':
      if (event.kind === 'move' && !travelled(gesture, event.x, event.y)) {
        // A press with a shaky hand is still a press: measured, a 4 pt drag
        // over 2 s kept the native highlight for the whole gesture.
        return {gesture, paint: 'on', timer: null};
      }
      // A cancel removes the paint with no transition, one frame BEFORE the
      // list moves.
      if (event.kind === 'move' || event.kind === 'cancel') {
        return step(gesture, 'dead', 'none', null);
      }
      // A release fades.
      if (event.kind === 'up') {
        return step(gesture, 'fading', 'fading', 'fade');
      }
      return {gesture, paint: 'on', timer: null};

    case 'buttonHeld':
      // Travel is not a scroll here (a mouse dragged off a button keeps its
      // `:active` until the button comes up), so only the release ends the
      // press, with the same fade a finger's release gets.
      if (event.kind === 'up') {
        return step(gesture, 'fading', 'fading', 'fade');
      }
      // The platform took it (a drag began, the pointer was cancelled): the
      // paint goes at once, as for a finger.
      if (event.kind === 'cancel') {
        return step(gesture, 'dead', 'none', null);
      }
      return {gesture, paint: 'on', timer: null};

    case 'flash':
      // The full-strength hold is over; hand it to the same fade a long press
      // gets, so both releases leave the same way.
      if (event.kind === 'flashEnd') {
        return step(gesture, 'fading', 'fading', 'fade');
      }
      // The finger is already up. A cancel here is the platform tidying up
      // after the tap (iOS sends `pointercancel` at `scrollend`), and it must
      // not clip the answer the tap earned.
      return {gesture, paint: 'on', timer: null};

    case 'fading':
      if (event.kind === 'fadeEnd') {
        return {gesture: IDLE, paint: 'none', timer: null};
      }
      return {gesture, paint: 'fading', timer: null};

    case 'dead':
      // The finger lifting is what ends a cancelled gesture: until it does, a
      // second finger is a second finger and not a press. Resolving to idle
      // here is what lets the NEXT touch be heard at all; without it a gesture
      // that became a scroll holds the controller's one slot for ever, and
      // every press after the first scroll answers with nothing.
      if (event.kind === 'up') {
        return {gesture: IDLE, paint: 'none', timer: null};
      }
      return {gesture, paint: 'none', timer: null};

    case 'idle':
      // Only a touch (handled above) starts a gesture; anything else while
      // idle is a stray timer or a release with nothing to release.
      return {gesture: IDLE, paint: 'none', timer: null};
  }
}

export function idlePressGesture(): PressGesture {
  return IDLE;
}
