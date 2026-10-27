// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file BottomSheetSwitcher.tsx
 * @input Uses React context, StyleX, shared layer dismissal, the modal outlet registry, the private bottom-sheet stack, BottomSheetSwitcherContext, BottomSheetHostContext
 * @output Exports BottomSheetSwitcher and BottomSheetSwitcherProps
 * @position Core switcher for mutually exclusive BottomSheet flows
 *
 * The switcher turns a set of declaratively nested BottomSheets into a
 * controlled single-selection group: `activeSheet` names the one interactive
 * child, or is null when the flow is closed. During a handoff the new sheet
 * enters above the previous sheet. If it is shorter, the previous sheet moves
 * down at the same time until their top edges align; otherwise it stays
 * stationary. The previous sheet fades only after both motions complete.
 *
 * Every child sheet owns a native `<dialog>`: a scrim flow presents each
 * sheet with showModal(), as a standalone modal sheet does, and a no-scrim
 * flow with show() inside the flow wrapper (a standalone no-scrim sheet is a
 * manual popover in the top layer instead; this deprecated path keeps its
 * released hosting). For a modal flow the browser then does what a modal
 * dialog does -- the page is inert, focus stays in the top-layer dialog,
 * Escape and the platform close arrive as `cancel`. The switcher is the coordinator: it decides which
 * sheet dialog is presented, retained, or hidden, keeps one scrim painted
 * across a handoff (the retained sheet's backdrop until it fades, then the
 * new sheet's, swapped without a fade), holds the flow's one page scroll
 * lock (the shared useScrollLock, as Dialog uses, acquired once while the
 * flow is presented and released after its exit, never per step) and the
 * one layer-dismissal registration, and returns focus to the flow's opener
 * when the flow ends, which no single dialog can know.
 *
 * The switcher's one element is a flow wrapper. In a scrim flow it has no box
 * (`display: contents`): the dialogs sit in the top layer. In a no-scrim flow
 * it is the isolated surface that orders the sheet dialogs locally, the way
 * the shared shell once did, so no sheet needs a page-level value of its own.
 *
 * Its `ref` resolves to the host dialog: the one presenting the active sheet,
 * the exiting sheet's through its exit, and the last host's (or the first
 * mounted sheet's) while the flow is closed, so the ref is never null while a
 * sheet is mounted. `id` and `data-testid` render on the host dialog only:
 * a flow that mounts open carries them on the active sheet's dialog in server
 * markup too; a flow that mounts closed carries them from the first commit's
 * synchronous re-render on, and its server markup carries them on no element.
 * Every other dialog prop and handler, `onCancel` included, applies to every
 * sheet dialog; the browser raises `cancel` on the dialog it presents.
 *
 * A scrim flow is one level of the private bottom-sheet stack
 * (bottomSheetStack.ts) while it is visible: it stacks over, or under, other
 * modal sheets in open order, recedes as a whole when covered, and switching
 * its step in place never changes its position. The level is realized by the
 * active step's dialog; on a handoff the registry is told the dialog changed
 * so the sheets above the flow stay above its new dialog. A flow stacked
 * above another sheet keeps every step backdrop clear; a flow beneath owns
 * the stack's one scrim and hands it between its own steps as it always did.
 * A switcher step is never paired in a replace: the flow replaces its own
 * steps. A flow rendered in another sheet's content leaves and returns with
 * that sheet, like a standalone sheet, without its state being written. A
 * modal flow's host dialog is a toast outlet like a standalone scrim sheet's
 * (Layer/modalOutlet.ts), following the handoff. The switcher is deprecated
 * in favour of standalone step sheets.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/BottomSheet/BottomSheet.tsx
 * - /packages/core/src/BottomSheet/bottomSheetStack.ts
 * - /packages/core/src/BottomSheet/BottomSheetHostContext.ts
 * - /packages/core/src/BottomSheet/BottomSheetStacking.test.tsx
 * - /packages/core/src/BottomSheet/BottomSheetSwitcherContext.ts
 * - /packages/core/src/BottomSheet/BottomSheetSwitcher.doc.mjs
 * - /packages/core/src/BottomSheet/BottomSheetSwitcher.spec.md
 * - /packages/core/src/BottomSheet/BottomSheetSwitcher.test.tsx
 * - /packages/core/src/BottomSheet/index.ts
 * - /apps/storybook/stories/BottomSheetSwitcher.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/BottomSheet/BottomSheetSwitcherShowcase.tsx
 */

import {
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import type {DialogPurpose} from '../Dialog';
import {useScrollLock} from '../hooks';
import {useFocusTrapEscapeCompatibilitySignal} from '../hooks/useFocusTrap';
import {dispatchLayerEscapeKeyDown} from '../Layer/layerStack';
import {useLayerDismissal} from '../Layer/useLayerDismissal';
import {composeEventHandlers} from '../utils';
import {mergeRefs} from '../utils/mergeRefs';
import {useModalOutlet} from '../Layer/modalOutlet';
import {BottomSheetHostContext} from './BottomSheetHostContext';
import {
  BOTTOM_SHEET_STACK_DEFAULT_VIEW,
  cancelScrimWrite,
  closeDialogKeepingFocus,
  focusSheetPanel,
  getBottomSheetBeneath,
  isClosingTogether,
  notifyBottomSheetHostChanged,
  presentStepModally,
  presentWithClearScrim,
  registerBottomSheet,
  reportClosedTogether,
  sealBottomSheetBatch,
  setBottomSheetOpen,
  writeScrimOpacity,
  type BottomSheetScrimWrite,
  type BottomSheetStackView,
} from './bottomSheetStack';
import {
  BottomSheetSwitcherContext,
  type BottomSheetSwitcherContextValue,
  type BottomSheetSwitcherDialogProps,
  type BottomSheetSwitcherPhase,
  type BottomSheetSwitcherTransitionEvent,
} from './BottomSheetSwitcherContext';

const styles = stylex.create({
  // A scrim flow's dialogs live in the top layer; the wrapper has no box.
  flow: {
    display: 'contents',
  },
  // show() leaves a no-scrim flow in the normal rendering tree, where DOM
  // order would decide which sheet dialog paints in front during a handoff.
  // The wrapper is then the flow's isolated surface: the sheet dialogs order
  // themselves locally inside it (`spec:AST-027` FR2), and the wrapper itself
  // keeps the one overlay value the shared shell carried before, which
  // `spec:AST-027` records as the non-modal migration gap. It passes pointer
  // input through to the live page; each sheet panel opts back in. Consumers
  // of this non-modal mode must still avoid transformed or clipping ancestors.
  flowNonModal: {
    display: 'block',
    position: 'fixed',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    isolation: 'isolate',
    zIndex: 1000,
  },
});

type RetainedSheetPhase = 'covered' | 'aligning' | 'fading' | 'exiting';

interface SheetTransitionState {
  enteringSheet: string | null;
  retainedSheet: string | null;
  retainedPhase: RetainedSheetPhase | null;
  alignmentOffset: number;
  isAlignmentComplete: boolean;
}

const IDLE_TRANSITION: SheetTransitionState = {
  enteringSheet: null,
  retainedSheet: null,
  retainedPhase: null,
  alignmentOffset: 0,
  isAlignmentComplete: false,
};

const ALIGNMENT_THRESHOLD_PX = 1;

function transitionForActiveSheetChange(
  previousSheet: string | null,
  nextSheet: string | null,
): SheetTransitionState {
  if (previousSheet == null) {
    return IDLE_TRANSITION;
  }
  if (nextSheet == null) {
    return {
      enteringSheet: null,
      retainedSheet: previousSheet,
      retainedPhase: 'exiting',
      alignmentOffset: 0,
      isAlignmentComplete: false,
    };
  }
  return {
    enteringSheet: nextSheet,
    retainedSheet: previousSheet,
    retainedPhase: 'covered',
    alignmentOffset: 0,
    isAlignmentComplete: false,
  };
}

function alignmentOffsetForElements(
  enteringElement: HTMLElement | undefined,
  retainedElement: HTMLElement | undefined,
): number {
  if (enteringElement == null || retainedElement == null) {
    return 0;
  }
  const enteringPositioner = enteringElement.parentElement;
  const enteringTop =
    enteringPositioner?.getBoundingClientRect().top ??
    enteringElement.getBoundingClientRect().top;
  return Math.max(0, enteringTop - retainedElement.getBoundingClientRect().top);
}

/**
 * Keeps one object identity while its own enumerable entries are unchanged, so
 * the consumer's rest props can sit in a memoized context value without
 * refreshing every sheet host on each switcher render.
 */
function useShallowStable<T extends object>(value: T): T {
  const stableRef = useRef(value);
  const previous = stableRef.current;
  const previousKeys = Object.keys(previous) as (keyof T)[];
  const nextKeys = Object.keys(value) as (keyof T)[];
  const isSame =
    previousKeys.length === nextKeys.length &&
    nextKeys.every(key => Object.is(previous[key], value[key]));
  if (!isSame) {
    stableRef.current = value;
  }
  return stableRef.current;
}

/**
 * Hands the flow's scrim to `dialog` without a fade. The backdrop's opacity
 * transition would otherwise ease from the transparent value the entering
 * dialog was presented with, dipping the page's dim for one motion token
 * exactly when the previous dialog's backdrop disappears. Even a near-zero
 * duration paints its first frame at the start value, so the swap disables
 * the transition outright, flushes style so the new value is committed under
 * that rule, then restores the token for later gesture and exit fades.
 */
function takeOverScrim(dialog: HTMLDialogElement, opacity: number): void {
  dialog.style.setProperty('--_sheet-scrim-duration', '0s');
  dialog.style.setProperty('--_sheet-scrim-opacity', String(opacity));
  if (typeof getComputedStyle === 'function') {
    void getComputedStyle(dialog, '::backdrop').opacity;
  }
  dialog.style.removeProperty('--_sheet-scrim-duration');
}

/**
 * @deprecated Write each step as its own `BottomSheet` with `isOpen`, driven
 * by one state value that names the open step; closing the top sheet and
 * opening the next in the same update, from inside the open step, runs the
 * same replace handoff (see BottomSheet, "Replacing a sheet"). Keeps working until a future minor
 * release removes it: on its own as released (plus two fixes: a toast raised
 * from a step now renders above the flow and can be pressed, and reduced motion
 * follows design:reduced-motion), as one stack level when stacked.
 */
export interface BottomSheetSwitcherProps extends BaseProps<HTMLDialogElement> {
  /**
   * Ref resolved to the native dialog hosting the flow: the active sheet's
   * dialog, which changes on a handoff; the exiting sheet's through its exit;
   * and, while the flow is closed, the dialog that hosted it last (or the
   * first mounted sheet's), so it is never null while a sheet is mounted,
   * from the first commit on.
   */
  ref?: React.Ref<HTMLDialogElement>;

  /** Called when the active sheet's native dialog receives a cancel event. */
  onCancel?: (event: SyntheticEvent<HTMLDialogElement>) => void;

  /**
   * ID of the interactive BottomSheet, or null when the flow should close.
   * Must match a nested BottomSheet's `sheetId`. The previous sheet may remain
   * visually present and inert while the new sheet enters, moving downward at
   * the same time if the new sheet is shorter, then fade away.
   */
  activeSheet: string | null;

  /** Called with null when the active sheet requests dismissal. */
  onActiveSheetChange: (sheetId: string | null) => void;

  /**
   * Whether each sheet dialog opens modally with a native ::backdrop.
   * Disable for a viewport-anchored, non-modal flow over an interactive page.
   * @default true
   */
  hasScrim?: boolean;

  /** BottomSheets identified by unique `sheetId` values. */
  children: ReactNode;
}

/**
 * Coordinates a set of BottomSheets so zero or one is active at a time, each
 * in its own native dialog. During a handoff the previous panel stays visible
 * and inert beneath the entering panel, then fades after motion completes.
 *
 * @deprecated Write each step as its own `BottomSheet` with `isOpen`, driven
 * by one state value that names the open step:
 *
 * ```
 * const [step, setStep] = useState(null);
 * const close = own => isOpen => !isOpen && setStep(c => (c === own ? null : c));
 * <BottomSheet isOpen={step === 'details'} onOpenChange={close('details')} label="Details">…</BottomSheet>
 * <BottomSheet isOpen={step === 'confirm'} onOpenChange={close('confirm')} label="Confirm">…</BottomSheet>
 * ```
 *
 * Closing the top sheet and opening the next in the same update, from a
 * control inside the open step, runs the same replace handoff, with no
 * `sheetId` and no switcher, for modal and `hasScrim={false}` flows alike; a
 * step changed from outside the flow's sheets closes and opens with the
 * sheets' own motion. The switcher keeps working until a future
 * minor release removes it: on its own as released (plus two fixes: a toast
 * raised from a step now renders above the flow and can be pressed, and reduced
 * motion follows design:reduced-motion), and as one level of the stack when
 * stacked with other sheets.
 */
export function BottomSheetSwitcher({
  activeSheet: activeSheetProp,
  onActiveSheetChange,
  hasScrim = true,
  children,
  ref,
  onCancel,
  onClick,
  onKeyDown,
  className,
  style,
  xstyle,
  ...restDialogProps
}: BottomSheetSwitcherProps) {
  // A flow rendered in another sheet's content is part of that sheet, as a
  // standalone sheet is: it is presented only while its host is open, leaves
  // with it, and comes back with it if its own `activeSheet` still names a
  // step (see BottomSheetHostContext). The consumer's state is never written
  // for it; with the host closed the flow simply reads as closed.
  const host = use(BottomSheetHostContext);
  const isHostOpen = host?.isOpen ?? true;
  const activeSheet = isHostOpen ? activeSheetProp : null;
  // Every sheet host applies the switcher's dialog surface to its own dialog.
  const dialogProps = useShallowStable<BottomSheetSwitcherDialogProps>({
    ...restDialogProps,
    className,
    style,
    xstyle,
  });
  const hostDialogRef = useRef<HTMLDialogElement | null>(null);
  const flowRef = useRef<HTMLDivElement | null>(null);
  const sheetDialogsRef = useRef(new Map<string, HTMLDialogElement>());
  // Sheet ids in the order their dialogs mounted (tree order on first mount).
  // State, not a ref: the resting host below is rendered -- it carries the
  // consumer's `id` -- so a sheet mounting or leaving must re-render.
  const [sheetOrder, setSheetOrder] = useState<ReadonlyArray<string>>([]);
  // The sheet that hosted the flow last, kept while the flow is closed so the
  // ref and `id` stay on the dialog the person last used. State adjusted
  // during render (not a ref read during render): it changes exactly when
  // the presented host does, and the next render reads it.
  const [lastHostSheet, setLastHostSheet] = useState<string | null>(null);
  const presentationOrderRef = useRef(new Map<string, number>());
  const presentationCounterRef = useRef(0);
  const modalFlowRef = useRef(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const sheetElementsRef = useRef(new Map<string, HTMLElement>());
  const committedActiveSheetRef = useRef(activeSheet);
  const scrimOpacityRef = useRef(1);
  const scrimOwnerRef = useRef<string | null>(null);
  // The flow's place in the stack of presented modal sheets; default until
  // the stack reports, in the commit that presents the flow. The whole flow
  // is one level, keyed once for its lifetime, so a handoff keeps its rank.
  const stackKeyRef = useRef<object>({});
  const [stackView, setStackView] = useState<BottomSheetStackView>(
    BOTTOM_SHEET_STACK_DEFAULT_VIEW,
  );
  const stackViewRef = useRef(stackView);
  stackViewRef.current = stackView;
  const scrimWriteRef = useRef<BottomSheetScrimWrite>({frame: null});
  useEffect(() => () => cancelScrimWrite(scrimWriteRef.current), []);
  // What the flow's place in the stack was when it left the registry: its
  // depth and the open sheet beneath it. React runs the registration
  // effect's cleanup before the focus-return effect below in the same
  // commit, so by then the registry no longer knows the flow; the cleanup
  // records what the return needs.
  const leftStackRef = useRef<{
    depth: number;
    revealed: {element: HTMLDialogElement; focus: () => void} | null;
    closingTogether: boolean;
  } | null>(null);
  const [sheetPurposes, setSheetPurposes] = useState<
    ReadonlyMap<string, DialogPurpose>
  >(() => new Map());
  const [unmountedSheetIds, setUnmountedSheetIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [transition, setTransition] =
    useState<SheetTransitionState>(IDLE_TRANSITION);

  const activeSheetChanged = committedActiveSheetRef.current !== activeSheet;
  const visibleTransition = activeSheetChanged
    ? transitionForActiveSheetChange(
        committedActiveSheetRef.current,
        activeSheet,
      )
    : transition;
  const presentedActiveSheet =
    activeSheet != null && !unmountedSheetIds.has(activeSheet)
      ? activeSheet
      : null;
  const presentedRetainedSheet =
    visibleTransition.retainedSheet != null &&
    !unmountedSheetIds.has(visibleTransition.retainedSheet)
      ? visibleTransition.retainedSheet
      : null;
  const isFlowVisible =
    presentedActiveSheet != null || presentedRetainedSheet != null;
  const isModal = hasScrim && isFlowVisible;
  // The dialog that hosts the flow for its ref, its single-instance
  // attributes, and its dismissal registration: the active sheet's, the
  // retained sheet's while the flow closes through its exit, and while the
  // flow is closed the dialog that hosted it last (or the first mounted
  // sheet's before any open), so the ref resolves to a closed dialog element
  // rather than to null, as the shared dialog did. Which sheet mounts first
  // is known only once its dialog registers during the first commit: the
  // ref is attached to it in that same commit (below), and the rendered
  // `id` follows in the synchronous re-render that commit schedules, before
  // the first paint. Server markup therefore carries the `id` on no element.
  const presentedHostSheet = presentedActiveSheet ?? presentedRetainedSheet;
  if (presentedHostSheet != null && presentedHostSheet !== lastHostSheet) {
    setLastHostSheet(presentedHostSheet);
  }
  const restingHostSheet =
    lastHostSheet != null && sheetOrder.includes(lastHostSheet)
      ? lastHostSheet
      : (sheetOrder[0] ?? null);
  const hostSheet = presentedHostSheet ?? restingHostSheet;
  // The dialog whose backdrop paints the flow's one scrim. A retained sheet
  // keeps it through a handoff so the entering dialog, presented above it in
  // the top layer, does not dim the previous panel beneath its own backdrop.
  const scrimOwnerSheet = presentedRetainedSheet ?? presentedActiveSheet;
  // Whether the flow's one scrim is the stack's visible scrim. A flow stacked
  // above another sheet keeps every step backdrop clear: the sheet beneath
  // dims the page, and a second dim would double it.
  const flowOwnsStackScrim = !stackView.isStacked || stackView.ownsScrim;
  const isFlowOpen = activeSheet != null;
  const isFlowOpenRef = useRef(isFlowOpen);
  isFlowOpenRef.current = isFlowOpen;
  const isFlowClosing = isFlowVisible && activeSheet == null;
  const activeSheetPurpose =
    (activeSheet == null ? null : sheetPurposes.get(activeSheet)) ?? 'info';
  const allowsEscapeDismiss = activeSheetPurpose !== 'required';
  const allowsLightDismiss = activeSheetPurpose === 'info';

  useLayoutEffect(() => {
    const previousActiveSheet = committedActiveSheetRef.current;
    if (previousActiveSheet === activeSheet) {
      return;
    }
    committedActiveSheetRef.current = activeSheet;
    const nextTransition = transitionForActiveSheetChange(
      previousActiveSheet,
      activeSheet,
    );
    setTransition(
      nextTransition.retainedSheet != null &&
        !sheetElementsRef.current.has(nextTransition.retainedSheet)
        ? IDLE_TRANSITION
        : nextTransition,
    );
  }, [activeSheet]);

  const dismissOnEscape = useCallback(() => {
    if (allowsEscapeDismiss) {
      onActiveSheetChange(null);
    }
  }, [allowsEscapeDismiss, onActiveSheetChange]);
  const dismissOnLightInteraction = useCallback(() => {
    if (allowsLightDismiss) {
      onActiveSheetChange(null);
    }
  }, [allowsLightDismiss, onActiveSheetChange]);
  // Focus containment is the native modal dialog's: showModal() makes the
  // page inert, so Tab cannot leave the active sheet. The released read-only
  // `hasActiveFocusTrapEscape()` signal still reports a modal flow as a trap,
  // as it did when a JavaScript trap backed it.
  useFocusTrapEscapeCompatibilitySignal(isModal);
  // One lock for the whole modal flow, as on a shared dialog: `isModal` stays
  // true through a handoff (two dialogs open) and through the exit motion, so
  // the shared counter is taken once and given back once.
  useScrollLock(isModal);
  const {shouldDismissOnCloseRequest} = useLayerDismissal({
    isActive: isFlowVisible,
    escapeBehavior: allowsEscapeDismiss ? 'close' : 'block',
    onDismiss: dismissOnEscape,
    getContainer: () => hostDialogRef.current,
    // A covered flow stands down from dismissal while a sheet covers it, so
    // Escape and the platform close request reach the top sheet; see the
    // standalone host.
    isPresent: () =>
      (hostDialogRef.current?.open ?? false) && !stackViewRef.current.isCovered,
  });

  // Point the consumer ref and the dismissal registration at the host dialog.
  // Sheet hosts register their dialogs during commit, so by the time this
  // layout effect runs the map already names the dialog for `hostSheet` --
  // and, in the first commit of a flow that mounts closed, the first
  // registered dialog before `sheetOrder` has caught up, so a parent's own
  // mount effects already find the ref resolved. The ref is attached the way
  // React attaches one: a callback ref's returned cleanup runs on detach, and
  // only a ref without one receives null. Attachment follows the resolved
  // element, not the render that resolved it: the re-render that catches
  // `sheetOrder` up resolves the same dialog and leaves the ref alone.
  const attachedRef = useRef<{
    ref: React.Ref<HTMLDialogElement> | undefined;
    host: HTMLDialogElement;
    detach: (() => void) | undefined;
  } | null>(null);
  useLayoutEffect(() => {
    const host =
      hostSheet == null
        ? (sheetDialogsRef.current.values().next().value ?? null)
        : (sheetDialogsRef.current.get(hostSheet) ?? null);
    const previousHost = hostDialogRef.current;
    hostDialogRef.current = host;
    if (host != null && host !== previousHost) {
      // The level's dialog changed on a handoff; the registry puts the
      // sheets above the flow back above its new dialog.
      notifyBottomSheetHostChanged(stackKeyRef.current);
    }
    const attached = attachedRef.current;
    if (attached?.host === host && attached.ref === ref) {
      return;
    }
    attached?.detach?.();
    if (host == null) {
      attachedRef.current = null;
      return;
    }
    const detach = mergeRefs(ref)(host);
    attachedRef.current = {
      ref,
      host,
      detach: typeof detach === 'function' ? detach : undefined,
    };
  }, [hostSheet, ref, sheetOrder]);
  useLayoutEffect(
    () => () => {
      hostDialogRef.current = null;
      attachedRef.current?.detach?.();
      attachedRef.current = null;
    },
    [],
  );

  // The flow's host dialog is an outlet for app-global surfaces (toasts)
  // while the flow is a modal one, as a standalone scrim sheet's dialog is
  // (`component:BottomSheet` FR13): every open scrim sheet supplies one, the
  // latest among sheets follows the stack, and a Dialog supplied later stays
  // above. The host changes on a handoff, so the supply follows `hostSheet`;
  // the retained step's dialog, inert and fading, is never the outlet. A
  // closing flow stops supplying at once, as a closing sheet does. Passive:
  // it runs after the layout effects that present the step dialogs.
  useModalOutlet(
    hostDialogRef,
    isModal && isFlowOpen,
    stackView.isTop || !stackView.isStacked,
    'bottom-sheet',
    hostSheet,
  );

  // Focus return is native per dialog: each showModal() records the focused
  // element and close() focuses it again. That serves a one-sheet flow, but
  // the second sheet of a flow records a control inside the first, which is
  // hidden by the time the flow ends, so the browser's return lands nowhere.
  // The flow therefore remembers its own opener -- the page element focused
  // before the first modal present -- and focuses it after the last dialog
  // closes. Sheet hosts ask before presenting modally, so the capture sees
  // the page element; hosts present in their own layout effects, which run
  // before the one below, so the restore follows the last dialog's close.
  const onBeforeSheetPresent = useCallback((sheetId: string) => {
    if (triggerRef.current == null) {
      triggerRef.current = document.activeElement as HTMLElement | null;
    }
    modalFlowRef.current = true;
    presentationCounterRef.current += 1;
    presentationOrderRef.current.set(sheetId, presentationCounterRef.current);
  }, []);
  useLayoutEffect(() => {
    if (isFlowVisible) {
      if (!hasScrim) {
        modalFlowRef.current = false;
      }
      return;
    }
    const left = leftStackRef.current;
    leftStackRef.current = null;
    if (modalFlowRef.current) {
      const depth = left?.depth ?? stackViewRef.current.depth;
      if (depth > 0) {
        // Closed from code beneath open sheets: focus stays in the sheet on
        // top; the flow's own close must not pull it back to the opener.
      } else if (left?.closingTogether) {
        // Closing together with the other sheets of its stack ("Close all"):
        // the registry returns focus once, after the last dialog has left.
        reportClosedTogether(stackKeyRef.current);
      } else {
        // With a sheet still open beneath the flow, focus returns into that
        // sheet: to the opener when it is there, else to the sheet's panel.
        // Otherwise, like the browser's own return on close(), without
        // scrolling: the page kept its scroll offset under the lock, and an
        // opener scrolled out of view must not drag the page back to itself.
        const revealed =
          left?.revealed ?? getBottomSheetBeneath(stackKeyRef.current);
        const trigger = triggerRef.current;
        if (
          revealed != null &&
          (trigger == null || !revealed.element.contains(trigger))
        ) {
          revealed.focus();
        } else {
          trigger?.focus({preventScroll: true});
        }
      }
    }
    triggerRef.current = null;
    modalFlowRef.current = false;
    presentationOrderRef.current.clear();
  }, [hasScrim, isFlowVisible]);

  // A scrim flow is one level of the bottom-sheet stack while it is visible.
  // The step hosts present their own dialogs; the registry re-presents the
  // level's dialog only to restore open order, moves focus into the active
  // panel when the flow lands on top, and reports the flow's view (top,
  // covered, depth, scrim ownership). Switching the step never
  // re-registers, so a switch in place keeps the flow's position.
  useLayoutEffect(() => {
    if (!isFlowVisible || !hasScrim) {
      return;
    }
    const key = stackKeyRef.current;
    const unregister = registerBottomSheet(
      {
        key,
        getElement: () => hostDialogRef.current,
        // The flow wrapper contains every step dialog, so it orders the flow
        // against sheets opened in the same commit whichever step is active.
        getTreeAnchor: () => flowRef.current,
        show: () => {
          const dialog = hostDialogRef.current;
          if (dialog == null || dialog.open) {
            return;
          }
          const hostId = [...sheetDialogsRef.current].find(
            ([, candidate]) => candidate === dialog,
          )?.[0];
          if (hostId != null) {
            onBeforeSheetPresent(hostId);
          }
          const ownsFlowScrim =
            hostId != null && hostId === scrimOwnerRef.current;
          const view = stackViewRef.current;
          if (ownsFlowScrim && (!view.isStacked || view.ownsScrim)) {
            dialog.style.setProperty(
              '--_sheet-scrim-opacity',
              String(scrimOpacityRef.current),
            );
            presentStepModally(dialog);
          } else {
            presentWithClearScrim(dialog);
          }
        },
        hide: () => closeDialogKeepingFocus(hostDialogRef.current),
        getReturnTarget: () => triggerRef.current,
        focus: reason => {
          const active = committedActiveSheetRef.current;
          const panel =
            active == null ? undefined : sheetElementsRef.current.get(active);
          focusSheetPanel(panel ?? null, reason, true);
        },
        onView: view => {
          const previous = stackViewRef.current;
          stackViewRef.current = view;
          setStackView(view);
          // A change of the stack's scrim owner lands with no fade on the
          // flow's own owner dialog; see writeScrimOpacity.
          const owner =
            scrimOwnerRef.current == null
              ? null
              : (sheetDialogsRef.current.get(scrimOwnerRef.current) ?? null);
          if (owner == null) {
            return;
          }
          const ownsNow = !view.isStacked || view.ownsScrim;
          const ownedBefore = !previous.isStacked || previous.ownsScrim;
          if (isFlowOpenRef.current && ownsNow !== ownedBefore) {
            writeScrimOpacity(
              owner,
              ownsNow && scrimOpacityRef.current > 0 ? '1' : '0',
              scrimWriteRef.current,
            );
          } else if (!isFlowOpenRef.current && view.isScrimTakenOver) {
            writeScrimOpacity(owner, '0', scrimWriteRef.current);
          }
        },
      },
      isFlowOpenRef.current,
    );
    return () => {
      // Read before the entry leaves: the focus-return effect runs after.
      leftStackRef.current = {
        depth: stackViewRef.current.depth,
        revealed: getBottomSheetBeneath(key),
        closingTogether: isClosingTogether(key),
      };
      unregister();
    };
  }, [hasScrim, isFlowVisible, onBeforeSheetPresent]);
  useLayoutEffect(() => {
    if (isFlowVisible && hasScrim) {
      setBottomSheetOpen(stackKeyRef.current, isFlowOpen);
    }
  }, [hasScrim, isFlowOpen, isFlowVisible]);
  // Closes a batch of same-commit opens; see sealBottomSheetBatch.
  useEffect(() => {
    sealBottomSheetBatch();
  });

  const getSheetPhase = useCallback(
    (sheetId: string): BottomSheetSwitcherPhase => {
      if (sheetId === activeSheet) {
        return sheetId === visibleTransition.enteringSheet
          ? 'entering'
          : 'active';
      }
      if (sheetId === visibleTransition.retainedSheet) {
        return visibleTransition.retainedPhase ?? 'hidden';
      }
      return 'hidden';
    },
    [activeSheet, visibleTransition],
  );

  const getSheetAlignmentOffset = useCallback(
    (sheetId: string) =>
      visibleTransition.retainedSheet === sheetId
        ? visibleTransition.alignmentOffset
        : 0,
    [visibleTransition],
  );

  const isScrimOwner = useCallback(
    (sheetId: string) => sheetId === scrimOwnerSheet,
    [scrimOwnerSheet],
  );

  const registerSheetElement = useCallback(
    (sheetId: string, element: HTMLElement | null) => {
      if (element == null) {
        sheetElementsRef.current.delete(sheetId);
        setUnmountedSheetIds(current => {
          if (current.has(sheetId)) {
            return current;
          }
          const next = new Set(current);
          next.add(sheetId);
          return next;
        });
        setTransition(current =>
          current.retainedSheet === sheetId ? IDLE_TRANSITION : current,
        );
      } else {
        sheetElementsRef.current.set(sheetId, element);
        setUnmountedSheetIds(current => {
          if (!current.has(sheetId)) {
            return current;
          }
          const next = new Set(current);
          next.delete(sheetId);
          return next;
        });
      }
    },
    [],
  );

  const registerSheetDialog = useCallback(
    (sheetId: string, dialog: HTMLDialogElement | null) => {
      if (dialog == null) {
        sheetDialogsRef.current.delete(sheetId);
        presentationOrderRef.current.delete(sheetId);
        setSheetOrder(current =>
          current.includes(sheetId)
            ? current.filter(id => id !== sheetId)
            : current,
        );
      } else {
        sheetDialogsRef.current.set(sheetId, dialog);
        setSheetOrder(current =>
          current.includes(sheetId) ? current : [...current, sheetId],
        );
      }
    },
    [],
  );

  const isCoveredInTopLayer = useCallback((sheetId: string) => {
    const order = presentationOrderRef.current;
    const own = order.get(sheetId);
    if (own == null) {
      return false;
    }
    for (const [otherId, stamp] of order) {
      if (
        otherId !== sheetId &&
        stamp > own &&
        sheetDialogsRef.current.get(otherId)?.open
      ) {
        return true;
      }
    }
    return false;
  }, []);

  const registerSheetPurpose = useCallback(
    (sheetId: string, purpose: DialogPurpose | null) => {
      setSheetPurposes(current => {
        if (purpose == null) {
          if (!current.has(sheetId)) {
            return current;
          }
          const next = new Map(current);
          next.delete(sheetId);
          return next;
        }
        if (current.get(sheetId) === purpose) {
          return current;
        }
        const next = new Map(current);
        next.set(sheetId, purpose);
        return next;
      });
    },
    [],
  );

  useLayoutEffect(() => {
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- clear a retained sheet after its panel unmounts
    setTransition(current =>
      current.retainedSheet != null &&
      unmountedSheetIds.has(current.retainedSheet)
        ? IDLE_TRANSITION
        : current,
    );
  }, [unmountedSheetIds]);

  const onSheetEnterStart = useCallback((sheetId: string) => {
    setTransition(current => {
      if (
        current.enteringSheet !== sheetId ||
        current.retainedSheet == null ||
        current.retainedPhase !== 'covered'
      ) {
        return current;
      }
      const alignmentOffset = alignmentOffsetForElements(
        sheetElementsRef.current.get(sheetId),
        sheetElementsRef.current.get(current.retainedSheet),
      );
      if (alignmentOffset <= ALIGNMENT_THRESHOLD_PX) {
        return current;
      }
      return {
        ...current,
        retainedPhase: 'aligning',
        alignmentOffset,
        isAlignmentComplete: false,
      };
    });
  }, []);

  const onSheetTransitionComplete = useCallback(
    ({sheetId, phase}: BottomSheetSwitcherTransitionEvent) => {
      setTransition(current => {
        if (phase === 'entering') {
          if (current.enteringSheet !== sheetId) {
            return current;
          }
          if (current.retainedSheet == null) {
            return IDLE_TRANSITION;
          }
          if (
            current.retainedPhase === 'aligning' &&
            !current.isAlignmentComplete
          ) {
            return {...current, enteringSheet: null};
          }
          return {
            ...current,
            enteringSheet: null,
            retainedPhase: 'fading',
          };
        }

        if (
          phase === 'aligning' &&
          current.retainedSheet === sheetId &&
          current.retainedPhase === 'aligning'
        ) {
          return current.enteringSheet == null
            ? {...current, retainedPhase: 'fading'}
            : {...current, isAlignmentComplete: true};
        }

        if (
          (phase === 'fading' || phase === 'exiting') &&
          current.retainedSheet === sheetId &&
          current.retainedPhase === phase
        ) {
          return IDLE_TRANSITION;
        }

        return current;
      });
    },
    [],
  );

  // One scrim for the flow. Only the owning dialog's backdrop carries the
  // current opacity; every other presented dialog keeps its backdrop clear.
  // When ownership moves — the retained dialog has faded and closes, or a
  // rapid replacement hides it — the new owner takes the value without a
  // fade, in the same layout pass that closes the old one.
  // A flow stacked above another sheet keeps every backdrop clear: the
  // stack's owner beneath dims the page (`flowOwnsStackScrim`).
  const applyScrimOpacity = useCallback(() => {
    const owner =
      scrimOwnerSheet == null
        ? null
        : (sheetDialogsRef.current.get(scrimOwnerSheet) ?? null);
    const value = flowOwnsStackScrim ? scrimOpacityRef.current : 0;
    // A fresh open keeps the backdrop's @starting-style fade; only a hand
    // from one presented dialog to another swaps without one.
    const ownerChanged =
      scrimOwnerRef.current != null &&
      scrimOwnerRef.current !== scrimOwnerSheet;
    scrimOwnerRef.current = scrimOwnerSheet;
    for (const [sheetId, dialog] of sheetDialogsRef.current) {
      if (dialog === owner) {
        if (ownerChanged && dialog.open) {
          takeOverScrim(dialog, value);
        } else {
          dialog.style.setProperty('--_sheet-scrim-opacity', String(value));
        }
      } else if (sheetId !== scrimOwnerSheet) {
        dialog.style.setProperty('--_sheet-scrim-opacity', '0');
      }
    }
  }, [flowOwnsStackScrim, scrimOwnerSheet]);
  const onSheetScrimOpacityChange = useCallback(
    (sheetId: string, opacity: number) => {
      // A pointer captured by the outgoing sheet can keep delivering gesture
      // events after a handoff. Only the currently committed sheet owns the
      // flow's scrim value, so stale gesture updates must not reach it.
      if (sheetId !== committedActiveSheetRef.current) {
        return;
      }
      scrimOpacityRef.current = opacity;
      applyScrimOpacity();
    },
    [applyScrimOpacity],
  );

  // A committed selection resets the flow's scrim value -- 1 while a sheet
  // is active, 0 for the exit fade -- and writes it to the owning backdrop in
  // the same effect; a gesture then adjusts the value through
  // `onSheetScrimOpacityChange` until the next selection.
  useLayoutEffect(() => {
    scrimOpacityRef.current = activeSheet == null ? 0 : 1;
    applyScrimOpacity();
  }, [applyScrimOpacity, activeSheet, hasScrim, isFlowVisible]);

  // A `cancel` that bubbles up from inside a step is not a close request for
  // the flow: a file input fires one when its picker is dismissed, and it
  // reaches the step's dialog. Only a `cancel` fired at a sheet dialog itself
  // dismisses; the bubbled one is left alone.
  const handleCancel = useCallback(
    (event: SyntheticEvent<HTMLDialogElement>) => {
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
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDialogElement>) => {
      // A consumer may stop propagation without claiming Escape. Route that
      // unprevented press now so the shared stack still chooses the top layer;
      // its preventDefault marker makes the document listener a no-op if the
      // event does continue bubbling.
      dispatchLayerEscapeKeyDown(event.nativeEvent);
    },
    [],
  );
  const handleClick = useCallback(
    (event: ReactMouseEvent<HTMLDialogElement>) => {
      // A `::backdrop` click targets its dialog element. Only the active
      // sheet's backdrop is the flow's scrim; a retained dialog is inert and
      // a hidden one closed, so neither can be clicked, but be explicit.
      if (
        hasScrim &&
        event.target === event.currentTarget &&
        event.currentTarget === hostDialogRef.current
      ) {
        dismissOnLightInteraction();
      }
    },
    [dismissOnLightInteraction, hasScrim],
  );
  const onDialogCancel = useMemo(
    () => composeEventHandlers(onCancel, handleCancel),
    [handleCancel, onCancel],
  );
  const onDialogClick = useMemo(
    () => composeEventHandlers(onClick, handleClick),
    [handleClick, onClick],
  );
  const onDialogKeyDown = useMemo(
    () => composeEventHandlers(onKeyDown, handleKeyDown),
    [handleKeyDown, onKeyDown],
  );

  const contextValue = useMemo<BottomSheetSwitcherContextValue>(
    () => ({
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
    }),
    [
      activeSheet,
      dialogProps,
      getSheetAlignmentOffset,
      getSheetPhase,
      hasScrim,
      hostSheet,
      isCoveredInTopLayer,
      isFlowClosing,
      isScrimOwner,
      onActiveSheetChange,
      onBeforeSheetPresent,
      onDialogCancel,
      onDialogClick,
      onDialogKeyDown,
      onSheetEnterStart,
      onSheetScrimOpacityChange,
      onSheetTransitionComplete,
      registerSheetDialog,
      registerSheetElement,
      registerSheetPurpose,
      stackView,
    ],
  );

  return (
    <BottomSheetSwitcherContext value={contextValue}>
      <div
        ref={flowRef}
        {...stylex.props(
          styles.flow,
          !hasScrim && isFlowVisible && styles.flowNonModal,
        )}>
        {children}
      </div>
    </BottomSheetSwitcherContext>
  );
}

BottomSheetSwitcher.displayName = 'BottomSheetSwitcher';
