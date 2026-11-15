// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSelectorPresentation.ts
 * @input Uses the shared adaptive presentation policy and usePopoverInternal
 * @output Coordinates popover and bottom-sheet disclosure state
 * @position Internal presentation controller shared by Selector and MultiSelector
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type RefObject,
} from 'react';
import {useCommittedRef, useCommittedRefInto} from '../hooks/useCommittedRef';
import {
  usePopoverInternal,
  type InternalPopoverOptions,
  type UsePopoverReturn,
} from '../Popover/usePopover';
import {
  useAdaptivePresentation,
  type AdaptivePresentation,
  type ResolvedAdaptivePresentation,
} from '../hooks/useAdaptivePresentation';
import type {InteractionModalityTracking} from '../utils/interactionModality';
import {useFocusReturnVisibility} from '../hooks/useFocusReturnVisibility';
import {
  createPresentationHold,
  usePresentationHold,
} from '../Layer/presentationHold';

interface UseSelectorPresentationOptions {
  presentation: AdaptivePresentation;
  onHide: () => void;
  onShow: () => void;
  popoverOptions: Omit<InternalPopoverOptions, 'onHide' | 'onShow'>;
  triggerRef: RefObject<HTMLElement | null>;
  /**
   * The component's one modality tracking, its `ref` attached to the trigger,
   * so the returned trigger's ring follows the trigger's own document.
   */
  triggerModality: Pick<InteractionModalityTracking, 'readModality'>;
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
  triggerModality,
  isFocusReturnAlways = false,
}: UseSelectorPresentationOptions): SelectorPresentationController {
  const resolvedPresentation = useAdaptivePresentation(presentation);
  // The layer runtime's presentation holds (Layer/presentationHold): the
  // presentation an opening chose, taken as it shows; and the sheet, held from
  // the render that opens it until its close settles. BottomSheet owns its
  // exit animation and final-focus handoff, so the sheet stays mounted after
  // the controlled open state turns false until that handoff reaches the
  // trigger; then consumers may remove the hidden surface tree.
  const [activePresentationHold] = useState(() =>
    createPresentationHold<ResolvedAdaptivePresentation>(),
  );
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const isSheetOpenRef = useRef(false);
  const {isHeld: isSheetPresented, release: releaseSheet} = usePresentationHold(
    {isOpen: isSheetOpen, presentation: true},
  );
  // The layer's popover ref callback can show the popover in the same commit.
  const onHideRef = useCommittedRef(onHide);
  const onShowRef = useCommittedRef(onShow);
  const didShowPopoverRef = useRef(false);
  // The popover's own ref to the open list's container. The hide reads it to
  // tell focus that is still inside the list from focus that moved elsewhere.
  // The hook writes it below, once the popover exists.
  const popoverContentRef = useRef<RefObject<HTMLDivElement | null> | null>(
    null,
  );
  const {
    isFocusRingSuppressed,
    onFocusReturnTargetFocus,
    prepareFocusReturn,
    resetFocusReturn,
  } = useFocusReturnVisibility(triggerModality);
  // Whether the last press while the list is open landed inside the list. A
  // press inside the list, such as a pick, moves focus to the list's nearest
  // focusable container, such as a dialog's content box. That focus is no
  // choice of the person.
  const isLastPressInListRef = useRef(false);
  const stopPressWatchRef = useRef<(() => void) | null>(null);

  const handlePopoverHide = useCallback(() => {
    onHideRef.current();
    const trigger = triggerRef.current;
    const isPressInList = isLastPressInListRef.current;
    stopPressWatchRef.current?.();
    stopPressWatchRef.current = null;
    // A light dismiss by a press on another Tab stop has already moved focus
    // there. Taking it back would send the next key to this closed Selector.
    // Escape, a press inside the list, or a press that lands on no Tab stop
    // returns focus to the trigger.
    const active = document.activeElement;
    const focusLandedElsewhere =
      !isFocusReturnAlways &&
      !isPressInList &&
      active instanceof HTMLElement &&
      active !== document.body &&
      active !== trigger &&
      popoverContentRef.current?.current?.contains(active) !== true &&
      active.tabIndex >= 0;
    if (focusLandedElsewhere) {
      return;
    }
    prepareFocusReturn();
    trigger?.focus();
  }, [isFocusReturnAlways, onHideRef, prepareFocusReturn, triggerRef]);
  const handlePopoverShow = useCallback(() => {
    didShowPopoverRef.current = true;
    resetFocusReturn();
    isLastPressInListRef.current = false;
    stopPressWatchRef.current?.();
    const doc = triggerRef.current?.ownerDocument ?? document;
    const onPress = (event: PointerEvent) => {
      isLastPressInListRef.current =
        popoverContentRef.current?.current?.contains(event.target as Node) ===
        true;
    };
    doc.addEventListener('pointerdown', onPress, {
      capture: true,
      passive: true,
    });
    stopPressWatchRef.current = () => {
      doc.removeEventListener('pointerdown', onPress, {capture: true});
    };
    onShowRef.current();
  }, [onShowRef, resetFocusReturn, triggerRef]);
  // Effect: removes the press watch's document listener on unmount.
  useEffect(
    () => () => {
      stopPressWatchRef.current?.();
    },
    [],
  );
  const popover = usePopoverInternal({
    ...popoverOptions,
    onHide: handlePopoverHide,
    onShow: handlePopoverShow,
  });
  useCommittedRefInto(popoverContentRef, popover.contentRef);
  const {hide: hidePopover, show: showPopover} = popover;

  const show = useCallback((): boolean => {
    activePresentationHold.take(resolvedPresentation);
    if (resolvedPresentation === 'bottom-sheet') {
      resetFocusReturn();
      onShowRef.current();
      isSheetOpenRef.current = true;
      setIsSheetOpen(true);
      return true;
    }
    releaseSheet();
    didShowPopoverRef.current = false;
    showPopover();
    return didShowPopoverRef.current;
  }, [
    activePresentationHold,
    onShowRef,
    releaseSheet,
    resetFocusReturn,
    resolvedPresentation,
    showPopover,
  ]);

  const hide = useCallback(() => {
    if (isSheetOpenRef.current) {
      prepareFocusReturn();
      isSheetOpenRef.current = false;
      setIsSheetOpen(false);
      onHideRef.current();
    } else {
      hidePopover();
    }
  }, [hidePopover, onHideRef, prepareFocusReturn]);

  const handleTriggerFocus = useCallback(
    (_event: FocusEvent<HTMLElement>) => {
      onFocusReturnTargetFocus();
      if (
        !isSheetOpenRef.current &&
        activePresentationHold.current() === 'bottom-sheet'
      ) {
        // BottomSheet focuses finalFocusRef only after its exit completes. That
        // focus event is the lifecycle signal that the retained sheet can now
        // leave the tree without dropping focus to the document body: its
        // close has settled.
        activePresentationHold.release();
        releaseSheet();
      }
    },
    [activePresentationHold, onFocusReturnTargetFocus, releaseSheet],
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
      ? (activePresentationHold.current() ?? resolvedPresentation)
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
