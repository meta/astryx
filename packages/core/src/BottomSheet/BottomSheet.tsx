// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file BottomSheet.tsx
 * @input Uses React, StyleX, core hooks, shared layer dismissal, the modal outlet registry, the shared interaction modality, named BottomSheetPanel, BottomSheetSwitcherContext
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
 * decide: gating `cancel` by `purpose` and the shared dismissal stack, and,
 * in a switcher, handing one scrim between two dialogs and keeping focus in
 * the active sheet when a retained dialog closes.
 *
 * While a standalone modal sheet is open, its dialog is the outlet that
 * app-global surfaces (toasts) render into (Layer/modalOutlet.ts).
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/BottomSheet/BottomSheetPanel.tsx
 * - /packages/core/src/BottomSheet/BottomSheetEdgeTint.tsx
 * - /packages/core/src/BottomSheet/BottomSheet.doc.mjs
 * - /packages/core/src/BottomSheet/BottomSheet.test.tsx
 * - /packages/core/src/BottomSheet/BottomSheetSwitcher.tsx
 * - /packages/core/src/BottomSheet/BottomSheetSwitcher.test.tsx
 * - /packages/core/src/Layer/layerDismissalFamilies.test.tsx
 * - /packages/core/src/Layer/layerDismissalInvariants.test.tsx
 * - /packages/core/src/Toast/ToastViewport.modalHost.test.tsx
 * - /apps/storybook/stories/BottomSheet.stories.tsx
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
import {colorVars, durationVars, easeVars} from '../theme/tokens.stylex';
import {useDevWarning, useScrollLock} from '../hooks';
import {mergeProps} from '../utils';
import {LayerDepthProvider} from '../Layer/LayerDepthContext';
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
  // panel lands on the dialog itself, which light dismiss reads.
  dialogPanelHost: {
    display: 'grid',
    alignContent: 'end',
    justifyItems: 'center',
  },
  dialogNonModal: {
    pointerEvents: 'none',
    zIndex: 1000,
    width: '100%',
    height: '100%',
  },
  scrim: {
    '::backdrop': {
      backgroundColor: colorVars['--color-overlay'],
      opacity: {
        default: 'var(--_sheet-scrim-opacity, 1)',
        '@starting-style': 0,
      },
      transitionProperty: 'opacity, display',
      // A switcher hands its one scrim from a fading dialog to the next by
      // pinning this duration for the swap; a standalone sheet never sets it.
      transitionDuration: `var(--_sheet-scrim-duration, ${durationVars['--duration-medium']})`,
      transitionTimingFunction: easeVars['--ease-standard'],
      transitionBehavior: 'allow-discrete',
      '@media (prefers-reduced-motion: reduce)': {
        // The switcher's scrim takeover pins the duration to 0s for one style
        // flush; a literal here would override that pin and paint a frame
        // with no scrim under reduced motion.
        transitionDuration: 'var(--_sheet-scrim-duration, 0.01s)',
      },
    },
  },
  // A non-modal switcher dialog does not enter the top layer, so DOM order
  // would decide which sheet paints in front during a handoff. The switcher's
  // flow wrapper is the isolated surface for that relationship; inside it the
  // sheet dialogs use local values only, the interactive sheet's on top.
  dialogNonModalItem: {
    pointerEvents: 'none',
    width: '100%',
    height: '100%',
  },
  dialogNonModalItemTop: {
    zIndex: 1,
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
});

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
  /** Element that receives focus after the sheet closes. */
  finalFocusRef?: RefObject<HTMLElement | null>;
  sheetId?: never;
}

interface SwitcherBottomSheetProps extends BottomSheetSharedProps {
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

// preventScroll on both: presenting a sheet must not scroll the page to reveal
// what it just focused. For an autofocused field that reveal is the mobile
// keyboard's, and it moves the document under a fixed sheet; useMobileKeyboard
// brings the field into view within the sheet instead.
function focusPanel(panel: HTMLElement | null, isModal: boolean): void {
  const activeElement = document.activeElement;
  if (activeElement != null && panel?.contains(activeElement)) {
    return;
  }
  const autofocus = panel?.querySelector<HTMLElement>('[data-autofocus]');
  if (autofocus != null) {
    autofocus.focus({preventScroll: true});
  } else if (isModal) {
    panel?.focus({preventScroll: true});
  }
}

/**
 * Present a switcher step's dialog modally with no focus to return to.
 * showModal() records the element focused at that moment and close() moves
 * focus back to it, in Chromium and WebKit even when focus is in another
 * dialog by then. For a step that element is the control that advanced the
 * flow (Continue, Back) or the flow's opener, and the dialog closes a fade
 * later, while the user is in the next step: the return would pull focus
 * off the active panel with no user action. Blurring first leaves nothing
 * recorded, so the close moves nothing; the entering step then focuses its
 * own panel, and the switcher returns focus to the opener itself when the
 * flow ends. The blur happens in the same task as the present, so no frame
 * paints without focus.
 */
function presentStepModally(dialog: HTMLDialogElement): void {
  const focused = dialog.ownerDocument.activeElement;
  if (focused instanceof HTMLElement && focused !== dialog.ownerDocument.body) {
    focused.blur();
  }
  dialog.showModal();
}

/**
 * Present a switcher dialog whose backdrop must start, and stay, clear: the
 * opacity is set with the scrim transition pinned to 0s, the dialog is
 * presented, and the pin is lifted only after a style flush has applied the
 * clear backdrop, so no frame eases from a previous backdrop value.
 */
function presentWithClearScrim(dialog: HTMLDialogElement): void {
  dialog.style.setProperty('--_sheet-scrim-duration', '0s');
  dialog.style.setProperty('--_sheet-scrim-opacity', '0');
  presentStepModally(dialog);
  if (typeof getComputedStyle === 'function') {
    void getComputedStyle(dialog, '::backdrop').opacity;
  }
  dialog.style.removeProperty('--_sheet-scrim-duration');
}

function StandaloneBottomSheet({
  ref,
  isOpen,
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
  const [isPresented, setIsPresented] = useState(isOpen);
  const shouldPresent = isOpen || isPresented;
  const panelState: BottomSheetPanelState = isOpen
    ? {kind: 'open', entering: false}
    : isPresented
      ? {kind: 'exiting'}
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
  const handleScrimOpacity = useCallback((opacity: number) => {
    dialogRef.current?.style.setProperty(
      '--_sheet-scrim-opacity',
      String(opacity),
    );
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog == null || !isOpen) {
      return;
    }

    // The controlled prop opens an already-mounted dialog; presentation state
    // must latch here so a later close can keep it mounted through its exit.
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- latches controlled open state for exit animation
    setIsPresented(true);
    dialog.style.setProperty('--_sheet-scrim-opacity', '1');
    const wasOpen = dialog.open;
    if (!wasOpen) {
      if (hasScrim) {
        triggerRef.current = document.activeElement as HTMLElement | null;
        dialog.showModal();
      } else {
        dialog.show();
      }
      focusPanel(panelRef.current, hasScrim);
    }
  }, [hasScrim, isOpen]);

  // Host app-global surfaces (toasts) inside this sheet while it is an open
  // modal, so they stay visible and operable above it. A closing sheet stays
  // modal through its exit animation, but inert and hidden, so it hands them
  // back as soon as it starts closing.
  useModalOutlet(dialogRef, isOpen && hasScrim);

  useEffect(() => {
    if (!isOpen && isPresented && hasScrim) {
      handleScrimOpacity(0);
    }
  }, [handleScrimOpacity, hasScrim, isOpen, isPresented]);

  const handleMotionComplete = useCallback(
    (motion: BottomSheetPanelMotion) => {
      if (motion !== 'exiting' || isOpen) {
        return;
      }
      const dialog = dialogRef.current;
      if (dialog?.open) {
        dialog.close();
      }
      setIsPresented(false);
      // The returned focus shows the focus-visible ring only after keyboard
      // input (`architecture:interaction-modality` INV1). The native close
      // may already have restored focus to the target with a ring; the helper
      // clears it first.
      const returnTarget = finalFocusRef?.current ?? triggerRef.current;
      if (returnTarget != null) {
        focusForLastInput(returnTarget);
      }
      triggerRef.current = null;
    },
    [finalFocusRef, isOpen],
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
    isPresent: () => dialogRef.current?.open ?? false,
  });

  // The native `cancel` event is a close request the stack never saw a press
  // for (Android back, the platform close watcher). One that bubbles up from
  // inside is not: a file input fires it when its picker is dismissed, so it is
  // left alone. Otherwise always preventDefault so the browser cannot close the
  // controlled <dialog>, then answer with the stack's rules: only the top-most
  // layer dismisses, and nothing dismisses during an IME composition.
  const handleCancel = useCallback(
    (event: React.SyntheticEvent<HTMLDialogElement>) => {
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

  return (
    <dialog
      {...stylex.props(
        styles.dialog,
        shouldPresent && styles.dialogOpen,
        shouldPresent && styles.dialogPanelHost,
        hasScrim && styles.scrim,
        hasScrim && !isOpen && isPresented && styles.scrimClosing,
        !hasScrim && styles.dialogNonModal,
      )}
      ref={dialogRef}
      aria-label={label}
      aria-hidden={!isOpen && isPresented ? 'true' : undefined}
      aria-modal={hasScrim && isOpen ? 'true' : undefined}
      role={purpose === 'required' ? 'alertdialog' : undefined}
      inert={!isOpen && isPresented ? true : undefined}
      onCancel={handleCancel}
      onClick={handleClick}>
      <BottomSheetPanel
        {...props}
        ref={ref}
        state={panelState}
        height={height}
        label={label}
        snapPoints={snapPoints}
        isSwipeDismissAllowed={purpose === 'info'}
        isPageScrollLocked={shouldPresent && hasScrim}
        xstyle={xstyle}
        onDismiss={dismissOnLightInteraction}
        onScrimOpacity={handleScrimOpacity}
        onElementChange={handlePanelElementChange}
        onMotionComplete={handleMotionComplete}>
        <LayerDepthProvider>
          {/* A sheet opened inside this one starts from Escape on. */}
          <BottomSheetEscapeContext value>{children}</BottomSheetEscapeContext>
        </LayerDepthProvider>
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
      aria-hidden={isInactive ? 'true' : undefined}
      inert={isInactive ? true : undefined}
      role={purpose === 'required' ? 'alertdialog' : switcherDialogProps.role}
      onCancel={onDialogCancel}
      onClick={onDialogClick}
      onKeyDown={onDialogKeyDown}>
      <div
        {...stylex.props(
          styles.positioner,
          !isPresented && styles.positionerHidden,
          isTopSheet && styles.positionerTop,
        )}
        hidden={!isPresented}
        aria-hidden={isInactive ? 'true' : undefined}
        inert={isInactive ? true : undefined}>
        <BottomSheetPanel
          {...props}
          ref={ref}
          state={panelState}
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
              it establishes a nested BottomSheetSwitcher of its own. */}
          <BottomSheetSwitcherContext value={null}>
            <LayerDepthProvider>
              {/* A sheet opened inside this one starts from Escape on. */}
              <BottomSheetEscapeContext value>
                {children}
              </BottomSheetEscapeContext>
            </LayerDepthProvider>
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
