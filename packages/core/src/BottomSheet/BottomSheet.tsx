// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file BottomSheet.tsx
 * @input Uses React, StyleX, core hooks, shared layer dismissal, the modal outlet registry, the shared interaction modality, named BottomSheetPanel, BottomSheetSwitcherContext, BottomSheetHostContext, the private bottom-sheet stack registry
 * @output Exports BottomSheet component and BottomSheetProps
 * @position Public BottomSheet router plus private standalone/switcher hosts
 *
 * BottomSheet selects one of two focused hosts. A standalone host owns its
 * native dialog lifecycle and joins the shared layer dismissal stack; a
 * switcher item owns a native dialog of its own too, but hands its lifecycle
 * to the parent's transition state machine, scrim ownership, and dismissal
 * registration. Both render the same BottomSheetPanel, which owns sheet
 * presentation, content padding, gestures, mobile-keyboard accommodation,
 * and motion completion.
 *
 * Every sheet dialog is native first. A scrim-backed sheet is presented with
 * showModal(): the browser makes the page inert and keeps focus inside the
 * dialog, delivers Escape and the platform close as `cancel`, paints the
 * scrim as `::backdrop`, and returns focus to the opener on close(). Page
 * scroll is locked by the shared useScrollLock hook, as for Dialog: a
 * standalone sheet holds it while presented, a switcher holds one for the
 * whole modal flow. The remaining script is what no single dialog can
 * decide: gating `cancel` by `purpose` and the shared dismissal stack, the
 * stack of sheets below, and, in a switcher, handing one scrim between two
 * dialogs and keeping focus in the active sheet when a retained dialog
 * closes.
 *
 * A standalone sheet also joins the private bottom-sheet stack
 * (bottomSheetStack.ts) while it is presented. The stack is behaviour, not
 * API: a modal sheet opened while another modal sheet is open stacks on top
 * of it, the covered sheet recedes and is blocked, one scrim stays visible,
 * and the native top layer is kept in open order even when several sheets
 * open in one commit. A sheet rendered in another sheet's content leaves
 * with its host and returns with it while its own `isOpen` is still true;
 * its state is never written for it. A modal sheet on its own never
 * notices the stack; when every sheet of a stack closes in one update, the
 * registry returns focus once, to the bottom sheet's target, after the last
 * dialog has closed.
 *
 * A standalone sheet closing in the same update as another standalone sheet
 * opens, at the same level and from a control inside the closing sheet, is
 * replaced by it: the two run the handoff a BottomSheetSwitcher runs between
 * its steps (entering sheet above, retained sheet aligning down then fading,
 * one steady scrim, focus into the new sheet and back to the flow's opener
 * on close). The registry pairs them and drives the handoff; this host
 * renders the retained panel state it reports, and reports its panel's
 * motions back. Non-modal sheets (`hasScrim={false}`) are hosted as manual
 * popovers so the top layer orders them, with `show()` below the Popover API
 * floor; they never stack, but they replace each other the same way, and
 * return focus to their opener on close only while the person is still in
 * them.
 *
 * Every open standalone modal sheet supplies its dialog as an outlet for
 * app-global surfaces (toasts) (Layer/modalOutlet.ts); the latest outlet,
 * the one they render into, follows the sheet stack's order, so toasts land
 * in the top sheet and return to the sheet beneath when it closes.
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
import {useDevWarning, useScrollLock} from '../hooks';
import {mergeProps} from '../utils';
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
  // An open standalone dialog is its panel's positioner: the panel sits at its
  // block end, centred, with no wrapper between them
  // (architecture:component-style-authoring INV7). A tap beside a narrower
  // panel lands on the dialog itself, which light dismiss reads. The stack's
  // recede (stackPositionerStyles) is applied to this dialog too, so a
  // covered standalone sheet shrinks and lifts as one, panel and all.
  dialogPanelHost: {
    display: 'grid',
    alignContent: 'end',
    justifyItems: 'center',
  },
  // A non-modal sheet is hosted in the top layer (manual popover), so it
  // carries no page-level z-index (spec:AST-027). Below the Popover API
  // floor `show()` leaves it in page stacking order as a reduced fallback:
  // usable, but with no promise over later page content.
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
  /**
   * The dim leaves with the sheet, on a curve that matches.
   *
   * A fade covers no distance, so the decelerate token front-loads its
   * progress and simply ends it early: `--ease-standard` puts the scrim at 90%
   * faded in 163ms of a 410ms close, leaving an undimmed page under a sheet
   * that is still sliding across it. `linear` spends the duration it is given.
   * Same reasoning the touch date picker's surface swap already carries.
   */
  scrimClosing: {
    '::backdrop': {
      transitionTimingFunction: 'linear',
    },
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
  const isOpen = isOpenProp && isHostOpen;
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
  // Whether a replace pairs this close is known only once every sheet of the
  // commit has reported to the registry, in the layout phase. Until the
  // registry has answered (a synchronous re-render later, before paint) the
  // panel holds its open pose: an exit pose rendered first and read back by
  // the panel's own style query would start the exit transition, and the
  // reversal into the retained pose would then snap the panel to rest. The
  // flag is keyed to the close it settles: every change of `isOpen` starts
  // it over, during render, and the layout effect below settles a close.
  const [isCloseSettled, setIsCloseSettled] = useState(false);
  const [settledIsOpen, setSettledIsOpen] = useState(isOpen);
  if (settledIsOpen !== isOpen) {
    setSettledIsOpen(isOpen);
    setIsCloseSettled(false);
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
      // Read before the browser's focus fixup for the exiting sheet's
      // `inert` runs (at the next rendering opportunity), so this is where
      // focus was when the person closed the sheet.
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
    }
  }, [hasScrim, isOpen, shouldPresent]);

  // Host app-global surfaces (toasts) inside this sheet while it is an open
  // modal, so they stay visible and operable above it. Every open scrim sheet
  // supplies an outlet (each is an active native modal); the latest outlet —
  // the one global hosts render into — follows the sheet stack's order among
  // sheets rather than the order the sheets were supplied in, so a toast lands
  // in the top sheet, and when that sheet closes the sheet it reveals becomes
  // the latest sheet again and takes the toasts back; a Dialog opened from a
  // sheet is supplied later and stays above every sheet. A closing sheet stays modal through its
  // exit animation, but inert and hidden, so it stops supplying as soon as it
  // starts closing. The registry reports a lone open sheet as the top one.
  // Passive: it runs after the layout effects that present.
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
      // The returned focus shows the focus-visible ring only after keyboard
      // input (`architecture:interaction-modality` INV1). The native close
      // may already have restored focus to the target with a ring; the helper
      // clears it first.
      //
      // With a sheet still open beneath this one, focus returns into that
      // sheet: to the opener when it is there, else to the sheet's panel.
      //
      // An explicit `finalFocusRef` always receives focus, as released. The
      // recorded opener of a non-modal sheet does so only if the person was
      // still in the sheet when it closed (`hidePopover()` never moves
      // focus, and the page behind it was live, so focus the person took
      // elsewhere stays there).
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

  useInteractionModalityTracking();
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
  const isInert = isExiting || stackView.isBlocked;

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
        hasScrim && isExiting && styles.scrimClosing,
        !hasScrim && styles.dialogNonModal,
      )}
      ref={dialogRef}
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
      onClick={handleClick}>
      <BottomSheetPanel
        {...props}
        ref={ref}
        state={panelState}
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
      onClick={onDialogClick}
      onKeyDown={onDialogKeyDown}>
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
