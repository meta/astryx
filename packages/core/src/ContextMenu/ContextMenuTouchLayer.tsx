// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ContextMenuTouchLayer.tsx
 * @input ContextMenu's touch layer (ContextMenuTouch.ts), the gesture
 *   foundation and the UIKit context-menu constants
 * @output ContextMenuTouchLayer: renders nothing; runs the trigger's press
 *   feedback and the lift presentation while ContextMenu is under the touch
 *   model; the hold is the trigger's context request (ContextMenu.tsx)
 * @position Imported by ContextMenu, which renders it only while the touch
 *   model applies: a fine pointer runs none of it
 *
 * SYNC: When modified, update /packages/core/src/ContextMenu/ContextMenu.tsx
 */

import {useEffect, useRef, type RefObject} from 'react';
import {playHaptic} from '../gestures';
import {contextMenu} from '../motion/uikit/contextMenu';
import {
  menuPlacement,
  useContextMenuLift,
  useContextMenuPressFeedback,
  type ContextMenuLift,
  type ContextMenuLiftResult,
  type MenuPlacement,
} from './ContextMenuTouch';

/** Where the lifted menu sits, and its gap from the lifted preview, in px. */
export interface LiftedMenuPlacement extends MenuPlacement {
  readonly gap: number;
}

/** What ContextMenu reaches of a mounted touch layer. */
export interface ContextMenuTouchHandle {
  /** The menu the press opened closed: the trigger springs back. */
  release(): void;
  /** The trigger stops growing at once: the lift takes it from here. */
  end(): void;
  /** The hold committed: the click haptic plays where a motor is the only haptic. */
  commit(): void;
  /** The hold's menu opens: the press feedback stops growing where it is. */
  hold(): void;
  /**
   * The lift presentation (ContextMenuLift.tsx): the trigger lifted above
   * the tint, and the menu's entrance and exit beside it.
   */
  readonly presentation: ContextMenuLift;
  /** Where the lifted menu sits for its rendered height (contextMenu.lift). */
  placeMenu(
    lifted: ContextMenuLiftResult,
    menuHeight: number,
  ): LiftedMenuPlacement;
}

export interface ContextMenuTouchLayerProps {
  triggerRef: RefObject<HTMLElement | null>;
  /** False for an inline trigger, which does not grow. */
  isShown: boolean;
  /** Changes when the trigger element is replaced (`triggerAs`). */
  triggerKey: unknown;
  /** Receives the layer's handle as it mounts, and null as it unmounts. */
  onHandleChange: (handle: ContextMenuTouchHandle | null) => void;
  /** A finger lifted on the lift's tint: the menu closes. */
  onBackdropTap: () => void;
}

/**
 * UIContextMenuInteraction's press feedback and lift. The trigger's context
 * request runs the hold on UIKit's timeline (contextMenu.press) and claims the
 * finger at the commit (the page stops scrolling under it, and its lift sends
 * no click and no compatibility mouse events); ContextMenu calls `commit()`
 * there, for the haptic, and `hold()` as the menu opens where the finger
 * landed. The press feedback grows the trigger while core's press machine
 * believes the press, springs back when it ends with no menu, and holds while
 * the menu it opened is up.
 */
export function ContextMenuTouchLayer({
  triggerRef,
  isShown,
  triggerKey,
  onHandleChange,
  onBackdropTap,
}: ContextMenuTouchLayerProps): null {
  const feedback = useContextMenuPressFeedback(triggerRef, isShown, triggerKey);
  // The lift presentation: ContextMenu decides when a press lifts the
  // trigger, and drives it through the handle.
  const lift = useContextMenuLift(triggerRef, {onBackdropTap});
  const liftRef = useRef(lift);
  liftRef.current = lift;
  const feedbackRef = useRef(feedback);
  feedbackRef.current = feedback;

  useEffect(() => {
    onHandleChange({
      release: () => feedbackRef.current.release(),
      end: () => feedbackRef.current.end(),
      commit: () => playHaptic(contextMenu.commitHaptic),
      hold: () => feedbackRef.current.hold(),
      get presentation() {
        return liftRef.current;
      },
      placeMenu: (lifted, menuHeight) => ({
        ...menuPlacement(lifted.lifted, menuHeight, lifted.viewport),
        gap: contextMenu.lift.menuGap,
      }),
    });
    return () => onHandleChange(null);
  }, [onHandleChange]);

  return null;
}
