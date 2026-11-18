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
import {useOutsidePress} from '../Layer/outsidePress';
import {
  containsAlongFlatTree,
  deepActiveElement,
  shadowRootsOutward,
} from '../utils/flatTree';
import {isShadowRoot} from '../utils/nodeType';
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

/** The browser light-dismisses the list; the press watch only reports. */
function closesNothing(): void {}

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
  // A press inside the list, such as a pick, can focus a container around it,
  // such as a dialog's content box. The person did not choose that focus.
  const isLastPressInListRef = useRef(false);
  const pressWatch = useOutsidePress();

  const handlePopoverHide = useCallback(() => {
    onHideRef.current();
    const trigger = triggerRef.current;
    const isPressInList = isLastPressInListRef.current;
    pressWatch.stop();
    // A light dismiss by a press on another control has already moved focus
    // there. Taking it back would send the next key to this closed Selector.
    // Escape, a press inside the list, or a press on nothing focusable returns
    // focus to the trigger. So does a press on a container around the list
    // that is no Tab stop, such as one with `tabIndex={-1}`.
    // Read through open shadow roots: the document reports a root's host.
    const active = deepActiveElement(document);
    const list = popoverContentRef.current?.current ?? null;
    // The press inside the list explains focus only while that focus still
    // holds the list. A later key can move focus to another field.
    const isFocusFromPressInList =
      isPressInList &&
      active != null &&
      list != null &&
      containsAlongFlatTree(active, list);
    // A closed shadow root hides which element inside it holds focus, so its
    // host is not a container around the list: focus may be on another field.
    const isClosedRootHost =
      active != null &&
      active.shadowRoot == null &&
      list != null &&
      shadowRootsOutward(list.getRootNode()).some(({host}) => host === active);
    const focusLandedElsewhere =
      !isFocusReturnAlways &&
      !isFocusFromPressInList &&
      active instanceof HTMLElement &&
      active !== document.body &&
      active !== trigger &&
      list?.contains(active) !== true &&
      (active.tabIndex >= 0 ||
        isClosedRootHost ||
        list == null ||
        !containsAlongFlatTree(active, list));
    if (focusLandedElsewhere) {
      return;
    }
    prepareFocusReturn();
    trigger?.focus();
  }, [
    isFocusReturnAlways,
    onHideRef,
    prepareFocusReturn,
    pressWatch,
    triggerRef,
  ]);
  const handlePopoverShow = useCallback(() => {
    didShowPopoverRef.current = true;
    resetFocusReturn();
    isLastPressInListRef.current = false;
    const trigger = triggerRef.current;
    if (trigger != null) {
      const root = trigger.getRootNode();
      pressWatch.start(
        trigger,
        path => {
          const list = popoverContentRef.current?.current;
          return list != null && path.includes(list);
        },
        closesNothing,
        {
          root: isShadowRoot(root) ? root : null,
          onPress: isInside => {
            isLastPressInListRef.current = isInside;
          },
        },
      );
    }
    onShowRef.current();
  }, [onShowRef, pressWatch, resetFocusReturn, triggerRef]);
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
