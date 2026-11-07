// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ContextMenuTouchLayer.tsx
 * @input ContextMenu's touch layer (ContextMenuTouch.ts), the gesture
 *   foundation and the UIKit context-menu constants
 * @output ContextMenuTouchLayer: renders nothing; runs the trigger's press
 *   recognizer while ContextMenu is under the touch model
 * @position Rendered by ContextMenu while the touch model applies
 *
 * SYNC: When modified, update /packages/core/src/ContextMenu/ContextMenu.tsx
 */

import {useImperativeHandle, useRef, type Ref, type RefObject} from 'react';
import {playHaptic} from '../gestures/haptics';
import {useGestureRecognizer} from '../gestures/useGestureRecognizer';
import {contextMenu} from '../motion/uikit/contextMenu';
import {ContextMenuPressRecognizer} from './ContextMenuTouch';

/** What ContextMenu reaches of a mounted touch layer. */
export interface ContextMenuTouchHandle {
  /** Whether the recognizer is timing a finger on the trigger. */
  isTracking(): boolean;
}

export interface ContextMenuTouchLayerProps {
  triggerRef: RefObject<HTMLElement | null>;
  /** Receives the layer's handle as it mounts, and null as it unmounts. */
  ref?: Ref<ContextMenuTouchHandle>;
  /** Open the menu at a client point (where the finger landed). */
  onOpen: (point: {x: number; y: number}) => void;
}

/**
 * UIContextMenuInteraction's long press. iOS Safari never fires `contextmenu`
 * for a held finger. So the trigger runs its own recognizer on UIKit's
 * timeline, `contextMenu.press`. At the commit, the haptic plays and the
 * recognizer claims the finger. The page stops scrolling under it, and its
 * lift sends no click and no compatibility mouse events. The menu opens where
 * the finger landed: at `menuDisplayMs` if it is still down, or at the lift.
 * A lift before the commit, a second finger or a scroll gets no menu. So does
 * a drift past the tolerance before the menu shows.
 */
export function ContextMenuTouchLayer({
  triggerRef,
  ref,
  onOpen,
}: ContextMenuTouchLayerProps): null {
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const hasPressOpenedRef = useRef(false);

  // The gesture hook follows the element behind the ref, so a `triggerAs`
  // swap moves the recognizer to the new node.
  const recognizer = useGestureRecognizer(
    triggerRef,
    () => new ContextMenuPressRecognizer(),
    press => {
      const open = () => {
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
          break;
      }
    },
  );

  useImperativeHandle(
    ref,
    () => ({
      isTracking: () => recognizer.numberOfTouches > 0,
    }),
    [recognizer],
  );

  return null;
}
