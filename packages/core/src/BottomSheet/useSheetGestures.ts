// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSheetGestures.ts
 * @input Uses React (useCallback, useEffect, useMemo, useRef, useState)
 * @output Exports useSheetGestures hook and its option/result types
 * @position Internal to BottomSheet; not exported from the core entry point
 *
 * Drag + snap machinery for the bottom sheet. Tracks a pointer drag down the
 * block axis, translates the sliding surface live, and on release settles to
 * the detent nearest where the sheet would coast to at the finger's speed, or
 * dismisses when that is past the dismiss line. A slow drag projects onto
 * itself and places; a throw continues past the finger. This is the core
 * behavior split the sheet needs: DRAG places, SWIPE closes.
 *
 * A settled detent is split across two properties: `settledLayoutOffset` is
 * the part the scrolling area gives up as layout height, and the remainder is
 * a transform. Gestures and snaps only ever move the transform, so they stay
 * on the compositor; layout height changes at rest, in one transition-free
 * render whose visible geometry is identical. A peek detent — a stop that is
 * only a sliver of the sheet — keeps the full height and slides below the
 * viewport instead of reflowing to that sliver.
 *
 * A live drag writes that transform straight to the sheet element, once per
 * input sample, and renders nothing: React state changes when the drag begins
 * and ends, and in between only when the layout split changes (a drag that
 * crosses above its base detent restores the full height). The live offset
 * is readable through `activeOffsetRef`. The host owns the element's
 * transform outside a drag and writes the resting value after each commit,
 * so a settle animates from wherever the finger left the sheet.
 *
 * Those are pixels, and the stops behind them are relative to the viewport, so
 * a sheet at rest re-resolves its detent on `resize` / `orientationchange`,
 * and whenever the host swaps the snap points, and re-anchors to the new
 * geometry without animating. The detent it returns to is tracked by index:
 * the pixels stop meaning the same thing when the viewport changes, the stop
 * the user chose does not.
 *
 * On touch, the scrolling body hands the gesture to the sheet at a scroll
 * edge — once every scroller under the finger, a box nested inside the body
 * and the body itself, is at the edge the pull opposes (see
 * scrollChainUnder). Two shapes, because the browser only offers one of them
 * a choice: a
 * finger that lands on an edge and pulls away from it promotes by cancelling
 * the first, still-cancelable touchmove; a finger that scrolls INTO the end of
 * the content mid-gesture cannot, since the browser has committed the gesture
 * to scrolling and every remaining event is non-cancelable. The second shape
 * needs no cancelling — the scroller is clamped at its end, so there is
 * nothing left to scroll — and instead anchors at the point where the content
 * ran out and drives the sheet from the travel beyond it.
 *
 * Every gesture here is one finger. A second finger is a pinch, and pinch-zoom
 * belongs to the browser (WCAG 1.4.4): the surfaces declare `pinch-zoom` in
 * their `touch-action`, and a second finger — on either surface, in either
 * order — ends any drag in flight or armed (yieldToPinch), as does the
 * browser cancelling a handle drag to take the pinch. The sheet returns to
 * its detent and the pinch zooms the page.
 *
 * Kept private to BottomSheet: a dismiss edge + detents on a bottom-anchored
 * surface are inherently sheet concepts. It is not a general primitive and is
 * intentionally not exported.
 *
 * SSR-safe: no window/document access at module scope; all measurement
 * happens inside handlers. Respects prefers-reduced-motion by skipping the
 * settle transition.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/BottomSheet/useSheetGestures.test.ts
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
  type TouchEvent as ReactTouchEvent,
  type UIEvent as ReactUIEvent,
} from 'react';

import {
  computeDetentOffsets,
  peekOffsetFor,
  resolveSettleOffset,
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

// A release is judged where the sheet WOULD come to rest, not where the
// finger left it: the release position plus the distance a surface moving at
// the finger's speed travels while it decelerates. The rate is UIKit's normal
// scroll deceleration (0.998 per ms), so a throw ends where a thrown scroll
// view would, and a slow release projects onto itself. A gesture shorter than
// the travel floor projects nothing: a nudge has no throw to continue.
const DECELERATION_RATE = 0.998;
const PROJECTION_FACTOR = DECELERATION_RATE / (1 - DECELERATION_RATE); // ms
const PROJECTION_MIN_TRAVEL = 48; // px traveled during the gesture
// The release speed is the finger's speed over its last stretch, not between
// its last two samples: one slow sample before the lift must not cancel a
// throw, and a finger that paused before lifting has no speed at all.
const VELOCITY_WINDOW_MS = 100;
// On a slow drag below the shortest detent, dismiss once dragged past it by
// more than this fraction of that detent's height; otherwise snap back to it.
const DISMISS_OVERSHOOT_RATIO = 0.4;
// Within this many px of a detent, the live drag is magnetically eased toward
// it so it "clicks" into place instead of hovering just off the mark.
const MAGNET_RANGE = 40;
// The touch path drives the sheet through the same machinery the pointer path
// uses, by handing it a pointer-shaped object built from a `Touch`. On iOS
// Safari that object is indistinguishable from the real thing: WebKit raises
// PointerEvents for a finger under the SAME numeric id it puts in
// `Touch.identifier`, so such a drag is keyed to a live pointer and the
// handlers that guard a mouse drag fire against it. Mark the synthetic object
// so they can tell the two apart.
type SyntheticTouchPointer = ReactPointerEvent & {syntheticTouch?: true};

function isSyntheticTouch(event: ReactPointerEvent): boolean {
  return (event as SyntheticTouchPointer).syntheticTouch === true;
}

// Rubber-band factor for dragging up past fully-open, capped at OVERSCROLL_MAX
// (the sheet reserves that much bottom padding for the lift to reveal).
const OVERSCROLL_RESISTANCE = 0.35;
// SYNC: must match OVERSCROLL_PADDING in BottomSheetPanel.tsx (the reserved
// bottom padding the lift reveals). Kept as a local const rather than a shared
// import so it can be used inside stylex.create there.
const OVERSCROLL_MAX = 48;
// Travel past the point where a scrolling gesture ran out of content before it
// hands the sheet the rest of the pull. Small enough to feel continuous with
// the scroll, large enough that a swipe merely coming to rest on the last pixel
// doesn't start a drag on jitter.
const CONTENT_END_HANDOFF_SLOP = 4;
// How far a finger resting on the body must travel before the pull becomes a
// sheet drag rather than a tap.
//
// This used to be zero: any downward movement promoted. A finger is never
// still, so tapping a control inside the sheet drifted a pixel or two and
// started a drag -- which suppresses the panel's transition, correctly, for as
// long as the sheet is tracking the finger. The close that the tap triggered
// then landed inside that window and cut instead of animating. A deliberate
// pull was unaffected; only a tap, and only a tap inside the sheet, since the
// scrim is outside the body and arms nothing.
//
// 8px is the conventional tap slop, a shade over iOS's own recognizer, and
// well under what a real pull covers in its first frames.
const DRAG_PROMOTION_SLOP = 8;

// Short haptic tick on detent settle where supported. iOS Safari doesn't
// expose navigator.vibrate, so this is a no-op there; skipped under
// reduced-motion.
function hapticTick(): void {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.vibrate !== 'function'
  ) {
    return;
  }
  if (prefersReducedMotion()) {
    return;
  }
  navigator.vibrate(8);
}

// Pull a value toward the nearest of `targets` when within MAGNET_RANGE, easing
// the last stretch so the surface settles crisply onto a detent while dragging.
function magnetize(value: number, targets: number[]): number {
  let nearestTarget = targets[0];
  let nearestDist = Math.abs(value - nearestTarget);
  for (const t of targets) {
    const d = Math.abs(value - t);
    if (d < nearestDist) {
      nearestDist = d;
      nearestTarget = t;
    }
  }
  if (nearestDist >= MAGNET_RANGE) {
    return value;
  }
  // Ease-in over the range: pull grows as you approach (t^2), so the click
  // feels magnetic near the detent but doesn't fight a deliberate drag-through.
  const t = nearestDist / MAGNET_RANGE;
  const pull = 1 - t * t;
  return value + (nearestTarget - value) * pull;
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

// A box the user can scroll down the block axis: it has overflow to scroll and
// an overflow mode that lets a finger or wheel do the scrolling.
function isBlockScroller(element: HTMLElement): boolean {
  if (element.scrollHeight - element.clientHeight <= 1) {
    return false;
  }
  const {overflowY} = getComputedStyle(element);
  return overflowY === 'auto' || overflowY === 'scroll';
}

/**
 * The scrollers a gesture that lands on `target` can scroll, innermost first
 * and the body last: every scrollable box between the target and the body,
 * then the body itself.
 *
 * The body is where the hook listens, but it is not always what scrolls. A
 * host that pins a header and footer around a scrolling middle, or lays a
 * scrolling grid inside the sheet, moves that inner box's `scrollTop` and
 * never the body's. Reading the edge off the body alone then reports "at the
 * top" for every touch, so a pull meant to scroll the inner box back up
 * drags the sheet instead, and the box can never be scrolled back by hand.
 *
 * The browser scrolls the innermost box that has room, then chains outward,
 * so the sheet's turn comes only when every box in the chain is at the edge
 * the pull opposes: see `chainAtTop` and `chainAtBottom`.
 */
export function scrollChainUnder(
  target: EventTarget | null,
  body: HTMLElement,
): HTMLElement[] {
  const chain: HTMLElement[] = [];
  for (
    let element = target instanceof Element ? target : null;
    element != null && element !== body;
    element = element.parentElement
  ) {
    if (element instanceof HTMLElement && isBlockScroller(element)) {
      chain.push(element);
    }
  }
  chain.push(body);
  return chain;
}

function elementAtTop(element: HTMLElement): boolean {
  return element.scrollTop <= 0;
}

function elementAtBottom(element: HTMLElement): boolean {
  return element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
}

/** Nothing in the chain can scroll up any further, so a pull down is the sheet's. */
function chainAtTop(chain: ReadonlyArray<HTMLElement>): boolean {
  return chain.every(elementAtTop);
}

/** Nothing in the chain can scroll down any further, so a pull up is the sheet's. */
function chainAtBottom(chain: ReadonlyArray<HTMLElement>): boolean {
  return chain.every(elementAtBottom);
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
   * 0 = hidden) as the drag moves and on settle. Full while the sheet is at
   * or above its mid detent, fading to 0 as it collapses onto the shortest
   * "peek" detent — thinning to a faint glance state without fully clearing — and
   * on the dismiss overshoot. Lets the owner mirror it onto the scrim.
   */
  onScrimOpacity?: (opacity: number) => void;
}

export interface SheetContentProps {
  style: CSSProperties;
}

export interface SheetHandleProps {
  style: CSSProperties;
  onContextMenu: (event: ReactMouseEvent) => void;
  onLostPointerCapture: (event: ReactPointerEvent) => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
  onPointerCancel: (event: ReactPointerEvent) => void;
  onTouchStart: (event: ReactTouchEvent) => void;
  onTouchMove: (event: ReactTouchEvent) => void;
}

export interface SheetBodyProps {
  ref: (node: HTMLElement | null) => void;
  onContextMenu: (event: ReactMouseEvent) => void;
  onLostPointerCapture: (event: ReactPointerEvent) => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
  onPointerCancel: (event: ReactPointerEvent) => void;
  onScroll: (event: ReactUIEvent<HTMLElement>) => void;
}

export interface UseSheetGesturesResult {
  /**
   * Callback ref for the sheet surface. The hook observes it (ResizeObserver)
   * to keep the fully-open height current, so detents stay correct across
   * rotation / viewport changes without re-measuring mid-drag.
   */
  sheetRef: (node: HTMLElement | null) => void;
  /** Spread on the sliding surface: live translate + touch-action guard (pans are the sheet's, pinch-zoom is the browser's). */
  contentProps: SheetContentProps;
  /** Spread on the grab-handle element: pointer drag handlers. */
  handleProps: SheetHandleProps;
  /**
   * Spread on the scrollable body. An overscroll-at-top pull-down starts a
   * sheet drag (a larger, more forgiving target when the content isn't itself
   * scrolling); normal scrolling passes through untouched.
   */
  bodyProps: SheetBodyProps;
  /**
   * The body element `bodyProps.ref` is attached to. The hook tracks the node
   * anyway (it owns the non-passive touch listeners on it), so a host that
   * also needs the element reads it here rather than wrapping `bodyProps.ref`
   * in a second callback ref.
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
  /** Layout offset retained until the transform-only snap finishes. */
  settlingLayoutOffset: number | null;
  /**
   * Reconciles the final layout once the transform-only snap finishes. The
   * panel decides WHEN a snap is over (it owns the element and its computed
   * transition), so completion cannot be driven from a `transitionend`
   * listener alone: with transitions disabled — inline `transition: none`, a
   * `0s` duration token, a test harness turning animation off — no event ever
   * arrives and the scroll area would keep its full height forever.
   */
  completeScrollAreaSettle: () => void;
  /**
   * How much of `settledOffset` is expressed as layout height rather than as a
   * transform. Equals `settledOffset` at the resizing detents; 0 at fully open
   * and at the peek, which keep the sheet's full height (see peekOffsetFor).
   */
  settledLayoutOffset: number;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
      if (
        shouldAnimate &&
        Math.abs(renderedOffset - targetOffset) > 0.5 &&
        !prefersReducedMotion()
      ) {
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
      // with (magnetize() lands a slow drag exactly on a detent). Swapping
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
  useEffect(() => {
    onDismissRef.current = onDismiss;
    canDismissRef.current = canDismiss;
    onSnapRef.current = onSnap;
    onScrimOpacityRef.current = onScrimOpacity;
  });

  // Live drag bookkeeping (refs so pointermove doesn't churn renders).
  const dragStateRef = useRef<{
    // Whether the touch path drives this drag. Such a drag holds no pointer
    // capture and takes its events from `touchmove`, so every real-pointer
    // handler has to leave it alone.
    syntheticTouch: boolean;
    /** The pointer's kind: a finger, a pen, or a mouse. */
    pointerType: string;
    pointerId: number;
    startCoord: number;
    lastCoord: number;
    lastTime: number;
    // The finger's recent positions, oldest first, kept to VELOCITY_WINDOW_MS
    // (and never fewer than two) for the release speed.
    samples: {t: number; y: number}[];
    velocity: number;
    height: number;
    baseOffset: number;
    baseLayoutOffset: number;
    renderedOffset: number;
    layoutOffset: number;
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
  const sheetRef = useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      sheetElRef.current = node;
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
    [recordSheetHeight],
  );
  useEffect(() => () => observerRef.current?.disconnect(), []);

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
    }
  }, [isOpen, recordSettledLayoutOffset]);

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
        maxOffset + shortestDetentHeight * DISMISS_OVERSHOOT_RATIO,
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

  // The one write a finger sample costs: the sheet's compositor transform,
  // on the element, with no render between the input and the paint. The
  // value matches what the host renders at rest (offset less the layout
  // split), so a settle that follows continues from it.
  const writeLiveTransform = useCallback(
    (offset: number, layoutOffset: number) => {
      const element = sheetElRef.current;
      if (element == null) {
        return;
      }
      const translation = offset - layoutOffset;
      element.style.transform =
        translation !== 0 ? `translateY(${translation}px)` : '';
    },
    [],
  );

  const cancelDrag = useCallback(
    (target?: HTMLElement) => {
      const state = dragStateRef.current;
      if (state == null) {
        return;
      }

      // Clear first: releasePointerCapture() may synchronously dispatch
      // lostpointercapture, which must observe that this drag is already done.
      dragStateRef.current = null;
      if (target?.hasPointerCapture?.(state.pointerId)) {
        target.releasePointerCapture(state.pointerId);
      }
      setDragOffset(state.baseOffset);
      setIsDragging(false);
      setIsTraveling(false);
      prepareScrollAreaSettle(
        state.baseLayoutOffset,
        state.baseOffset,
        state.baseLayoutOffset,
        state.renderedOffset,
        state.layoutOffset,
        state.naturalEndGap,
        true,
      );

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
      const dismissOffset =
        maxOffset + shortestDetentHeight * DISMISS_OVERSHOOT_RATIO;
      onScrimOpacityRef.current?.(
        scrimOpacityForOffset(
          state.baseOffset,
          offsets,
          dismissOffset,
          peekOffset,
        ),
      );
    },
    [prepareScrollAreaSettle, resolveDetents],
  );

  useEffect(() => {
    // Only an open sheet can be dragged; a closed one listens to nothing.
    if (!isOpen) {
      return;
    }
    const handleWindowBlur = () => cancelDrag();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        cancelDrag();
      }
    };
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [cancelDrag, isOpen]);

  const settleFromDrag = useCallback(
    (
      offset: number,
      velocity: number,
      height: number,
      dir: number,
      travel: number,
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
      const dismissOffset =
        maxOffset + shortestDetentHeight * DISMISS_OVERSHOOT_RATIO;
      const projected =
        travel > PROJECTION_MIN_TRAVEL
          ? offset + velocity * PROJECTION_FACTOR
          : offset;
      const settleAt = (target: number) => {
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
          true,
        );
        recordSettledLayoutOffset(targetLayoutOffset);
        settledDetentIndexRef.current = Math.max(0, offsets.indexOf(target));
        setSettledOffset(target);
        onSnapRef.current?.(
          visibleHeightForOffset(
            height,
            target,
            offscreenBlockEndInsetRef.current,
          ),
        );
        onScrimOpacityRef.current?.(
          scrimOpacityForOffset(target, offsets, dismissOffset, peekOffset),
        );
        if (target !== baseOffset) {
          hapticTick();
        }
      };

      // A release that would coast past the dismiss line closes the sheet: a
      // throw from anywhere, or a slow drag that already crossed it.
      if (dir > 0 && projected > dismissOffset) {
        if (canDismissRef.current) {
          prepareScrollAreaSettle(
            baseLayoutOffset,
            baseOffset,
            baseLayoutOffset,
            baseLayoutOffset,
            baseLayoutOffset,
            naturalEndGap,
            false,
          );
          setTouchDragDismissal({isTouch, pending: true});
          onDismissRef.current();
        } else {
          settleAt(maxOffset);
        }
        return;
      }
      // Settle to the detent nearest where the release would coast to, in the
      // drag direction (never back past the starting detent), de-duped and
      // direction-clamped by the util. A throw upward projects past the
      // tallest detent and lands on it.
      const target = resolveSettleOffset(
        Math.min(Math.max(projected, 0), maxOffset),
        offsets,
        dir,
        baseOffset,
      );
      settleAt(target);
    },
    [prepareScrollAreaSettle, recordSettledLayoutOffset, resolveDetents],
  );

  const beginDrag = useCallback(
    (event: ReactPointerEvent, sheetHeight: number, startCoord?: number) => {
      const target = event.currentTarget as HTMLElement;
      const syntheticTouch = isSyntheticTouch(event);
      // Never capture for a touch drag. The id came from `Touch.identifier`,
      // which on iOS names a live pointer: the capture succeeds, WebKit takes
      // it straight back for its own gesture handling, and the
      // `lostpointercapture` a millisecond later cancels the drag that just
      // started. Touch drags need no capture — the listener is on the
      // scroller itself.
      if (!syntheticTouch) {
        target.setPointerCapture?.(event.pointerId);
      }
      // `startCoord` lets a body-overscroll drag anchor at the original
      // pointer-down position (not the promotion point), so the first frame's
      // delta reflects the full pull distance.
      const start = startCoord ?? event.clientY;
      const naturalEndGap = naturalEndGapFor(bodyNodeRef.current);
      const baseLayoutOffset = settledLayoutOffsetRef.current;
      dragStateRef.current = {
        syntheticTouch,
        pointerType: syntheticTouch ? 'touch' : event.pointerType,
        pointerId: event.pointerId,
        startCoord: start,
        lastCoord: event.clientY,
        lastTime: event.timeStamp,
        samples: [{t: event.timeStamp, y: event.clientY}],
        velocity: 0,
        height: sheetHeight,
        baseOffset: settledOffset,
        baseLayoutOffset,
        renderedOffset: settledOffset,
        layoutOffset: baseLayoutOffset,
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
      setDragOffset(settledOffset);
      setIsDragging(true);
    },
    [settledOffset, updateScrollPreservationInset],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (event.button !== 0 || !event.isPrimary) {
        return;
      }
      // The handle has no native focus action. Prevent pointer-down from
      // moving focus off a form control on a tap; once the pointer actually
      // moves, BottomSheet dismisses the keyboard as sheet travel begins.
      event.preventDefault();
      beginDrag(event, measureHeight());
    },
    [beginDrag, measureHeight],
  );

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent) => {
      if (dragStateRef.current == null) {
        return;
      }
      event.preventDefault();
      cancelDrag(event.currentTarget as HTMLElement);
    },
    [cancelDrag],
  );

  const handleLostPointerCapture = useCallback(
    (event: ReactPointerEvent) => {
      // A touch drag never took capture, so this is WebKit reclaiming its own
      // pointer for the finger doing the dragging — not the drag losing its
      // grip.
      if (dragStateRef.current?.syntheticTouch) {
        return;
      }
      if (dragStateRef.current?.pointerId === event.pointerId) {
        cancelDrag();
      }
    },
    [cancelDrag],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== event.pointerId) {
        return;
      }
      // Same finger, real pointer event: the touch path already drove this
      // move. Let it own the drag rather than driving it twice.
      if (state.syntheticTouch && !isSyntheticTouch(event)) {
        return;
      }
      const delta = event.clientY - state.startCoord;
      const dt = event.timeStamp - state.lastTime;
      if (dt > 0) {
        state.lastCoord = event.clientY;
        state.lastTime = event.timeStamp;
        state.samples.push({t: event.timeStamp, y: event.clientY});
        // Drop what fell out of the window while a partner remains: a throw
        // that begins after a rest reads its own speed, not the average since
        // touch-down.
        while (
          state.samples.length > 2 &&
          event.timeStamp - state.samples[0].t > VELOCITY_WINDOW_MS
        ) {
          state.samples.shift();
        }
        const first = state.samples[0];
        // A lone partner older than the window says only where the finger
        // rested; the move it precedes is read as if it took the window.
        const span = Math.min(event.timeStamp - first.t, VELOCITY_WINDOW_MS);
        state.velocity = span > 0 ? (event.clientY - first.y) / span : 0;
      }
      const {offsets, peekOffset} = resolveDetents(state.height);

      const raw = state.baseOffset + delta;
      const maxDetentOffset = offsets[offsets.length - 1];
      let next: number;
      if (raw < 0) {
        // Up past fully-open: damped + capped rubber-band; springs back on release.
        next = Math.max(-OVERSCROLL_MAX, raw * OVERSCROLL_RESISTANCE);
      } else if (raw > maxDetentOffset) {
        // In the dismiss zone: no magnet, so it doesn't fight a drag-to-close.
        next = raw;
      } else {
        // Between detents: magnetically ease toward a nearby one.
        next = magnetize(raw, offsets);
      }
      // Dragging above the base restores the full layout height below the
      // viewport; otherwise keep whatever layout the base detent settled with
      // (0 at a peek, so a peek drag stays transform-only).
      const layoutOffset = next < state.baseOffset ? 0 : state.baseLayoutOffset;
      const hasLayoutChanged = layoutOffset !== state.layoutOffset;
      state.renderedOffset = next;
      state.layoutOffset = layoutOffset;
      activeOffsetRef.current = next;
      writeLiveTransform(next, layoutOffset);
      if (hasLayoutChanged) {
        // The layout split moved: the host renders the new height, reading
        // the offset it has to pair with it from state.
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
      const dismissOffset =
        floorOffset + shortestDetentHeight * DISMISS_OVERSHOOT_RATIO;
      onScrimOpacityRef.current?.(
        scrimOpacityForOffset(next, offsets, dismissOffset, peekOffset),
      );
    },
    [resolveDetents, updateScrollPreservationInset, writeLiveTransform],
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== event.pointerId) {
        return;
      }
      // `pointercancel` fires for the finger the moment WebKit claims the
      // gesture; ending a touch drag on it settles the sheet mid-pull. The
      // touchend handler is what finishes a touch drag.
      if (state.syntheticTouch && !isSyntheticTouch(event)) {
        return;
      }
      const target = event.currentTarget as HTMLElement;
      const delta = event.clientY - state.startCoord;
      const offset = Math.max(0, state.baseOffset + delta);
      const dir = delta === 0 ? 0 : delta > 0 ? 1 : -1;
      // A finger that rested before lifting released nothing in motion.
      const velocity =
        event.timeStamp - state.lastTime < VELOCITY_WINDOW_MS
          ? state.velocity
          : 0;
      dragStateRef.current = null;
      if (!state.syntheticTouch) {
        target.releasePointerCapture?.(event.pointerId);
      }
      setIsDragging(false);
      setIsTraveling(false);
      settleFromDrag(
        offset,
        velocity,
        state.height || 1,
        dir,
        Math.abs(delta),
        state.baseOffset,
        state.baseLayoutOffset,
        state.renderedOffset,
        state.layoutOffset,
        state.naturalEndGap,
        state.pointerType === 'touch',
      );
    },
    [settleFromDrag],
  );

  // Pointer path for the body at-top pull-down (desktop / mouse). Touch uses
  // the non-passive listener below, since pointer events are cancelled once a
  // native pan starts.
  const armedBodyRef = useRef<{
    pointerId: number;
    startCoord: number;
    scrollers: HTMLElement[];
  } | null>(null);

  const handleBodyPointerDown = useCallback((event: ReactPointerEvent) => {
    if (event.button !== 0 || !event.isPrimary) {
      return;
    }
    const scrollers = scrollChainUnder(
      event.target,
      event.currentTarget as HTMLElement,
    );
    if (!chainAtTop(scrollers)) {
      armedBodyRef.current = null;
      return;
    }
    armedBodyRef.current = {
      pointerId: event.pointerId,
      startCoord: event.clientY,
      scrollers,
    };
  }, []);

  const handleBodyPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      if (dragStateRef.current) {
        handlePointerMove(event);
        return;
      }
      const armed = armedBodyRef.current;
      if (!armed || armed.pointerId !== event.pointerId) {
        return;
      }
      const delta = event.clientY - armed.startCoord;
      if (delta > DRAG_PROMOTION_SLOP && chainAtTop(armed.scrollers)) {
        // Downward pull at the top: promote to a sheet drag, anchored at the
        // original pointer-down position so the pull distance carries over.
        armedBodyRef.current = null;
        beginDrag(event, measureHeight(), armed.startCoord);
        handlePointerMove(event);
      } else if (delta < 0) {
        // Upward move = the user is scrolling; disarm so we don't hijack it.
        armedBodyRef.current = null;
      }
    },
    [beginDrag, handlePointerMove, measureHeight],
  );

  const handleBodyEnd = useCallback(
    (event: ReactPointerEvent) => {
      armedBodyRef.current = null;
      // The pointerup/pointercancel for a finger already driving a touch drag
      // arrives here carrying that drag's own id; touchend ends those.
      if (dragStateRef.current?.syntheticTouch) {
        return;
      }
      if (dragStateRef.current) {
        endDrag(event);
      }
    },
    [endDrag],
  );

  // Non-passive touchmove is the reliable scroll<->drag handoff on touch:
  // preventDefault() at a scroll edge stops the native scroll and drives the
  // sheet drag through the pointer math (Touch adapted to the fields it reads).
  //
  // Every touch on the body is tracked, not only the ones that begin at an
  // edge: a gesture that starts mid-content and scrolls to the end has to hand
  // off too, and by then it is far too late to arm from `touchstart`.
  const touchDragRef = useRef<{
    id: number;
    startY: number;
    // The boxes this touch can scroll (see scrollChainUnder); their edges
    // decide the handoff for the rest of the touch.
    scrollers: HTMLElement[];
    top: boolean;
    bottom: boolean;
    // Where the finger was when the scroller ran out of content, or null while
    // it can still scroll. A mid-gesture handoff drives the sheet from travel
    // BEYOND this point, so the part of the swipe that legitimately scrolled
    // doesn't move the sheet as well.
    contentEndY: number | null;
    // Whether the drag in flight was promoted from `contentEndY` rather than
    // armed at `touchstart`. That drag never cancelled the native scroll, so
    // it has to yield again if the finger comes back down.
    promotedAtContentEnd: boolean;
  } | null>(null);
  const previousTouchHandlersRef = useRef<{
    start: (e: TouchEvent) => void;
    move: (e: TouchEvent) => void;
    end: (e: TouchEvent) => void;
  } | null>(null);

  // A second finger is a pinch, and pinch-zoom is the browser's. Whichever
  // surface it lands on and whichever finger came first, drop every armed
  // hand-off and any drag in flight so nothing claims (or preventDefault()s)
  // the gesture; the sheet returns to its detent.
  const yieldToPinch = useCallback(
    (target?: HTMLElement) => {
      touchDragRef.current = null;
      armedBodyRef.current = null;
      cancelDrag(target);
    },
    [cancelDrag],
  );

  const beginDragRef = useRef(beginDrag);
  const cancelDragRef = useRef(cancelDrag);
  const yieldToPinchRef = useRef(yieldToPinch);
  const pointerMoveRef = useRef(handlePointerMove);
  const endDragRef = useRef(endDrag);
  const measureHeightRef = useRef(measureHeight);
  useEffect(() => {
    beginDragRef.current = beginDrag;
    cancelDragRef.current = cancelDrag;
    yieldToPinchRef.current = yieldToPinch;
    pointerMoveRef.current = handlePointerMove;
    endDragRef.current = endDrag;
    measureHeightRef.current = measureHeight;
  });

  const bodyRef = useCallback((node: HTMLElement | null) => {
    const asPointer = (touch: Touch, target: HTMLElement) =>
      ({
        syntheticTouch: true,
        pointerId: touch.identifier,
        clientY: touch.clientY,
        timeStamp: Date.now(),
        currentTarget: target,
        setPointerCapture: () => {},
        releasePointerCapture: () => {},
      }) as unknown as ReactPointerEvent;

    const onTouchStart = (event: TouchEvent) => {
      const body = event.currentTarget as HTMLElement;
      if (event.touches.length > 1) {
        yieldToPinchRef.current(body);
        return;
      }
      const touch = event.changedTouches[0];
      // Record where the gesture began and whether it began at a scroll edge.
      // At the top, a pull DOWN hands off (collapse); at the bottom, a pull UP
      // hands off (expand). A gesture that starts mid-content is an ordinary
      // scroll, but it is tracked all the same: the scroller can run out of
      // content while the finger is still down (see onTouchMove).
      if (!touch) {
        touchDragRef.current = null;
        return;
      }
      const scrollers = scrollChainUnder(event.target, body);
      const top = chainAtTop(scrollers);
      // The bottom edge hands off so the sheet can EXPAND, so it is only a
      // handoff when a taller detent exists. Already at the tallest, an
      // upward pull has nowhere to travel: promoting it would trade the
      // user's scroll for a rubber-band the release throws straight back, and
      // — because promotion preventDefault()s the rest of the gesture — would
      // strand the scroller for as long as the finger stays down, so reversing
      // downward to scroll back would collapse the sheet instead. Leave the
      // gesture with the content.
      const bottom = chainAtBottom(scrollers) && activeOffsetRef.current > 0;
      touchDragRef.current = {
        id: touch.identifier,
        startY: touch.clientY,
        scrollers,
        top,
        bottom,
        contentEndY: null,
        promotedAtContentEnd: false,
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      const scroller = event.currentTarget as HTMLElement;
      // `touches` lists every finger on the screen, so this also catches a
      // second finger that landed outside the body (on the handle, or off the
      // sheet), where no listener here saw it arrive.
      if (event.touches.length > 1) {
        yieldToPinchRef.current(scroller);
        return;
      }
      const armed = touchDragRef.current;
      if (dragStateRef.current) {
        const t = [...event.changedTouches].find(
          x => x.identifier === dragStateRef.current?.pointerId,
        );
        if (!t) {
          return;
        }
        if (armed?.promotedAtContentEnd && armed.contentEndY != null) {
          if (t.clientY >= armed.contentEndY) {
            // Back at the point where the content ran out. This drag never
            // cancelled the native scroll — it couldn't, the events were no
            // longer cancelable — so the scroller is about to move again. Hand
            // the gesture back rather than driving the sheet and the content
            // at once; a later pull past the end promotes again.
            armed.contentEndY = null;
            armed.promotedAtContentEnd = false;
            cancelDragRef.current(scroller);
            return;
          }
          // Deliberately NOT preventDefault()ed: the scroller is clamped at
          // its end, so there is no scrolling left to cancel, and claiming the
          // gesture would strand the content for as long as the finger is down.
          pointerMoveRef.current(asPointer(t, scroller));
          return;
        }
        event.preventDefault();
        pointerMoveRef.current(asPointer(t, scroller));
        return;
      }
      if (!armed) {
        return;
      }
      const t = [...event.changedTouches].find(x => x.identifier === armed.id);
      if (!t) {
        return;
      }
      const delta = t.clientY - armed.startY;
      // Promote to a sheet drag on a pull that opposes the armed edge and can
      // no longer scroll that way: at the top, a downward pull (delta > 0)
      // collapses; at the bottom, an upward pull (delta < 0) expands. The
      // opposite direction is a real scroll, so disarm and let it through.
      const pullDownAtTop =
        armed.top && delta > DRAG_PROMOTION_SLOP && chainAtTop(armed.scrollers);
      const pullUpAtBottom =
        armed.bottom &&
        delta < -DRAG_PROMOTION_SLOP &&
        chainAtBottom(armed.scrollers);
      if (pullDownAtTop || pullUpAtBottom) {
        event.preventDefault();
        touchDragRef.current = null;
        beginDragRef.current(
          asPointer(t, scroller),
          measureHeightRef.current(),
          armed.startY,
        );
        pointerMoveRef.current(asPointer(t, scroller));
        return;
      }
      if ((armed.top && delta < 0) || (armed.bottom && delta > 0)) {
        // Scrolling away from the armed edge; hand back to native scroll. The
        // touch stays tracked: this is the swipe that may reach the far edge.
        armed.top = false;
        armed.bottom = false;
      }
      // Reaching the end of the content mid-gesture. Arming at `touchstart`
      // cannot see this, and re-arming for a preventDefault() promotion would
      // be useless anyway: once the browser has committed the gesture to
      // scrolling, every remaining touchmove is non-cancelable. Nothing needs
      // cancelling either — the scroller is clamped at its maximum, so further
      // upward travel scrolls nothing. Anchor at the point where the content
      // ran out and give the sheet everything past it, so the pull continues
      // into the sheet with no jump and no lost scrolling.
      if (activeOffsetRef.current > 0 && chainAtBottom(armed.scrollers)) {
        if (armed.contentEndY == null) {
          armed.contentEndY = t.clientY;
        } else if (armed.contentEndY - t.clientY >= CONTENT_END_HANDOFF_SLOP) {
          armed.promotedAtContentEnd = true;
          beginDragRef.current(
            asPointer(t, scroller),
            measureHeightRef.current(),
            armed.contentEndY,
          );
          pointerMoveRef.current(asPointer(t, scroller));
        }
      } else {
        armed.contentEndY = null;
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      touchDragRef.current = null;
      const pointerId = dragStateRef.current?.pointerId;
      if (pointerId == null) {
        return;
      }
      const t = [...event.changedTouches].find(
        touch => touch.identifier === pointerId,
      );
      const target = event.currentTarget as HTMLElement;
      if (t) {
        endDragRef.current(asPointer(t, target));
      } else if (event.touches.length === 0) {
        // Some interrupted multi-touch sequences omit the active touch from
        // changedTouches. If no fingers remain, the drag cannot finish later.
        cancelDragRef.current(target);
      }
    };

    const prev = bodyNodeRef.current;
    if (prev && previousTouchHandlersRef.current) {
      const h = previousTouchHandlersRef.current;
      prev.removeEventListener('touchstart', h.start);
      prev.removeEventListener('touchmove', h.move);
      prev.removeEventListener('touchend', h.end);
      prev.removeEventListener('touchcancel', h.end);
    }
    bodyNodeRef.current = node;
    if (node) {
      node.addEventListener('touchstart', onTouchStart, {passive: true});
      node.addEventListener('touchmove', onTouchMove, {passive: false});
      node.addEventListener('touchend', onTouchEnd, {passive: true});
      node.addEventListener('touchcancel', onTouchEnd, {passive: true});
      previousTouchHandlersRef.current = {
        start: onTouchStart,
        move: onTouchMove,
        end: onTouchEnd,
      };
    } else {
      previousTouchHandlersRef.current = null;
    }
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

  // A second pointer on either surface is a pinch: yield before either
  // surface's primary-pointer handling sees it.
  const handleHandlePointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (!event.isPrimary) {
        yieldToPinch(event.currentTarget as HTMLElement);
        return;
      }
      handlePointerDown(event);
    },
    [handlePointerDown, yieldToPinch],
  );
  const handleBodyPointerDownOrPinch = useCallback(
    (event: ReactPointerEvent) => {
      if (!event.isPrimary) {
        yieldToPinch(event.currentTarget as HTMLElement);
        return;
      }
      handleBodyPointerDown(event);
    },
    [handleBodyPointerDown, yieldToPinch],
  );
  // A finger that started on the handle reports every finger on the screen,
  // so a second one landing anywhere (off the sheet included) is seen here,
  // usually before the browser gets round to cancelling the handle pointer.
  const handleHandleTouch = useCallback(
    (event: ReactTouchEvent) => {
      if (event.touches.length > 1) {
        yieldToPinch(event.currentTarget as HTMLElement);
      }
    },
    [yieldToPinch],
  );
  // The handle allows only pinch-zoom, so the browser cancels a handle drag's
  // pointer when it takes a pinch. That is not a release: return to the
  // detent rather than settling from wherever the finger had got to.
  const handleHandlePointerCancel = useCallback(
    (event: ReactPointerEvent) => {
      const state = dragStateRef.current;
      if (state?.pointerId !== event.pointerId || state.syntheticTouch) {
        return;
      }
      cancelDrag(event.currentTarget as HTMLElement);
    },
    [cancelDrag],
  );

  // The resting transform; a drag in flight writes its own to the element
  // (writeLiveTransform) and a host that owns the element's transform must not
  // render this over it while `isDragging`.
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
        // One-finger drags are the sheet's; a pinch stays the browser's.
        touchAction: 'pinch-zoom',
        overscrollBehavior: 'contain',
      },
    }),
    [activeOffset, isDragging, isOpen, isScrollAreaReconciling],
  );

  const handleProps = useMemo<SheetHandleProps>(
    () => ({
      style: {touchAction: 'pinch-zoom', cursor: 'grab'},
      onContextMenu: handleContextMenu,
      onLostPointerCapture: handleLostPointerCapture,
      onPointerDown: handleHandlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: endDrag,
      onPointerCancel: handleHandlePointerCancel,
      onTouchStart: handleHandleTouch,
      onTouchMove: handleHandleTouch,
    }),
    [
      endDrag,
      handleContextMenu,
      handleHandlePointerCancel,
      handleHandlePointerDown,
      handleHandleTouch,
      handleLostPointerCapture,
      handlePointerMove,
    ],
  );

  const bodyProps = useMemo<SheetBodyProps>(
    () => ({
      ref: bodyRef,
      onContextMenu: handleContextMenu,
      onLostPointerCapture: handleLostPointerCapture,
      onPointerDown: handleBodyPointerDownOrPinch,
      onPointerMove: handleBodyPointerMove,
      onPointerUp: handleBodyEnd,
      onPointerCancel: handleBodyEnd,
      onScroll: handleBodyScroll,
    }),
    [
      bodyRef,
      handleBodyEnd,
      handleBodyPointerDownOrPinch,
      handleBodyPointerMove,
      handleBodyScroll,
      handleContextMenu,
      handleLostPointerCapture,
    ],
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
  };
}
