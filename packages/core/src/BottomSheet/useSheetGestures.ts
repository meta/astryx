// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSheetGestures.ts
 * @input React hooks
 * @output useSheetGestures hook, its option/result types, and the height and
 *   end-inset formats a host renders for the layout split
 * @position Internal to BottomSheet; not exported from the core entry point.
 *   A dismiss edge and detents on a bottom-anchored surface are sheet
 *   concepts, so this is not a general primitive.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/BottomSheet/useSheetGestures.test.ts
 */

// A drag moves the sheet live. On release it settles to the detent nearest
// where the sheet would coast at the finger's speed, or it dismisses past the
// dismiss line. So a slow drag places and a throw closes.
//
// A settled detent is split in two: `settledLayoutOffset` is the layout
// height that the scrolling area gives up, and the rest is a transform.
// Gestures and snaps move only the transform, on the compositor. The layout
// height changes at rest, in one transition-free render with the same visible
// geometry. A peek detent keeps the full height and slides below the
// viewport.
//
// A live drag writes the transform to the element for each input sample and
// renders nothing. A drag that crosses above its base detent changes the
// transform, the height and the end inset, which only look right together.
// The move writes all three in one task, so they paint in one frame. The host
// writes the resting values after each commit, so a settle animates from
// where the finger left the sheet.
//
// A resting sheet re-resolves its detent by index on a resize, an
// orientation change, or new snap points, and re-anchors without animating.
// The pixels change meaning when the viewport changes, but the chosen stop
// does not.
//
// On touch, the body hands the gesture to the sheet when every scroller under
// the finger is at the edge that the pull opposes (see scrollChainUnder). A
// finger that lands on an edge and pulls away cancels the first touchmove. A
// finger that scrolls into the end mid-gesture cannot cancel, so it anchors
// where the content ran out and drives the sheet from the travel beyond it.
//
// A second finger is a pinch, and pinch-zoom belongs to the browser (WCAG
// 1.4.4). The surfaces declare `pinch-zoom` in `touch-action`, and a second
// finger ends any drag (yieldToPinch). There is no module-scope DOM access,
// so the hook is SSR-safe. Reduced motion skips the settle transition.

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

import {VelocityTracker} from '../gestures/VelocityTracker';
import {resolveSnapPoint} from '../motion/resolveSnapPoint';
import {rubberBand} from '../motion/rubberBand';
import {scroll} from '../motion/uikit/scroll';
import {sheet} from '../motion/uikit/sheet';
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

type StylusTouch = Touch & {touchType?: string};

// An Apple Pencil raises touch events too, marked `stylus`. Its drag is a
// pen's, as on the grabber, where WebKit reports it as a pen.
function touchPointerType(touch: Touch): string {
  return (touch as StylusTouch).touchType === 'stylus' ? 'pen' : 'touch';
}

// A mouse's or a pen's stretch past fully open: a resisted fraction of the
// drag, capped at OVERSCROLL_MAX.
const OVERSCROLL_RESISTANCE = 0.35;
// SYNC: must not exceed MIN_RESERVE in BottomSheetPanel.tsx, the smallest
// reserve the sheet keeps below the screen.
const OVERSCROLL_MAX = 48;
// Travel past the point where a scrolling gesture ran out of content before it
// hands the sheet the rest of the pull. Small enough to feel continuous with
// the scroll, large enough that a swipe merely coming to rest on the last pixel
// doesn't start a drag on jitter.
const CONTENT_END_HANDOFF_SLOP = 4;
// How far a finger resting on the body moves before the pull becomes a drag.
// A finger is never still. With no slop, a tap on a control in the sheet
// started a drag, which turns off the panel's transition, so the close that
// the tap caused cut instead of animating. 8px is the usual tap slop and is
// well under what a real pull covers in its first frames.
const DRAG_PROMOTION_SLOP = 8;
// A cancelled touchmove ends the touch's click in WebKit. A tap's wobble stays
// under this distance, so the tap keeps its click. A kept first touchmove of
// this distance already commits iOS Safari to the scroller's pan, so the
// cancel starts at it.
const PAN_CANCEL_SLOP = 5;

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

/**
 * The sheet's height, in px, while it is in motion or rests with a layout
 * split: the fully open height less the part the scrolling area gives up.
 * The host renders it and a live drag writes it; one format keeps the two
 * identical, so the render that follows a written value changes nothing.
 */
export function sheetLayoutHeight(
  sheetHeight: number,
  layoutOffset: number,
): string {
  return `${Math.max(0, sheetHeight - Math.max(0, layoutOffset))}px`;
}

/**
 * The scrolling area's end padding that preserves its scroll position across
 * a height change, or nothing when there is none to add. Shared by the host's
 * render and a live drag's write for the same reason as sheetLayoutHeight.
 */
export function scrollPreservationPadding(inset: number): string | undefined {
  return inset > 0 ? `${inset}px` : undefined;
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
 * Whether a gesture that lands on `target` began inside another layer
 * rendered in this sheet's content — a `<dialog>` between the target and the
 * body. A sheet opened from inside a sheet's content, a Dialog opened there,
 * renders its dialog as a descendant of the host's body, so its pointer and
 * touch events bubble through the host's gesture listeners. That gesture is
 * the layer's own: the host must neither arm a drag on it nor take pointer
 * the layer's own: the host must neither arm a drag on it nor take pointer
 * capture for it, which would cancel the drag the layer's own handle began.
 * A swipe reaches only the top sheet of a stack, and a covered sheet is
 * blocked.
 */
export function isInsideNestedLayer(
  target: EventTarget | null,
  body: HTMLElement,
): boolean {
  for (
    let element = target instanceof Element ? target : null;
    element != null && element !== body;
    element = element.parentElement
  ) {
    if (element.localName === 'dialog') {
      return true;
    }
  }
  return false;
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

function chainScrolls(chain: ReadonlyArray<HTMLElement>): boolean {
  return chain.some(element => element.scrollHeight - element.clientHeight > 1);
}

/**
 * iOS rubber-bands a scroller past its end even under `overscroll-behavior:
 * contain`. While the content sits at its end mid-pull, `none` holds it still,
 * so only the sheet moves. Returns the undo.
 */
function holdAtEnd(chain: ReadonlyArray<HTMLElement>): () => void {
  const previous = chain.map(element => element.style.overscrollBehaviorY);
  for (const element of chain) {
    element.style.overscrollBehaviorY = 'none';
  }
  return () => {
    chain.forEach((element, index) => {
      element.style.overscrollBehaviorY = previous[index];
    });
  };
}

function releaseContentHold(
  armed: {releaseContentHold: (() => void) | null} | null,
): void {
  if (armed?.releaseContentHold != null) {
    armed.releaseContentHold();
    armed.releaseContentHold = null;
  }
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
  /** Called once a drag first moves the sheet off its detent. */
  onTravelStart?: () => void;
  /**
   * Called with the scrim opacity the sheet should show (1 = fully visible,
   * 0 = hidden) as the drag moves and on settle. Full while the sheet is at
   * or above its mid detent, fading to 0 as it collapses onto the shortest
   * "peek" detent — thinning to a faint glance state without fully clearing — and
   * on the dismiss overshoot. Lets the owner mirror it onto the scrim.
   */
  onScrimOpacity?: (opacity: number) => void;
  /**
   * Whether the host draws the sheet at a fixed height of its own (a caller's
   * height) rather than the layout-split height. A drag across the base
   * detent then writes only the transform and the end inset, and leaves the
   * element's height to the host.
   * @default false
   */
  hasFixedHeight?: boolean;
}

/** A drag's close: the distance left to the closed position and the speed. */
export interface SheetDragExit {
  /** px from the release position to the closed position. */
  readonly distance: number;
  /** The release velocity, px/s, positive toward closed. */
  readonly velocity: number;
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
   * reduced motion, a transition that a touch drag's release starts
   * cross-fades on every pointer, so the exit's motion needs to know.
   */
  isDismissedByTouchDrag: boolean;
  /**
   * The exit a touch drag's release started: the distance left to travel and
   * the release speed. Null for a close that no touch drag started.
   */
  dragExit: SheetDragExit | null;
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
  onTravelStart,
  onScrimOpacity,
  hasFixedHeight = false,
}: UseSheetGesturesOptions): UseSheetGesturesResult {
  const [dragOffset, setDragOffset] = useState(0);
  const [settledOffset, setSettledOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  // Scoped to the one close the release requested. The release calls
  // onDismiss() and sets `pending`; the host answers in the same update, so
  // the first render afterwards says whether it took the close (its
  // controlled state now says closed: the exit under way is the drag's) or
  // refused it (a guarded onOpenChange left it open: the sheet snaps back,
  // its scrim with it, and the request is spent). Either way the flag is
  // settled during render, the prev-prop pattern, and derived back to false
  // once the sheet is open again — so a later close from a control, Escape
  // or code is never mistaken for a drag.
  const [touchDragDismissal, setTouchDragDismissal] = useState<{
    isTouch: boolean;
    pending: boolean;
    exit: SheetDragExit | null;
  } | null>(null);
  // The render that spends a refused request counts it. The layout effect
  // below answers each count.
  const [refusedDismissalCount, setRefusedDismissalCount] = useState(0);
  if (touchDragDismissal != null) {
    if (touchDragDismissal.pending) {
      if (isOpenRequested) {
        setTouchDragDismissal(null);
        setRefusedDismissalCount(count => count + 1);
      } else {
        setTouchDragDismissal({...touchDragDismissal, pending: false});
      }
    } else if (isOpenRequested) {
      setTouchDragDismissal(null);
    }
  }
  const isDismissedByDrag =
    touchDragDismissal != null &&
    !touchDragDismissal.pending &&
    !isOpenRequested;
  const isDismissedByTouchDrag =
    isDismissedByDrag && touchDragDismissal.isTouch;
  const dragExit = isDismissedByDrag ? touchDragDismissal.exit : null;
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
  const onTravelStartRef = useRef(onTravelStart);
  onTravelStartRef.current = onTravelStart;

  const onDismissRef = useRef(onDismiss);
  const canDismissRef = useRef(canDismiss);
  const onSnapRef = useRef(onSnap);
  const onScrimOpacityRef = useRef(onScrimOpacity);
  const hasFixedHeightRef = useRef(hasFixedHeight);
  useEffect(() => {
    onDismissRef.current = onDismiss;
    canDismissRef.current = canDismiss;
    onSnapRef.current = onSnap;
    onScrimOpacityRef.current = onScrimOpacity;
    hasFixedHeightRef.current = hasFixedHeight;
  });

  // The release cannot know whether the host takes the close. The host
  // answers through `isOpenRequested` in the next render. Keep the left
  // detent's scrim until then.
  const restingScrimOpacityRef = useRef<number | null>(null);
  // Syncs the host's scrim (its backdrop, written through `onScrimOpacity`)
  // with the panel's return to rest after a refusal: the panel rests on that
  // detent again, so the scrim the drag thinned toward the dismiss line rests
  // with it. The refusal changes none of the host's own scrim inputs, so the
  // drag's last value would otherwise stand.
  useLayoutEffect(() => {
    const restingScrimOpacity = restingScrimOpacityRef.current;
    if (refusedDismissalCount === 0 || restingScrimOpacity == null) {
      return;
    }
    restingScrimOpacityRef.current = null;
    onScrimOpacityRef.current?.(restingScrimOpacity);
  }, [refusedDismissalCount]);

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
    // The finger's positions on the timestamps their events carry, for the
    // release velocity (Core's one velocity tracker).
    tracker: VelocityTracker;
    height: number;
    /** The surface kept below the screen when the drag began. */
    reserve: number;
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
  // Syncs the browser layout with the transform reset, then ends the
  // scroll-area reconcile one frame later.
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
      // No measure here: reading the height while the sheet mounts forces a
      // layout in the middle of the open. The observer's first report comes
      // after the browser's own layout, before the first paint.
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
  // Releases the height observer on unmount.
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

  // The fully open height right now. At a resizing detent the element has a
  // stale pixel height. So drop the inline height, measure, and put it back in
  // the same synchronous block. The browser cannot paint in between.
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

  // A settled sheet holds its viewport-fraction detents as pixels, read at
  // gesture time. Without this, a viewport change freezes the old geometry: a
  // half-height sheet shows 75% of a shorter window, or a peek slides past the
  // whole window while the dialog stays modal. So re-resolve the same detent
  // by index and re-anchor without animating, because the geometry moved, not
  // the finger.
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

  // Syncs window resize and orientation listeners with `isOpen`. Each event
  // anchors the sheet to its settled detent again.
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

  // A live drag's layout split moved. The transform written beside this call
  // is only correct on the new split, so the height and end inset that pair
  // with it go to the elements in the same task. They are the values the host
  // renders from the state this move also sets, in the same format, so its
  // commit, whenever it lands, leaves them as they are. If the drag ends
  // before that commit, the host's post-commit write puts the resting values
  // back, since React sees no change from what it committed before the drag.
  // A host with a fixed height of its own renders that height throughout and
  // never restores a written one, so its height is not written.
  const writeLiveLayout = useCallback(
    (sheetHeight: number, layoutOffset: number) => {
      const element = sheetElRef.current;
      // Unmeasured, the host renders no height to pair with.
      if (element != null && sheetHeight > 0 && !hasFixedHeightRef.current) {
        element.style.height = sheetLayoutHeight(sheetHeight, layoutOffset);
      }
      const body = bodyNodeRef.current;
      if (body != null) {
        body.style.paddingBlockEnd =
          scrollPreservationPadding(scrollPreservationInsetRef.current) ?? '';
      }
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

  // Syncs window blur and document visibilitychange listeners with `isOpen`. A
  // blur or a hidden page cancels a drag.
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

      const closeSheet = (exit: SheetDragExit | null) => {
        if (!canDismissRef.current) {
          settleAt(maxOffset);
          return;
        }
        prepareScrollAreaSettle(
          baseLayoutOffset,
          baseOffset,
          baseLayoutOffset,
          baseLayoutOffset,
          baseLayoutOffset,
          naturalEndGap,
          false,
        );
        restingScrimOpacityRef.current = scrimOpacityForOffset(
          baseOffset,
          offsets,
          dismissOffset,
          peekOffset,
        );
        setTouchDragDismissal({isTouch, pending: true, exit});
        onDismissRef.current();
      };
      if (isTouch) {
        // A touch release takes UIKit's sheet values, with closed counted as
        // one position. A flick lands on the first position at or past its
        // projection. A release that moves back toward where the drag began
        // cancels to that detent.
        const {
          fastSpeed,
          minProjectionSpeed,
          projectionSeconds,
          detentTolerance,
        } = sheet.release;
        const points = [...offsets, maxOffset + shortestDetentHeight];
        const {index} = resolveSnapPoint({
          points,
          position: offset,
          velocity: velocity * 1000,
          flickThreshold: travel > DRAG_PROMOTION_SLOP ? fastSpeed : Infinity,
          tolerance: detentTolerance,
          flickPastProjection: true,
          projection: {
            seconds: projectionSeconds,
            minSpeed: minProjectionSpeed,
          },
          start: baseOffset,
        });
        if (index === points.length - 1) {
          closeSheet({
            distance: Math.max(0, height - offset),
            velocity: velocity * 1000,
          });
        } else {
          settleAt(points[index]);
        }
        return;
      }
      // A release that would coast past the dismiss line closes the sheet: a
      // throw from anywhere, or a slow drag that already crossed it.
      if (dir > 0 && projected > dismissOffset) {
        closeSheet(null);
        return;
      }
      // Settle to the detent nearest where the release would coast to, in the
      // drag direction (never back past the starting detent), de-duped and
      // direction-clamped by the util. A throw upward projects past the
      // tallest detent and lands on it.
      settleAt(
        resolveSettleOffset(
          Math.min(Math.max(projected, 0), maxOffset),
          offsets,
          dir,
          baseOffset,
        ),
      );
    },
    [prepareScrollAreaSettle, recordSettledLayoutOffset, resolveDetents],
  );

  const beginDrag = useCallback(
    (
      event: ReactPointerEvent,
      sheetHeight: number,
      startCoord?: number,
      // The contact's samples since it landed. A pull that begins past the
      // promotion slop still releases at the speed of the whole motion.
      tracker: VelocityTracker = new VelocityTracker(),
    ) => {
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
      tracker.add(0, event.clientY, event.timeStamp);
      dragStateRef.current = {
        syntheticTouch,
        pointerType: event.pointerType,
        pointerId: event.pointerId,
        startCoord: start,
        tracker,
        height: sheetHeight,
        reserve: offscreenBlockEndInsetRef.current,
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
      // One sample per event, on the event's own timestamp: when the finger
      // was there, however late a busy main thread handles the event.
      state.tracker.add(0, event.clientY, event.timeStamp);
      const {offsets, peekOffset} = resolveDetents(state.height);

      const raw = state.baseOffset + delta;
      const maxDetentOffset = offsets[offsets.length - 1];
      let next: number;
      if (raw < 0) {
        // A touch device's reserve covers the whole stretch. The clamp binds
        // only where the reserve is short.
        next =
          state.pointerType === 'touch'
            ? Math.max(
                -state.reserve,
                rubberBand(
                  raw,
                  state.height - state.reserve,
                  scroll.rubberBand.coefficient,
                ),
              )
            : Math.max(-OVERSCROLL_MAX, raw * OVERSCROLL_RESISTANCE);
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
      updateScrollPreservationInset(
        preservationInsetForOffset(
          state.baseLayoutOffset,
          layoutOffset,
          state.naturalEndGap,
        ),
      );
      writeLiveTransform(next, layoutOffset);
      if (hasLayoutChanged) {
        // The layout split moved. The new height and end inset are written
        // with the transform, in this task: a render scheduled normally can
        // commit after the next paint, and the transform alone on the old
        // height would put the sheet the whole split away from the finger
        // for that frame. The host still renders them from state, reading
        // the offset it has to pair with the height from here.
        writeLiveLayout(state.height, layoutOffset);
        setDragOffset(next);
      }
      if (!state.hasTraveled && next !== state.baseOffset) {
        state.hasTraveled = true;
        setIsTraveling(true);
        onTravelStartRef.current?.();
      }

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
    [
      resolveDetents,
      updateScrollPreservationInset,
      writeLiveLayout,
      writeLiveTransform,
    ],
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
      // The release velocity, px/ms. A lift at a new position is the last
      // sample. A finger that held still for longer than the stillness
      // interval before the lift releases nothing in motion.
      if (state.tracker.lastSample?.y !== event.clientY) {
        state.tracker.add(0, event.clientY, event.timeStamp);
      }
      const velocity = state.tracker.velocity(event.timeStamp).y / 1000;
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

  // Pointer path for the body at-top pull-down, for a mouse or a pen. A
  // finger's drag belongs to the non-passive touch listeners below, so its
  // touch-down drops this arm.
  const armedBodyRef = useRef<{
    pointerId: number;
    startCoord: number;
    scrollers: HTMLElement[];
    tracker: VelocityTracker;
  } | null>(null);

  const handleBodyPointerDown = useCallback((event: ReactPointerEvent) => {
    if (event.button !== 0 || !event.isPrimary) {
      return;
    }
    const body = event.currentTarget as HTMLElement;
    // A gesture inside a layer this sheet hosts belongs to that layer.
    if (isInsideNestedLayer(event.target, body)) {
      armedBodyRef.current = null;
      return;
    }
    const scrollers = scrollChainUnder(event.target, body);
    if (!chainAtTop(scrollers)) {
      armedBodyRef.current = null;
      return;
    }
    const tracker = new VelocityTracker();
    tracker.add(0, event.clientY, event.timeStamp);
    armedBodyRef.current = {
      pointerId: event.pointerId,
      startCoord: event.clientY,
      scrollers,
      tracker,
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
      armed.tracker.add(0, event.clientY, event.timeStamp);
      if (delta > DRAG_PROMOTION_SLOP && chainAtTop(armed.scrollers)) {
        // Downward pull at the top: promote to a sheet drag, anchored at the
        // original pointer-down position so the pull distance carries over.
        armedBodyRef.current = null;
        beginDrag(event, measureHeight(), armed.startCoord, armed.tracker);
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
    startX: number;
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
    // Null while no hold is set.
    releaseContentHold: (() => void) | null;
    // The finger's positions since it landed, for the release velocity of a
    // drag that this touch begins.
    tracker: VelocityTracker;
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
      releaseContentHold(touchDragRef.current);
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
    const asPointer = (touch: Touch, target: HTMLElement, event: TouchEvent) =>
      ({
        syntheticTouch: true,
        pointerId: touch.identifier,
        pointerType: touchPointerType(touch),
        clientY: touch.clientY,
        // The touch event's own time: when the finger was there, however
        // late this handler runs.
        timeStamp: event.timeStamp,
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
      // A finger raises pointer events before its touch events, so the
      // pointer path arms for it too. That path begins the drag first and
      // takes pointer capture from the element under the finger. The capture
      // change then cancels the drag. So a contact that raises touch events
      // belongs to this path.
      armedBodyRef.current = null;
      const touch = event.changedTouches[0];
      // Record where the gesture began and whether it began at a scroll edge.
      // At the top, a pull DOWN hands off (collapse); at the bottom, a pull UP
      // hands off (expand). A gesture that starts mid-content is an ordinary
      // scroll, but it is tracked all the same: the scroller can run out of
      // content while the finger is still down (see onTouchMove). A touch
      // inside a layer this sheet hosts is that layer's, never tracked here.
      releaseContentHold(touchDragRef.current);
      if (!touch || isInsideNestedLayer(event.target, body)) {
        touchDragRef.current = null;
        return;
      }
      const scrollers = scrollChainUnder(event.target, body);
      const top = chainAtTop(scrollers);
      // Claiming a pull up from its first move blocks the content's scroll for
      // the whole touch. So it is claimed here only below the tallest detent,
      // or over content that cannot scroll. At the tallest detent, a list at
      // its end keeps its touch. Its pull reaches the sheet through the
      // content-end hand-off below, and a reversal hands it back.
      const bottom =
        chainAtBottom(scrollers) &&
        (activeOffsetRef.current > 0 || !chainScrolls(scrollers));
      const tracker = new VelocityTracker();
      tracker.add(0, touch.clientY, event.timeStamp);
      touchDragRef.current = {
        id: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        scrollers,
        top,
        bottom,
        contentEndY: null,
        promotedAtContentEnd: false,
        releaseContentHold: null,
        tracker,
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
            releaseContentHold(armed);
            cancelDragRef.current(scroller);
            return;
          }
          // Deliberately NOT preventDefault()ed: the scroller is clamped at
          // its end, so there is no scrolling left to cancel, and claiming the
          // gesture would strand the content for as long as the finger is down.
          pointerMoveRef.current(asPointer(t, scroller, event));
          return;
        }
        event.preventDefault();
        pointerMoveRef.current(asPointer(t, scroller, event));
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
      armed.tracker.add(0, t.clientY, event.timeStamp);
      // A pull against the armed edge can never scroll: the chain is at that
      // edge. Its native pan is cancelled before the promotion slop, once the
      // pull passes a tap's wobble, because a later cancel no longer stops a
      // pan iOS Safari has committed. A mostly sideways move is a horizontal
      // row's scroll, so the sheet does not cancel it.
      const opposesTop = armed.top && delta > 0 && chainAtTop(armed.scrollers);
      const opposesBottom =
        armed.bottom && delta < 0 && chainAtBottom(armed.scrollers);
      const sideways = Math.abs(t.clientX - armed.startX);
      const isMostlyVertical = Math.abs(delta) > sideways;
      if (
        (opposesTop || opposesBottom) &&
        Math.abs(delta) >= PAN_CANCEL_SLOP &&
        isMostlyVertical &&
        event.cancelable
      ) {
        event.preventDefault();
      }
      // Promote to a sheet drag on a pull that opposes the armed edge and can
      // no longer scroll that way: at the top, a downward pull (delta > 0)
      // collapses; at the bottom, an upward pull (delta < 0) expands. The
      // opposite direction is a real scroll, so disarm and let it through.
      const pullDownAtTop =
        opposesTop && isMostlyVertical && delta > DRAG_PROMOTION_SLOP;
      const pullUpAtBottom =
        opposesBottom && isMostlyVertical && delta < -DRAG_PROMOTION_SLOP;
      if (pullDownAtTop || pullUpAtBottom) {
        if (event.cancelable) {
          event.preventDefault();
        }
        releaseContentHold(armed);
        touchDragRef.current = null;
        beginDragRef.current(
          asPointer(t, scroller, event),
          measureHeightRef.current(),
          armed.startY,
          armed.tracker,
        );
        pointerMoveRef.current(asPointer(t, scroller, event));
        return;
      }
      // The first move past the drag slop on either axis decides the touch,
      // once. A drag that started later would move the sheet by the whole
      // travel at once. A mostly sideways move is a row's scroll or swipe, so
      // the sheet stops tracking the touch. Any other move that did not start
      // the drag is the content's scroll, and both edges go back to it.
      const isPastDragSlop =
        Math.max(Math.abs(delta), sideways) > DRAG_PROMOTION_SLOP;
      if (isPastDragSlop && (armed.top || armed.bottom)) {
        if (!isMostlyVertical) {
          releaseContentHold(armed);
          touchDragRef.current = null;
          return;
        }
        armed.top = false;
        armed.bottom = false;
      }
      // Under the drag slop, an armed edge goes back to the native scroll when
      // a move leaves it, on two conditions. The content has room to scroll
      // that way. The move has passed a tap's wobble, because a shorter move
      // commits no native pan. The touch stays tracked, because this swipe can
      // reach the far edge. Content that fits has nothing to scroll, so both
      // edges stay armed.
      if (
        armed.top &&
        delta <= -PAN_CANCEL_SLOP &&
        !chainAtBottom(armed.scrollers)
      ) {
        armed.top = false;
      }
      if (
        armed.bottom &&
        delta >= PAN_CANCEL_SLOP &&
        !chainAtTop(armed.scrollers)
      ) {
        armed.bottom = false;
      }
      // Reaching the end of the content mid-gesture. Arming at `touchstart`
      // cannot see this, and re-arming for a preventDefault() promotion would
      // be useless anyway: once the browser has committed the gesture to
      // scrolling, every remaining touchmove is non-cancelable. Nothing needs
      // cancelling either: the hold clamps the scroller at its maximum, so
      // further upward travel scrolls nothing. Anchor at the point where the content
      // ran out and give the sheet everything past it, so the pull continues
      // into the sheet with no jump and no lost scrolling.
      if (chainAtBottom(armed.scrollers)) {
        if (armed.contentEndY == null) {
          armed.contentEndY = t.clientY;
          armed.releaseContentHold ??= holdAtEnd(armed.scrollers);
        } else if (armed.contentEndY - t.clientY >= CONTENT_END_HANDOFF_SLOP) {
          armed.promotedAtContentEnd = true;
          beginDragRef.current(
            asPointer(t, scroller, event),
            measureHeightRef.current(),
            armed.contentEndY,
            armed.tracker,
          );
          pointerMoveRef.current(asPointer(t, scroller, event));
        }
      } else {
        armed.contentEndY = null;
        releaseContentHold(armed);
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      releaseContentHold(touchDragRef.current);
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
        endDragRef.current(asPointer(t, target, event));
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
        // reduced-motion cross-fade on a coarse pointer.
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
    dragExit,
    activeOffsetRef,
    sheetHeight,
    scrollPreservationInset,
    settlingLayoutOffset,
    settledLayoutOffset,
    completeScrollAreaSettle,
  };
}
