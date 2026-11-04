// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useBackdropPress.ts
 * @input A modal layer's backdrop dismissal and whether it is allowed now
 * @output Capture-phase pointer handlers and a click handler for the layer's
 *   <dialog> root
 * @position Shared backdrop-press rule for Dialog and Drawer
 */

import {useCallback, useRef, type PointerEvent, type MouseEvent} from 'react';

export interface BackdropPressHandlers {
  onPointerDownCapture: (event: PointerEvent<HTMLElement>) => void;
  onPointerUpCapture: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancelCapture: (event: PointerEvent<HTMLElement>) => void;
  onClick: (event: MouseEvent<HTMLElement>) => void;
}

function isPopoverShowing(element: Element): boolean {
  try {
    return element.matches(':popover-open');
  } catch {
    // jsdom and pre-Popover browsers do not recognize :popover-open.
    return false;
  }
}

/** The popovers showing in the host's document, other than the host and what holds it. */
function popoversShowingAbove(host: HTMLElement): ReadonlyArray<Element> {
  return Array.from(host.ownerDocument.querySelectorAll('[popover]')).filter(
    element => !element.contains(host) && isPopoverShowing(element),
  );
}

/**
 * A press on a modal layer's backdrop targets the <dialog> root itself. A
 * click there is also what the browser sends when a press starts on one side
 * of the layer's edge and ends on the other (it goes to the nearest common
 * ancestor), so a backdrop press dismisses only when its pointer-down and its
 * pointer-up both landed on the backdrop. A cancelled pointer ends the press.
 *
 * A press that light-dismisses a layer open above the host, such as a menu
 * open in the dialog, is that layer's: the host stays open, and the next
 * backdrop press dismisses it, as a second Escape does. The press counts as
 * the layer's when a popover that showed at pointer-down no longer shows at
 * the click.
 *
 * The pointer handlers run in the capture phase. A nested layer, such as a
 * popover open in the dialog, stops its presses at its own root, so a
 * bubble-phase handler here does not see them.
 */
export function useBackdropPress(
  onBackdropPress: () => void,
  isEnabled: boolean,
): BackdropPressHandlers {
  const startedOnBackdropRef = useRef(false);
  const endedOnBackdropRef = useRef(false);
  const layersAboveRef = useRef<ReadonlyArray<Element>>([]);

  const onPointerDownCapture = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const isOnBackdrop = event.target === event.currentTarget;
      startedOnBackdropRef.current = isOnBackdrop;
      endedOnBackdropRef.current = false;
      layersAboveRef.current = isOnBackdrop
        ? popoversShowingAbove(event.currentTarget)
        : [];
    },
    [],
  );

  const onPointerUpCapture = useCallback((event: PointerEvent<HTMLElement>) => {
    endedOnBackdropRef.current =
      startedOnBackdropRef.current && event.target === event.currentTarget;
    startedOnBackdropRef.current = false;
  }, []);

  const onPointerCancelCapture = useCallback(() => {
    startedOnBackdropRef.current = false;
    endedOnBackdropRef.current = false;
    layersAboveRef.current = [];
  }, []);

  const onClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const pressWasOnBackdrop = endedOnBackdropRef.current;
      const dismissedALayerAbove = layersAboveRef.current.some(
        layer => !isPopoverShowing(layer),
      );
      startedOnBackdropRef.current = false;
      endedOnBackdropRef.current = false;
      layersAboveRef.current = [];
      if (
        isEnabled &&
        pressWasOnBackdrop &&
        !dismissedALayerAbove &&
        event.target === event.currentTarget
      ) {
        onBackdropPress();
      }
    },
    [isEnabled, onBackdropPress],
  );

  return {
    onPointerDownCapture,
    onPointerUpCapture,
    onPointerCancelCapture,
    onClick,
  };
}
