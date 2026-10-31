// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSheetGestures.ts
 * @input Uses React (useCallback, useEffect, useMemo, useRef, useState) and
 *   the gesture system's recognizers (../gestures)
 * @output Exports useSheetGestures hook and its option/result types
 * @position Internal to BottomSheet; not exported from the core entry point
 *
 * Drag + snap machinery for the bottom sheet. Tracks a pointer drag down the
 * block axis, moves the sliding surface live, and on release does what
 * UISheetPresentationController does (sheetRelease.ts): it settles on the
 * position nearest where the release projects at the finger's velocity, the
 * dismissed position counting as one, on UIKit's release spring handed that
 * velocity. A slow drag projects onto itself and places; a throw continues
 * past the finger. This is the core behavior split the sheet needs: DRAG
 * places, SWIPE closes.
 *
 * A settled detent is split across two properties: `settledLayoutOffset` is
 * the part the scrolling area gives up as layout height, and the remainder is
 * a transform. Gestures and snaps only ever move the transform, so they stay
 * on the compositor; layout height changes at rest, in one transition-free
 * render whose visible geometry is identical. A peek detent — a stop that is
 * only a sliver of the sheet — keeps the full height and slides below the
 * viewport instead of reflowing to that sliver.
 *
 * The host owns the element's `transform` and writes the resting value after
 * each commit. A gesture moves the sheet on the separate `translate` channel,
 * relative to that resting transform, through the motion foundation's
 * animator: a drag sets it once per input sample and renders nothing (React
 * state changes when the drag begins and ends, and in between only when the
 * layout split changes: a drag that crosses above its base detent restores
 * the full height), and the release springs it on the compositor, as Web
 * Animations baked from the spring, so the settle keeps its pace while the
 * main thread is busy. A finger landing on a settling sheet catches it where
 * the curve says it is. When the settle lands, the host writes the new
 * resting transform and `translate` returns to zero in the same commit as
 * the layout reconcile. The live offset is readable through
 * `activeOffsetRef`. Under the pointer presentation the release keeps the
 * theme's duration and easing instead of UIKit's springs (releaseMotion.ts),
 * on the same channel. Under a finger the host also presents and dismisses the sheet on
 * that channel (`present` / `dismiss`): UIKit's sheet spring from below the
 * screen and back, the dim on the same spring's progress; under reduced
 * motion a fade in place (design:reduced-motion).
 *
 * Those are pixels, and the stops behind them are relative to the viewport, so
 * a sheet at rest re-resolves its detent on `resize` / `orientationchange`,
 * and whenever the host swaps the snap points, and re-anchors to the new
 * geometry without animating. The detent it returns to is tracked by index:
 * the pixels stop meaning the same thing when the viewport changes, the stop
 * the user chose does not.
 *
 * Every drag runs on the gesture system's recognizers (../gestures), which
 * attach for every pointer (spec:AST-094 FR19) and report UIKit's numbers: a
 * pan's translation from where it began, past its 10 px threshold (FR17),
 * and its velocity, UIKit's filter over the events' own timestamps
 * (spec:AST-100 FR4). A finger's or a pen's drag where the primary pointer
 * is coarse tracks 1:1 and settles on UIKit's springs; a mouse anywhere, and
 * a pen or a finger where the primary pointer is fine, keep the pointer
 * presentation's tracking (the detent magnet, the stretch past the top) and
 * the theme's release timing (FR13, spec:AST-017 FR59). Every release decides
 * by FR36's rule: the travel so far plus the release velocity's projection,
 * against the commit point. A vertical pan on the handle; on the scrolling body, a
 * downward pan that begins only when nothing under the finger can scroll up
 * (`scrollEdge`, the scrollers nested in the body included), and an upward
 * one that does so at the bottom while a taller detent exists. At that edge a
 * pull away from it is the sheet's from its first move: the moves the browser
 * would rubber-band are held before the pan begins at its 10 px, so a slow
 * pull moves the sheet as on iOS; a real scroll is never held (spec:AST-094
 * FR19, DEC-18). Who gets a
 * drag is decided once, when it begins (spec:AST-094 FR14): content scrolled
 * to its end mid-gesture keeps the drag and rubber-bands, and the sheet grows
 * only from a drag that begins at the edge. The host derives each surface's
 * `touch-action`.
 *
 * A drag begins on one finger. With a second finger down before it begins,
 * wherever that one landed, the fingers are a pinch, and pinch-zoom belongs
 * to the browser (WCAG 1.4.4): the sheet's pans give up and it holds its
 * detent while the page zooms. A drag that has begun keeps its finger when
 * another lands, neither cancelled nor redirected (spec:AST-094 FR10).
 * Losing window focus or hiding the page cancels a drag in flight, back to
 * the detent.
 *
 * A finger landing on a settling sheet catches it at the touch, where it is
 * drawn: a watcher (a long press of no duration that never claims) reports
 * the touch-down and the lift, and on iOS WebKit, which hit-tests a moving
 * element where its animation started, the host sends the touch to where the
 * sheet is drawn.
 *
 * Kept private to BottomSheet: a dismiss edge + detents on a bottom-anchored
 * surface are inherently sheet concepts. It is not a general primitive and is
 * intentionally not exported.
 *
 * SSR-safe: no window/document access at module scope; all measurement
 * happens inside handlers. Under prefers-reduced-motion every release and
 * spring-back follows design:reduced-motion: the animator's own cross-fade
 * replaces the travel (opacity only, 200 ms or less after a touch release or
 * on a touch screen; at once with a mouse).
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/BottomSheet/useSheetGestures.test.ts
 * - /packages/core/src/BottomSheet/sheetRelease.ts
 * - /packages/core/src/BottomSheet/releaseMotion.ts
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type UIEvent as ReactUIEvent,
} from 'react';
import {getGestureHost} from '../gestures/GestureHost';
import type {GestureRecognizer} from '../gestures/GestureRecognizer';
import {LongPressGestureRecognizer} from '../gestures/LongPressGestureRecognizer';
import {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
import type {GestureTouch, PointerKind} from '../gestures/types';
import {useGestureRecognizer} from '../gestures/useGestureRecognizer';
import {playHaptic} from '../gestures/haptics';
import {readTouchPresentation} from './sheetTouch';
import {lockSheetSelection} from './sheetSelectionLock';
import {
  createAnimator,
  type Animator,
  type MotionHandle,
} from '../motion/animator';
import {rubberBand} from '../motion/rubberBand';
import type {SpringDescription} from '../motion/spring';
import {sheet as sheetTable} from '../motion/uikit/sheet';
import {
  SHEET_DETENT_SPRING,
  SHEET_DISMISS_SPRING,
  SHEET_PRESENT_SPRING,
} from '../motion/uikit/springs';
import {
  createInteractiveTransition,
  type MapLayer,
  type ReleaseRule,
} from '../motion/interactive';
import {readReleaseMotion, type ReleaseMotion} from './releaseMotion';
import {limitOvershoot, sheetReleaseRule} from './sheetRelease';
import {
  computeDetentOffsets,
  peekOffsetFor,
  scrimOpacityForOffset,
} from './snapOffsets';

/**
 * The stops a sheet of a given height rests at: offsets from fully-open in px,
 * ascending, plus which of them (if any) is the peek.
 */
interface SheetDetents {
  offsets: number[];
  peekOffset: number | null;
}

// The sheet's moves run on the interactive-transition driver
// (motion/interactive.ts): its travel channel drives, and the dim on the
// dialog's ::backdrop is a layer mapped from it. The sheet decides its own
// targets (sheetRelease.ts) and plays them with `to`, so the driver's own
// release rule is never consulted.
const settleOnly: ReleaseRule<'settle'> = ({position}) => ({
  target: position,
  motion: SHEET_DETENT_SPRING,
  outcome: 'settle',
});

/** The handle of a move the driver settled at once, playing nothing. */
function settledHandle(finished: Promise<boolean>): MotionHandle {
  const handle: MotionHandle = {
    properties: [],
    finished,
    started: Promise.resolve(performance.now()),
    value: () => 0,
    velocity: () => 0,
    // It played nothing: no curve for a companion to follow.
    curve: () => null,
    retarget: () => handle,
    stop: () => {},
  };
  return handle;
}

// Gone: the sheet's top at the bottom of the screen. A release under a finger
// can carry the sheet there (sheetRelease.ts).
function dismissedOffsetFor(
  maxOffset: number,
  shortestDetentHeight: number,
): number {
  return maxOffset + shortestDetentHeight;
}
// Where the scrim reaches clear: gone, under every pointer. UIKit's dim is
// linear from the shortest detent to the dismissed position, and one release
// rule decides every drag (spec:AST-094 FR36), so a dim that cleared sooner
// would let a sheet spring back under a clear backdrop.
function scrimClearOffset(
  maxOffset: number,
  shortestDetentHeight: number,
): number {
  return dismissedOffsetFor(maxOffset, shortestDetentHeight);
}
// The pointer presentation's drag (a mouse anywhere, and anything where the
// primary pointer is fine) keeps the sheet's pointer tracking (spec:AST-094
// FR13, spec:AST-017 FR59): within this many px of a detent the live drag
// eases toward it, so it "clicks" into place instead of hovering just off the
// mark. Under UIKit's presentation the sheet tracks 1:1, as UIKit's does.
const MAGNET_RANGE = 40;
// Rubber-band factor for the pointer presentation's drag up past fully open.
// Under UIKit's
// presentation the stretch is UIKit's rubber band instead (spec:AST-094 FR3).
const OVERSCROLL_RESISTANCE = 0.35;
// How far any drag may lift the sheet past fully open: the bottom padding the
// sheet reserves for the lift to reveal.
// SYNC: must match OVERSCROLL_PADDING in BottomSheetPanel.tsx.
const OVERSCROLL_MAX = 48;

// Pull a value toward the nearest of `targets` when within MAGNET_RANGE,
// easing the last stretch so the surface settles crisply onto a detent while
// dragging.
function magnetize(value: number, targets: ReadonlyArray<number>): number {
  let nearestTarget = targets[0];
  let nearestDist = Math.abs(value - nearestTarget);
  for (const target of targets) {
    const distance = Math.abs(value - target);
    if (distance < nearestDist) {
      nearestDist = distance;
      nearestTarget = target;
    }
  }
  if (nearestDist >= MAGNET_RANGE) {
    return value;
  }
  // Ease-in over the range: the pull grows as the drag nears the detent
  // (t^2), so it feels magnetic close by without fighting a drag-through.
  const t = nearestDist / MAGNET_RANGE;
  const pull = 1 - t * t;
  return value + (nearestTarget - value) * pull;
}

// The live offset for a mouse or pen drag at `raw` (spec:AST-017 FR59): a
// damped, capped stretch up past fully open, 1:1 in the dismiss zone,
// magnetic between detents.
function pointerDragOffset(
  raw: number,
  offsets: ReadonlyArray<number>,
): number {
  if (raw < 0) {
    return Math.max(-OVERSCROLL_MAX, raw * OVERSCROLL_RESISTANCE);
  }
  if (raw > offsets[offsets.length - 1]) {
    return raw;
  }
  return magnetize(raw, offsets);
}

// The live offset for a finger's drag at `raw`: 1:1 between detents and into
// the dismiss zone, as UIKit's sheet tracks (the release picks the detent),
// and past fully open UIKit's rubber band over the sheet's height
// (spec:AST-094 FR3), no farther than the reserve.
function fingerDragOffset(raw: number, height: number): number {
  if (raw >= 0) {
    return raw;
  }
  return Math.max(
    -OVERSCROLL_MAX,
    rubberBand(raw, height, sheetTable.rubberBand.coefficient),
  );
}

function preservationInsetForOffset(
  baseOffset: number,
  targetOffset: number,
  naturalEndGap: number,
): number {
  return Math.max(0, baseOffset - targetOffset - naturalEndGap);
}

function renderedBlockEndPadding(element: HTMLElement): number {
  const value = Number.parseFloat(getComputedStyle(element).paddingBlockEnd);
  return Number.isFinite(value) ? value : 0;
}

// How much further the body could scroll on its own, ignoring the padding the
// hook adds to preserve scroll position across a height change.
function naturalEndGapFor(body: HTMLElement | null): number {
  if (!body) {
    return 0;
  }
  const renderedInset = renderedBlockEndPadding(body);
  const naturalMaxScrollTop = Math.max(
    0,
    body.scrollHeight - body.clientHeight - renderedInset,
  );
  return naturalMaxScrollTop - body.scrollTop;
}

function visibleHeightForOffset(
  sheetHeight: number,
  offset: number,
  offscreenBlockEndInset: number,
): number {
  return Math.max(0, sheetHeight - offscreenBlockEndInset - offset);
}

export interface UseSheetGesturesOptions {
  /** Whether the owning sheet is open. Drag state resets when it closes. */
  isOpen: boolean;
  /**
   * The host's controlled answer to the last close request: false once the
   * host has taken a dismissal (its own state says closed, even while the
   * sheet still animates out), true while it is open or has refused one.
   * Settles whether a release's dismissal was honored. Defaults to `isOpen`.
   */
  isOpenRequested?: boolean;
  /**
   * Whether a downward swipe may dismiss the sheet. When false, a gesture
   * past the dismiss threshold settles at the shortest detent instead.
   * @default true
   */
  canDismiss?: boolean;
  /**
   * Portion of the measured sheet border box reserved below the viewport.
   * Excluded from detent heights so a 50vh snap has 50vh of visible sheet.
   * @default 0
   */
  offscreenBlockEndInset?: number;
  /** Called on a swipe-to-close (fast downward flick, or drag past the floor). */
  onDismiss: () => void;
  /**
   * Resolver for candidate visible detent heights in px below the fully open
   * visible height. Called at the start of each drag, and again whenever the
   * viewport changes while the sheet rests, so the detents track the window
   * (rotation, a resized desktop window, collapsing browser chrome). The fully
   * open height is always the tallest detent. Omit for a single-height sheet
   * (a drag then only dismisses or springs back).
   *
   * Keep the identity stable: a new function is read as new stops, and
   * re-anchors a resting sheet to them.
   */
  snapHeights?: () => number[];
  /** Notified when the settled visible detent height (px) changes. */
  onSnap?: (heightPx: number) => void;
  /**
   * Called with the scrim opacity the sheet should show (1 = fully visible,
   * 0 = hidden) as the drag moves and on settle. Full at the shortest working
   * detent and above; below it, linear in the sheet's position to 0 at the
   * dismissed position (UIKit's dim), or to a faint glance state at a "peek"
   * detent. Lets the owner mirror it onto the scrim.
   */
  onScrimOpacity?: (opacity: number) => void;
  /**
   * Given by a host whose scrim is a modal dialog's `::backdrop`. While true,
   * the dim follows the sheet with no easing of its own: a gesture writes it
   * at once, and a release plays it on the compositor in lockstep with the
   * sheet. False hands it back, at the value last written.
   */
  onScrimTracking?: (tracking: boolean) => void;
  /**
   * Given with `onScrimTracking`: whether the dialog's `::backdrop` is the
   * visible scrim at this moment. A stack shows one backdrop: a sheet stacked
   * above another keeps a transparent one, and a sheet whose scrim another
   * took over drops it, so neither plays the dim there. Omitted: always.
   */
  isScrimShown?: () => boolean;
  /**
   * True while the sheet presents under a finger (`present`), false once it
   * lands. UIKit drops every touch that begins during a sheet's presentation,
   * for its whole life (F4 b59): the host holds input meanwhile.
   */
  onPresentingChange?: (presenting: boolean) => void;
}

export interface SheetContentProps {
  style: CSSProperties;
}

export interface SheetHandleProps {
  ref: (node: HTMLElement | null) => void;
  style: CSSProperties;
  onContextMenu: (event: ReactMouseEvent) => void;
  /** Keeps the focus where it is: the handle has no native focus action. */
  onPointerDown: (event: ReactPointerEvent) => void;
}

export interface SheetBodyProps {
  ref: (node: HTMLElement | null) => void;
  onContextMenu: (event: ReactMouseEvent) => void;
  onScroll: (event: ReactUIEvent<HTMLElement>) => void;
}

/**
 * A drag-dismissed sheet on its way off screen. The release spring carries it
 * on the travel channel at the finger's velocity, so the host keeps
 * `transform` as given (the resting value, which also holds off a stylesheet
 * exit transform) and ends its exit when `finished` settles.
 */
export interface SheetGestureExit {
  finished: Promise<boolean>;
  transform: string;
}

export interface UseSheetGesturesResult {
  /**
   * Callback ref for the sheet surface. The hook observes it (ResizeObserver)
   * to keep the fully-open height current, so detents stay correct across
   * rotation / viewport changes without re-measuring mid-drag.
   */
  sheetRef: (node: HTMLElement | null) => void;
  /** Spread on the sliding surface: the resting transform, and `touch-action` (no page pan from it; pinch-zoom stays the browser's). */
  contentProps: SheetContentProps;
  /** Spread on the grab-handle element: its ref (the handle's pan attaches to it). */
  handleProps: SheetHandleProps;
  /**
   * Spread on the scrollable body. A pull at a scroll edge starts a sheet drag
   * (a larger, more forgiving target when the content isn't itself
   * scrolling); normal scrolling passes through untouched.
   */
  bodyProps: SheetBodyProps;
  /**
   * The body element `bodyProps.ref` is attached to. The hook tracks the node
   * anyway (its pans attach to it), so a host that also needs the element
   * reads it here rather than wrapping `bodyProps.ref` in a second callback
   * ref.
   */
  bodyElementRef: RefObject<HTMLElement | null>;
  /**
   * The drag offset the host last had to render against, in px (0 = fully
   * expanded, larger = collapsed): seeded when a drag begins and refreshed
   * when its layout split changes. Not the live position; see
   * `activeOffsetRef`.
   */
  dragOffset: number;
  /** Translate of the resting detent in px (0 = tallest detent). */
  settledOffset: number;
  /** Whether a drag is currently in progress. */
  isDragging: boolean;
  /** Whether the drag in progress has moved the sheet off its base detent. */
  isTraveling: boolean;
  /**
   * Whether the sheet's current dismissal was started by the release of a
   * touch drag (a finger's swipe or fling past the dismiss line). True from
   * the release until the sheet is open again; false for a dismissal from a
   * control, Escape, the scrim or code, and for a mouse or pen drag. Under
   * reduced motion a transition a touch drag's release starts cross-fades on
   * every pointer (`design:reduced-motion` DR2), so the exit's motion needs
   * to know.
   */
  isDismissedByTouchDrag: boolean;
  /**
   * The sheet's offset right now, in px: the settled detent at rest, the live
   * position during a drag. Written per input sample without a render; read
   * it where the live number is needed without subscribing to it.
   */
  activeOffsetRef: RefObject<number>;
  /** Measured height of the fully expanded sheet. */
  sheetHeight: number;
  /** End padding that preserves the scroll position across height changes. */
  scrollPreservationInset: number;
  /**
   * Layout offset retained while a release spring runs; null at rest. The
   * host leaves the resting transform alone until it clears.
   */
  settlingLayoutOffset: number | null;
  /**
   * Reconciles the final layout once a release spring lands. The hook calls
   * it itself when the spring's curve ends (a timer on the curve's length,
   * not an animation event, so it lands with animations disabled too).
   */
  completeScrollAreaSettle: () => void;
  /**
   * Set while a drag-dismissed sheet is carried off screen by its release
   * spring; null otherwise.
   */
  gestureExitRef: RefObject<SheetGestureExit | null>;
  /**
   * Call right after writing a resting transform to the sheet: folds the
   * gesture's travel into it. A no-op while travel is animating.
   */
  resetTravel: () => void;
  /**
   * Presents the sheet the way UIKit does under a finger: from below the
   * screen to its detent on `SHEET_PRESENT_SPRING`, the dim on the same
   * curve (under reduced motion, a fade in place). Call from an effect
   * as the sheet opens, before its dialog is shown (a child's effect runs
   * before its host's): the dim is taken over at once, and the travel starts
   * in a microtask, once every effect has run and the dialog has laid out.
   * False under a mouse, whose entrance stays the stylesheet's.
   */
  present: () => boolean;
  /**
   * Calls `callback` once the entrance `present` started has landed or
   * ended, at once when none is running; returns its cancel. A sheet that
   * replaces another under a finger arrives on the present spring, and the
   * handoff waits for it here before the replaced sheet fades.
   */
  afterEntrance: (callback: () => void) => () => void;
  /**
   * Dismisses the sheet the way UIKit does under a finger: off screen on
   * `SHEET_DISMISS_SPRING`, the dim on the same curve. During the entrance it
   * waits for the sheet to land, then runs from the detent, as UIKit queues
   * it. Sets and returns `gestureExitRef`'s exit for the host to wait on;
   * null under a mouse.
   */
  dismiss: () => SheetGestureExit | null;
  /**
   * How much of `settledOffset` is expressed as layout height rather than as a
   * transform. Equals `settledOffset` at the resizing detents; 0 at fully open
   * and at the peek, which keep the sheet's full height (see peekOffsetFor).
   */
  settledLayoutOffset: number;
}

/**
 * Drag + snap machinery for the bottom sheet. Returns props to spread on the
 * grab handle and the sliding surface, plus live drag state. A slow drag
 * settles to the nearest detent; a fast downward flick dismisses; a fast
 * upward flick expands to the tallest detent.
 *
 * @example
 * ```
 * const {contentProps, handleProps} = useSheetGestures({
 *   isOpen,
 *   onDismiss: () => onOpenChange(false),
 *   snapHeights: () => [240, 0.5 * (window.visualViewport?.height ?? 0)],
 * });
 * <div {...contentProps}>
 *   <div {...handleProps} />
 *   {children}
 * </div>
 * ```
 */
export function useSheetGestures({
  isOpen,
  isOpenRequested = isOpen,
  canDismiss = true,
  offscreenBlockEndInset = 0,
  onDismiss,
  snapHeights,
  onSnap,
  onScrimOpacity,
  onScrimTracking,
  isScrimShown,
  onPresentingChange,
}: UseSheetGesturesOptions): UseSheetGesturesResult {
  const [dragOffset, setDragOffset] = useState(0);
  const [settledOffset, setSettledOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  // Scoped to the one close the release requested. The release calls
  // onDismiss() and sets `pending`; the host answers in the same update, so
  // the first render afterwards says whether it took the close (its
  // controlled state now says closed: the exit under way is the drag's) or
  // refused it (a guarded onOpenChange left it open: the sheet snaps back and
  // the request is spent). Either way the flag is settled during render, the
  // prev-prop pattern, and derived back to false once the sheet is open
  // again — so a later close from a control, Escape or code is never
  // mistaken for a drag.
  const [touchDragDismissal, setTouchDragDismissal] = useState<{
    isTouch: boolean;
    pending: boolean;
  } | null>(null);
  if (touchDragDismissal != null) {
    if (touchDragDismissal.pending) {
      setTouchDragDismissal(
        isOpenRequested
          ? null
          : {isTouch: touchDragDismissal.isTouch, pending: false},
      );
    } else if (isOpenRequested) {
      setTouchDragDismissal(null);
    }
  }
  const isDismissedByTouchDrag =
    touchDragDismissal != null &&
    !touchDragDismissal.pending &&
    touchDragDismissal.isTouch &&
    !isOpenRequested;
  // Whether the drag in flight has moved the sheet off its base detent. One
  // state change per drag, for hosts that react to travel beginning.
  const [isTraveling, setIsTraveling] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [scrollPreservationInset, setScrollPreservationInset] = useState(0);
  // How much of the settled travel is expressed as layout height. Equal to
  // settledOffset for the resizing detents, and 0 at fully open and at the
  // peek (see peekOffsetFor), which keep the full height and use a transform.
  const [settledLayoutOffset, setSettledLayoutOffset] = useState(0);
  const settledLayoutOffsetRef = useRef(0);
  // WHICH detent the sheet rests on, as an index into the resolved list. The
  // offsets themselves are pixels derived from the viewport, so they stop
  // meaning the same thing the moment the viewport changes; the index survives
  // that and lets a resize re-resolve the same stop against the new geometry.
  const settledDetentIndexRef = useRef(0);
  const [settlingLayoutOffset, setSettlingLayoutOffset] = useState<
    number | null
  >(null);
  const [isScrollAreaReconciling, setIsScrollAreaReconciling] = useState(false);
  const scrollPreservationInsetRef = useRef(0);
  const settlingLayoutOffsetRef = useRef<number | null>(null);
  const pendingScrollPreservationInsetRef = useRef<number | null>(null);
  const offscreenBlockEndInsetRef = useRef(offscreenBlockEndInset);
  offscreenBlockEndInsetRef.current = Math.max(0, offscreenBlockEndInset);
  const recordSettledLayoutOffset = useCallback((offset: number) => {
    const normalizedOffset = Math.max(0, offset);
    settledLayoutOffsetRef.current = normalizedOffset;
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- layout offset is recorded from measurement effects
    setSettledLayoutOffset(normalizedOffset);
  }, []);
  const updateScrollPreservationInset = useCallback((nextInset: number) => {
    const normalizedInset = Math.max(0, nextInset);
    const hasChanged =
      Math.abs(normalizedInset - scrollPreservationInsetRef.current) > 0.5;
    if (!hasChanged) {
      return;
    }
    scrollPreservationInsetRef.current = normalizedInset;
    setScrollPreservationInset(normalizedInset);
  }, []);
  const completeScrollAreaSettle = useCallback(() => {
    // Resetting the transform at the same time as the final height swap must
    // not start a second transition. The layouts have identical visible
    // geometry, so reconcile them with transitions disabled for one frame.
    setIsScrollAreaReconciling(true);
    settlingLayoutOffsetRef.current = null;
    setSettlingLayoutOffset(null);
    const pendingInset = pendingScrollPreservationInsetRef.current;
    pendingScrollPreservationInsetRef.current = null;
    if (pendingInset != null) {
      updateScrollPreservationInset(pendingInset);
    }
  }, [updateScrollPreservationInset]);
  const prepareScrollAreaSettle = useCallback(
    (
      baseLayoutOffset: number,
      targetOffset: number,
      targetLayoutOffset: number,
      renderedOffset: number,
      layoutOffset: number,
      naturalEndGap: number,
      shouldAnimate: boolean,
    ) => {
      const targetInset = preservationInsetForOffset(
        baseLayoutOffset,
        targetLayoutOffset,
        naturalEndGap,
      );
      if (shouldAnimate && Math.abs(renderedOffset - targetOffset) > 0.5) {
        pendingScrollPreservationInsetRef.current = targetInset;
        settlingLayoutOffsetRef.current = layoutOffset;
        setSettlingLayoutOffset(layoutOffset);
        return;
      }
      pendingScrollPreservationInsetRef.current = null;
      settlingLayoutOffsetRef.current = null;
      setSettlingLayoutOffset(null);
      // Released on the detent, so there is no travel left to animate — but
      // the layout split may still differ from the one the drag rendered
      // with (a drag that ends exactly on a detent). Swapping
      // height for transform is only invisible while transitions are off:
      // with them live, the composited transform would animate the whole
      // swap while the layout height jumped, throwing the sheet the wrong
      // way. Reconcile in one transition-free frame instead.
      setIsScrollAreaReconciling(
        Math.abs(layoutOffset - targetLayoutOffset) > 0.5,
      );
      updateScrollPreservationInset(targetInset);
    },
    [updateScrollPreservationInset],
  );
  // The sheet's offset right now: the settled detent at rest, the live drag
  // position while dragging (written by the move handler, not by a render, so
  // a render in the middle of a drag must not overwrite it).
  const activeOffsetRef = useRef(0);
  if (!isDragging) {
    activeOffsetRef.current = settledOffset;
  }
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  // The resolver is refreshed during render, not with the callbacks below: the
  // layout effect that re-anchors on a change to it runs BEFORE passive
  // effects, so a resolver parked in one would still be the previous set of
  // stops by the time the re-anchor read it.
  const snapHeightsRef = useRef(snapHeights);
  snapHeightsRef.current = snapHeights;

  const onDismissRef = useRef(onDismiss);
  const canDismissRef = useRef(canDismiss);
  const onSnapRef = useRef(onSnap);
  const onScrimOpacityRef = useRef(onScrimOpacity);
  const onScrimTrackingRef = useRef(onScrimTracking);
  const isScrimShownRef = useRef(isScrimShown);
  const onPresentingChangeRef = useRef(onPresentingChange);
  useEffect(() => {
    onDismissRef.current = onDismiss;
    canDismissRef.current = canDismiss;
    onSnapRef.current = onSnap;
    onScrimOpacityRef.current = onScrimOpacity;
    onScrimTrackingRef.current = onScrimTracking;
    isScrimShownRef.current = isScrimShown;
    onPresentingChangeRef.current = onPresentingChange;
  });

  // The scrim, while a gesture or its release moves it (`onScrimTracking`):
  // the release plays the dim on the dialog's ::backdrop with the same clock
  // as the sheet, each frame's value read from where the sheet is on its
  // curve, as UIKit recomputes its dim from position every frame.
  const scrimAnimatorRef = useRef<Animator | null>(null);
  const isScrimTrackingRef = useRef(false);
  // Whether the dim playing is a release's, which a close takes back.
  const scrimOwnerRef = useRef<'release' | null>(null);
  // Stops a release's dim where it is, and says where that was.
  const stopScrimFollow = useCallback((): number | null => {
    const scrim = scrimAnimatorRef.current;
    if (scrim == null) {
      return null;
    }
    const current = scrim.get('opacity');
    scrim.dispose();
    scrimAnimatorRef.current = null;
    return current;
  }, []);
  // A gesture takes the dim: a release's dim still playing is picked up
  // where it is, and the host stops easing it. Only under a finger (every
  // touch device: one touch model), whose dimming view follows the sheet frame
  // by frame; under a mouse the host keeps easing the dim toward each value,
  // as today.
  const beginScrimTracking = useCallback(() => {
    if (!readTouchPresentation().isTouch) {
      return;
    }
    scrimOwnerRef.current = null;
    const current = stopScrimFollow();
    if (current != null) {
      onScrimOpacityRef.current?.(current);
    }
    if (!isScrimTrackingRef.current && onScrimTrackingRef.current != null) {
      isScrimTrackingRef.current = true;
      onScrimTrackingRef.current(true);
    }
  }, [stopScrimFollow]);
  // The motion is over: the host gets the dim back at its final value.
  const endScrimTracking = useCallback(
    (dim: number) => {
      scrimOwnerRef.current = null;
      stopScrimFollow();
      onScrimOpacityRef.current?.(dim);
      if (isScrimTrackingRef.current) {
        isScrimTrackingRef.current = false;
        onScrimTrackingRef.current?.(false);
      }
    },
    [stopScrimFollow],
  );
  // The sheet is closing: the host gets the dim back as it is, unpinned, so
  // its own close fade runs; nothing is written over it.
  const releaseScrimTracking = useCallback(() => {
    scrimOwnerRef.current = null;
    stopScrimFollow();
    if (isScrimTrackingRef.current) {
      isScrimTrackingRef.current = false;
      onScrimTrackingRef.current?.(false);
    }
  }, [stopScrimFollow]);
  // The dim's own animator on the dialog's ::backdrop, for a release or a
  // presentation to play the dim on as a layer of the sheet's travel (the
  // interactive-transition driver): only while the dim is tracked, and a
  // fresh one each time, so a release's dim never outlives its run.
  const scrimLayerAnimator = useCallback((): Animator | null => {
    const dialog = sheetElRef.current?.closest('dialog');
    // Only on the stack's visible backdrop: a transparent one stays clear.
    if (
      !isScrimTrackingRef.current ||
      dialog == null ||
      isScrimShownRef.current?.() === false
    ) {
      return null;
    }
    stopScrimFollow();
    const scrim = createAnimator(dialog, {pseudoElement: '::backdrop'});
    scrimAnimatorRef.current = scrim;
    return scrim;
  }, [stopScrimFollow]);
  // The dim map of the last release, for a spring-back that interrupts it.
  const lastDimForRef = useRef<((offset: number) => number) | null>(null);

  // The entrance under a finger (`present`): while it runs the host holds
  // input, and a close waits for it (see `dismiss`).
  const presentingRef = useRef(false);
  const entranceRef = useRef<Promise<boolean> | null>(null);
  const [entranceWaiters] = useState(() => new Set<() => void>());
  const endPresenting = useCallback(() => {
    entranceRef.current = null;
    if (presentingRef.current) {
      presentingRef.current = false;
      onPresentingChangeRef.current?.(false);
    }
    const waiters = [...entranceWaiters];
    entranceWaiters.clear();
    for (const waiter of waiters) {
      waiter();
    }
  }, [entranceWaiters]);
  const afterEntrance = useCallback(
    (callback: () => void) => {
      if (!presentingRef.current) {
        callback();
        return () => {};
      }
      entranceWaiters.add(callback);
      return () => {
        entranceWaiters.delete(callback);
      };
    },
    [entranceWaiters],
  );

  // Live drag bookkeeping (refs so a move doesn't churn renders).
  const dragStateRef = useRef<{
    // The pan driving the drag; null while only a catch holds the sheet
    // under a finger that has not moved past a pan's threshold yet.
    pan: PanGestureRecognizer | null;
    /** The pointer's kind: a finger, a pen, or a mouse. */
    pointerType: string;
    height: number;
    baseOffset: number;
    baseLayoutOffset: number;
    renderedOffset: number;
    // The layout split the drag asks the host for (setDragOffset) ...
    layoutOffset: number;
    // ... and the one the host has rendered: the travel is always written
    // against what is on screen, so a split that changes mid-drag (crossing
    // above the base restores the full height) lands in the same commit as
    // the travel that pairs with it, never a frame before it.
    committedLayoutOffset: number;
    naturalEndGap: number;
    hasTraveled: boolean;
  } | null>(null);

  // Fully-open height, tracked by a ResizeObserver (see sheetRef) so detents
  // stay correct across rotation / viewport changes without re-measuring.
  const sheetHeightRef = useRef(0);
  const sheetElRef = useRef<HTMLElement | null>(null);
  const bodyNodeRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  useLayoutEffect(() => {
    if (!isScrollAreaReconciling) {
      return;
    }
    // Force the transition-free transform reset to resolve before transitions
    // are restored. Otherwise both DOM updates can be coalesced and the reset
    // becomes an unintended fly-in animation from the bottom.
    void sheetElRef.current?.offsetHeight;
    const frame = requestAnimationFrame(() => {
      setIsScrollAreaReconciling(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [isScrollAreaReconciling]);
  const recordSheetHeight = useCallback((renderedHeight: number) => {
    if (renderedHeight <= 0) {
      return;
    }
    // A resized or closing panel's observer reports intermediate heights
    // throughout its animation. Keep the last fully-expanded measurement
    // instead of feeding those transient values back into the rendered height.
    if (!isOpenRef.current || activeOffsetRef.current > 0) {
      return;
    }
    sheetHeightRef.current = renderedHeight;
    setSheetHeight(previousHeight =>
      previousHeight === renderedHeight ? previousHeight : renderedHeight,
    );
  }, []);
  // The gesture's share of the sheet's travel, on the `translate` channel:
  // the motion foundation's animator, attached to the sheet by sheetRef. Zero
  // at rest, and measured from the resting transform the host writes
  // (`travelBaseRef`), so the two add up to the offset less the layout split.
  const animatorRef = useRef<Animator | null>(null);
  animatorRef.current ??= createAnimator(null);
  const animator = animatorRef.current;
  const travelBaseRef = useRef(0);
  // The layout offset the running travel is measured from (a release keeps
  // the drag's base layout until it lands, while settledLayoutOffset already
  // names the target's).
  const travelLayoutBaseRef = useRef(0);
  // The settle, return or exit running on the travel channel, if any.
  const travelHandleRef = useRef<MotionHandle | null>(null);
  // Which timing the gesture's release runs on: UIKit's springs under a
  // finger, the theme's under a mouse. Read once per drag.
  const releaseMotionRef = useRef<ReleaseMotion>({kind: 'uikit'});
  // Set while a drag-dismissed sheet is carried off screen by its release
  // spring (see SheetGestureExit).
  const gestureExitRef = useRef<SheetGestureExit | null>(null);
  const sheetRef = useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      sheetElRef.current = node;
      animator.attach(node);
      if (!node || typeof ResizeObserver === 'undefined') {
        if (node) {
          recordSheetHeight(node.getBoundingClientRect().height);
        }
        return;
      }
      recordSheetHeight(node.getBoundingClientRect().height);
      const ro = new ResizeObserver(entries => {
        const entry = entries[0];
        if (entry) {
          // Keep this measurement in the same border-box coordinate space as
          // getBoundingClientRect(). contentRect excludes the sheet's reserved
          // bottom padding and would make the first resized drag jump shorter.
          const borderBoxHeight = entry.borderBoxSize?.[0]?.blockSize;
          recordSheetHeight(
            borderBoxHeight ?? entry.target.getBoundingClientRect().height,
          );
        }
      });
      ro.observe(node);
      observerRef.current = ro;
    },
    [animator, recordSheetHeight],
  );
  // While a finger drags the sheet under UIKit's presentation, or holds it
  // after catching it mid-settle, no text selection starts under it and the
  // touch callout is off: a finger held still on a caught sheet would
  // otherwise start a text selection (on iOS, with its loupe) under the drag.
  // Taken at the catch (the touch-down), before the long press would select,
  // and released at the lift (sheetSelectionLock.ts: how each engine refuses
  // one). The gesture host takes the same lock for the sheet's recognizers;
  // the two release in whichever order they let go.
  const selectionLockRef = useRef<(() => void) | null>(null);
  const lockSelection = useCallback((target: EventTarget | null) => {
    const element = sheetElRef.current;
    if (element == null || selectionLockRef.current != null) {
      return;
    }
    selectionLockRef.current = lockSheetSelection([element], target);
  }, []);
  const unlockSelection = useCallback(() => {
    const release = selectionLockRef.current;
    selectionLockRef.current = null;
    release?.();
  }, []);

  // Unmount: the size observer, and the sheet's animator. Stopping it settles
  // any travel still running as unfinished and clears its completion timer,
  // so nothing completes on an unmounted sheet.
  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      animator.stop();
      unlockSelection();
    },
    [animator, unlockSelection],
  );

  // Reset to the tallest detent each time the sheet re-opens.
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- resets gesture state on controlled reopen
      setDragOffset(0);
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- resets gesture state on controlled reopen
      setSettledOffset(0);
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- resets gesture state on controlled reopen
      setIsDragging(false);
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- resets gesture state on controlled reopen
      setIsTraveling(false);
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- resets gesture state on controlled reopen
      setIsScrollAreaReconciling(false);
      recordSettledLayoutOffset(0);
      settledDetentIndexRef.current = 0;
      scrollPreservationInsetRef.current = 0;
      settlingLayoutOffsetRef.current = null;
      pendingScrollPreservationInsetRef.current = null;
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- resets gesture state on controlled reopen
      setScrollPreservationInset(0);
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- resets gesture state on controlled reopen
      setSettlingLayoutOffset(null);
      // The sheet's animator too, the compositor `translate` it moves, with
      // no exit pending. Reopened before its entrance landed, the entrance
      // runs on (a close queued meanwhile stands down at the landing, see
      // `dismiss`). Reopened while its exit spring runs, it springs back from
      // where it is, keeping that spring's velocity (spec:AST-094 FR6), on the
      // present spring. Otherwise it is put back at rest.
      const isEntering = entranceRef.current != null;
      if (!isEntering) {
        const isExitInFlight =
          gestureExitRef.current != null && travelHandleRef.current != null;
        travelHandleRef.current = null;
        if (isExitInFlight) {
          // The travel was measured from the exit's base: fold that in, so
          // the channel holds the sheet's whole offset from the tallest
          // detent.
          const base = travelLayoutBaseRef.current + travelBaseRef.current;
          travelBaseRef.current = 0;
          travelLayoutBaseRef.current = 0;
          if (base !== 0) {
            animator.rebase({y: base});
          }
          const handle = animator.animate(
            {y: 0},
            {spring: SHEET_PRESENT_SPRING},
            {crossfadeAs: 'entrance'},
          );
          travelHandleRef.current = handle;
          void handle.finished.then(() => {
            if (travelHandleRef.current === handle) {
              travelHandleRef.current = null;
            }
          });
        } else {
          animator.set({y: 0});
        }
        // And the dialog's ::backdrop dim: its animation stops, and the host
        // gets its own easing back.
        stopScrimFollow();
        if (isScrimTrackingRef.current) {
          isScrimTrackingRef.current = false;
          onScrimTrackingRef.current?.(false);
        }
      }
      gestureExitRef.current = null;
    }
  }, [animator, isOpen, recordSettledLayoutOffset, stopScrimFollow]);

  // Syncs the dialog's ::backdrop dim with a close: a release still playing
  // it stops, and the host's easing comes back unpinned, so the host's close
  // fade runs instead of the page staying dimmed until the dialog closes.
  useEffect(() => {
    if (!isOpen && scrimOwnerRef.current === 'release') {
      releaseScrimTracking();
    }
  }, [isOpen, releaseScrimTracking]);

  // The fully-open height for detent math. Prefer the ResizeObserver-locked
  // value; fall back to a live measure of the tracked sheet element if the
  // observer hasn't reported yet.
  const measureHeight = useCallback((): number => {
    if (sheetHeightRef.current > 0) {
      return sheetHeightRef.current;
    }
    return sheetElRef.current?.getBoundingClientRect().height ?? 0;
  }, []);

  // Detent translate offsets (px) from the tallest detent, ascending, plus the
  // peek among them. Exclude the border-box portion reserved below the
  // viewport before comparing the candidate visible heights; otherwise every
  // snap point lands that many px too low. Snap heights are resolved lazily so
  // they track the viewport.
  const resolveDetents = useCallback((height: number): SheetDetents => {
    const visibleSheetHeight = visibleHeightForOffset(
      height,
      0,
      offscreenBlockEndInsetRef.current,
    );
    const offsets = computeDetentOffsets(
      visibleSheetHeight,
      snapHeightsRef.current?.() ?? [],
    );
    return {offsets, peekOffset: peekOffsetFor(offsets, visibleSheetHeight)};
  }, []);

  // The height the sheet WOULD have fully open, right now. While it rests at a
  // resizing detent the element carries a pixel height computed for whatever
  // the viewport was then, so measuring it directly just reads that stale
  // number back. Drop the inline height for the measurement and put it back in
  // the same synchronous block — the browser cannot paint in between, so this
  // is invisible — and the natural CSS budget is what gets measured.
  const measureFullyOpenHeight = useCallback((): number => {
    const element = sheetElRef.current;
    if (!element) {
      return sheetHeightRef.current;
    }
    const inlineHeight = element.style.height;
    if (inlineHeight === '') {
      return element.getBoundingClientRect().height;
    }
    element.style.height = '';
    const height = element.getBoundingClientRect().height;
    element.style.height = inlineHeight;
    return height;
  }, []);

  // Detents are viewport fractions, but a settled sheet holds them as pixels:
  // an offset to translate by, and a layout height to render. Both are read
  // once, at gesture time. Without this, a viewport change leaves the sheet
  // frozen at the old pixel geometry — a "half height" sheet showing 75% of a
  // shorter window, a peek detent whose slide-down is taller than the whole
  // window (so the sheet leaves the screen while its dialog stays modal), and
  // a stale fully-open height for the next drag to overshoot past.
  //
  // Re-resolve the SAME detent — by index, the one thing that survives the
  // units changing — against the new geometry, and re-anchor without
  // animating: the geometry moved, not the user's finger, so there is no
  // gesture to continue and nothing to ease.
  const reanchorToSettledDetent = useCallback(() => {
    // A closed sheet re-anchors on its way back open; a live drag re-measures
    // on its own, and a settle in flight owns the layout until it lands.
    if (
      !isOpenRef.current ||
      dragStateRef.current != null ||
      settlingLayoutOffsetRef.current != null
    ) {
      return;
    }
    const height = measureFullyOpenHeight();
    if (height <= 0) {
      return;
    }
    const {offsets, peekOffset} = resolveDetents(height);
    const index = Math.min(settledDetentIndexRef.current, offsets.length - 1);
    const target = offsets[index];
    const targetLayoutOffset = target === peekOffset ? 0 : target;
    const baseLayoutOffset = settledLayoutOffsetRef.current;
    if (
      height === sheetHeightRef.current &&
      Math.abs(target - activeOffsetRef.current) <= 0.5 &&
      Math.abs(targetLayoutOffset - baseLayoutOffset) <= 0.5
    ) {
      return;
    }

    sheetHeightRef.current = height;
    // Re-anchoring is a measurement: the geometry it reads is only knowable
    // after layout, so the state it corrects can only be set from an effect
    // (or, on the resize path, from the listener). Both writes below are
    // guarded by the equality check above, so a re-anchor that finds nothing
    // to change sets nothing.
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- corrects settled geometry from a measurement
    setSheetHeight(height);
    settledDetentIndexRef.current = index;
    prepareScrollAreaSettle(
      baseLayoutOffset,
      target,
      targetLayoutOffset,
      target,
      baseLayoutOffset,
      naturalEndGapFor(bodyNodeRef.current),
      false,
    );
    recordSettledLayoutOffset(targetLayoutOffset);
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- corrects settled geometry from a measurement
    setSettledOffset(target);
    onSnapRef.current?.(
      visibleHeightForOffset(height, target, offscreenBlockEndInsetRef.current),
    );
    const maxOffset = offsets[offsets.length - 1];
    const shortestDetentHeight = visibleHeightForOffset(
      height,
      maxOffset,
      offscreenBlockEndInsetRef.current,
    );
    onScrimOpacityRef.current?.(
      scrimOpacityForOffset(
        target,
        offsets,
        scrimClearOffset(maxOffset, shortestDetentHeight),
        peekOffset,
      ),
    );
  }, [
    measureFullyOpenHeight,
    prepareScrollAreaSettle,
    recordSettledLayoutOffset,
    resolveDetents,
  ]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      return;
    }
    window.addEventListener('resize', reanchorToSettledDetent);
    window.addEventListener('orientationchange', reanchorToSettledDetent);
    return () => {
      window.removeEventListener('resize', reanchorToSettledDetent);
      window.removeEventListener('orientationchange', reanchorToSettledDetent);
    };
  }, [isOpen, reanchorToSettledDetent]);

  // The other input to the same geometry: the snap points themselves. A host
  // that swaps them while the sheet rests has moved the stops out from under
  // it, exactly as a rotation does, so re-anchor the same way. Skipped on the
  // first run — the sheet is already anchored to the detents it opened with.
  const hasAnchoredSnapHeightsRef = useRef(false);
  useLayoutEffect(() => {
    if (!hasAnchoredSnapHeightsRef.current) {
      hasAnchoredSnapHeightsRef.current = true;
      return;
    }
    reanchorToSettledDetent();
  }, [reanchorToSettledDetent, snapHeights]);

  // The one write a finger sample costs: the sheet's travel channel, with no
  // render between the input and the paint. Added to the resting transform
  // the drag began on, it makes the offset less the layout split: what the
  // host renders at rest, so a settle that follows continues from it.
  const writeLiveTransform = useCallback(
    (offset: number, layoutOffset: number) => {
      animator.set({y: offset - layoutOffset - travelBaseRef.current});
    },
    [animator],
  );

  // Whether a finger drives the current or last drag, so its release, and a
  // spring-back after it, fade under reduced motion whatever the primary
  // pointer (design:reduced-motion DR2).
  const dragTouchRef = useRef(false);
  // Moves the sheet to `offset` on the travel channel, holding the layout
  // split it is rendered with (`layoutOffset`) until it lands; landing a
  // settle reconciles the layout, and the host folds the travel into its new
  // resting transform in the same commit. On the compositor: the curve is
  // baked into Web Animations, so it keeps its pace while the main thread is
  // busy. Under a finger, `spring` handed `velocity` (px/s; the speed on
  // screen by default); under a mouse, the theme's timing.
  const springTravel = useCallback(
    (
      offset: number,
      layoutOffset: number,
      spring: SpringDescription,
      velocity?: number,
      dimFor?: (offset: number) => number,
      crossfadeAs?: 'exit',
    ): MotionHandle => {
      const base = layoutOffset + travelBaseRef.current;
      travelLayoutBaseRef.current = layoutOffset;
      const to = offset - base;
      const motion = releaseMotionRef.current;
      // One clock for the sheet and its dim.
      const at = performance.now();
      const from = animator.get('y', at);
      // Under reduced motion the animator's own cross-fade replaces the
      // travel (design:reduced-motion). A finger started it, so it fades
      // whatever the primary pointer (DR2).
      const touchRelease = dragTouchRef.current;
      // The dim rides the same curve on the dialog's ::backdrop.
      const layers: MapLayer[] = [];
      if (dimFor != null) {
        const scrim = scrimLayerAnimator();
        if (scrim != null) {
          scrimOwnerRef.current = 'release';
          const map = (y: number) => dimFor(base + y);
          // Starts from the dim on screen, so a reduced-motion fade does too.
          scrim.set({opacity: map(from)});
          layers.push({animator: scrim, property: 'opacity', map});
        }
      }
      // Thrown up onto the tallest detent, the 80 % damped spring overshoots
      // above it; the sheet extends only its reserve below the screen, so
      // the hand-off is capped to keep the page from showing under it.
      const handed = velocity ?? animator.getVelocity('y', at);
      const v =
        motion.kind === 'uikit' && offset === 0
          ? limitOvershoot(
              spring,
              from,
              to,
              handed,
              offscreenBlockEndInsetRef.current,
            )
          : handed;
      const run = createInteractiveTransition({
        driver: {animator, property: 'y'},
        layers,
        rule: settleOnly,
      }).to(
        to,
        motion.kind === 'theme'
          ? {durationMs: motion.durationMs, easing: motion.easing}
          : spring,
        {
          velocity: motion.kind === 'theme' ? 0 : v,
          touchRelease,
          now: at,
          ...(crossfadeAs == null ? {} : {crossfadeAs}),
        },
      );
      const handle = run.handle ?? settledHandle(run.finished);
      travelHandleRef.current = handle;
      void handle.finished.then(finished => {
        if (travelHandleRef.current !== handle) {
          return;
        }
        travelHandleRef.current = null;
        if (!finished) {
          return;
        }
        if (dimFor != null) {
          // Closed meanwhile: the release's dim isn't written back.
          if (isOpenRef.current) {
            endScrimTracking(dimFor(offset));
          } else {
            releaseScrimTracking();
          }
        }
        if (settlingLayoutOffsetRef.current != null) {
          completeScrollAreaSettle();
        }
      });
      return handle;
    },
    [
      animator,
      completeScrollAreaSettle,
      endScrimTracking,
      releaseScrimTracking,
      scrimLayerAnimator,
    ],
  );

  // The host calls this right after it writes a resting transform: the travel
  // that carried the sheet there is folded into that transform. Travel still
  // animating keeps its channel.
  const resetTravel = useCallback(() => {
    if (travelHandleRef.current != null || animator.get('y') === 0) {
      return;
    }
    animator.set({y: 0});
  }, [animator]);

  // Folds the travel into the element's transform: the host's own exit
  // transition then runs from where the pointer left the sheet, as it does
  // under a mouse. Written while the drag's `transition: none` is still on
  // the element, so the fold does not animate.
  const foldTravel = useCallback(() => {
    const translation = travelBaseRef.current + animator.get('y');
    const element = sheetElRef.current;
    if (element != null) {
      element.style.transform =
        translation !== 0 ? `translateY(${translation}px)` : '';
    }
    animator.set({y: 0});
  }, [animator]);

  // Whether a release can animate at all: UIKit's springs always can; the
  // theme's timing not when it is zero (transitions turned off).
  const releaseAnimates = useCallback(() => {
    const motion = releaseMotionRef.current;
    return motion.kind === 'uikit' || motion.durationMs > 0;
  }, []);

  const cancelDrag = useCallback(() => {
    const state = dragStateRef.current;
    if (state == null) {
      return;
    }
    dragStateRef.current = null;
    unlockSelection();
    setDragOffset(state.baseOffset);
    setIsDragging(false);
    setIsTraveling(false);
    prepareScrollAreaSettle(
      state.baseLayoutOffset,
      state.baseOffset,
      state.baseLayoutOffset,
      state.renderedOffset,
      state.committedLayoutOffset,
      state.naturalEndGap,
      releaseAnimates(),
    );
    const cancelDimFor = (o: number) => {
      const {offsets: stops, peekOffset: peek} = resolveDetents(state.height);
      const shortest = stops[stops.length - 1];
      return scrimOpacityForOffset(
        o,
        stops,
        scrimClearOffset(
          shortest,
          visibleHeightForOffset(
            state.height,
            shortest,
            offscreenBlockEndInsetRef.current,
          ),
        ),
        peek,
      );
    };
    if (settlingLayoutOffsetRef.current != null) {
      springTravel(
        state.baseOffset,
        state.committedLayoutOffset,
        SHEET_DETENT_SPRING,
        undefined,
        cancelDimFor,
      );
    }

    // An interrupted drag returns to its previous resting detent. Restore
    // the matching scrim opacity as well so the modal shell cannot remain
    // dimmed with its sheet translated out of view.
    const {offsets, peekOffset} = resolveDetents(state.height);
    const maxOffset = offsets[offsets.length - 1];
    const shortestDetentHeight = visibleHeightForOffset(
      state.height,
      maxOffset,
      offscreenBlockEndInsetRef.current,
    );
    const clearOffset = scrimClearOffset(maxOffset, shortestDetentHeight);
    if (settlingLayoutOffsetRef.current == null) {
      endScrimTracking(
        scrimOpacityForOffset(
          state.baseOffset,
          offsets,
          clearOffset,
          peekOffset,
        ),
      );
    } else {
      onScrimOpacityRef.current?.(
        scrimOpacityForOffset(
          state.baseOffset,
          offsets,
          clearOffset,
          peekOffset,
        ),
      );
    }
  }, [
    endScrimTracking,
    prepareScrollAreaSettle,
    releaseAnimates,
    resolveDetents,
    springTravel,
    unlockSelection,
  ]);

  const settleFromDrag = useCallback(
    (
      offset: number,
      velocity: number,
      height: number,
      baseOffset: number,
      baseLayoutOffset: number,
      renderedOffset: number,
      layoutOffset: number,
      naturalEndGap: number,
      isTouch: boolean,
    ) => {
      const {offsets, peekOffset} = resolveDetents(height);
      const maxOffset = offsets[offsets.length - 1];
      const shortestDetentHeight = visibleHeightForOffset(
        height,
        maxOffset,
        offscreenBlockEndInsetRef.current,
      );
      const dismissedOffset = dismissedOffsetFor(
        maxOffset,
        shortestDetentHeight,
      );
      // Where the scrim reaches clear, and the dim at any offset this release
      // passes through.
      const clearOffset = scrimClearOffset(maxOffset, shortestDetentHeight);
      const dimFor = (o: number) =>
        scrimOpacityForOffset(o, offsets, clearOffset, peekOffset);
      lastDimForRef.current = dimFor;
      // UIKit's rule for every pointer (sheetRelease.ts, spec:AST-094 FR36),
      // as the interactive-transition driver's rule: offsets in, offsets out;
      // what plays the settle follows the presentation (FR13).
      const release = sheetReleaseRule(
        {position: offset, finger: offset, velocity},
        {
          detents: offsets,
          dismissedOffset: canDismissRef.current ? dismissedOffset : null,
          startOffset: baseOffset,
        },
      );

      if (release.outcome === 'dismiss') {
        prepareScrollAreaSettle(
          baseLayoutOffset,
          baseOffset,
          baseLayoutOffset,
          baseLayoutOffset,
          baseLayoutOffset,
          naturalEndGap,
          false,
        );
        if (releaseMotionRef.current.kind === 'uikit') {
          // The release spring carries the sheet off screen at the finger's
          // velocity; the host's exit waits for it instead of running its own.
          const handle = springTravel(
            release.target,
            baseLayoutOffset,
            release.motion,
            velocity,
            dimFor,
            'exit',
          );
          const base = travelBaseRef.current;
          gestureExitRef.current = {
            finished: handle.finished,
            transform: base !== 0 ? `translateY(${base}px)` : 'none',
          };
          setDismissRequest(request => request + 1);
        } else {
          // The host's own exit fades the dim from where it is.
          endScrimTracking(dimFor(renderedOffset));
          foldTravel();
        }
        setTouchDragDismissal({isTouch, pending: true});
        onDismissRef.current();
        return;
      }

      const target = release.target;
      // A peek keeps the full layout height and slides below the viewport;
      // every taller detent resizes the scrolling area to what it shows.
      const targetLayoutOffset = target === peekOffset ? 0 : target;
      prepareScrollAreaSettle(
        baseLayoutOffset,
        target,
        targetLayoutOffset,
        renderedOffset,
        layoutOffset,
        naturalEndGap,
        releaseAnimates(),
      );
      if (settlingLayoutOffsetRef.current != null) {
        springTravel(target, layoutOffset, release.motion, velocity, dimFor);
      } else {
        endScrimTracking(dimFor(target));
      }
      recordSettledLayoutOffset(targetLayoutOffset);
      settledDetentIndexRef.current = Math.max(0, release.index);
      setSettledOffset(target);
      onSnapRef.current?.(
        visibleHeightForOffset(
          height,
          target,
          offscreenBlockEndInsetRef.current,
        ),
      );
      onScrimOpacityRef.current?.(dimFor(target));
      if (target !== baseOffset) {
        // A short tick where the platform vibrates (gestures/haptics.ts).
        playHaptic('impactLight');
      }
    },
    [
      endScrimTracking,
      foldTravel,
      prepareScrollAreaSettle,
      recordSettledLayoutOffset,
      releaseAnimates,
      resolveDetents,
      springTravel,
    ],
  );

  // A drag-dismissed sheet whose host keeps it open (a controlled `open` that
  // stays true) springs back to where it rests, as a UIKit sheet does when
  // its dismissal is declined. This syncs the sheet's animator (the
  // compositor `translate`) with the declined request; the cleanup stops the
  // spring it started if the effect runs again or the sheet unmounts.
  const [dismissRequest, setDismissRequest] = useState(0);
  useLayoutEffect(() => {
    if (dismissRequest === 0 || gestureExitRef.current == null || !isOpen) {
      return;
    }
    gestureExitRef.current = null;
    const handle = springTravel(
      settledOffset,
      settledLayoutOffsetRef.current,
      SHEET_DETENT_SPRING,
      undefined,
      lastDimForRef.current ?? undefined,
    );
    return () => {
      if (travelHandleRef.current === handle) {
        animator.stop(['y']);
      }
    };
  }, [animator, dismissRequest, isOpen, settledOffset, springTravel]);

  // The dim for an offset of a sheet `height` tall: full at the shortest
  // working detent and above, linear to clear at gone (UIKit's dim).
  const dimForHeight = useCallback(
    (offset: number, height: number) => {
      const {offsets, peekOffset} = resolveDetents(height);
      const shortest = offsets[offsets.length - 1];
      return scrimOpacityForOffset(
        offset,
        offsets,
        dismissedOffsetFor(
          shortest,
          visibleHeightForOffset(
            height,
            shortest,
            offscreenBlockEndInsetRef.current,
          ),
        ),
        peekOffset,
      );
    },
    [resolveDetents],
  );

  // Present and dismiss: UIKit animates a sheet in and out on one critically
  // damped spring (sheetPresent / sheetDismiss) and its dimming view's colour
  // on the same spring, from clear to its resting dim and back (so the dim
  // follows the spring's progress, not the drag's position map). Under
  // reduced motion the sheet fades in or out in place instead, on the
  // animator's own cross-fade (crossfadeAs; design:reduced-motion DR2), and
  // the dim with it. Under a finger only.
  const present = useCallback((): boolean => {
    if (!readTouchPresentation().isTouch) {
      return false;
    }
    // One entrance at a time: a second call while it runs joins it.
    if (presentingRef.current) {
      return true;
    }
    // Input is held from now until the sheet lands (F4 b59).
    presentingRef.current = true;
    onPresentingChangeRef.current?.(true);
    // Before the host shows the dialog: its backdrop must not start its own
    // fade-in.
    beginScrimTracking();
    queueMicrotask(() => {
      const element = sheetElRef.current;
      if (element == null || !isOpenRef.current) {
        endScrimTracking(1);
        endPresenting();
        return;
      }
      // Below the screen: the sheet's visible height at its rest. It opens at
      // its tallest detent: the reopen reset renders only after this
      // microtask, so `settledOffset` may still be where the last close left
      // the sheet (a peek, with its lighter scrim).
      const height = measureHeight();
      const restOffset = 0;
      const distance = visibleHeightForOffset(
        height,
        restOffset,
        offscreenBlockEndInsetRef.current,
      );
      const dimFor = (o: number) => dimForHeight(o, height);
      if (distance <= 0 || height <= 0) {
        endScrimTracking(dimFor(restOffset));
        endPresenting();
        return;
      }
      travelBaseRef.current = 0;
      travelLayoutBaseRef.current = 0;
      animator.set({y: distance});
      // From rest, with no start time: the browser starts the entrance when
      // it commits it, as Core Animation starts it at its transaction's
      // commit, so a long task after this call delays it instead of skipping
      // into its curve. The dim, also from rest in this task, shares that
      // start.
      const restingDim = dimFor(restOffset);
      const layers: MapLayer[] = [];
      const scrim = scrimLayerAnimator();
      if (scrim != null) {
        // The dim on the spring's progress: clear below the screen, the
        // resting dim at rest.
        const map = (y: number) => restingDim * (1 - y / distance);
        scrim.set({opacity: map(distance)});
        layers.push({animator: scrim, property: 'opacity', map});
      }
      const run = createInteractiveTransition({
        driver: {animator, property: 'y'},
        layers,
        rule: settleOnly,
      }).to(0, SHEET_PRESENT_SPRING, {
        crossfadeAs: 'entrance',
        startAtCommit: true,
      });
      const handle = run.handle ?? settledHandle(run.finished);
      travelHandleRef.current = handle;
      // A close asked for meanwhile waits on this (see `dismiss`).
      entranceRef.current = handle.finished;
      void handle.finished.then(finished => {
        endPresenting();
        if (travelHandleRef.current !== handle) {
          return;
        }
        travelHandleRef.current = null;
        if (finished) {
          endScrimTracking(restingDim);
        }
      });
    });
    return true;
  }, [
    animator,
    beginScrimTracking,
    dimForHeight,
    endPresenting,
    endScrimTracking,
    measureHeight,
    scrimLayerAnimator,
  ]);

  const startDismiss = useCallback((): SheetGestureExit | null => {
    if (gestureExitRef.current != null) {
      return gestureExitRef.current;
    }
    if (sheetElRef.current == null || !readTouchPresentation().isTouch) {
      return null;
    }
    if (travelHandleRef.current != null) {
      // A settle still running: leave from where it is.
      travelHandleRef.current = null;
      animator.stop(['y']);
    } else {
      travelBaseRef.current = settledOffset - settledLayoutOffsetRef.current;
      travelLayoutBaseRef.current = settledLayoutOffsetRef.current;
    }
    // Computed, not read from layout: by now the host may have rendered its
    // closing style, whose transform the exit's held transform replaces in
    // this same commit.
    const height = measureHeight();
    const from = animator.get('y');
    const fromOffset =
      travelLayoutBaseRef.current + travelBaseRef.current + from;
    // Below the screen: what is still visible of the sheet.
    const distance = visibleHeightForOffset(
      height,
      fromOffset,
      offscreenBlockEndInsetRef.current,
    );
    // The dim fades from where it is: an entrance (whose dim follows its
    // progress, not position) or a release may still be playing it.
    const startingDim =
      scrimAnimatorRef.current?.get('opacity') ??
      dimForHeight(fromOffset, height);
    beginScrimTracking();
    // From rest, with no start time, as the entrance: the browser starts the
    // exit when it commits it, so a long task after the close delays it
    // instead of skipping into its curve. The dim shares that start.
    const layers: MapLayer[] = [];
    const scrim = scrimLayerAnimator();
    if (scrim != null) {
      // The dim on the spring's progress: from where it is to clear below the
      // screen.
      const map = (y: number) =>
        distance > 0 ? startingDim * (1 - (y - from) / distance) : 0;
      scrim.set({opacity: startingDim});
      layers.push({animator: scrim, property: 'opacity', map});
    }
    const run = createInteractiveTransition({
      driver: {animator, property: 'y'},
      layers,
      rule: settleOnly,
    }).to(from + distance, SHEET_DISMISS_SPRING, {
      crossfadeAs: 'exit',
      startAtCommit: true,
    });
    const handle = run.handle ?? settledHandle(run.finished);
    travelHandleRef.current = handle;
    void handle.finished.then(finished => {
      if (travelHandleRef.current === handle) {
        travelHandleRef.current = null;
      }
      if (finished) {
        endScrimTracking(0);
      }
    });
    const base = travelBaseRef.current;
    gestureExitRef.current = {
      finished: handle.finished,
      transform: base !== 0 ? `translateY(${base}px)` : 'none',
    };
    return gestureExitRef.current;
  }, [
    animator,
    beginScrimTracking,
    dimForHeight,
    endScrimTracking,
    measureHeight,
    scrimLayerAnimator,
    settledOffset,
  ]);

  // UIKit queues a dismissal asked for during the presentation: the sheet
  // lands on its detent, then a full dismissal runs from there (F4 b59).
  const dismiss = useCallback((): SheetGestureExit | null => {
    if (gestureExitRef.current != null) {
      return gestureExitRef.current;
    }
    const entrance = entranceRef.current;
    if (entrance == null) {
      return startDismiss();
    }
    const base = travelBaseRef.current;
    // The host asks for the exit once the sheet is closing.
    const wasClosing = !isOpenRef.current;
    const queued: SheetGestureExit = {
      finished: entrance.then(async () => {
        if (gestureExitRef.current === queued) {
          gestureExitRef.current = null;
        }
        // Opened again before it landed: the newer intent owns the outcome
        // (`architecture:interaction-modality` INV8), so the sheet stays.
        if (wasClosing && isOpenRef.current) {
          return false;
        }
        return startDismiss()?.finished ?? true;
      }),
      transform: base !== 0 ? `translateY(${base}px)` : 'none',
    };
    gestureExitRef.current = queued;
    return queued;
  }, [startDismiss]);

  // A drag begins when a pan does (past its threshold, UIKit's translation
  // from there on), or on a settling sheet at the touch itself (the catch).
  const beginDrag = useCallback(
    (
      pointerType: string,
      sheetHeight: number,
      target: EventTarget | null,
    ): boolean => {
      // A closing sheet is not grabbed: its exit owns the surface.
      if (!isOpenRef.current) {
        return false;
      }
      dragTouchRef.current = pointerType === 'touch';
      const naturalEndGap = naturalEndGapFor(bodyNodeRef.current);
      let baseOffset = settledOffset;
      let baseLayoutOffset = settledLayoutOffsetRef.current;
      if (travelHandleRef.current != null) {
        // A finger landing on a settling sheet catches it where the curve has
        // it on screen (never a layout read), and the drag continues from
        // there. The settle is abandoned in place, so the host's layout split
        // and the drag's both start from the catch point.
        travelHandleRef.current = null;
        animator.stop(['y']);
        baseLayoutOffset = settlingLayoutOffsetRef.current ?? baseLayoutOffset;
        baseOffset =
          baseLayoutOffset + travelBaseRef.current + animator.get('y');
        settlingLayoutOffsetRef.current = null;
        setSettlingLayoutOffset(null);
        pendingScrollPreservationInsetRef.current = null;
        recordSettledLayoutOffset(baseLayoutOffset);
        setSettledOffset(baseOffset);
      } else {
        // At rest the host's transform holds the detent's translation; the
        // drag travels from it.
        travelBaseRef.current = settledOffset - baseLayoutOffset;
      }
      activeOffsetRef.current = baseOffset;
      beginScrimTracking();
      // Read before this drag turns transitions off (releaseMotion.ts).
      releaseMotionRef.current = readReleaseMotion(
        sheetElRef.current,
        pointerType,
      );
      // Selection and the callout go off with UIKit's presentation, the same
      // answer as the tracking and the release: a finger where the primary
      // pointer is fine keeps the browser's (spec:AST-094 FR19).
      // The touch's target joins the lock: WebKit makes every input
      // selectable, out of reach of the sheet's lock, and the content's pans
      // bring the gesture host no lock of their own (spec:AST-094 FR41).
      if (releaseMotionRef.current.kind === 'uikit') {
        lockSelection(target);
      }
      dragStateRef.current = {
        pan: null,
        pointerType,
        height: sheetHeight,
        baseOffset,
        baseLayoutOffset,
        renderedOffset: baseOffset,
        layoutOffset: baseLayoutOffset,
        committedLayoutOffset: baseLayoutOffset,
        naturalEndGap,
        hasTraveled: false,
      };
      updateScrollPreservationInset(
        preservationInsetForOffset(
          baseLayoutOffset,
          baseLayoutOffset,
          naturalEndGap,
        ),
      );
      // Seed dragOffset at the resting detent so flipping isDragging doesn't
      // jump the sheet to fully-open for one frame.
      setDragOffset(baseOffset);
      setIsDragging(true);
      return true;
    },
    [
      animator,
      beginScrimTracking,
      lockSelection,
      recordSettledLayoutOffset,
      settledOffset,
      updateScrollPreservationInset,
    ],
  );

  // The sheet at the drag's base plus the pan's translation, every move.
  const moveDrag = useCallback(
    (translation: number) => {
      const state = dragStateRef.current;
      if (!state) {
        return;
      }
      const {offsets, peekOffset} = resolveDetents(state.height);

      const raw = state.baseOffset + translation;
      // Under UIKit's presentation (a finger or a pen where the primary
      // pointer is coarse, the same answer as the release's): 1:1 between
      // detents and into the dismiss zone, as UIKit's sheet tracks (the
      // release, not the drag, picks the detent), and past fully open the
      // record's rubber band (spec:AST-094 FR3). Otherwise the pointer
      // presentation's tracking (FR13, spec:AST-017 FR59).
      const next =
        releaseMotionRef.current.kind === 'uikit'
          ? fingerDragOffset(raw, state.height)
          : pointerDragOffset(raw, offsets);
      // Dragging above the base restores the full layout height below the
      // viewport; otherwise keep whatever layout the base detent settled with
      // (0 at a peek, so a peek drag stays transform-only).
      const layoutOffset = next < state.baseOffset ? 0 : state.baseLayoutOffset;
      const hasLayoutChanged = layoutOffset !== state.layoutOffset;
      state.renderedOffset = next;
      state.layoutOffset = layoutOffset;
      activeOffsetRef.current = next;
      writeLiveTransform(next, state.committedLayoutOffset);
      if (hasLayoutChanged) {
        // The layout split moved: the host renders the new height, reading
        // the offset it has to pair with it from state; the travel follows
        // in that commit (see the layout effect below).
        setDragOffset(next);
      }
      if (!state.hasTraveled && next !== state.baseOffset) {
        state.hasTraveled = true;
        setIsTraveling(true);
      }
      updateScrollPreservationInset(
        preservationInsetForOffset(
          state.baseLayoutOffset,
          layoutOffset,
          state.naturalEndGap,
        ),
      );

      // Mirror the scrim to the live drag: full at/above the mid detent,
      // fading to hidden as it collapses onto the peek detent and through the
      // dismiss overshoot.
      const floorOffset = offsets[offsets.length - 1];
      const shortestDetentHeight = visibleHeightForOffset(
        state.height,
        floorOffset,
        offscreenBlockEndInsetRef.current,
      );
      onScrimOpacityRef.current?.(
        scrimOpacityForOffset(
          next,
          offsets,
          scrimClearOffset(floorOffset, shortestDetentHeight),
          peekOffset,
        ),
      );
    },
    [resolveDetents, updateScrollPreservationInset, writeLiveTransform],
  );

  // The host rendered a drag's new layout split (the panel derives it from
  // these, as here): in the same commit, before it paints, the travel moves
  // to the value that pairs with it, so the sheet stays under the finger.
  useLayoutEffect(() => {
    const state = dragStateRef.current;
    if (!isDragging || state == null) {
      return;
    }
    const committed = dragOffset < settledOffset ? 0 : settledLayoutOffset;
    if (committed !== state.committedLayoutOffset) {
      state.committedLayoutOffset = committed;
      writeLiveTransform(state.renderedOffset, committed);
    }
  }, [
    dragOffset,
    isDragging,
    settledLayoutOffset,
    settledOffset,
    writeLiveTransform,
  ]);

  // The release: where the pan's translation left the sheet, at the pan's
  // velocity (px/s, UIKit's filter over the events' own timestamps).
  const endDrag = useCallback(
    (translation: number, velocity: number) => {
      const state = dragStateRef.current;
      if (!state) {
        return;
      }
      const offset = Math.max(0, state.baseOffset + translation);
      // Today's inputs, for a release under a mouse: the drag's direction and
      // travel, and the release velocity, the same filter as every pointer's.
      dragStateRef.current = null;
      unlockSelection();
      setIsDragging(false);
      setIsTraveling(false);
      settleFromDrag(
        offset,
        velocity,
        state.height || 1,
        state.baseOffset,
        state.baseLayoutOffset,
        state.renderedOffset,
        state.committedLayoutOffset,
        state.naturalEndGap,
        state.pointerType === 'touch',
      );
    },
    [settleFromDrag, unlockSelection],
  );

  // The kind of pointer each recognizer took last, read as its gesture
  // begins: a finger's release fades under reduced motion whatever the
  // primary pointer (design:reduced-motion DR2).
  const [pointerKinds] = useState(
    () => new WeakMap<GestureRecognizer, PointerKind>(),
  );
  // And the touch's target, for the drag's selection lock (see `beginDrag`).
  const [touchTargets] = useState(
    () => new WeakMap<GestureRecognizer, EventTarget | null>(),
  );
  const notePointer = useCallback(
    (recognizer: GestureRecognizer, touch: GestureTouch): boolean => {
      // The recognizers serve every pointer, a mouse, a pen and a finger,
      // and wheel and trackpad scrolling (spec:AST-094 FR19, FR43).
      pointerKinds.set(recognizer, touch.pointerType);
      touchTargets.set(
        recognizer,
        touch.target instanceof EventTarget ? touch.target : null,
      );
      return true;
    },
    [pointerKinds, touchTargets],
  );
  // Neither a closing sheet nor one still presenting starts a drag: the exit
  // owns the surface, and the entrance holds input (see `present`).
  const canDrag = useCallback(
    () => isOpenRef.current && !presentingRef.current,
    [],
  );
  // A drag begins only on a lone finger: with a second one down, wherever it
  // landed, the fingers are a pinch, and pinch-zoom is the browser's (WCAG
  // 1.4.4). The host counts the fingers on the screen, whatever they touch.
  // A drag that has begun keeps its finger when another lands
  // (spec:AST-094 FR10).
  const canBegin = useCallback(() => {
    if (!canDrag()) {
      return false;
    }
    const doc =
      sheetElRef.current?.ownerDocument ??
      (typeof document === 'undefined' ? null : document);
    return doc == null || getGestureHost(doc).fingersDown() <= 1;
  }, [canDrag]);

  // One listener for the sheet's pans: whichever began drives the drag.
  const onPan = useCallback(
    (pan: PanGestureRecognizer) => {
      switch (pan.state) {
        case 'began': {
          // A catch already holds the sheet under this finger (see the
          // watcher below); otherwise the drag starts here.
          if (
            dragStateRef.current == null &&
            !beginDrag(
              pointerKinds.get(pan) ?? 'touch',
              measureHeight(),
              touchTargets.get(pan) ?? null,
            )
          ) {
            return;
          }
          const state = dragStateRef.current;
          if (state == null) {
            return;
          }
          state.pan = pan;
          moveDrag(pan.translation().y);
          return;
        }
        case 'changed':
          if (dragStateRef.current?.pan === pan) {
            moveDrag(pan.translation().y);
          }
          return;
        case 'ended':
          if (dragStateRef.current?.pan === pan) {
            endDrag(pan.translation().y, pan.velocity().y);
          }
          return;
        case 'possible':
        case 'failed':
          return;
        case 'cancelled':
          // The browser or the page taking the touch, a context menu: not a
          // release, so back to the detent.
          if (dragStateRef.current?.pan === pan) {
            cancelDrag();
          }
          return;
        default:
          return;
      }
    },
    [
      beginDrag,
      cancelDrag,
      endDrag,
      measureHeight,
      moveDrag,
      pointerKinds,
      touchTargets,
    ],
  );

  // The handle: a vertical pan, for every pointer (spec:AST-094 FR19) and for
  // wheel and trackpad scrolling (FR43). A control's drag, so text selection
  // and the touch callout are off under the finger.
  const handleElRef = useRef<HTMLElement | null>(null);
  useGestureRecognizer(
    handleElRef,
    () =>
      new PanGestureRecognizer({
        allowedScrollTypes: ['continuous'],
        name: 'BottomSheet.handle',
        direction: 'vertical',
        maximumNumberOfTouches: 1,
        selectionLock: lockSheetSelection,
        shouldBegin: canBegin,
        shouldReceiveTouch: notePointer,
      }),
    onPan,
  );
  // The body, pulled down where nothing under the pointer can scroll up: the
  // sheet collapses toward its shortest detent or away.
  useGestureRecognizer(
    bodyNodeRef,
    () =>
      new PanGestureRecognizer({
        allowedScrollTypes: ['continuous'],
        name: 'BottomSheet.bodyDown',
        direction: 'down',
        maximumNumberOfTouches: 1,
        scrollEdge: true,
        shouldBegin: canBegin,
        shouldReceiveTouch: notePointer,
      }),
    onPan,
  );
  // The body, pulled up where nothing under the finger can scroll down, while
  // a taller detent exists: at the tallest, an upward pull is the content's
  // (promoting it would trade the scroll for a pull the release throws
  // back). A finger that scrolls the content into its end mid-gesture keeps
  // it: who gets the drag is decided when it begins (spec:AST-094 FR14).
  useGestureRecognizer(
    bodyNodeRef,
    () =>
      new PanGestureRecognizer({
        allowedScrollTypes: ['continuous'],
        name: 'BottomSheet.bodyUp',
        direction: 'up',
        maximumNumberOfTouches: 1,
        scrollEdge: true,
        shouldBegin: () => canBegin() && activeOffsetRef.current > 0,
        shouldReceiveTouch: notePointer,
      }),
    onPan,
  );
  // The catch: a finger landing on a settling sheet stops it where it is
  // drawn, at the touch, and a pan that begins under it drags it from there;
  // held still and lifted, it settles from where it was caught. A watcher
  // reports the touch and the lift: it never claims, prevents nothing,
  // leaves the sheet's styles alone and, recognized at every touch-down,
  // never cancels the touches of what is under it, so a control in the sheet
  // still gets its click.
  useGestureRecognizer(
    sheetElRef,
    () =>
      new LongPressGestureRecognizer({
        name: 'BottomSheet.catch',
        minimumPressDuration: 0,
        claimsTouches: false,
        cancelsTouchesInView: false,
        shouldReceiveTouch: notePointer,
      }),
    press => {
      switch (press.state) {
        case 'began':
          if (
            travelHandleRef.current != null &&
            dragStateRef.current == null &&
            canDrag()
          ) {
            beginDrag(
              pointerKinds.get(press) ?? 'touch',
              measureHeight(),
              touchTargets.get(press) ?? null,
            );
          }
          return;
        case 'ended':
          if (
            dragStateRef.current != null &&
            dragStateRef.current.pan == null
          ) {
            endDrag(0, 0);
          }
          return;
        case 'cancelled':
          if (
            dragStateRef.current != null &&
            dragStateRef.current.pan == null
          ) {
            cancelDrag();
          }
          return;
        case 'possible':
        case 'changed':
        case 'failed':
          return;
      }
    },
    {manageStyle: false},
  );

  // A context menu interrupts the drag: back to the detent.
  const handleContextMenu = useCallback(
    (event: ReactMouseEvent) => {
      const state = dragStateRef.current;
      if (state == null) {
        return;
      }
      event.preventDefault();
      if (state.pan != null) {
        // Turning a recognizer off mid-gesture cancels it (its listener
        // cancels the drag).
        state.pan.setEnabled(false);
        state.pan.setEnabled(true);
      }
      cancelDrag();
    },
    [cancelDrag],
  );

  // The handle has no native focus action: a press on it keeps the focus
  // where it is (a form control's keyboard stays up); once the sheet travels,
  // BottomSheet dismisses the keyboard.
  const handleHandlePointerDown = useCallback((event: ReactPointerEvent) => {
    if (event.button !== 0 || !event.isPrimary) {
      return;
    }
    event.preventDefault();
  }, []);

  const handleRef = useCallback((node: HTMLElement | null) => {
    handleElRef.current = node;
  }, []);
  const bodyRef = useCallback((node: HTMLElement | null) => {
    bodyNodeRef.current = node;
  }, []);

  const reconcileScrollPreservationInset = useCallback(
    (body: HTMLElement) => {
      if (scrollPreservationInsetRef.current <= 0) {
        return;
      }
      const renderedInset = renderedBlockEndPadding(body);
      const naturalMaxScrollTop = Math.max(
        0,
        body.scrollHeight - body.clientHeight - renderedInset,
      );
      const requiredInset = Math.max(0, body.scrollTop - naturalMaxScrollTop);
      if (requiredInset < scrollPreservationInsetRef.current - 0.5) {
        updateScrollPreservationInset(requiredInset);
      }
    },
    [updateScrollPreservationInset],
  );

  const handleBodyScroll = useCallback(
    (event: ReactUIEvent<HTMLElement>) => {
      if (
        dragStateRef.current != null ||
        settlingLayoutOffsetRef.current != null
      ) {
        return;
      }
      reconcileScrollPreservationInset(event.currentTarget);
    },
    [reconcileScrollPreservationInset],
  );

  // The resting transform, for a host that renders before it measures; a
  // gesture moves the sheet on the travel channel instead (writeLiveTransform,
  // springTravel).
  const activeOffset = isDragging ? dragOffset : settledOffset;

  const contentProps = useMemo<SheetContentProps>(
    () => ({
      style: {
        transform:
          activeOffset !== 0 ? `translateY(${activeOffset}px)` : undefined,
        // Gated on the sheet being up: suppression must not outlive the sheet
        // it was suppressing for. The host swaps the panel to its closing
        // state in whatever frame the dismissal lands, and a stale `none`
        // would apply to that transform too, cutting the exit. Reduced motion
        // is the panel's own stylesheet's to honor (its transform transition
        // collapses under the preference), not an inline `none` here: the
        // shorthand would also silence the panel's opacity transition, the
        // cross-fade `design:reduced-motion` DR2 asks for on a coarse pointer.
        transition:
          isOpen && (isDragging || isScrollAreaReconciling)
            ? 'none'
            : undefined,
        // No page pan from the sheet itself (its drags are the recognizers'
        // on the handle and the body, which the host styles); a pinch stays
        // the browser's.
        touchAction: 'pinch-zoom',
        overscrollBehavior: 'contain',
      },
    }),
    [activeOffset, isDragging, isOpen, isScrollAreaReconciling],
  );

  const handleProps = useMemo<SheetHandleProps>(
    () => ({
      ref: handleRef,
      style: {cursor: 'grab'},
      onContextMenu: handleContextMenu,
      onPointerDown: handleHandlePointerDown,
    }),
    [handleContextMenu, handleHandlePointerDown, handleRef],
  );

  const bodyProps = useMemo<SheetBodyProps>(
    () => ({
      ref: bodyRef,
      onContextMenu: handleContextMenu,
      onScroll: handleBodyScroll,
    }),
    [bodyRef, handleBodyScroll, handleContextMenu],
  );

  return {
    sheetRef,
    contentProps,
    handleProps,
    bodyProps,
    bodyElementRef: bodyNodeRef,
    dragOffset,
    settledOffset,
    isDragging,
    isTraveling,
    isDismissedByTouchDrag,
    activeOffsetRef,
    sheetHeight,
    scrollPreservationInset,
    settlingLayoutOffset,
    settledLayoutOffset,
    completeScrollAreaSettle,
    gestureExitRef,
    resetTravel,
    present,
    afterEntrance,
    dismiss,
  };
}
