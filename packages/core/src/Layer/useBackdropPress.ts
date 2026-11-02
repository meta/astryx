// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useBackdropPress.ts
 * @input A modal layer's backdrop dismissal and whether it is allowed now
 * @output Pointer-down and click handlers for the layer's <dialog> root
 * @position Shared backdrop-press rule for Dialog and Drawer
 */

import {useCallback, useRef, type PointerEvent, type MouseEvent} from 'react';

export interface BackdropPressHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onClick: (event: MouseEvent<HTMLElement>) => void;
}

/**
 * A press on a modal layer's backdrop targets the <dialog> root itself. A
 * click there is also what the browser sends when a press starts inside the
 * layer and ends on the backdrop (it goes to the nearest common ancestor), so
 * a backdrop press dismisses only when it both started and ended on the
 * backdrop: the pointer-down is recorded, and the click checks it.
 */
export function useBackdropPress(
  onBackdropPress: () => void,
  isEnabled: boolean,
): BackdropPressHandlers {
  const startedOnBackdropRef = useRef(false);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    startedOnBackdropRef.current = event.target === event.currentTarget;
  }, []);

  const onClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const startedOnBackdrop = startedOnBackdropRef.current;
      startedOnBackdropRef.current = false;
      if (
        isEnabled &&
        startedOnBackdrop &&
        event.target === event.currentTarget
      ) {
        onBackdropPress();
      }
    },
    [isEnabled, onBackdropPress],
  );

  return {onPointerDown, onClick};
}
