// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file tapRecognizer.ts
 * @input A press on a trigger and the gesture counter
 * @output Exports TOUCH_POINTER_TYPES, the TapRecognizer type and
 *   useTapRecognizer (internal: not re-exported from index)
 * @position Layer module that waits for the tap a touch or pen press may
 *   become. useTouchTrigger re-exports it. Truncated Text and Heading import
 *   it directly, so their import does not load useTouchTrigger.
 */

import {useEffect, useState} from 'react';
import {currentGesture} from './gestureCounter';

/**
 * Pointer types whose *press* is a tap rather than a click.
 *
 * A pen belongs here but not in the arrival path: in detection range it hovers
 * — firing `pointerenter`/`pointermove` with no contact, exactly as a mouse
 * does, on a device where `(hover: hover)` matches — and only becomes a tap
 * once it lands. See useTouchTrigger's `handlePointerEnter`.
 */
export const TOUCH_POINTER_TYPES = new Set(['touch', 'pen']);

/** Waits for the tap that a touch or pen press may become. Internal. */
export interface TapRecognizer {
  /**
   * Call on every press. A touch or pen press on `trigger` waits for its tap:
   * the press's own `click`. A touch the browser takes for a scroll or a
   * pinch (`pointercancel`) is no tap, and a new press replaces one still
   * waiting. Returns whether the press is touch or pen.
   */
  press(
    event: PointerEvent,
    trigger: Element | null,
    onTap: (tapEvent: Event) => void,
  ): boolean;
  /** Stops waiting for a press still waiting for its tap. */
  forget(): void;
}

/** One tap recognizer for a trigger, released on unmount. Internal. */
export function useTapRecognizer(): TapRecognizer {
  const [recognizer] = useState(createTapRecognizer);
  // Releases a pending tap on unmount.
  useEffect(() => () => recognizer.forget(), [recognizer]);
  return recognizer;
}

function createTapRecognizer(): TapRecognizer {
  let stopWaiting: (() => void) | null = null;
  const forget = () => {
    stopWaiting?.();
    stopWaiting = null;
  };
  return {
    press(event, trigger, onTap) {
      forget();
      if (!TOUCH_POINTER_TYPES.has(event.pointerType)) {
        return false;
      }
      if (trigger == null) {
        return true;
      }
      // The tap must belong to this press. A key press or a new pointer press
      // advances the gesture, so a keyboard activation that later fires
      // `click` on the trigger (Enter on a button) is not mistaken for it.
      const gesture = currentGesture();
      const stop = () => {
        trigger.removeEventListener('click', handleTap);
        trigger.removeEventListener('pointercancel', stop);
        if (stopWaiting === stop) {
          stopWaiting = null;
        }
      };
      const handleTap = (tapEvent: Event) => {
        stop();
        if (currentGesture() === gesture) {
          onTap(tapEvent);
        }
      };
      trigger.addEventListener('click', handleTap);
      trigger.addEventListener('pointercancel', stop);
      stopWaiting = stop;
      return true;
    },
    forget,
  };
}
