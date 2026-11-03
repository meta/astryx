// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTooltipHold.ts
 * @input A tooltip's trigger, open state, show and hide, label, and
 *   `touchTrigger`
 * @output useTooltipHold: the hold behind useTooltip's show() and hide(), and
 *   the tooltip's touch trigger
 * @position Core-internal: one call per tooltip, useTooltip's. It owns the
 *   tooltip's touch trigger, so the host makes no second touch-trigger call.
 *
 * SYNC: When modified, update /packages/core/src/Tooltip/useTooltip.tsx.
 */

import {useCallback, useRef, useState, type RefObject} from 'react';
import {useAnnounce} from '../hooks/useAnnounce';
import {
  useTouchTriggerInternal,
  type LayerTouchTrigger,
  type UseTouchTriggerReturn,
} from '../Layer/useTouchTrigger';

export interface UseTooltipHoldOptions {
  /** Whether the tooltip's triggers are live at all. */
  isEnabled: boolean;
  /** The controlled open value, or `undefined` when uncontrolled. */
  isOpen: boolean | undefined;
  /** Whether the tooltip shows now. */
  isLayerOpen: boolean;
  /** The tooltip surface's element id. */
  layerId: string;
  /** Shows the tooltip now, with no delay. */
  show: () => void;
  /** Hides the tooltip now. */
  hide: () => void;
  /** Reports a controlled tooltip's requested value without changing it. */
  report: (isOpen: boolean) => void;
  /** The tooltip's `label`: a hold says it once, in place of its text. */
  label?: string;
  /** The tooltip's `touchTrigger`. */
  touchTrigger: LayerTouchTrigger;
  /** The host's trigger element, which the touch trigger reads. */
  triggerRef: RefObject<HTMLElement | null>;
}

export interface UseTooltipHoldReturn {
  /** Whether a hold keeps the tooltip open now. The host's hides ask it. */
  isHeldOpen: () => boolean;
  /** Whether a hold is set, shown or not. */
  isHeld: () => boolean;
  /** Listens for focus leaving the trigger element, or stops with `null`. */
  attach: (element: HTMLElement | null) => void;
  /** Drops the hold without hiding: Escape, or a hide from elsewhere. */
  drop: () => void;
  /**
   * The app's `show()`: shows the tooltip and holds it open until `release`,
   * Escape, a press outside, or focus leaving the trigger and the tooltip. A
   * controlled tooltip reports the request instead.
   */
  hold: () => void;
  /** The app's `hide()`: drops the hold and hides the tooltip. */
  release: () => void;
  /**
   * Whether the tooltip shows held. The host then announces its rendered
   * text, unless the tooltip has a `label`.
   */
  isHoldShown: boolean;
  /** The tooltip's touch trigger (useTouchTriggerInternal), wired to the hold. */
  touch: Pick<
    UseTouchTriggerReturn,
    | 'isTouchPointerRef'
    | 'isTouchInteraction'
    | 'handlePointerEnter'
    | 'handlePointerDown'
    | 'clearTapOpen'
  >;
}

/**
 * Holds a tooltip open for the app's `show()`. `hide()`, Escape, a press or
 * scroll outside, and focus that leaves the trigger and the tooltip end the
 * hold.
 */
export function useTooltipHold(
  options: UseTooltipHoldOptions,
): UseTooltipHoldReturn {
  const {isOpen, isLayerOpen, layerId} = options;

  // DOM listeners read the latest options and announcer through refs. The
  // announcer is the tooltip's own: inside a modal, the modal's region.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const announce = useAnnounce();
  const announceRef = useRef(announce);
  announceRef.current = announce;

  const isHeldRef = useRef(false);
  const [isHeldState, setIsHeldState] = useState(false);
  const setHeld = useCallback((next: boolean) => {
    isHeldRef.current = next;
    setIsHeldState(next);
  }, []);

  const triggerRef = useRef<HTMLElement | null>(null);

  // The touch trigger's outside dismissal (a press or scroll outside) ends a
  // hold with the tooltip.
  const hideFromTouch = useCallback(() => {
    const current = optionsRef.current;
    if (isHeldRef.current) {
      setHeld(false);
      if (current.isOpen !== undefined) {
        current.report(false);
        return;
      }
    }
    current.hide();
  }, [setHeld]);

  const {
    isTouchPointerRef,
    isTouchInteraction,
    handlePointerEnter,
    handlePointerDown,
    clearTapOpen,
    armOutsideDismiss,
  } = useTouchTriggerInternal({
    touchTrigger: options.touchTrigger,
    isEnabled: options.isEnabled,
    isControlled: isOpen !== undefined,
    isOpen: isLayerOpen,
    layerId,
    triggerRef: options.triggerRef,
    show: options.show,
    hide: hideFromTouch,
  });

  const release = useCallback(() => {
    const current = optionsRef.current;
    clearTapOpen();
    setHeld(false);
    if (current.isOpen !== undefined) {
      current.report(false);
      return;
    }
    current.hide();
  }, [setHeld, clearTapOpen]);

  const hold = useCallback(() => {
    const current = optionsRef.current;
    if (!current.isEnabled) {
      return;
    }
    setHeld(true);
    armOutsideDismiss();
    const name = current.label?.trim() ?? '';
    if (name !== '') {
      announceRef.current(name, 'polite');
    }
    if (current.isOpen !== undefined) {
      current.report(true);
      return;
    }
    current.show();
  }, [setHeld, armOutsideDismiss]);

  const isHeldOpen = useCallback(() => {
    const current = optionsRef.current;
    return isHeldRef.current && current.isLayerOpen && current.isOpen !== false;
  }, []);

  const isHeld = useCallback(() => isHeldRef.current, []);

  const handleFocusLeave = useCallback(
    (event: FocusEvent) => {
      if (!isHeldOpen()) {
        return;
      }
      const next = event.relatedTarget;
      const trigger = triggerRef.current;
      // Focus that leaves for no element is a press's to decide. The trigger
      // can sit in another document, so the check uses its own window.
      const view = trigger?.ownerDocument.defaultView;
      if (view == null || !(next instanceof view.Node)) {
        return;
      }
      const surface =
        trigger?.ownerDocument.getElementById(optionsRef.current.layerId) ??
        null;
      if (
        trigger?.contains(next) === true ||
        surface?.contains(next) === true
      ) {
        return;
      }
      release();
    },
    [isHeldOpen, release],
  );

  // Its own focus-leave listener: `focusTrigger="never"` attaches none.
  const attach = useCallback(
    (element: HTMLElement | null) => {
      if (triggerRef.current === element) {
        return;
      }
      triggerRef.current?.removeEventListener('focusout', handleFocusLeave);
      triggerRef.current = element;
      element?.addEventListener('focusout', handleFocusLeave);
    },
    [handleFocusLeave],
  );

  const drop = useCallback(() => {
    if (isHeldRef.current) {
      setHeld(false);
    }
  }, [setHeld]);

  return {
    isHeldOpen,
    isHeld,
    attach,
    drop,
    hold,
    release,
    isHoldShown: isHeldState && isLayerOpen && isOpen !== false,
    touch: {
      isTouchPointerRef,
      isTouchInteraction,
      handlePointerEnter,
      handlePointerDown,
      clearTapOpen,
    },
  };
}
