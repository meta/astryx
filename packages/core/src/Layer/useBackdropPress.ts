// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useBackdropPress.ts
 * @input A modal layer's backdrop dismissal and whether it is allowed now
 * @output Pointer and click handlers for the layer's <dialog> root
 * @position Shared backdrop-press rule for Dialog and Drawer
 */

import {useCallback, useRef, type PointerEvent, type MouseEvent} from 'react';

export interface BackdropPressHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  onClick: (event: MouseEvent<HTMLElement>) => void;
}

/**
 * A press on a modal layer's backdrop targets the <dialog> root itself. A
 * click there is also what the browser sends when a press starts on one side
 * of the layer's edge and ends on the other (it goes to the nearest common
 * ancestor), so a backdrop press dismisses only when its pointer-down and its
 * pointer-up both landed on the backdrop. A cancelled pointer ends the press.
 */
export function useBackdropPress(
  onBackdropPress: () => void,
  isEnabled: boolean,
): BackdropPressHandlers {
  const startedOnBackdropRef = useRef(false);
  const endedOnBackdropRef = useRef(false);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    startedOnBackdropRef.current = event.target === event.currentTarget;
    endedOnBackdropRef.current = false;
  }, []);

  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    endedOnBackdropRef.current =
      startedOnBackdropRef.current && event.target === event.currentTarget;
    startedOnBackdropRef.current = false;
  }, []);

  const onPointerCancel = useCallback(() => {
    startedOnBackdropRef.current = false;
    endedOnBackdropRef.current = false;
  }, []);

  const onClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const pressWasOnBackdrop = endedOnBackdropRef.current;
      endedOnBackdropRef.current = false;
      if (
        isEnabled &&
        pressWasOnBackdrop &&
        event.target === event.currentTarget
      ) {
        onBackdropPress();
      }
    },
    [isEnabled, onBackdropPress],
  );

  return {onPointerDown, onPointerUp, onPointerCancel, onClick};
}
