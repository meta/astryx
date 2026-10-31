// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSelectorPresentation.ts
 * @input Uses the shared adaptive presentation policy and usePopover
 * @output Coordinates popover and bottom-sheet disclosure state
 * @position Internal presentation controller shared by Selector and MultiSelector
 */

import {
  useCallback,
  useRef,
  useState,
  type FocusEvent,
  type RefObject,
} from 'react';
import {
  usePopover,
  type UsePopoverOptions,
  type UsePopoverReturn,
} from '../Popover/usePopover';
import {
  useAdaptivePresentation,
  type AdaptivePresentation,
  type ResolvedAdaptivePresentation,
} from '../hooks/useAdaptivePresentation';
import {useFocusReturnVisibility} from '../hooks/useFocusReturnVisibility';

interface UseSelectorPresentationOptions {
  presentation: AdaptivePresentation;
  onHide: () => void;
  onShow: () => void;
  popoverOptions: Omit<UsePopoverOptions, 'onHide' | 'onShow'>;
  triggerRef: RefObject<HTMLElement | null>;
  /**
   * Return focus to the trigger on every close, even when a press already
   * moved focus to another element. A caller-rendered trigger needs this
   * (spec:AST-055 AR3); the built-in trigger leaves focus where the press put
   * it (spec:Popover AR4).
   */
  isFocusReturnAlways?: boolean;
}

interface SelectorPresentationController {
  activePresentation: ResolvedAdaptivePresentation;
  hide: () => void;
  isOpen: boolean;
  isSheetOpen: boolean;
  isSheetPresented: boolean;
  isTriggerFocusRingSuppressed: boolean;
  onSheetOpenChange: (isOpen: boolean) => void;
  onTriggerFocus: (event: FocusEvent<HTMLElement>) => void;
  popover: UsePopoverReturn;
  show: () => boolean;
}

export function useSelectorPresentation({
  presentation,
  onHide,
  onShow,
  popoverOptions,
  triggerRef,
  isFocusReturnAlways = false,
}: UseSelectorPresentationOptions): SelectorPresentationController {
  const resolvedPresentation = useAdaptivePresentation(presentation);
  const activePresentationRef =
    useRef<ResolvedAdaptivePresentation>(resolvedPresentation);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const isSheetOpenRef = useRef(false);
  // BottomSheet owns its exit animation and final-focus handoff. Keep it mounted
  // after the controlled open state turns false until that handoff reaches the
  // trigger, then consumers may remove the hidden surface tree.
  const [isSheetPresented, setIsSheetPresented] = useState(false);
  const onHideRef = useRef(onHide);
  const onShowRef = useRef(onShow);
  const didShowPopoverRef = useRef(false);
  // The open list's container, read when the popover hides to tell focus that
  // is still inside the list from focus that moved to another element.
  const popoverContentRef = useRef<HTMLDivElement | null>(null);
  const {
    isFocusRingSuppressed,
    onFocusReturnTargetFocus,
    prepareFocusReturn,
    resetFocusReturn,
  } = useFocusReturnVisibility();
  onHideRef.current = onHide;
  onShowRef.current = onShow;

  const handlePopoverHide = useCallback(() => {
    onHideRef.current();
    const trigger = triggerRef.current;
    // A light dismiss caused by pressing another focusable element has already
    // moved focus there; taking it back would leave the next key on this
    // closed Selector (spec:Popover AR4 returns focus only when it would
    // otherwise be lost). Escape, a choice in the list, or a press on nothing
    // focusable still returns focus to the trigger.
    const active = document.activeElement;
    const focusLandedElsewhere =
      !isFocusReturnAlways &&
      active instanceof HTMLElement &&
      active !== document.body &&
      active !== trigger &&
      !popoverContentRef.current?.contains(active);
    if (focusLandedElsewhere) {
      return;
    }
    prepareFocusReturn();
    trigger?.focus();
  }, [isFocusReturnAlways, prepareFocusReturn, triggerRef]);
  const handlePopoverShow = useCallback(() => {
    didShowPopoverRef.current = true;
    resetFocusReturn();
    onShowRef.current();
  }, [resetFocusReturn]);
  const popover = usePopover({
    ...popoverOptions,
    onHide: handlePopoverHide,
    onShow: handlePopoverShow,
  });
  popoverContentRef.current = popover.contentRef.current;
  const {hide: hidePopover, show: showPopover} = popover;

  const show = useCallback((): boolean => {
    activePresentationRef.current = resolvedPresentation;
    if (resolvedPresentation === 'bottom-sheet') {
      resetFocusReturn();
      onShowRef.current();
      isSheetOpenRef.current = true;
      setIsSheetPresented(true);
      setIsSheetOpen(true);
      return true;
    }
    setIsSheetPresented(false);
    didShowPopoverRef.current = false;
    showPopover();
    return didShowPopoverRef.current;
  }, [resetFocusReturn, resolvedPresentation, showPopover]);

  const hide = useCallback(() => {
    if (isSheetOpenRef.current) {
      prepareFocusReturn();
      isSheetOpenRef.current = false;
      setIsSheetOpen(false);
      onHideRef.current();
    } else {
      hidePopover();
    }
  }, [hidePopover, prepareFocusReturn]);

  const handleTriggerFocus = useCallback(
    (_event: FocusEvent<HTMLElement>) => {
      onFocusReturnTargetFocus();
      if (
        !isSheetOpenRef.current &&
        activePresentationRef.current === 'bottom-sheet'
      ) {
        // BottomSheet focuses finalFocusRef only after its exit completes. That
        // focus event is the lifecycle signal that the retained sheet can now
        // leave the tree without dropping focus to the document body.
        setIsSheetPresented(false);
      }
    },
    [onFocusReturnTargetFocus],
  );

  const handleSheetOpenChange = useCallback(
    (nextIsOpen: boolean) => {
      if (nextIsOpen) {
        show();
      } else {
        hide();
      }
    },
    [hide, show],
  );

  const isOpen = popover.isOpen || isSheetOpen;
  const activePresentation =
    isOpen || isSheetPresented
      ? activePresentationRef.current
      : resolvedPresentation;

  return {
    activePresentation,
    hide,
    isOpen,
    isSheetOpen,
    isSheetPresented,
    isTriggerFocusRingSuppressed: isFocusRingSuppressed,
    onSheetOpenChange: handleSheetOpenChange,
    onTriggerFocus: handleTriggerFocus,
    popover,
    show,
  };
}
