// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ContextMenuTouchLayer.tsx
 * @input ContextMenu's press recognizer (contextMenuPress.ts), the gesture
 *   foundation and the UIKit context-menu constants
 * @output ContextMenuTouchLayer: renders nothing; runs the trigger's press
 *   recognizer and press feedback while ContextMenu is under the touch model
 * @position Rendered by ContextMenu while the touch model applies
 *
 * SYNC: When modified, update /packages/core/src/ContextMenu/ContextMenu.tsx
 */

import {useImperativeHandle, useRef, type Ref, type RefObject} from 'react';
import {flushSync} from 'react-dom';
import {getGestureHost} from '../gestures/GestureHost';
import {isTerminal} from '../gestures/GestureRecognizer';
import {playHaptic} from '../gestures/haptics';
import {useGestureRecognizer} from '../gestures/useGestureRecognizer';
import {useCommittedRef, useCommittedRefInto} from '../hooks/useCommittedRef';
import {contextMenu} from '../motion/uikit/contextMenu';
import {isElement} from '../utils/nodeType';
import {ContextMenuPressRecognizer} from './contextMenuPress';
import {useContextMenuPressFeedback} from './contextMenuPressFeedback';

/** The finger or pen that is still down as the menu opens under it. */
export interface ContextMenuHeldPointer {
  readonly pointerId: number;
  readonly pointerType: 'touch' | 'pen';
}

/** What ContextMenu reaches of a mounted touch layer. */
export interface ContextMenuTouchHandle {
  /** The menu the press opened closed: the trigger returns. */
  release(): void;
  /** Whether the recognizer is timing a finger on the trigger. */
  isTracking(): boolean;
}

export interface ContextMenuTouchLayerProps {
  triggerRef: RefObject<HTMLElement | null>;
  /** The trigger's own visual, which the press feedback grows. */
  visualRef: RefObject<HTMLElement | null>;
  /** False for an inline trigger, which does not grow. */
  isShown: boolean;
  /** Receives the layer's handle as it mounts, and null as it unmounts. */
  ref?: Ref<ContextMenuTouchHandle>;
  /**
   * Open the menu at a client point (where the finger landed). `held` is the
   * finger or pen that is still down as the menu opens. It goes on into the
   * menu. It is null for a menu that opens at the lift.
   */
  onOpen: (
    point: {x: number; y: number},
    held: ContextMenuHeldPointer | null,
  ) => void;
  /**
   * The hold committed: the menu shows at its moment or at the lift, so its
   * content can mount now, hidden.
   */
  onCommit?: () => void;
  /** The press ended with no menu: what mounted at the commit can go. */
  onCancel?: () => void;
}

/**
 * The pointer that the gesture host paired with the press's finger, for the
 * menu's press model. Null where the finger has no pointer.
 */
function heldPointerOf(
  press: ContextMenuPressRecognizer,
  doc: Document | undefined,
): ContextMenuHeldPointer | null {
  const touch = press.trackedTouches[0];
  if (touch == null || doc == null || touch.pointerType === 'mouse') {
    return null;
  }
  const pointerId = getGestureHost(doc).pointerIdOf(touch);
  return pointerId == null ? null : {pointerId, pointerType: touch.pointerType};
}

/**
 * UIContextMenuInteraction's long press. iOS Safari never fires `contextmenu`
 * for a held finger. So the trigger runs its own recognizer on UIKit's
 * timeline, `contextMenu.press`. At the commit, the haptic plays and the
 * recognizer claims the finger. The page stops scrolling under it, and its
 * lift sends no click and no compatibility mouse events. The menu opens where
 * the finger landed: at `menuDisplayMs` if it is still down, or at the lift.
 * A finger still down goes on into the menu. Before the commit, a lift, a
 * second finger or a scroll gets no menu. So does a drift past the tolerance
 * before the menu shows. The press feedback grows the trigger's visual from
 * the onset, 150 ms after the finger lands, while the recognizer follows the
 * finger. It springs back when the recognizer ends the press with no menu, and
 * it holds while that menu is up.
 */
export function ContextMenuTouchLayer({
  triggerRef,
  visualRef,
  isShown,
  ref,
  onOpen,
  onCommit,
  onCancel,
}: ContextMenuTouchLayerProps): null {
  // Whether the recognizer follows a finger or a pen now. It is set below,
  // where the recognizer exists.
  const isFollowedRef = useRef<() => boolean>(() => false);
  const feedback = useContextMenuPressFeedback(
    triggerRef,
    visualRef,
    isShown,
    isFollowedRef,
  );
  const feedbackRef = useCommittedRef(feedback);
  const onCancelRef = useCommittedRef(onCancel);
  const hasPressOpenedRef = useRef(false);

  // The gesture hook follows the element behind the ref, so a `triggerAs`
  // swap moves the recognizer to the new node.
  const recognizer = useGestureRecognizer(
    triggerRef,
    () => {
      const recognizer = new ContextMenuPressRecognizer();
      // Its target-action listeners never hear `failed`, so a press that ends
      // with no menu springs back, and releases what the commit mounted, from
      // here.
      recognizer.addTransitionListener((press, _from, to) => {
        if (to === 'failed' || to === 'cancelled') {
          feedbackRef.current.end(press.clockTime);
          onCancelRef.current?.();
        }
      });
      // A finger's or a pen's growth counts from the landing the recognizer
      // records as it takes the contact.
      recognizer.onPressBegan = (touch, time) => {
        feedbackRef.current.begin(
          time,
          isElement(touch.target) ? touch.target : null,
        );
      };
      return recognizer;
    },
    press => {
      const open = (held: ContextMenuHeldPointer | null) => {
        // The growth holds where it is while the menu is up. ContextMenu
        // places the menu's anchor under the finger, outside the growth.
        feedbackRef.current.hold();
        hasPressOpenedRef.current = true;
        // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the menu shows in the task that decides it, as UIKit shows it at its moment, not a scheduled task later
        flushSync(() => {
          onOpen(press.press ?? press.location(), held);
        });
      };
      switch (press.state) {
        case 'began':
          hasPressOpenedRef.current = false;
          // The click haptic, where a vibration motor is the only haptic.
          // iOS Safari can play none here: no tap lands at the commit.
          playHaptic(contextMenu.commitHaptic);
          // The menu shows at its moment or at the lift. Mounted now, its
          // content costs that show nothing.
          onCommit?.();
          break;
        case 'changed':
          if (press.isMenuDue && !hasPressOpenedRef.current) {
            open(heldPointerOf(press, triggerRef.current?.ownerDocument));
          }
          break;
        case 'ended':
          if (!hasPressOpenedRef.current) {
            open(null);
          }
          break;
        case 'possible':
        case 'failed':
        case 'cancelled':
          break;
      }
    },
  );

  useCommittedRefInto(
    isFollowedRef,
    () => recognizer.numberOfTouches > 0 && !isTerminal(recognizer.state),
  );

  useImperativeHandle(
    ref,
    () => ({
      release: () => feedbackRef.current.release(),
      isTracking: () => recognizer.numberOfTouches > 0,
    }),
    [feedbackRef, recognizer],
  );

  return null;
}
