// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSheetGestures.ts
 * @input Uses React (useCallback, useEffect, useMemo, useRef, useState) and
 *   the core useMediaQuery hook
 * @output Exports useSheetGestures hook, its option/result types, and the
 *   height and end-inset formats a host renders for the layout split
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
 * main thread is busy. That crossing changes three things that only look
 * right together: the travel, the sheet's height and the scrolling area's end
 * inset. The move writes all three to the elements in the same task, so the
 * browser paints them in one frame, and the render it schedules catches the
 * host up to the same values whenever it commits. A finger landing on a
 * settling sheet catches it where the curve says it is. When the settle
 * lands, the host writes the new resting transform and `translate` returns
 * to zero in the same commit as the layout reconcile. Outside a drag the host
 * also writes the resting height and end inset after each commit (a host with
 * a fixed height of its own keeps that height, and the drag never writes it),
 * so a release processed before the crossing move's render commits still
 * leaves the sheet drawn at its resting detent. The live offset is readable
 * through `activeOffsetRef`. Under a mouse the release keeps the theme's
 * duration and easing instead of UIKit's springs (releaseMotion.ts), on the
 * same channel.
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
  type TouchEvent as ReactTouchEvent,
  type UIEvent as ReactUIEvent,
} from 'react';
import {VelocityTracker} from '../gestures/VelocityTracker';
import {playHaptic} from '../gestures/haptics';
import {readTouchPresentation} from './sheetTouch';
import {lockSheetSelection} from './sheetSelectionLock';
import {TOUCH_QUERY} from '../utils/touchPresentation';
import {useMediaQuery} from '../hooks';
import {
  createAnimator,
  type Animator,
  type MotionCurve,
  type MotionHandle,
} from '../motion/animator';
import {rubberBand} from '../motion/rubberBand';
import {solveSpring, toSpring, type SpringDescription} from '../motion/spring';
import {sheet as sheetTable} from '../motion/uikit/sheet';
import {SHEET_DETENT_SPRING} from '../motion/uikit/springs';
import {
  readReleaseMotion,
  themeCurve,
  type ReleaseMotion,
} from './releaseMotion';
import {
  DEFAULT_DISMISS_OVERSHOOT_RATIO,
  limitOvershoot,
  resolveDefaultRelease,
  resolveSheetRelease,
} from './sheetRelease';
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

// Gone: the sheet's top at the bottom of the screen. A release under a finger
// can carry the sheet there (sheetRelease.ts).
function dismissedOffsetFor(
  maxOffset: number,
  shortestDetentHeight: number,
): number {
  return maxOffset + shortestDetentHeight;
}
// Where the scrim reaches clear. Under a finger, gone: UIKit's dim is linear
// from the shortest detent to the dismissed position. Under a mouse, today's
// dismiss line: DEFAULT_DISMISS_OVERSHOOT_RATIO of the shortest detent's
// height below it.
function scrimClearOffset(
  maxOffset: number,
  shortestDetentHeight: number,
  isUIKit: boolean,
): number {
  return isUIKit
    ? dismissedOffsetFor(maxOffset, shortestDetentHeight)
    : maxOffset + shortestDetentHeight * DEFAULT_DISMISS_OVERSHOOT_RATIO;
}
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
// Today's drag (a mouse anywhere, and anything where the primary pointer is
// fine) keeps the sheet's pointer behavior (spec:AST-017 FR59): within this
// many px of a detent the live drag eases toward it, so it "clicks" into place
// instead of hovering just off the mark. Under UIKit's presentation the sheet
// tracks 1:1, as UIKit's does.
const MAGNET_RANGE = 40;
// Rubber-band factor for today's drag up past fully open. Under UIKit's
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
 * capture for it, which would cancel the drag the layer's own handle began
 * (`component:BottomSheet` FR7: a swipe reaches only the top sheet of a
 * stack; FR6: a covered sheet is blocked).
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
   * Whether the host draws the sheet at a fixed height of its own (a caller's
   * height) rather than the layout-split height. A drag across the base
   * detent then writes only the transform and the end inset, and leaves the
   * element's height to the host.
   * @default false
   */
  hasFixedHeight?: boolean;
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
  hasFixedHeight = false,
  onScrimTracking,
  isScrimShown,
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
  const hasFixedHeightRef = useRef(hasFixedHeight);
  const onScrimTrackingRef = useRef(onScrimTracking);
  const isScrimShownRef = useRef(isScrimShown);
  useEffect(() => {
    onDismissRef.current = onDismiss;
    canDismissRef.current = canDismiss;
    onSnapRef.current = onSnap;
    onScrimOpacityRef.current = onScrimOpacity;
    hasFixedHeightRef.current = hasFixedHeight;
    onScrimTrackingRef.current = onScrimTracking;
    isScrimShownRef.current = isScrimShown;
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
  // Plays the dim along the sheet's curve: `offsetAt(t)` is where the sheet
  // is `t` s after `at`.
  const followScrim = useCallback(
    (
      curve: {duration: number; offsetAt: (t: number) => number},
      dimFor: (offset: number) => number,
      at: number,
      touchRelease = false,
    ) => {
      const dialog = sheetElRef.current?.closest('dialog');
      // Only on the stack's visible backdrop: a transparent one stays clear.
      if (
        !isScrimTrackingRef.current ||
        dialog == null ||
        isScrimShownRef.current?.() === false
      ) {
        return;
      }
      stopScrimFollow();
      const dim = (t: number) => dimFor(curve.offsetAt(t));
      const dimCurve: MotionCurve = {
        duration: curve.duration,
        at: dim,
        velocity: t => {
          const h = 0.0005;
          const a = Math.max(0, t - h);
          const b = Math.min(curve.duration, t + h);
          return b > a ? (dim(b) - dim(a)) / (b - a) : 0;
        },
      };
      const scrim = createAnimator(dialog, {pseudoElement: '::backdrop'});
      scrimAnimatorRef.current = scrim;
      // Starts from the dim on screen, so a reduced-motion fade does too.
      scrim.set({opacity: dim(0)});
      // Under reduced motion the animator fades the dim to its end value
      // (200 ms or less, or at once with a fine pointer; design:reduced-motion).
      scrim.play({opacity: dimCurve}, {at, touchRelease});
    },
    [stopScrimFollow],
  );
  // The dim map of the last release, for a spring-back that interrupts it.
  const lastDimForRef = useRef<((offset: number) => number) | null>(null);

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
    // release velocity (the gesture foundation's estimator, UIKit's filter).
    tracker: VelocityTracker;
    height: number;
    baseOffset: number;
    baseLayoutOffset: number;
    renderedOffset: number;
    // The layout split the drag asks the host for (setDragOffset) ...
    layoutOffset: number;
    // ... and the one the sheet is drawn with: the move that changes the
    // split writes the new height and end inset with its travel
    // (writeLiveLayout), and a commit of the host re-pairs the travel with
    // the split it rendered. The travel, a release and a cancel all read it.
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
  // The settle, return or exit running on the travel channel, if any.
  const travelHandleRef = useRef<MotionHandle | null>(null);
  // Which timing the gesture's release runs on: UIKit's springs under a
  // finger, the theme's under a mouse. Read once per drag.
  const releaseMotionRef = useRef<ReleaseMotion>({kind: 'uikit'});
  // Set while a drag-dismissed sheet is carried off screen by its release
  // spring (see SheetGestureExit).
  const gestureExitRef = useRef<SheetGestureExit | null>(null);
  // Counts the sheet's mounts: the dialog-level touch listeners (see
  // `drawnSheetRect`) attach once it is in the DOM. The node itself stays in
  // `sheetElRef`, out of React state.
  const [sheetMounts, setSheetMounts] = useState(0);
  const sheetRef = useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      sheetElRef.current = node;
      setSheetMounts(mounts => mounts + 1);
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
  // one).
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
      // The sheet's animator too, the compositor `translate` it moves: back
      // to rest, with no exit pending.
      gestureExitRef.current = null;
      travelHandleRef.current = null;
      animator.set({y: 0});
      // And the dialog's ::backdrop dim: its animation stops, and the host
      // gets its own easing back.
      stopScrimFollow();
      if (isScrimTrackingRef.current) {
        isScrimTrackingRef.current = false;
        onScrimTrackingRef.current?.(false);
      }
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
        scrimClearOffset(
          maxOffset,
          shortestDetentHeight,
          readTouchPresentation().isTouch,
        ),
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

  // Whether the primary pointer is coarse, subscribed: the catch's touch-only
  // listeners exist only then (spec:AST-094 FR24), and come and go with it.
  const coarsePrimary = useMediaQuery(TOUCH_QUERY);

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
      const to = offset - base;
      const from = animator.get('y');
      const motion = releaseMotionRef.current;
      // One clock for the sheet and its dim.
      const at = performance.now();
      // Under reduced motion the animator's own cross-fade replaces the
      // travel (design:reduced-motion). A finger started it, so it fades
      // whatever the primary pointer (DR2).
      const touchRelease = dragTouchRef.current;
      let handle: MotionHandle;
      if (motion.kind === 'theme') {
        const curve = themeCurve(from, to, motion);
        handle = animator.play({y: curve}, {at, crossfadeAs, touchRelease});
        if (dimFor != null) {
          scrimOwnerRef.current = 'release';
          followScrim(
            {duration: curve.duration, offsetAt: t => base + curve.at(t)},
            dimFor,
            at,
            touchRelease,
          );
        }
      } else {
        // Thrown up onto the tallest detent, the 80 % damped spring overshoots
        // above it; the sheet extends only its reserve below the screen, so
        // the hand-off is capped to keep the page from showing under it.
        const handed = velocity ?? animator.getVelocity('y');
        const v =
          offset === 0
            ? limitOvershoot(
                spring,
                from,
                to,
                handed,
                offscreenBlockEndInsetRef.current,
              )
            : handed;
        handle = animator.animate(
          {y: to},
          {spring, velocity: {y: v}},
          {at, crossfadeAs, touchRelease},
        );
        if (dimFor != null) {
          const curve = solveSpring(toSpring(spring), {from, to, velocity: v});
          scrimOwnerRef.current = 'release';
          followScrim(
            {
              duration: curve.settleTime(0.5),
              offsetAt: t => base + curve.value(t),
            },
            dimFor,
            at,
            touchRelease,
          );
        }
      }
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
      followScrim,
      releaseScrimTracking,
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
      unlockSelection();
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
            releaseMotionRef.current.kind === 'uikit',
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
      const clearOffset = scrimClearOffset(
        maxOffset,
        shortestDetentHeight,
        releaseMotionRef.current.kind === 'uikit',
      );
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
    },
    [
      endScrimTracking,
      prepareScrollAreaSettle,
      releaseAnimates,
      resolveDetents,
      springTravel,
      unlockSelection,
    ],
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
      today: {direction: number; travel: number; velocity: number},
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
      const isUIKit = releaseMotionRef.current.kind === 'uikit';
      const dismissedOffset = dismissedOffsetFor(
        maxOffset,
        shortestDetentHeight,
      );
      // Where the scrim reaches clear, and the dim at any offset this release
      // passes through.
      const clearOffset = scrimClearOffset(
        maxOffset,
        shortestDetentHeight,
        isUIKit,
      );
      const dimFor = (o: number) =>
        scrimOpacityForOffset(o, offsets, clearOffset, peekOffset);
      lastDimForRef.current = dimFor;
      // UIKit's rule under a finger; today's under a mouse (sheetRelease.ts).
      const release = isUIKit
        ? resolveSheetRelease({
            detents: offsets,
            dismissedOffset: canDismissRef.current ? dismissedOffset : null,
            position: offset,
            velocity,
            // A release moving back toward where the drag began cancels
            // (spec:AST-094 FR37).
            start: baseOffset,
          })
        : resolveDefaultRelease({
            detents: offsets,
            shortestDetentHeight,
            dismissible: canDismissRef.current,
            position: offset,
            velocity: today.velocity,
            travel: today.travel,
            direction: today.direction,
            startOffset: baseOffset,
          });

      if (release.kind === 'dismiss') {
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
            dismissedOffset,
            baseLayoutOffset,
            release.spring,
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

      const target = release.offset;
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
        springTravel(target, layoutOffset, release.spring, velocity, dimFor);
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

  const beginDrag = useCallback(
    (event: ReactPointerEvent, sheetHeight: number, startCoord?: number) => {
      // A closing sheet is not grabbed: its exit owns the surface.
      if (!isOpenRef.current) {
        return;
      }
      const target = event.currentTarget as HTMLElement;
      const syntheticTouch = isSyntheticTouch(event);
      dragTouchRef.current = syntheticTouch || event.pointerType === 'touch';
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
        syntheticTouch ? 'touch' : event.pointerType,
      );
      // Selection and the callout go off with UIKit's presentation, the same
      // answer as the tracking and the release: a finger where the primary
      // pointer is fine keeps the browser's (spec:AST-094 FR19).
      if (releaseMotionRef.current.kind === 'uikit') {
        lockSelection(event.target);
      }
      const tracker = new VelocityTracker();
      tracker.add(0, event.clientY, event.timeStamp);
      dragStateRef.current = {
        syntheticTouch,
        pointerType: syntheticTouch ? 'touch' : event.pointerType,
        pointerId: event.pointerId,
        startCoord: start,
        tracker,
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
      // One sample per event, as UIKit's velocity filter takes them, on the
      // event's own timestamp: when the finger was there, however late a busy
      // main thread gets to the event.
      state.tracker.add(0, event.clientY, event.timeStamp);
      const {offsets, peekOffset} = resolveDetents(state.height);

      const raw = state.baseOffset + delta;
      // Under UIKit's presentation (a finger or a pen where the primary
      // pointer is coarse, the same answer as the release's) the sheet tracks
      // as UIKit's does, with the record's rubber band past fully open
      // (spec:AST-094 FR3); otherwise today's pointer behavior (spec:AST-017
      // FR59).
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
        // with the travel, in this task: a render scheduled normally can
        // commit after the next paint, and the travel alone on the old
        // height would put the sheet the whole split away from the finger
        // for that frame. The host still renders them from state, reading
        // the offset it has to pair with the height from here.
        writeLiveLayout(state.height, layoutOffset);
        state.committedLayoutOffset = layoutOffset;
        setDragOffset(next);
      }
      if (!state.hasTraveled && next !== state.baseOffset) {
        state.hasTraveled = true;
        setIsTraveling(true);
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
      onScrimOpacityRef.current?.(
        scrimOpacityForOffset(
          next,
          offsets,
          scrimClearOffset(
            floorOffset,
            shortestDetentHeight,
            releaseMotionRef.current.kind === 'uikit',
          ),
          peekOffset,
        ),
      );
    },
    [
      resolveDetents,
      updateScrollPreservationInset,
      writeLiveLayout,
      writeLiveTransform,
    ],
  );

  // The host committed a drag's layout split (the panel derives it from
  // these, as here). The move that changed the split already wrote it with
  // its travel; a commit that renders another split (a render committing
  // after a later move) re-pairs the travel with it before it paints, so the
  // sheet stays under the finger.
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
      // The finger's velocity at the lift, in px/s, as UIKit reports it: from
      // the positions on the timestamps their events carried, so a busy main
      // thread handing them over late does not change it. A lift where the
      // finger last was adds nothing; one after the finger held still for
      // longer than the stillness interval reads 0 (spec:AST-100 FR2: a still
      // finger never flicks), read at the lift's own time.
      if (state.tracker.lastSample?.y !== event.clientY) {
        state.tracker.add(0, event.clientY, event.timeStamp);
      }
      const velocity = state.tracker.velocity(event.timeStamp).y;
      // Today's inputs, for a release under a mouse: the drag's direction
      // and travel, and the release velocity every pointer reads
      // (spec:AST-100 FR2, FR4).
      const today = {
        direction: delta === 0 ? 0 : delta > 0 ? 1 : -1,
        travel: Math.abs(delta),
        velocity,
      };
      dragStateRef.current = null;
      unlockSelection();
      if (!state.syntheticTouch) {
        target.releasePointerCapture?.(event.pointerId);
      }
      setIsDragging(false);
      setIsTraveling(false);
      settleFromDrag(
        offset,
        velocity,
        today,
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
  // The body's touch handlers, made with its node; attached by an Effect.
  const bodyTouchHandlersRef = useRef<{
    start: (e: TouchEvent) => void;
    move: (e: TouchEvent) => void;
    end: (e: TouchEvent) => void;
  } | null>(null);
  const [bodyMounts, setBodyMounts] = useState(0);

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

  // A finger on the drawn sheet during a release. WebKit (iOS Safari 26.2)
  // hit-tests an element that a compositor animation is moving at its
  // un-animated position, and reports that rect too, so a touch on the moving
  // sheet lands on whatever sat there when the release began: the scrim, or
  // content the sheet has left. While a release travels, a touch on the
  // dialog is mapped through the sheet's drawn rect instead (its layout box,
  // its resting transform and the animator's current travel, never a rect
  // read): inside, it catches the sheet at touch-down and is never a scrim
  // tap; outside, it is left alone.
  const drawnSheetRect = useCallback(() => {
    const sheet = sheetElRef.current;
    if (sheet == null) {
      return null;
    }
    // offsetTop/offsetLeft ignore transforms, in every engine.
    let top = 0;
    let left = 0;
    for (
      let node: HTMLElement | null = sheet;
      node != null;
      node = node.offsetParent as HTMLElement | null
    ) {
      top += node.offsetTop;
      left += node.offsetLeft;
    }
    const resting = getComputedStyle(sheet).transform;
    const restingY =
      resting !== '' && resting !== 'none'
        ? new DOMMatrixReadOnly(resting).m42
        : 0;
    const drawnTop = top + restingY + animator.get('y');
    return {
      top: drawnTop,
      bottom: drawnTop + sheet.offsetHeight,
      left,
      right: left + sheet.offsetWidth,
    };
  }, [animator]);
  const caughtTouchRef = useRef<number | null>(null);
  const suppressClickUntilRef = useRef(-Infinity);
  useEffect(() => {
    const sheetNode = sheetElRef.current;
    const dialog = sheetNode?.closest('dialog');
    // Touch-only work: none where the primary pointer is fine (spec:AST-094
    // FR24).
    if (!isOpen || !coarsePrimary || sheetNode == null || dialog == null) {
      return;
    }
    const asPointer = (touch: Touch, timeStamp: number) =>
      ({
        syntheticTouch: true,
        pointerId: touch.identifier,
        clientY: touch.clientY,
        timeStamp,
        // Where the finger landed: what the selection lock reads.
        target: touch.target,
        currentTarget: sheetNode,
        setPointerCapture: () => {},
        releasePointerCapture: () => {},
      }) as unknown as ReactPointerEvent;
    const find = (list: TouchList, id: number): Touch | null => {
      for (let i = 0; i < list.length; i++) {
        if (list[i].identifier === id) {
          return list[i];
        }
      }
      return null;
    };
    const onDrawnSheet = (x: number, y: number) => {
      const rect = drawnSheetRect();
      return (
        rect != null &&
        y >= rect.top &&
        y <= rect.bottom &&
        x >= rect.left &&
        x <= rect.right
      );
    };
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.changedTouches[0] as Touch | undefined;
      if (
        travelHandleRef.current == null ||
        event.touches.length !== 1 ||
        touch == null ||
        !onDrawnSheet(touch.clientX, touch.clientY)
      ) {
        return;
      }
      // The sheet's: not the stale target's (handle, body or scrim).
      event.stopPropagation();
      caughtTouchRef.current = touch.identifier;
      suppressClickUntilRef.current = Infinity;
      beginDragRef.current(
        asPointer(touch, event.timeStamp),
        measureHeightRef.current(),
      );
    };
    const onTouchMove = (event: TouchEvent) => {
      const id = caughtTouchRef.current;
      const touch = id == null ? null : find(event.changedTouches, id);
      if (touch == null) {
        return;
      }
      event.stopPropagation();
      if (event.cancelable) {
        event.preventDefault();
      }
      pointerMoveRef.current(asPointer(touch, event.timeStamp));
    };
    const onTouchEnd = (event: TouchEvent) => {
      const id = caughtTouchRef.current;
      const touch = id == null ? null : find(event.changedTouches, id);
      if (touch == null) {
        return;
      }
      event.stopPropagation();
      caughtTouchRef.current = null;
      // A tap's click follows the lift, on the stale target: not a scrim tap.
      suppressClickUntilRef.current = performance.now() + 700;
      if (event.type === 'touchcancel') {
        cancelDragRef.current();
      } else {
        endDragRef.current(asPointer(touch, event.timeStamp));
      }
    };
    // The same finger's pointer events belong to the touch above, never to
    // the stale target's handlers.
    const onPointer = (event: PointerEvent) => {
      if (
        event.pointerType === 'touch' &&
        (caughtTouchRef.current != null ||
          (event.type === 'pointerdown' &&
            travelHandleRef.current != null &&
            onDrawnSheet(event.clientX, event.clientY)))
      ) {
        event.stopPropagation();
      }
    };
    const onClick = (event: MouseEvent) => {
      if (performance.now() <= suppressClickUntilRef.current) {
        suppressClickUntilRef.current = -Infinity;
        event.stopPropagation();
        event.preventDefault();
      }
    };
    const touchTypes = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];
    const touchHandlers = [onTouchStart, onTouchMove, onTouchEnd, onTouchEnd];
    const pointerTypes = [
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel',
    ];
    touchTypes.forEach((type, i) =>
      dialog.addEventListener(type, touchHandlers[i] as EventListener, {
        capture: true,
        passive: type !== 'touchmove',
      }),
    );
    pointerTypes.forEach(type =>
      dialog.addEventListener(type, onPointer as EventListener, true),
    );
    dialog.addEventListener('click', onClick, true);
    return () => {
      touchTypes.forEach((type, i) =>
        dialog.removeEventListener(type, touchHandlers[i] as EventListener, {
          capture: true,
        }),
      );
      pointerTypes.forEach(type =>
        dialog.removeEventListener(type, onPointer as EventListener, true),
      );
      dialog.removeEventListener('click', onClick, true);
      caughtTouchRef.current = null;
    };
  }, [coarsePrimary, drawnSheetRect, isOpen, sheetMounts]);

  const bodyRef = useCallback((node: HTMLElement | null) => {
    // `timeStamp` is the touch event's own: when the finger was there, on the
    // same clock as pointer events, not when a busy main thread handled it.
    const asPointer = (touch: Touch, target: HTMLElement, timeStamp: number) =>
      ({
        syntheticTouch: true,
        pointerId: touch.identifier,
        clientY: touch.clientY,
        timeStamp,
        // Where the finger landed: what the selection lock reads.
        target: touch.target,
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
      // content while the finger is still down (see onTouchMove). A touch
      // inside a layer this sheet hosts is that layer's, never tracked here.
      if (!touch || isInsideNestedLayer(event.target, body)) {
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
          pointerMoveRef.current(asPointer(t, scroller, event.timeStamp));
          return;
        }
        event.preventDefault();
        pointerMoveRef.current(asPointer(t, scroller, event.timeStamp));
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
          asPointer(t, scroller, event.timeStamp),
          measureHeightRef.current(),
          armed.startY,
        );
        pointerMoveRef.current(asPointer(t, scroller, event.timeStamp));
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
            asPointer(t, scroller, event.timeStamp),
            measureHeightRef.current(),
            armed.contentEndY,
          );
          pointerMoveRef.current(asPointer(t, scroller, event.timeStamp));
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
        endDragRef.current(asPointer(t, target, event.timeStamp));
      } else if (event.touches.length === 0) {
        // Some interrupted multi-touch sequences omit the active touch from
        // changedTouches. If no fingers remain, the drag cannot finish later.
        cancelDragRef.current(target);
      }
    };

    bodyNodeRef.current = node;
    bodyTouchHandlersRef.current =
      node == null
        ? null
        : {start: onTouchStart, move: onTouchMove, end: onTouchEnd};
    setBodyMounts(mounts => mounts + 1);
  }, []);
  // The body's touch listeners, for a finger under any primary pointer: a
  // touchscreen laptop's finger pulls the sheet from the content's top as a
  // phone's does, where the pointer listeners would lose it to the browser's
  // scroll. Under a fine pointer a component may listen on its own element
  // (spec:AST-094 FR24). Attached for each mounted body, removed when it
  // goes.
  useEffect(() => {
    const node = bodyNodeRef.current;
    const h = bodyTouchHandlersRef.current;
    if (node == null || h == null) {
      return;
    }
    node.addEventListener('touchstart', h.start, {passive: true});
    node.addEventListener('touchmove', h.move, {passive: false});
    node.addEventListener('touchend', h.end, {passive: true});
    node.addEventListener('touchcancel', h.end, {passive: true});
    return () => {
      node.removeEventListener('touchstart', h.start);
      node.removeEventListener('touchmove', h.move);
      node.removeEventListener('touchend', h.end);
      node.removeEventListener('touchcancel', h.end);
    };
  }, [bodyMounts]);

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
    gestureExitRef,
    resetTravel,
  };
}
