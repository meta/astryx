// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file BottomSheet.tsx
 * @input React, StyleX, core hooks, shared layer dismissal, the modal outlet
 *   registry, interaction modality, BottomSheetPanel, the switcher and host
 *   contexts, and the private bottom-sheet stack registry
 * @output Exports BottomSheet component and BottomSheetProps
 * @position Public BottomSheet router plus private standalone/switcher hosts
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/BottomSheet/BottomSheetPanel.tsx
 * - /packages/core/src/BottomSheet/BottomSheetEdgeTint.tsx
 * - /packages/core/src/BottomSheet/BottomSheetHostContext.ts
 * - /packages/core/src/BottomSheet/bottomSheetStack.ts
 * - /packages/core/src/BottomSheet/BottomSheet.doc.mjs
 * - /packages/core/src/BottomSheet/BottomSheet.test.tsx
 * - /packages/core/src/BottomSheet/BottomSheetStacking.test.tsx
 * - /packages/core/src/BottomSheet/BottomSheetSwitcher.tsx
 * - /packages/core/src/BottomSheet/BottomSheetSwitcher.test.tsx
 * - /packages/core/src/Layer/layerDismissalFamilies.test.tsx
 * - /packages/core/src/Layer/layerDismissalInvariants.test.tsx
 * - /packages/core/src/Toast/ToastViewport.modalHost.test.tsx
 * - /apps/storybook/stories/BottomSheet.stories.tsx
 * - /apps/storybook/stories/BottomSheetStacking.stories.tsx
 * - /apps/storybook/stories/BottomSheetReplace.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/BottomSheet/BottomSheetShowcase.tsx
 */

// BottomSheet picks one of two hosts. A standalone host owns its native
// dialog and joins the shared layer dismissal stack. A switcher item also
// owns a native dialog, but its parent switcher owns the lifecycle, the scrim
// and dismissal. Both render BottomSheetPanel, which owns presentation,
// padding, gestures, the mobile keyboard and motion.
//
// A scrim sheet uses showModal(), so the browser makes the page inert, keeps
// focus in the dialog, sends Escape as `cancel`, paints `::backdrop`, and
// returns focus on close(). Script does only what one dialog cannot: it gates
// `cancel` by `purpose`, orders the stack of sheets, and hands one scrim
// between dialogs.
//
// A standalone sheet joins the private sheet stack (bottomSheetStack.ts)
// while it is presented. A modal sheet opened over another stacks on top, and
// the covered sheet recedes. The stack keeps the top layer in open order,
// also when several sheets open in one commit. A sheet that closes as another
// opens, from a control inside it, is replaced with the switcher's handoff.
// Non-modal sheets (`hasScrim={false}`) are manual popovers. They never
// stack, but they replace each other. Each open modal sheet is an outlet for
// toasts (Layer/modalOutlet.ts), in stack order.

import {
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from 'react';
import {useIsHydrating} from '../hooks/useIsHydrating';
import {useSettledOpen} from '../hooks/useSettledOpen';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import type {DialogPurpose} from '../Dialog';
import type {SpacingStep} from '../utils/types';
import {
  colorVars,
  durationVars,
  easeVars,
  spacingVars,
} from '../theme/tokens.stylex';
import {useDevWarning} from '../hooks/useDevWarning';
import {useScrollLock} from '../hooks/useScrollLock';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {observeMutations} from '../utils/sharedMutationObserver';
import {mergeProps} from '../utils/mergeProps';
import {LayerDepthProvider} from '../Layer/LayerDepthContext';
import {ModalAnnounceProvider} from '../hooks/ModalAnnounceProvider';
import {useModalOutlet} from '../Layer/modalOutlet';
import {useLayerDismissal} from '../Layer/useLayerDismissal';
import {focusForLastInput} from '../utils/focusReturn';
import {useInteractionModalityTracking} from '../utils/interactionModality';
import {
  BottomSheetPanel,
  type BottomSheetPanelMotion,
  type BottomSheetPanelState,
} from './BottomSheetPanel';
import {BottomSheetEdgeTint} from './BottomSheetEdgeTint';
import {
  BottomSheetHostContext,
  CLOSED_BOTTOM_SHEET_HOST,
  OPEN_BOTTOM_SHEET_HOST,
} from './BottomSheetHostContext';
import {
  BOTTOM_SHEET_STACK_DEFAULT_VIEW,
  cancelScrimWrite,
  closeDialogKeepingFocus,
  focusSheetPanel,
  getBottomSheetBeneath,
  hideSheetHost,
  isClosingTogether,
  isSheetHostPresented,
  presentStepModally,
  presentWithClearScrim,
  registerBottomSheet,
  reportBottomSheetMotion,
  reportClosedTogether,
  sealBottomSheetBatch,
  setBottomSheetOpen,
  showSheetHostNonModal,
  writeScrimOpacity,
  type BottomSheetScrimWrite,
  type BottomSheetStackView,
} from './bottomSheetStack';
import {
  BottomSheetSwitcherContext,
  type BottomSheetSwitcherContextValue,
  type BottomSheetSwitcherPhase,
} from './BottomSheetSwitcherContext';

export type {BottomSheetHeight, BottomSheetSnapPoint} from './BottomSheetPanel';
import type {BottomSheetHeight, BottomSheetSnapPoint} from './BottomSheetPanel';
import {BottomSheetEscapeContext} from './bottomSheetEscape';
import {layerClickBoundary} from '../Layer/layerClickBoundary';

const styles = stylex.create({
  dialog: {
    position: 'fixed',
    inset: 0,
    width: '100dvw',
    height: '100dvh',
    maxWidth: 'none',
    maxHeight: 'none',
    margin: 0,
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    overflow: 'visible',
    display: 'none',
    outline: 'none',
  },
  dialogOpen: {
    display: 'block',
  },
  // An open standalone dialog positions its panel: the panel sits at its
  // block end, centred, with no wrapper. A tap beside a narrower panel lands
  // on the dialog, which light dismiss reads. A flex row, not a grid: WebKit
  // lays a grid host out again on each render inside the sheet, which makes
  // each update slower. Not a column: WebKit then drops the content's
  // block-end padding from the scroll range. In a row the panel's height is
  // its own cross size, so a sheet taller than the viewport runs past the top
  // edge, as in a grid. The stack's recede applies to this dialog too, so a
  // covered sheet shrinks and lifts as one.
  dialogPanelHost: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  // A non-modal sheet is in the top layer as a manual popover, so it has no
  // page z-index (AST-027). Below the Popover API floor, `show()` leaves it
  // in page stacking order as a reduced fallback.
  dialogNonModal: {
    pointerEvents: 'none',
    width: '100%',
    height: '100%',
  },
  dialogNonModalItem: {
    pointerEvents: 'none',
    width: '100%',
    height: '100%',
  },
  dialogNonModalItemTop: {
    zIndex: 1,
  },
  scrim: {
    '::backdrop': {
      backgroundColor: colorVars['--color-overlay'],
      opacity: {
        default: 'var(--_sheet-scrim-opacity, 1)',
        '@starting-style': 0,
      },
      transitionProperty: 'opacity, display',
      // The scrim changes hands between stacked sheets with no fade at all:
      // the host pins this to 0s inline for the frame the change lands in
      // (see `writeScrimOpacity`). Reduced motion keeps the pin too.
      transitionDuration: `var(--_sheet-scrim-duration, ${durationVars['--duration-medium']})`,
      transitionTimingFunction: easeVars['--ease-standard'],
      transitionBehavior: 'allow-discrete',
      '@media (prefers-reduced-motion: reduce)': {
        transitionDuration: 'var(--_sheet-scrim-duration, 0.01s)',
      },
    },
  },
  // A sheet present on page load dims at once (AST-013 FR13), with the
  // reduced-motion collapse, so the transition still ends.
  scrimSettled: {
    '::backdrop': {
      transitionDuration: '0.01s',
    },
  },
  /**
   * The dim leaves with the sheet, on a matching curve. A fade covers no
   * distance, so `--ease-standard` would end it early: 90% faded after 163ms
   * of a 410ms close, under a sheet that is still sliding. `linear` uses the
   * whole duration.
   */
  scrimClosing: {
    '::backdrop': {
      transitionTimingFunction: 'linear',
    },
  },
  // A closing sheet that keeps focus takes no pointer input during its exit.
  exitHoldingFocus: {
    pointerEvents: 'none',
  },
  positioner: {
    position: 'absolute',
    insetInline: 0,
    insetBlockEnd: 0,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  positionerHidden: {
    display: 'none',
  },
  positionerTop: {
    zIndex: 1,
  },
  // A sheet in a stack recedes and returns with CSS motion only; the style
  // stays on while another sheet is presented so the return animates too.
  // On a standalone sheet these apply to the dialog itself (its panel's
  // positioner); on a switcher step, to the step's positioner.
  positionerStackMotion: {
    transformOrigin: '50% 0',
    transitionProperty: 'transform',
    transitionDuration: durationVars['--duration-medium'],
    transitionTimingFunction: easeVars['--ease-standard'],
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0.01s',
    },
  },
  // Covered sheets recede behind the top sheet: the nearest shrinks a step
  // about its top edge and lifts, the next shrinks a second step; deeper
  // sheets share that second step. Only sheets count toward the depth.
  positionerReceded1: {
    transform: `translateY(calc(-1 * ${spacingVars['--spacing-2']})) scale(0.96)`,
  },
  positionerReceded2: {
    transform: `translateY(calc(-2 * ${spacingVars['--spacing-2']})) scale(0.92)`,
  },
});

/** Positioner styles for a sheet's place in the stack; the switcher items share them. */
function stackPositionerStyles(view: BottomSheetStackView) {
  return [
    view.isStacked && styles.positionerStackMotion,
    view.depth === 1 && styles.positionerReceded1,
    view.depth >= 2 && styles.positionerReceded2,
  ] as const;
}

/** The `data-sheet-stack` value for a host: only set while sheets stack. */
/** Stops a click, from any input, before it reaches its target. */
function ignoreActivation(event: React.MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Stops every key except Tab before it reaches the focused control, so no
 * key handler runs and no text changes (a search field's Enter, a typed
 * letter, Backspace, an arrow that reopens a list). Tab still moves focus.
 */
function ignoreKeyDuringExit(event: React.KeyboardEvent): void {
  if (event.key !== 'Tab') {
    event.preventDefault();
    event.stopPropagation();
  }
}

function stackStateAttribute(
  view: BottomSheetStackView,
  isOpen: boolean,
): 'top' | 'covered' | 'exiting' | 'replaced' | undefined {
  if (!view.isStacked) {
    return undefined;
  }
  if (!isOpen) {
    return view.replacedMotion != null ? 'replaced' : 'exiting';
  }
  return view.isTop ? 'top' : 'covered';
}

/** Scrim opacity for an open modal sheet: one visible backdrop per stack. */
function scrimOpacityForView(view: BottomSheetStackView): '0' | '1' {
  return view.isStacked && !view.ownsScrim ? '0' : '1';
}

interface BottomSheetSharedProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the visual sheet panel <div>. */
  ref?: React.Ref<HTMLDivElement>;

  /** Accessible label for the sheet. */
  label: string;

  /** Sheet content, rendered below the grab handle in a scrollable area. */
  children: ReactNode;

  /**
   * Internal padding of the sheet content using the spacing scale, matching
   * Dialog. Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   * When omitted, uses the theme default for bottom sheets (`--spacing-4`
   * unless the theme sets `padding` on `bottom-sheet`), matching Dialog. The
   * content box is a container: a Section that is its only child escapes the
   * padding, and bleed children such as Table and Divider compensate against
   * it. Pass `0` for content that supplies its own inset.
   */
  padding?: SpacingStep;

  /** Height budget or custom CSS length. Only fully expanded Tall is keyboard-aware. @default 'capped' */
  height?: BottomSheetHeight | number | string;

  /**
   * Extra heights the sheet can rest at when dragged; its own height is always
   * the tallest stop, and omitting this gives a sheet that only opens and
   * closes. Each stop is the sheet's visible height: a number is a viewport
   * fraction (`0.5` is half the screen), `'50%'` the same in CSS, `'320px'` an
   * absolute length. A stop of a quarter of the sheet or less is a peek — it
   * slides away instead of reflowing, and thins the scrim.
   */
  snapPoints?: ReadonlyArray<BottomSheetSnapPoint>;

  /**
   * Configures implicit dismissal behavior, matching Dialog.
   * - required: Blocks swipe, scrim click, and Escape
   * - form: Blocks swipe and scrim click, allows Escape
   * - info: Allows swipe, scrim click, and Escape
   * @default 'info'
   */
  purpose?: DialogPurpose;
}

interface StandaloneBottomSheetProps extends BottomSheetSharedProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  hasScrim?: boolean;
  /**
   * Element that receives focus after the sheet closes. For a sheet on its
   * own, or the last sheet of a stack, it is always focused, wherever focus
   * was. When the sheet closes with a modal sheet still open beneath it,
   * focus returns into that sheet instead (to this element if it is inside
   * it, else the revealed sheet's panel), because the page is still inert.
   */
  finalFocusRef?: RefObject<HTMLElement | null>;
  sheetId?: never;
}

interface SwitcherBottomSheetProps extends BottomSheetSharedProps {
  /**
   * @deprecated `BottomSheetSwitcher` is deprecated; give each step its own
   * standalone sheet with `isOpen` instead. Keeps working until a future
   * minor release removes the switcher.
   */
  sheetId: string;
  isOpen?: never;
  onOpenChange?: never;
  hasScrim?: never;
}

export type BottomSheetProps =
  StandaloneBottomSheetProps | SwitcherBottomSheetProps;

function panelStateForSwitcherPhase(
  phase: BottomSheetSwitcherPhase,
  alignmentOffset: number,
): BottomSheetPanelState {
  switch (phase) {
    case 'active':
      return {kind: 'open', entering: false};
    case 'entering':
      return {kind: 'open', entering: true};
    case 'covered':
    case 'aligning':
    case 'fading':
      return {kind: 'retained', motion: phase, alignmentOffset};
    case 'exiting':
      return {kind: 'exiting'};
    case 'hidden':
      return {kind: 'hidden'};
  }
}

function focusPanel(panel: HTMLElement | null, isModal: boolean): void {
  focusSheetPanel(panel, 'open', isModal);
}

function StandaloneBottomSheet({
  ref,
  isOpen: isOpenProp,
  onOpenChange,
  label,
  children,
  height = 'capped',
  snapPoints,
  hasScrim = true,
  finalFocusRef,
  purpose = 'info',
  xstyle,
  ...props
}: StandaloneBottomSheetProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  // Whether focus was inside this sheet when its close began. A non-modal
  // sheet leaves the page interactive, so it returns focus to its opener
  // only if the person was still in the sheet; a modal sheet always does.
  const hadFocusAtCloseRef = useRef(false);
  const finalFocusRefRef = useRef(finalFocusRef);
  finalFocusRefRef.current = finalFocusRef;
  // A sheet rendered in another sheet's content is presented only while that
  // sheet is open: it leaves with its host and, if its own state is still
  // open, comes back when the host does (see BottomSheetHostContext). Its
  // state stays the consumer's; nothing here writes it.
  const host = use(BottomSheetHostContext);
  const isHostOpen = host?.isOpen ?? true;
  // A sheet open on the server renders closed until hydration. It opens in
  // the next render, the first one that can enter its native host. A
  // <dialog> painted open with aria-modal before it is modal claims a state
  // it does not have.
  const isHydrating = useIsHydrating();
  const isOpen = isOpenProp && isHostOpen && !isHydrating;
  // A sheet open on the server opens settled, with no rise or fade-in. Later
  // opens and closes animate. It latches on its own request, not its host's
  // state, because a hydrating host reads as closed. The latch ends when the
  // settled entry's transition ends, so a later drag settle glides.
  const [settledOpen, releaseSettledOpen] = useSettledOpen(
    isOpenProp,
    isOpen,
    false,
  );
  const isEntrySettled = settledOpen && isOpen;
  // Presentation outlives the controlled prop: a closing sheet stays mounted
  // and in its native host through its exit, and only its motion completion
  // (or a replace finishing) clears it. The open flip is derived during
  // render; the close flip is the host's own event.
  const [isPresented, setIsPresented] = useState(isOpen);
  if (isOpen && !isPresented) {
    setIsPresented(true);
  }
  const shouldPresent = isOpen || isPresented;

  // The sheet's place in the stack of presented modal sheets. Default until
  // the stack reports otherwise, which it does in the commit that presents
  // the sheet, so the first painted frame already shows it.
  const stackKeyRef = useRef<object>({});
  const [stackView, setStackView] = useState<BottomSheetStackView>(
    BOTTOM_SHEET_STACK_DEFAULT_VIEW,
  );
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  // Closed and being replaced by the sheet that opened in the same update:
  // the panel is retained (stays, aligns, fades) instead of sliding out.
  const isReplaced = !isOpen && isPresented && stackView.replacedMotion != null;
  // Only the layout phase knows if a replace pairs this close. Until the
  // registry answers (a synchronous re-render before paint), the panel holds
  // its open pose. An exit pose rendered first would start the exit
  // transition, and the reversal would snap the panel to rest. Each change of
  // `isOpen` restarts the flag during render, and the layout effect below
  // settles a close.
  const [isCloseSettled, setIsCloseSettled] = useState(false);
  // Whether focus was inside the sheet when it closed. Such a sheet stays out
  // of `inert` and `aria-hidden` until its exit ends and focus has left.
  const [isExitFocusHeld, setIsExitFocusHeld] = useState(false);
  const [settledIsOpen, setSettledIsOpen] = useState(isOpen);
  if (settledIsOpen !== isOpen) {
    setSettledIsOpen(isOpen);
    setIsCloseSettled(false);
    setIsExitFocusHeld(false);
  }
  const panelState: BottomSheetPanelState = isOpen
    ? {kind: 'open', entering: stackView.isReplacing}
    : isReplaced
      ? {
          kind: 'retained',
          motion: stackView.replacedMotion ?? 'covered',
          alignmentOffset: stackView.alignmentOffset,
        }
      : isPresented
        ? isCloseSettled
          ? {kind: 'exiting'}
          : {kind: 'open', entering: false}
        : {kind: 'hidden'};

  // Popover's sheet may turn Escape off on its own (bottomSheetEscape.ts).
  const isEscapeAllowed = use(BottomSheetEscapeContext);
  const dismissOnEscape = useCallback(() => {
    if (isOpen && purpose !== 'required' && isEscapeAllowed) {
      onOpenChange(false);
    }
  }, [isEscapeAllowed, isOpen, onOpenChange, purpose]);
  const dismissOnLightInteraction = useCallback(() => {
    if (purpose === 'info') {
      onOpenChange(false);
    }
  }, [onOpenChange, purpose]);
  const handlePanelElementChange = useCallback(
    (element: HTMLDivElement | null) => {
      panelRef.current = element;
    },
    [],
  );
  const stackViewRef = useRef(stackView);
  stackViewRef.current = stackView;
  const scrimWriteRef = useRef<BottomSheetScrimWrite>({frame: null});
  useEffect(() => () => cancelScrimWrite(scrimWriteRef.current), []);
  const writeScrim = useCallback(
    (opacity: '0' | '1') =>
      writeScrimOpacity(dialogRef.current, opacity, scrimWriteRef.current),
    [],
  );
  const handleScrimOpacity = useCallback((opacity: number) => {
    // Only the sheet whose backdrop is the visible scrim thins it; a sheet
    // stacked above it has a transparent backdrop that a drag must not reveal.
    const view = stackViewRef.current;
    if (view.isStacked && !view.ownsScrim) {
      return;
    }
    dialogRef.current?.style.setProperty(
      '--_sheet-scrim-opacity',
      String(opacity),
    );
  }, []);

  // A sheet joins the registry for as long as it is presented. For a modal
  // sheet the registry shows the dialog (in open order, repairing same-commit
  // ties before paint), moves focus into it when it lands on top, and reports
  // the sheet's view. A non-modal sheet is a group of its own: it is shown as
  // a manual popover (or by `show()` below the Popover API floor), never
  // stacks or recedes, and only replaces other non-modal sheets.
  useLayoutEffect(() => {
    if (!shouldPresent) {
      return;
    }
    const key = stackKeyRef.current;
    return registerBottomSheet(
      {
        key,
        getElement: () => dialogRef.current,
        show: () => {
          const dialog = dialogRef.current;
          if (dialog == null || isSheetHostPresented(dialog)) {
            return;
          }
          if (triggerRef.current == null) {
            triggerRef.current = document.activeElement as HTMLElement | null;
          }
          if (!hasScrim) {
            showSheetHostNonModal(dialog, panelRef.current);
            return;
          }
          dialog.style.setProperty(
            '--_sheet-scrim-opacity',
            scrimOpacityForView(stackViewRef.current),
          );
          dialog.showModal();
        },
        hide: () => closeDialogKeepingFocus(dialogRef.current),
        focus: reason => focusSheetPanel(panelRef.current, reason, hasScrim),
        getReturnTarget: () =>
          finalFocusRefRef.current?.current ?? triggerRef.current,
        onView: view => {
          stackViewRef.current = view;
          setStackView(view);
          // Who owns the scrim is the stack's decision; a change of owner
          // lands with no fade (see writeScrimOpacity). A replaced sheet
          // keeps the scrim it owns until the sheet replacing it takes it
          // over; a closing sheet whose scrim an open sheet took over drops
          // its backdrop the same way; a closing sheet that owned the scrim
          // alone fades it out.
          if (isOpenRef.current || view.replacedMotion != null) {
            writeScrim(scrimOpacityForView(view));
          } else if (view.isScrimTakenOver) {
            writeScrim('0');
          }
        },
        replaceable: {
          getPanel: () => panelRef.current,
          getOpener: () => triggerRef.current,
          setOpener: opener => {
            triggerRef.current = opener;
          },
          finish: () => {
            // The registry has closed the dialog; focus stayed in the sheet
            // that replaced this one, and so did the flow's opener.
            triggerRef.current = null;
            setIsPresented(false);
          },
        },
      },
      isOpenRef.current,
      hasScrim,
    );
  }, [hasScrim, shouldPresent, writeScrim]);
  useLayoutEffect(() => {
    if (!isOpen) {
      // Where focus was when the person closed the sheet. The closing sheet
      // is not inert yet, so focus has not moved.
      const dialog = dialogRef.current;
      hadFocusAtCloseRef.current =
        dialog != null && dialog.contains(dialog.ownerDocument.activeElement);
    }
    if (shouldPresent) {
      setBottomSheetOpen(stackKeyRef.current, isOpen);
    }
    if (!isOpen) {
      // The registry has had every sheet's report for this commit; a close
      // that was not paired as a replace is an exit from here on.
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- settles the close once the registry has answered
      setIsCloseSettled(true);
      // Read with the close, before the sheet can go inert.
      setIsExitFocusHeld(hadFocusAtCloseRef.current);
    }
  }, [hasScrim, isOpen, shouldPresent]);

  // An open modal sheet hosts app-global surfaces (toasts), so they stay
  // visible above it. The latest outlet follows the sheet stack's order, so a
  // toast lands in the top sheet and goes back to the revealed sheet when the
  // top one closes. A Dialog opened from a sheet stays above every sheet. A
  // closing sheet stops supplying when it starts to close. Passive: it runs
  // after the layout effects that present.
  useModalOutlet(
    dialogRef,
    isOpen && hasScrim,
    stackView.isTop,
    'bottom-sheet',
  );
  // Closes a batch of same-commit opens; see sealBottomSheetBatch.
  useEffect(() => {
    sealBottomSheetBatch();
  });

  // The scrim at rest: one visible backdrop per stack while open (a sheet
  // stacked above the owner keeps its own backdrop transparent, and a reopen
  // during the exit brings the owner's back), fading out through the exit.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog == null || !hasScrim) {
      return;
    }
    // A replaced sheet keeps the scrim it owns until the sheet replacing it
    // takes it over; see bottomSheetStack.
    if (isOpen || isReplaced) {
      dialog.style.setProperty(
        '--_sheet-scrim-opacity',
        scrimOpacityForView(stackViewRef.current),
      );
    } else if (isPresented) {
      dialog.style.setProperty('--_sheet-scrim-opacity', '0');
    }
  }, [hasScrim, isOpen, isPresented, isReplaced]);

  const handleMotionStart = useCallback((motion: BottomSheetPanelMotion) => {
    reportBottomSheetMotion(stackKeyRef.current, 'start', motion);
  }, []);
  const handleMotionComplete = useCallback(
    (motion: BottomSheetPanelMotion) => {
      // The replace handoff's motions (entering as a replacer, aligning and
      // fading as the replaced sheet) are the registry's to sequence.
      reportBottomSheetMotion(stackKeyRef.current, 'complete', motion);
      if (motion !== 'exiting' || isOpen) {
        return;
      }
      // A sheet closing from code beneath open sheets leaves focus where it
      // is: in the sheet on top. Its own close must not pull focus back to
      // the element its dialog recorded, nor does it move it anywhere else.
      if (hasScrim && stackViewRef.current.depth > 0) {
        closeDialogKeepingFocus(dialogRef.current);
        setIsPresented(false);
        triggerRef.current = null;
        return;
      }
      // Closing together with the other sheets of its stack ("Close all"):
      // the registry returns focus once, after the last dialog has left.
      if (hasScrim && isClosingTogether(stackKeyRef.current)) {
        closeDialogKeepingFocus(dialogRef.current);
        setIsPresented(false);
        triggerRef.current = null;
        reportClosedTogether(stackKeyRef.current);
        return;
      }
      const dialog = dialogRef.current;
      if (dialog != null) {
        hideSheetHost(dialog);
      }
      setIsPresented(false);
      // The native close can show a focus ring on the target. Clear it. The
      // ring shows only after keyboard input.
      //
      // If a sheet is open below, focus goes to this sheet's opener when it is
      // in that sheet, else to that sheet's panel.
      //
      // A non-modal sheet returns focus to its opener only if focus was still
      // in the sheet. The page behind it stays live, so the person can move
      // focus away first.
      const revealed = hasScrim
        ? getBottomSheetBeneath(stackKeyRef.current)
        : null;
      const returnTarget =
        finalFocusRef?.current ??
        (hasScrim || hadFocusAtCloseRef.current ? triggerRef.current : null);
      if (
        revealed != null &&
        (returnTarget == null || !revealed.element.contains(returnTarget))
      ) {
        revealed.focus();
      } else if (returnTarget != null) {
        focusForLastInput(returnTarget);
      }
      triggerRef.current = null;
    },
    [finalFocusRef, hasScrim, isOpen],
  );

  const {ref: modalityRef} = useInteractionModalityTracking();
  // Ends the exit hold once focus has left the sheet: moved elsewhere, or
  // dropped to the page because the focused control was removed or disabled.
  // Native listeners, because React drops the `focusout` a browser sends while
  // React removes the focused element, and Firefox and WebKit send no
  // `focusout` for a removed element at all, so a subtree change is read too.
  // Each reads the focus after the event. They attach only while a closing
  // sheet holds focus, so a closed or open sheet observes nothing.
  const isWatchingExitFocus =
    !isOpen && isPresented && !isReplaced && isExitFocusHeld;
  const exitFocusRef = useCallback(
    (dialog: HTMLDialogElement | null) => {
      if (dialog == null || !isWatchingExitFocus) {
        return;
      }
      const releaseIfFocusLeft = () => {
        if (!dialog.contains(dialog.ownerDocument.activeElement)) {
          setIsExitFocusHeld(false);
        }
      };
      const onFocusOut = () => queueMicrotask(releaseIfFocusLeft);
      dialog.addEventListener('focusout', onFocusOut);
      const unobserve = observeMutations(
        dialog,
        {
          childList: true,
          subtree: true,
          attributeFilter: ['disabled', 'hidden', 'inert'],
        },
        releaseIfFocusLeft,
      );
      return () => {
        dialog.removeEventListener('focusout', onFocusOut);
        unobserve();
      };
    },
    [isWatchingExitFocus],
  );
  const dialogComposedRef = useMergedRefs(dialogRef, modalityRef, exitFocusRef);
  useScrollLock(shouldPresent && hasScrim);
  useDevWarning(
    'BottomSheet',
    'requires a non-empty `label` for an accessible name; the open sheet ' +
      'has no built-in heading to derive one from.',
    isOpen && !label,
  );

  // Join the shared layer dismissal stack. The stack owns the Escape listener
  // and routes each press to the top-most layer, so a Popover or Dialog opened
  // inside this sheet takes the press before the sheet does. It also claims a
  // composing Escape without dismissing anything.
  //
  // The sheet stays registered while it is presented, including its exit
  // animation: a closing sheet is still on screen, so it swallows the press
  // rather than letting it close a layer behind it. `required` blocks too.
  const {shouldDismissOnCloseRequest} = useLayerDismissal({
    isActive: shouldPresent,
    escapeBehavior:
      isOpen && purpose !== 'required' && isEscapeAllowed ? 'close' : 'block',
    onDismiss: dismissOnEscape,
    getContainer: () => dialogRef.current,
    // A covered sheet is on screen but never the one a press is for: the
    // dismissal stack ranks by tree nesting first, which would hand Escape to
    // a covered sheet nested in another sheet's content ahead of a top sheet
    // written outside it. Standing down while covered keeps Escape and the
    // platform close request with the top sheet, as the sheet stack orders.
    // A replaced sheet stands down the same way: the sheet that replaced it,
    // registered before or after it, takes the press.
    isPresent: () =>
      isSheetHostPresented(dialogRef.current) &&
      !stackViewRef.current.isCovered &&
      stackViewRef.current.replacedMotion == null,
  });

  // The native `cancel` event is a close request the stack never saw a press
  // for (Android back, the platform close watcher). Always preventDefault so
  // the browser cannot close the controlled <dialog>, then answer with the
  // stack's rules: only the top-most layer dismisses, and nothing dismisses
  // during an IME composition.
  const handleCancel = useCallback(
    (event: React.SyntheticEvent<HTMLDialogElement>) => {
      // A `cancel` that bubbles up from inside is not a close request: a
      // file input fires it when its picker is dismissed, so it is left alone.
      if (event.target !== event.currentTarget) {
        return;
      }
      event.preventDefault();
      if (shouldDismissOnCloseRequest()) {
        dismissOnEscape();
      }
    },
    [dismissOnEscape, shouldDismissOnCloseRequest],
  );
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      if (hasScrim && event.target === event.currentTarget) {
        dismissOnLightInteraction();
      }
    },
    [dismissOnLightInteraction, hasScrim],
  );

  const isExiting = !isOpen && isPresented;
  // A covered sheet is blocked by the browser: the top sheet's modal dialog
  // makes everything outside it inert, this dialog included. A covered sheet
  // that contains no presented sheet is marked inert and hidden as well, so
  // the state is explicit; one that does contain the top sheet is left alone,
  // because inert on it would reach the top sheet too.
  // A sheet that closes with focus inside it is neither inert nor hidden
  // while that focus stays: `inert` would drop the focus to the page, and
  // `aria-hidden` would hide the focused control. When the exit ends, the
  // dialog closes and focus returns in the same task. When focus leaves the
  // sheet first (into a sheet opened above it, for example), the sheet goes
  // inert at once. Until the close settles, no closing sheet is inert, so the
  // first commit of a close never hides focus.
  const isExitHoldingFocus =
    isExiting && !isReplaced && (!isCloseSettled || isExitFocusHeld);
  const isInert = (isExiting && !isExitHoldingFocus) || stackView.isBlocked;

  return (
    <dialog
      {...stylex.props(
        styles.dialog,
        shouldPresent && styles.dialogOpen,
        shouldPresent && styles.dialogPanelHost,
        // The dialog is the panel's positioner, so the stack's recede
        // transforms the dialog: panel, grabber and all shrink and lift as
        // one. The backdrop is not a descendant and stays put.
        ...stackPositionerStyles(stackView),
        hasScrim && styles.scrim,
        hasScrim && isEntrySettled && styles.scrimSettled,
        hasScrim && isExiting && styles.scrimClosing,
        isExitHoldingFocus && styles.exitHoldingFocus,
        !hasScrim && styles.dialogNonModal,
      )}
      ref={dialogComposedRef}
      // A non-modal sheet is hosted in the top layer as a manual popover
      // (no light dismiss, no backdrop), so sheets order by presentation
      // without a page-level z-index. Below the Popover API floor the
      // attribute is inert and the sheet falls back to show(), in page
      // stacking order (the documented reduced fallback).
      popover={hasScrim ? undefined : 'manual'}
      aria-label={label}
      aria-hidden={isInert ? 'true' : undefined}
      aria-modal={hasScrim && isOpen ? 'true' : undefined}
      role={purpose === 'required' ? 'alertdialog' : undefined}
      inert={isInert ? true : undefined}
      data-sheet-stack={
        hasScrim ? stackStateAttribute(stackView, isOpen) : undefined
      }
      data-sheet-stack-depth={
        hasScrim && stackView.depth > 0 ? stackView.depth : undefined
      }
      onCancel={handleCancel}
      // A closing sheet that keeps focus takes no activation during its
      // exit: no click and no key but Tab reaches the control that has focus.
      onClickCapture={isExitHoldingFocus ? ignoreActivation : undefined}
      onKeyDownCapture={isExitHoldingFocus ? ignoreKeyDuringExit : undefined}
      onKeyUpCapture={isExitHoldingFocus ? ignoreKeyDuringExit : undefined}
      // Presses inside the sheet do not reach handlers around where it is
      // written. The dialog, not the panel, is the root, as in a switcher.
      {...layerClickBoundary({onClick: handleClick})}>
      <BottomSheetPanel
        {...props}
        ref={ref}
        state={panelState}
        isEntrySettled={isEntrySettled}
        onEntrySettled={releaseSettledOpen}
        isOpenRequested={isOpen}
        height={height}
        label={label}
        snapPoints={snapPoints}
        isSwipeDismissAllowed={purpose === 'info'}
        isPageScrollLocked={shouldPresent && hasScrim}
        xstyle={xstyle}
        onDismiss={dismissOnLightInteraction}
        onScrimOpacity={handleScrimOpacity}
        onElementChange={handlePanelElementChange}
        onMotionStart={handleMotionStart}
        onMotionComplete={handleMotionComplete}>
        <ModalAnnounceProvider
          dialogRef={dialogRef}
          isOpen={isOpen && hasScrim}>
          <LayerDepthProvider>
            {/* A sheet opened inside this one starts from Escape on. */}
            <BottomSheetEscapeContext value>
              <BottomSheetHostContext
                value={
                  isOpen ? OPEN_BOTTOM_SHEET_HOST : CLOSED_BOTTOM_SHEET_HOST
                }>
                {children}
              </BottomSheetHostContext>
            </BottomSheetEscapeContext>
          </LayerDepthProvider>
        </ModalAnnounceProvider>
      </BottomSheetPanel>
      {/* Its own element, outside the panel's transform, so it stays flush
          with the viewport's bottom edge at every detent; only while the
          sheet is presented, so a closed sheet renders no extra element. */}
      {shouldPresent && <BottomSheetEdgeTint />}
    </dialog>
  );
}

interface SwitcherBottomSheetItemProps extends SwitcherBottomSheetProps {
  switcher: BottomSheetSwitcherContextValue;
}

function SwitcherBottomSheetItem({
  switcher,
  ref,
  sheetId,
  label,
  children,
  height = 'capped',
  snapPoints,
  purpose = 'info',
  xstyle,
  ...props
}: SwitcherBottomSheetItemProps) {
  const {
    activeSheet,
    hasScrim,
    onActiveSheetChange,
    getSheetPhase,
    getSheetAlignmentOffset,
    hostSheet,
    isScrimOwner,
    isFlowClosing,
    registerSheetElement,
    registerSheetDialog,
    registerSheetPurpose,
    onBeforeSheetPresent,
    isCoveredInTopLayer,
    onSheetEnterStart,
    onSheetTransitionComplete,
    onSheetScrimOpacityChange,
    stackView,
    dialogProps,
    onDialogCancel,
    onDialogClick,
    onDialogKeyDown,
    settledSheet,
    releaseSettledSheet,
  } = switcher;
  const hasValidSheetId = typeof sheetId === 'string' && sheetId.length > 0;
  const phase = hasValidSheetId ? getSheetPhase(sheetId) : 'hidden';
  const alignmentOffset = hasValidSheetId
    ? getSheetAlignmentOffset(sheetId)
    : 0;
  const panelState = panelStateForSwitcherPhase(phase, alignmentOffset);
  const isInteractive = phase === 'active' || phase === 'entering';
  const isInactive =
    phase === 'covered' ||
    phase === 'aligning' ||
    phase === 'fading' ||
    phase === 'exiting';
  const isPresented = phase !== 'hidden';
  // The step open on the server opens settled.
  const isEntrySettled =
    hasValidSheetId && isPresented && settledSheet === sheetId;
  const isTopSheet = phase === 'active' || phase === 'entering';
  const ownsScrim = hasValidSheetId && isScrimOwner(sheetId);
  // The flow is one level of the bottom-sheet stack; a sheet outside the flow
  // covering it blocks every step dialog, the way a covered standalone sheet
  // is blocked. A step is also inactive on its own terms during a handoff.
  const isBlocked = isInactive || (hasScrim && stackView.isBlocked);
  const isHostSheet = hasValidSheetId && hostSheet === sheetId;
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const dialogModeRef = useRef<'modal' | 'non-modal' | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousPhaseRef = useRef(phase);
  const previousPhase = previousPhaseRef.current;
  const hasPresentedRef = useRef(false);

  useLayoutEffect(() => {
    previousPhaseRef.current = phase;
  }, [phase]);

  const dismissOnSwipe = useCallback(() => {
    if (purpose === 'info' && hasValidSheetId && activeSheet === sheetId) {
      onActiveSheetChange(null);
    }
  }, [activeSheet, hasValidSheetId, onActiveSheetChange, purpose, sheetId]);
  const handlePanelElementChange = useCallback(
    (element: HTMLDivElement | null) => {
      panelRef.current = element;
      if (hasValidSheetId) {
        registerSheetElement(sheetId, element);
      }
    },
    [hasValidSheetId, registerSheetElement, sheetId],
  );
  const handleDialogElementChange = useCallback(
    (element: HTMLDialogElement | null) => {
      dialogRef.current = element;
      if (hasValidSheetId) {
        registerSheetDialog(sheetId, element);
      }
    },
    [hasValidSheetId, registerSheetDialog, sheetId],
  );
  const handleMotionStart = useCallback(
    (motion: BottomSheetPanelMotion) => {
      if (motion === 'entering' && hasValidSheetId) {
        onSheetEnterStart(sheetId);
      }
    },
    [hasValidSheetId, onSheetEnterStart, sheetId],
  );
  const handleMotionComplete = useCallback(
    (motion: BottomSheetPanelMotion) => {
      if (hasValidSheetId) {
        onSheetTransitionComplete({sheetId, phase: motion});
      }
    },
    [hasValidSheetId, onSheetTransitionComplete, sheetId],
  );
  const handleScrimOpacity = useCallback(
    (opacity: number) => {
      if (hasValidSheetId) {
        onSheetScrimOpacityChange(sheetId, opacity);
      }
    },
    [hasValidSheetId, onSheetScrimOpacityChange, sheetId],
  );

  useLayoutEffect(() => {
    if (!hasValidSheetId) {
      return;
    }
    registerSheetPurpose(sheetId, purpose);
    return () => registerSheetPurpose(sheetId, null);
  }, [hasValidSheetId, purpose, registerSheetPurpose, sheetId]);

  // Present this sheet's own dialog while the switcher keeps the sheet on
  // screen, and close it once the sheet is hidden. A scrim flow presents
  // modally: an entering dialog is shown above the retained one in the top
  // layer, and the retained dialog closes only after its panel has faded. A
  // modal dialog that is still open beneath a newer one -- the user went back
  // to a sheet that was still fading -- re-presents to become topmost again:
  // the document is blocked by the topmost modal dialog, so a lower one is
  // inert whatever the switcher calls it.
  //
  // Every present blurs first, so no step dialog records an element to
  // return focus to: a close while another sheet is active moves nothing,
  // and when the flow ends the switcher focuses the flow's opener itself.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog == null || !hasValidSheetId) {
      return;
    }
    if (!isPresented) {
      if (dialog.open) {
        dialog.close();
      }
      dialogModeRef.current = null;
      return;
    }
    const nextMode = hasScrim ? 'modal' : 'non-modal';
    if (dialog.open && dialogModeRef.current !== nextMode) {
      dialog.close();
    }
    if (
      dialog.open &&
      hasScrim &&
      isInteractive &&
      isCoveredInTopLayer(sheetId)
    ) {
      dialog.close();
    }
    if (!dialog.open) {
      if (hasScrim) {
        onBeforeSheetPresent(sheetId);
        if (ownsScrim) {
          presentStepModally(dialog);
        } else {
          // Entering above a retained dialog whose backdrop already dims the
          // page: present with a clear backdrop so the page is not dimmed
          // twice and the previous panel stays undimmed beneath this one.
          // Pinned to 0s across the present: a dialog re-presented from the
          // retained position (the user went back while it was fading)
          // closed with its backdrop at 1, and would otherwise ease it down
          // over the scrim duration on top of the new owner's backdrop.
          presentWithClearScrim(dialog);
        }
      } else {
        dialog.show();
      }
    }
    dialogModeRef.current = nextMode;
  }, [
    hasScrim,
    hasValidSheetId,
    isCoveredInTopLayer,
    isInteractive,
    isPresented,
    onBeforeSheetPresent,
    ownsScrim,
    sheetId,
  ]);

  // A sheet removed while presented -- a consumer unmounts the closing sheet
  // in the same update that closes the flow -- takes its dialog out of the
  // top layer with it, but the element would keep its `open` state. Close it
  // while it is still attached so the native lifecycle ends cleanly.
  useLayoutEffect(
    () => () => {
      const dialog = dialogRef.current;
      if (dialog?.open) {
        dialog.close();
      }
    },
    [],
  );

  useEffect(() => {
    if (isInteractive) {
      const wasInteractive =
        previousPhase === 'active' || previousPhase === 'entering';
      if (!hasPresentedRef.current || !wasInteractive) {
        focusPanel(panelRef.current, hasScrim);
      }
      hasPresentedRef.current = true;
    } else if (phase === 'hidden') {
      hasPresentedRef.current = false;
    }
  }, [hasScrim, isInteractive, phase, previousPhase]);

  useDevWarning(
    'BottomSheet',
    'requires a non-empty `label` for an accessible name; the open sheet ' +
      'has no built-in heading to derive one from.',
    isInteractive && !label,
  );

  // The switcher's dialog surface applies to every sheet dialog, except the
  // attributes that identify one element: those render on the host dialog
  // only, the one the switcher's ref resolves to. Of the attributes set
  // explicitly below, only `role` has a consumer value to keep: a required
  // step forces `alertdialog`, otherwise the switcher's `role` stands, as on
  // a shared dialog. `aria-label`/`aria-labelledby` keep consumer precedence
  // above; `aria-modal`, `aria-hidden`, and `inert` are the host's own state.
  const {
    className: switcherClassName,
    style: switcherStyle,
    xstyle: switcherXstyle,
    'aria-label': switcherAriaLabel,
    'aria-labelledby': switcherAriaLabelledBy,
    id: switcherId,
    'data-testid': switcherTestId,
    ...switcherDialogProps
  } = dialogProps;
  const dialogPresentationProps = mergeProps(
    stylex.props(
      styles.dialog,
      isPresented && styles.dialogOpen,
      hasScrim && styles.scrim,
      hasScrim && isEntrySettled && styles.scrimSettled,
      hasScrim && ownsScrim && isFlowClosing && styles.scrimClosing,
      !hasScrim && styles.dialogNonModalItem,
      !hasScrim && isTopSheet && styles.dialogNonModalItemTop,
      switcherXstyle,
    ),
    switcherClassName,
    switcherStyle,
  );

  return (
    <dialog
      {...switcherDialogProps}
      {...dialogPresentationProps}
      id={isHostSheet ? switcherId : undefined}
      data-testid={isHostSheet ? switcherTestId : undefined}
      ref={handleDialogElementChange}
      aria-label={
        switcherAriaLabel ??
        (switcherAriaLabelledBy == null ? label : undefined)
      }
      aria-labelledby={switcherAriaLabelledBy}
      aria-modal={hasScrim && isInteractive ? 'true' : undefined}
      aria-hidden={isBlocked ? 'true' : undefined}
      inert={isBlocked ? true : undefined}
      data-sheet-stack={
        hasScrim && isPresented
          ? stackStateAttribute(stackView, activeSheet != null)
          : undefined
      }
      data-sheet-stack-depth={
        hasScrim && isPresented && stackView.depth > 0
          ? stackView.depth
          : undefined
      }
      role={purpose === 'required' ? 'alertdialog' : switcherDialogProps.role}
      onCancel={onDialogCancel}
      onKeyDown={onDialogKeyDown}
      // Presses inside the sheet do not reach handlers around where it is
      // written. The step's dialog, not the panel, is the root, because the
      // switcher's handlers sit here and must still run.
      {...layerClickBoundary({
        ...switcherDialogProps,
        onClick: onDialogClick,
      })}>
      <div
        {...stylex.props(
          styles.positioner,
          !isPresented && styles.positionerHidden,
          isTopSheet && styles.positionerTop,
          ...(hasScrim ? stackPositionerStyles(stackView) : []),
        )}
        hidden={!isPresented}
        aria-hidden={isBlocked ? 'true' : undefined}
        inert={isBlocked ? true : undefined}>
        <BottomSheetPanel
          {...props}
          ref={ref}
          state={panelState}
          isEntrySettled={isEntrySettled}
          onEntrySettled={releaseSettledSheet}
          isOpenRequested={hasValidSheetId && activeSheet === sheetId}
          height={height}
          label={label}
          snapPoints={snapPoints}
          isSwipeDismissAllowed={purpose === 'info'}
          isPageScrollLocked={hasScrim}
          xstyle={xstyle}
          onDismiss={dismissOnSwipe}
          onScrimOpacity={handleScrimOpacity}
          onElementChange={handlePanelElementChange}
          onMotionStart={handleMotionStart}
          onMotionComplete={handleMotionComplete}>
          {/* A switcher item consumes its parent controller. Its content starts a
              fresh ownership scope so a nested BottomSheet is standalone unless
              it establishes a nested BottomSheetSwitcher of its own. A
              standalone sheet in this step's content is presented only while
              the step is the interactive one: it leaves when the step is left,
              keeps its own isOpen, and returns with the step while still open. */}
          <BottomSheetSwitcherContext value={null}>
            <ModalAnnounceProvider
              dialogRef={dialogRef}
              isOpen={isPresented && hasScrim}>
              <LayerDepthProvider>
                {/* A sheet opened inside this one starts from Escape on. */}
                <BottomSheetEscapeContext value>
                  <BottomSheetHostContext
                    value={
                      isInteractive
                        ? OPEN_BOTTOM_SHEET_HOST
                        : CLOSED_BOTTOM_SHEET_HOST
                    }>
                    {children}
                  </BottomSheetHostContext>
                </BottomSheetEscapeContext>
              </LayerDepthProvider>
            </ModalAnnounceProvider>
          </BottomSheetSwitcherContext>
        </BottomSheetPanel>
      </div>
      {isPresented && <BottomSheetEdgeTint />}
    </dialog>
  );
}

/**
 * A mobile touch sheet that owns a native dialog. Given a sheetId inside a
 * BottomSheetSwitcher, that switcher coordinates the dialog's lifecycle.
 */
export function BottomSheet(props: BottomSheetProps) {
  const switcher = use(BottomSheetSwitcherContext);
  const runtimeSheetId = (props as {sheetId?: string}).sheetId;
  const hasValidSheetId =
    typeof runtimeSheetId === 'string' && runtimeSheetId.length > 0;

  useDevWarning(
    'BottomSheet',
    'requires a non-empty `sheetId` when nested in ' +
      'BottomSheetSwitcher; standalone `isOpen` / `onOpenChange` props are ' +
      'ignored there.',
    switcher != null && !hasValidSheetId,
  );
  useDevWarning(
    'BottomSheet',
    '`sheetId` only works inside BottomSheetSwitcher. Use `isOpen` and ' +
      '`onOpenChange` for a standalone sheet.',
    switcher == null && runtimeSheetId != null,
  );

  if (switcher != null) {
    return (
      <SwitcherBottomSheetItem
        {...(props as SwitcherBottomSheetProps)}
        switcher={switcher}
      />
    );
  }
  return <StandaloneBottomSheet {...(props as StandaloneBottomSheetProps)} />;
}

BottomSheet.displayName = 'BottomSheet';
