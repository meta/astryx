// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ContextMenuTouchLayer.tsx
 * @input ContextMenu's touch layer (ContextMenuTouch.ts), the gesture
 *   foundation and the UIKit context-menu constants
 * @output ContextMenuTouchLayer: renders nothing; runs the trigger's press
 *   recognizer and press feedback while ContextMenu is under the touch model
 * @position Loaded on demand by ContextMenu (lazyContextMenuTouchLayer.ts),
 *   only while the touch model applies, so a fine-pointer page never loads the
 *   touch code
 *
 * SYNC: When modified, update /packages/core/src/ContextMenu/ContextMenu.tsx
 */

import {useEffect, useRef, type RefObject} from 'react';
import {playHaptic, useGestureRecognizer} from '../gestures';
import {contextMenu} from '../motion/uikit/contextMenu';
import {
  ContextMenuPressRecognizer,
  useContextMenuPressFeedback,
} from './ContextMenuTouch';

/** What ContextMenu reaches of a mounted touch layer. */
export interface ContextMenuTouchHandle {
  /** The menu the press opened closed: the trigger springs back. */
  release(): void;
  /** Whether the recognizer is timing a finger on the trigger. */
  isTracking(): boolean;
}

export interface ContextMenuTouchLayerProps {
  triggerRef: RefObject<HTMLElement | null>;
  /** False for an inline trigger, which does not grow. */
  isShown: boolean;
  /** Changes when the trigger element is replaced (`triggerAs`). */
  triggerKey: unknown;
  /** Receives the layer's handle as it mounts, and null as it unmounts. */
  onHandleChange: (handle: ContextMenuTouchHandle | null) => void;
  /** Open the menu at a client point (where the finger landed). */
  onOpen: (point: {x: number; y: number}) => void;
}

/**
 * UIContextMenuInteraction's long press. iOS Safari never fires `contextmenu`
 * for a held finger, so the trigger runs its own recognizer on UIKit's
 * timeline (contextMenu.press; the states are described in
 * contextMenuPress.ts). At the commit the haptic plays and the recognizer
 * claims the finger (the page stops scrolling under it, and its lift sends no
 * click and no compatibility mouse events). The menu opens where the finger
 * landed: at `menuDisplayMs` if it is still down, or at the lift. A lift
 * before the commit, a second finger, a scroll, or a drift past the tolerance
 * before the menu shows gets no menu. The press feedback grows the trigger
 * while core's press machine believes the press, springs back when it ends
 * with no menu, and holds while the menu it opened is up.
 */
export function ContextMenuTouchLayer({
  triggerRef,
  isShown,
  triggerKey,
  onHandleChange,
  onOpen,
}: ContextMenuTouchLayerProps): null {
  const feedback = useContextMenuPressFeedback(triggerRef, isShown, triggerKey);
  const feedbackRef = useRef(feedback);
  feedbackRef.current = feedback;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  // Whether the press in flight has opened its menu.
  const hasPressOpenedRef = useRef(false);

  // The gesture hook follows the element behind the ref, so a `triggerAs`
  // swap moves the recognizer to the new node.
  const recognizer = useGestureRecognizer(
    triggerRef,
    () => new ContextMenuPressRecognizer(),
    press => {
      const open = () => {
        // The press feedback has grown the trigger from its center, and the
        // cursor anchor inside it moves with that scale: stop the growth
        // where it is; ContextMenu places the anchor under the finger.
        feedbackRef.current.hold();
        hasPressOpenedRef.current = true;
        onOpenRef.current(press.press ?? press.location());
      };
      switch (press.state) {
        case 'began':
          hasPressOpenedRef.current = false;
          // The click haptic, where a vibration motor is the only haptic.
          // iOS Safari can play none here: no tap lands at the commit.
          playHaptic(contextMenu.commitHaptic);
          break;
        case 'changed':
          if (press.isMenuDue && !hasPressOpenedRef.current) {
            open();
          }
          break;
        case 'ended':
          if (!hasPressOpenedRef.current) {
            open();
          }
          break;
        case 'possible':
        case 'failed':
        case 'cancelled':
          // A press that ends with no menu: the press feedback springs back.
          break;
      }
    },
  );

  useEffect(() => {
    onHandleChange({
      release: () => feedbackRef.current.release(),
      isTracking: () => recognizer.numberOfTouches > 0,
    });
    return () => onHandleChange(null);
  }, [onHandleChange, recognizer]);

  return null;
}
