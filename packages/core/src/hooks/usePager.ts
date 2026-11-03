// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file usePager.ts
 * @input A viewport and its track, a page count and gap (or the track's
 *   children), the gesture system and the animator
 * @output Exports `createPager` (the framework-free pager), `usePager` (its
 *   React face) and their types
 * @position Shared hook for core components that page like a UIKit paging
 *   scroll view, such as Carousel's paging presentation
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/usePager.test.ts
 * - /packages/core/src/hooks/__tests__/usePager.interaction.browser.spec.ts
 */

import {useEffect, useRef, useState, type RefObject} from 'react';
import {getGestureHost, type GestureHost} from '../gestures/GestureHost';
import type {GestureRecognizer} from '../gestures/GestureRecognizer';
import {LongPressGestureRecognizer} from '../gestures/LongPressGestureRecognizer';
import {useAttachmentPair} from './useAttachment';
import {lockSelection, locksSelectionFor} from '../gestures/selectionLock';
import {
  PanGestureRecognizer,
  type PanGestureRecognizerOptions,
} from '../gestures/PanGestureRecognizer';
import type {
  GestureEventContext,
  GestureTouch,
  Point,
  PointerKind,
} from '../gestures/types';
import {
  animatorFor,
  type Animator,
  type MotionCurve,
  type MotionHandle,
} from '../motion/animator';
import {
  pagingSettleVelocity,
  solveAnimatedPageScroll,
  solvePaging,
} from '../motion/paging';
import {resolveMotion} from '../motion/resolveMotion';
import {resolveSnapPoint} from '../motion/resolveSnapPoint';
import {rubberBandClamp, rubberBandUnclamp} from '../motion/rubberBand';
import {paging, registerPagingTable} from '../motion/uikit/paging';
import {observeResize} from '../utils/sharedResizeObserver';
import {isRtlElement} from './isRtlElement';
import {useIsomorphicLayoutEffect} from './useIsomorphicLayoutEffect';

/** A release the pager settles: where the content is, how fast, and the page it left. */
export interface PageRelease {
  /** Content offset at the lift, px, or pages for children pages (may be past either end). */
  position: number;
  /** Content velocity at the release, px/s (the shared release velocity). */
  velocity: number;
  /** Distance between consecutive pages: page width plus the gap, px (1 for children pages). */
  stride: number;
  /** Number of pages (at least 1). */
  count: number;
  /** The page the drag started on (its rest position when the finger landed). */
  startIndex: number;
  /** Wraps around: the target may leave [0, count - 1] (the owner wraps it). */
  loop?: boolean;
}

/**
 * A pan or a screen-edge pan, told apart by its kind, never by its class.
 */
function isPanFamily(
  recognizer: GestureRecognizer,
): recognizer is PanGestureRecognizer {
  return recognizer.kind === 'pan' || recognizer.kind === 'screenEdgePan';
}

/**
 * The page a release settles on. It applies UIKit's measured paging rule
 * (`release` in uikit/paging.ts) through the release policy of
 * resolveSnapPoint.ts, with the pager's own pages and thresholds.
 *
 * - A release at `advanceSpeed` or faster is a flick: it goes to the next page
 *   in the direction of the velocity, from any content position.
 * - A slower release goes to the page nearest the content. UIKit's measured
 *   `commitFraction` is half a page, the policy's nearest snap point.
 * - A release whose velocity points back toward the start page settles there,
 *   at any travel, through the policy's `start`.
 * - The page is never more than `maxPagesFromStart` from the start page
 *   (`maxSteps`). It is clamped to the pages unless the pager loops.
 * - The policy sees only the pages within that reach of the start page. So a
 *   looping target may leave the range, and the owner wraps it.
 *
 * With children pages, positions are in pages, but the velocity stays px/s.
 * The policy reads the velocity only against `advanceSpeed` and for its
 * direction.
 *
 * @example
 * ```
 * // Released at rest 60 % of the way from page 1 to page 2: page 2.
 * pageForRelease({position: 1.6 * 402, velocity: 0, stride: 402, count: 6, startIndex: 1});
 * // Flicked forward at 600 px/s from 6 % past page 1: page 2.
 * pageForRelease({position: 1.06 * 402, velocity: 600, stride: 402, count: 6, startIndex: 1});
 * ```
 */

export function pageForRelease({
  position,
  velocity,
  stride,
  count,
  startIndex,
  loop = false,
}: PageRelease): number {
  if (!(stride > 0) || count < 1) {
    return 0;
  }
  const reach = paging.release.maxPagesFromStart;
  // A stale start page past either end (the count shrank, an overscrolled
  // track) counts from the nearest real page.
  const from = loop ? startIndex : Math.min(Math.max(startIndex, 0), count - 1);
  const first = loop ? from - reach : Math.max(0, from - reach);
  const last = loop ? from + reach : Math.min(count - 1, from + reach);
  const points = Array.from(
    {length: last - first + 1},
    (_, i) => (first + i) * stride,
  );
  const {index} = resolveSnapPoint({
    points,
    position,
    velocity,
    flickThreshold: paging.release.advanceSpeed,
    // A hair of tolerance so a release exactly on a page reads as on it.
    tolerance: 1e-6 * stride,
    start: from * stride,
    fromIndex: from - first,
    maxSteps: reach,
  });
  return first + index;
}

/** Why the target page changed. */
export type PagerChangeReason = 'drag' | 'goTo' | 'controlled';

export interface PagerOptions {
  /** Number of pages (at least 1). */
  count: number;
  /** Space between pages, px; it shows only while a page moves. @default 0 */
  gap?: number;
  /** Pages wrap around; indexes become unbounded. @default false */
  loop?: boolean;
  /**
   * What a page is. With `'viewport'`, every page is the viewport's width, at
   * index × (width + `gap`). With `'children'`, each child of the track is a
   * page at its own start edge, as `scroll-snap-align: start` places it.
   *
   * With children pages, the viewport's padding stays an inset. The travel
   * ends where the track's end meets the end of the viewport's content box. A
   * child whose start lies past that point rests there, so the last children
   * can share one page. The count is then the number of distinct pages
   * (`pageCount`). `count` and `gap` serve only before the first measure, and
   * children pages do not loop. The pager measures the children on attach, on
   * a resize, on an options change and when a drag begins. It never measures
   * while a finger moves.
   * @default 'viewport'
   */
  pages?: 'viewport' | 'children';
  /** Starting page. @default 0 */
  defaultIndex?: number;
  /**
   * The target page changed (index wrapped into [0, count)). A release
   * reports once its settle is moving; `index` has the page from the lift.
   * A controlled move (the `index` prop, or a `count` that clamps the page)
   * is the owner's own and is not reported.
   */
  onIndexChange?: (index: number, reason: PagerChangeReason) => void;
  /**
   * The track came to rest on `index` after moving on its own (a settle, a
   * `goTo`), having last rested on `previous` (equal when it returned).
   */
  onSettle?: (index: number, previous: number) => void;
  /**
   * With `pages: 'children'`: a measure found different pages (how many, or
   * where they rest) after the viewport or the track resized or the options
   * changed. Not called for the measure an attach makes: read `pageCount`
   * after attaching.
   */
  onPagesChange?: (pageCount: number) => void;
  /**
   * Called when the pan would begin, with the drag's first physical direction
   * on screen, the same in RTL. Return false to leave the touch to someone
   * else, such as a zoomed photo that can still pan that way.
   */
  shouldBeginPan?: (direction: 'left' | 'right') => boolean;
  /** Constructor options for the pan (e.g. `allowedPointerTypes`). */
  panOptions?: Partial<PanGestureRecognizerOptions>;
}

export interface GoToOptions {
  /** Animate with `setContentOffset(_:animated:)`'s curve. @default true */
  animated?: boolean;
  /** @default 'goTo' */
  reason?: PagerChangeReason;
}

export interface Pager {
  /** The page pan, for failure requirements and simultaneity. */
  readonly pan: PanGestureRecognizer;
  /** The target page, wrapped into [0, count). */
  readonly index: number;
  /** The target page, unbounded when looping. */
  readonly virtualIndex: number;
  /**
   * How many pages there are: `count`, or with `pages: 'children'` the
   * distinct pages last measured.
   */
  readonly pageCount: number;
  /** Whether the track is moving on its own (a settle or a `goTo`). */
  readonly isSettling: boolean;
  /** Whether a finger is dragging the track. */
  readonly isDragging: boolean;
  /** The content offset on screen right now, from the curve (px). */
  presentation(): number;
  /** Where page `index` rests (px). */
  pageOffset(index: number): number;
  /** The page whose rest is nearest content offset `position` (px). */
  nearestPage(position: number): number;
  /** Move to a page (wrapped to the nearest copy when looping). */
  goTo(index: number, options?: GoToOptions): void;
  /** Update options; a smaller count clamps the target page. */
  setOptions(options: Partial<PagerOptions>): void;
  /**
   * Turns the page pan on or off (the hook's `isPanEnabled`). While it is off,
   * a touch does not stop a settle or a `goTo`. A drag that it ends settles as
   * a cancelled drag does. The callbacks of that settle wait for the next
   * frame, so no callback runs inside the caller's update.
   */
  setPanEnabled(enabled: boolean): void;
  /** Attach to the elements; returns a detach function. */
  attach(viewport: HTMLElement, track: HTMLElement): () => void;
  /** Detach and stop everything (attaching again restarts it). */
  dispose(): void;
}

/**
 * The copy of page `index` nearest virtual page `from`, in a loop of `count`
 * pages. Two copies can be equally near: with two pages, or half an even
 * count away. Then it is `index` itself when that is one of them, so a step
 * to `from + 1` always goes forward.
 */
export function nearestLoopCopy(
  index: number,
  from: number,
  count: number,
): number {
  if (Math.abs(index - from) * 2 <= count) {
    return index;
  }
  return Math.round(
    from +
      (((mod(index, count) - mod(from, count) + count + count / 2) % count) -
        count / 2),
  );
}

/** Whether two measured page lists are the same to within half a pixel. */
function sameOffsets(
  a: ReadonlyArray<number>,
  b: ReadonlyArray<number> | null,
): boolean {
  return (
    b != null &&
    a.length === b.length &&
    a.every((offset, i) => Math.abs(offset - b[i]) < 0.5)
  );
}

function mod(value: number, count: number): number {
  return ((value % count) + count) % count;
}

/** A position curve seen as the track's x (mirrored for LTR). */
function toTrackCurve(curve: MotionCurve, sign: number): MotionCurve {
  // `+ 0` turns a mirrored zero (−0) into 0.
  return {
    duration: curve.duration,
    at: t => sign * curve.at(t) + 0,
    velocity: t => sign * curve.velocity(t) + 0,
  };
}

/** What a pager runs on; tests pass their own clocked host and animator. */
export interface PagerEnvironment {
  /** The gesture host; the document's shared host by default. */
  host?: GestureHost;
  /** The track's animator; `animatorFor(track)` by default. */
  animator?: Animator;
  /** Timers for the catch delay; the viewport's window's by default. */
  setTimeout?: (callback: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  /** The next animation frame; the viewport's window's by default. */
  requestFrame?: (callback: () => void) => void;
}

/**
 * The pager's pan. Its release velocity is the pan's `scrollVelocity()`, the
 * one UIScrollView hands `scrollViewWillEndDragging`. Unlike UIKit's, it reads
 * 0 after a still hold.
 *
 * Inside a scroll view, it takes UIKit's rule: a drag whose dominant axis is
 * horizontal is the pager's (`paging.nestedPanAxisRatio`, the tie included).
 * Any other drag is the page's. Like every pan, it cancels the touch's moves
 * once it begins, at its 10 pt hysteresis. Nothing claims a touch earlier.
 *
 * Inside a sheet, it keeps the sheet's rule (`axisRatio`,
 * `paging.panAxisRatio`). The arena shows the sheet as an enclosing vertical
 * pan that takes part in the touch. Between atan(1 ÷ that ratio) and 45°,
 * neither moves.
 */
class PagerPanGestureRecognizer extends PanGestureRecognizer {
  /**
   * The kind of pointer the pan follows. Under Reduce Motion a touch's
   * release cross-fades; a mouse's or a pen's lands at once on a fine
   * pointer.
   */
  pointerType: PointerKind | null = null;

  protected override touchesBegan(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    if (this.state === 'possible' && touches.length > 0) {
      this.pointerType = touches[0].pointerType;
    }
    super.touchesBegan(touches, event);
  }

  private hasEnclosingVerticalPan(): boolean {
    for (const other of this.arena?.involvedRecognizers ?? []) {
      if (
        other !== this &&
        isPanFamily(other) &&
        (other.direction === 'vertical' ||
          other.direction === 'up' ||
          other.direction === 'down')
      ) {
        return true;
      }
    }
    return false;
  }

  protected override classify(translation: Point): 'begin' | 'fail' | 'wait' {
    const decided = super.classify(translation);
    if (decided !== 'wait' || this.hasEnclosingVerticalPan()) {
      return decided;
    }
    const along = Math.abs(translation.x);
    const across = Math.abs(translation.y);
    if (along === 0 && across === 0) {
      return 'wait';
    }
    return along >= paging.nestedPanAxisRatio * across ? 'begin' : 'fail';
  }
}

/**
 * The settle catcher: a zero-duration long press that only stops the settle.
 * It never claims the touch. So a vertical swipe or a pinch that starts on a
 * settling track still reaches the page. UIKit also hands the outer scroll
 * view a vertical drag after the paging view's content stops.
 */
class SettleCatcher extends LongPressGestureRecognizer {
  /** The kind of pointer that caught the settle (see the pager's pan). */
  pointerType: PointerKind | null = null;

  override get claimsTouches(): boolean {
    return false;
  }

  protected override touchesBegan(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    if (this.state === 'possible' && touches.length > 0) {
      this.pointerType = touches[0].pointerType;
    }
    super.touchesBegan(touches, event);
  }
}

/**
 * A trackpad swipe that moved under this fraction of a page (in the pages'
 * own spacing, children pages included) releases still, whatever its
 * speed.
 */
const STILL_RELEASE_FRACTION = 0.1;

/** Whether a pan's contact is a scroll (a trackpad's), not a pointer. */
function isScrollContact(recognizer: PanGestureRecognizer): boolean {
  return recognizer.trackedTouches[0]?.scrollType != null;
}

/**
 * Creates a pager: UIKit's paging scroll view, driven by the gesture system
 * and played on the compositor. A native scroll-snap container does not run
 * UIKit's paging integrator, and it cannot share a gesture with a pinch.
 * Attach the pager to its viewport and track. It measures the page width on
 * attach, on a resize and when a drag begins, never while a finger moves.
 *
 * - A horizontal pan moves the track 1:1, with one `translate` write per
 *   move, no layout read and no React render. Past the first or last page,
 *   the track follows UIKit's rubber band, with d = the page width.
 * - At the lift, `pageForRelease` picks the page with UIKit's measured rule.
 *   The track then settles on UIKit's paging integrator (`solvePaging`),
 *   baked into keyframes.
 * - A finger that lands on a settling pager catches it `paging.catchStopMs`
 *   after the touch, as in UIKit. A drag catches it at once, from the value
 *   on screen. While the pan is off, a touch does not stop the motion.
 * - `goTo` runs the curve of `setContentOffset(_:animated:)` and cancels a
 *   drag in progress. It reads that duration and curve through
 *   `resolveMotion`.
 * - Under Reduce Motion, the drag still follows the finger, but nothing
 *   travels after the lift. A touch's release cross-fades in 200 ms on any
 *   pointer. `goTo` and a mouse's or a pen's release cross-fade on a coarse
 *   pointer, and land at once on any other.
 * - `onIndexChange` reports a release's page once its settle runs on the
 *   compositor, two frames after the frame it started in. It reports a
 *   `goTo` at once, and never a controlled change. A report still waiting at
 *   a detach or a controlled move is dropped. `onSettle` runs when the track
 *   rests.
 * - A detach ends a drag on its start page, and an unmount calls nothing.
 *   When a replaced viewport or track attaches, a motion that the detach
 *   stopped ends on its page. Its report and `onSettle` go out from a frame.
 * - A controlled `index` wins. A page that the pager reports and the owner
 *   does not take returns the pager to `index`, without a report.
 * - The pan and the catch attach for every pointer. A mouse drags the track
 *   as a finger does. The pan follows a trackpad's scroll along its axis, but
 *   never a mouse wheel's.
 * - A trackpad swipe moves the track at most one page from its start page.
 *   A swipe that moves under a tenth of a page releases still, at any speed.
 *   A swipe that lands during the last swipe's settle begins from that
 *   settle's page.
 *
 * Positions are content offsets in px, 0 at page 0 and growing toward later
 * pages. The track is translated by −position, or by +position in a
 * right-to-left viewport. The owner renders the pages: all of them, a window,
 * or a wrapped copy for a loop. With `loop`, indexes are unbounded, and
 * `index` wraps them into [0, count).
 *
 * Give the current page and its neighbors their own layers
 * (`will-change: transform`). Through a busy main thread, Mobile Safari moves
 * the track but cannot paint new content, so part of a page that slides in
 * stays blank. A page on its own layer is painted whole before it moves.
 */
export function createPager(
  initial: PagerOptions,
  environment: PagerEnvironment = {},
): Pager {
  registerPagingTable();
  // Frames and timers come from the viewport's own window, known from the
  // attach. In a Picture-in-Picture window, the opener's frames stop while
  // its tab is hidden.
  let view: (Window & typeof globalThis) | null = null;
  const realm = () => view ?? globalThis;
  const setTimer =
    environment.setTimeout ??
    ((callback: () => void, ms: number) => realm().setTimeout(callback, ms));
  const clearTimer =
    environment.clearTimeout ??
    ((handle: unknown) =>
      realm().clearTimeout(handle as ReturnType<typeof setTimeout>));
  const requestFrame =
    environment.requestFrame ??
    ((callback: () => void) => {
      const frames = realm();
      if (typeof frames.requestAnimationFrame === 'function') {
        frames.requestAnimationFrame(() => callback());
      } else {
        setTimer(callback, 16);
      }
    });
  let options: PagerOptions = {...initial};
  let viewport: HTMLElement | null = null;
  let trackElement: HTMLElement | null = null;
  let animator: Animator | null = null;
  let pageWidth = 0;
  let isRtl = false;
  // With `pages: 'children'`, each page's offset (px, ascending), once
  // measured.
  let childOffsets: ReadonlyArray<number> | null = null;

  const isChildPages = () => options.pages === 'children';
  const isLooping = () => options.loop === true && !isChildPages();
  const count = () =>
    isChildPages() && childOffsets != null
      ? childOffsets.length
      : Math.max(1, Math.floor(options.count));
  const stride = () => pageWidth + (options.gap ?? 0);
  const sign = () => (isRtl ? 1 : -1);
  const clampIndex = (index: number) =>
    isLooping() ? index : Math.max(0, Math.min(count() - 1, index));

  /** Where page `index` rests (px). */
  function offsetOf(index: number): number {
    if (isChildPages() && childOffsets != null) {
      return childOffsets[
        Math.max(0, Math.min(childOffsets.length - 1, index))
      ];
    }
    return index * stride();
  }

  /**
   * Where `position` falls, in pages: an index plus the fraction of the way
   * to the next page (past either end, in the end page's spacing).
   */
  function pageAt(position: number): number {
    if (!(isChildPages() && childOffsets != null)) {
      return position / stride();
    }
    const at = childOffsets;
    const n = at.length;
    if (n === 1) {
      return (position - at[0]) / (pageWidth > 0 ? pageWidth : 1);
    }
    if (position < at[0]) {
      return (position - at[0]) / (at[1] - at[0]);
    }
    for (let i = 0; i < n - 1; i++) {
      if (position < at[i + 1]) {
        return i + (position - at[i]) / (at[i + 1] - at[i]);
      }
    }
    return n - 1 + (position - at[n - 1]) / (at[n - 1] - at[n - 2]);
  }

  /** The page nearest `position`, or the target before anything is measured. */
  function nearestPage(position: number): number {
    if (!isChildPages() && !(stride() > 0)) {
      return target;
    }
    return Math.round(pageAt(position));
  }

  /**
   * The page a release from `position` at `velocity` settles on (UIKit's
   * rule, pageForRelease), in children pages' own spacing.
   */
  function releasePage(
    position: number,
    velocity: number,
    startIndex: number,
  ): number {
    const pages = isChildPages() && childOffsets != null;
    return pageForRelease({
      position: pages ? pageAt(position) : position,
      velocity,
      stride: pages ? 1 : stride(),
      count: count(),
      startIndex,
      loop: isLooping(),
    });
  }

  /**
   * Children pages: each child's start edge, from the track's start. The
   * track's own translate moves both alike, so it cancels out. Each offset is
   * clamped to the travel that keeps the track's end at or past the end of
   * the viewport's content box. Children clamped onto one offset share its
   * page.
   *
   * Rects are read in the track's own CSS pixels, which its `translate` moves
   * in. An ancestor's `zoom` scales the rects, so the pager divides out that
   * scale: the rect's width over the track's used width.
   */
  function measureChildOffsets(): ReadonlyArray<number> {
    const track = trackElement;
    if (viewport == null || track == null || track.children.length === 0) {
      return [0];
    }
    const box = track.getBoundingClientRect();
    const used = Number.parseFloat(getComputedStyle(track).width);
    const scale = used > 0 && box.width > 0 ? box.width / used : 1;
    const style = getComputedStyle(viewport);
    const inner =
      viewport.clientWidth -
      (Number.parseFloat(style.paddingLeft) || 0) -
      (Number.parseFloat(style.paddingRight) || 0);
    const starts: number[] = [];
    let extent = 0;
    for (const child of Array.from(track.children)) {
      const rect = child.getBoundingClientRect();
      starts.push(
        (isRtl ? box.right - rect.right : rect.left - box.left) / scale,
      );
      extent = Math.max(
        extent,
        (isRtl ? box.right - rect.left : rect.right - box.left) / scale,
      );
    }
    const end = Math.max(0, extent - inner);
    const offsets: number[] = [];
    for (const start of starts) {
      const offset = Math.min(Math.max(start, 0), end);
      if (offsets.length === 0 || offset > offsets[offsets.length - 1] + 0.5) {
        offsets.push(offset);
      }
    }
    return offsets.length > 0 ? offsets : [0];
  }

  // The page the track rests on or is heading for (unbounded when looping),
  // and the one it last rested on.
  let target = clampIndex(Math.round(options.defaultIndex ?? 0));
  let settled = target;
  let settleHandle: MotionHandle | null = null;
  let isSwipeSettle = false;
  let settleToken = 0;
  let isDragging = false;

  let dragStart = 0;
  let dragStartIndex = 0;
  let dragPosition = 0;
  let suppressCancelSettle = false;
  let catchTimer: unknown = null;
  // Whether the finger now holding the track stopped a settle (not one that
  // ended on its own inside the catch window).
  let caughtSettle = false;

  const pan = new PagerPanGestureRecognizer({
    ...options.panOptions,
    // Published, so app code can relate its own recognizers to the paging
    // pan (gesture delegates). Instances are told apart by their element.
    name: options.panOptions?.name ?? 'pager',
    direction: 'horizontal',
    axisRatio: options.panOptions?.axisRatio ?? paging.panAxisRatio,
    // On the web the pan follows a trackpad's scroll along its axis and never
    // a mouse wheel's.
    allowedScrollTypes: options.panOptions?.allowedScrollTypes ?? [
      'continuous',
    ],
    shouldBegin: recognizer => {
      if (options.panOptions?.shouldBegin?.(recognizer) === false) {
        return false;
      }
      const dx = recognizer.totalTranslation().x;
      const direction = dx < 0 ? 'left' : 'right';
      return options.shouldBeginPan?.(direction) ?? true;
    },
  });

  // Catches a settling track when a finger lands on it. It begins on the
  // touch itself, alongside the pan, only while the track moves on its own
  // and the pan is on.
  const catcher = new SettleCatcher({
    minimumPressDuration: 0,
    allowableMovement: Number.POSITIVE_INFINITY,
    // Its own hold does nothing, so it brings no selection lock: a finger on
    // a resting track keeps the browser's native long press. Stopping a
    // settle does something; `holdSelection` locks then.
    selectionLock: null,
    shouldBegin: () => settleHandle != null && !isDragging && pan.isEnabled,
  });
  catcher.recognizeSimultaneouslyWith(pan);

  function positionToX(position: number): number {
    const x = sign() * position;
    return x === 0 ? 0 : x;
  }

  function presentation(): number {
    if (animator == null) {
      return offsetOf(target);
    }
    return sign() * animator.get('x');
  }

  function clearCatchTimer(): void {
    if (catchTimer != null) {
      clearTimer(catchTimer);
      catchTimer = null;
    }
  }

  function stopSettle(): void {
    clearCatchTimer();
    flushReport();
    isSwipeSettle = false;
    if (settleHandle != null) {
      settleToken += 1;
      settleHandle = null;
      animator?.stop(['x']);
    }
  }

  function wrapped(index: number): number {
    return isLooping() ? mod(index, count()) : index;
  }

  // The owner passes its own updates (setOptions, a controlled goTo) from an
  // Effect. The callbacks they cause run from a frame callback, never inside
  // that Effect. There, a callback that sets state would update the owner
  // during its own commit. A detach drops the callbacks still waiting.
  let deferDepth = 0;
  let deferred: (() => void)[] = [];
  let deferredToken = 0;

  function deliver(callback: () => void): void {
    if (deferDepth > 0) {
      deferred.push(callback);
    } else {
      callback();
    }
  }

  function deferringCallbacks(work: () => void): void {
    deferDepth += 1;
    try {
      work();
    } finally {
      deferDepth -= 1;
      if (deferDepth === 0 && deferred.length > 0) {
        const calls = deferred;
        deferred = [];
        const token = deferredToken;
        requestFrame(() => {
          if (token === deferredToken) {
            for (const call of calls) {
              call();
            }
          }
        });
      }
    }
  }

  function dropDeferred(): void {
    deferred = [];
    deferredToken += 1;
  }

  // A release's report waits for its settle to reach the compositor.
  let reported = wrapped(target);
  let pendingReport: PagerChangeReason | null = null;
  let reportToken = 0;

  function report(reason: PagerChangeReason): void {
    pendingReport = null;
    reportToken += 1;
    const index = wrapped(target);
    if (index !== reported) {
      reported = index;
      // A controlled move (the owner's `index`, or a `count` that clamps the
      // page) is the owner's own change: it is not reported back.
      if (reason !== 'controlled') {
        deliver(() => options.onIndexChange?.(index, reason));
      }
    }
  }

  function flushReport(): void {
    if (pendingReport != null) {
      report(pendingReport);
    }
  }

  /**
   * Forgets a release's report still waiting: the pager is detaching, or the
   * owner's own (controlled) move replaces the page it chose. The page last
   * reported stays as it was.
   */
  function dropReport(): void {
    pendingReport = null;
    reportToken += 1;
  }

  /**
   * A release reports its page once the settle reaches the compositor, two
   * frames after the frame it started in. In Mobile Safari, a main-thread
   * block that starts within about two frames of the touch freezes a motion
   * that the touch's handler started. The owner's render of the new page is
   * such a block. UIKit tells its delegate at the lift
   * (`scrollViewWillEndDragging`), and the page is known then too (`index`).
   */
  function setTarget(
    next: number,
    reason: PagerChangeReason,
    whenMoving = false,
  ): void {
    target = next;
    if (whenMoving) {
      pendingReport = reason;
    } else {
      report(reason);
    }
  }

  /**
   * Runs `callback` in the `frames`-th animation frame after the frame that a
   * motion started in. Call it when the motion's start resolves.
   *
   * WebKit resolves an animation's start inside that frame's rendering
   * update, before the frame's animation-frame callbacks. No task runs inside
   * a rendering update. So a first frame that runs before a task queued at
   * the resolution is the start's own frame, and it does not count.
   * Timestamps cannot tell: WebKit stamps that frame's callbacks 0–4 ms after
   * the animation's start time, as far apart as two frames at 240 Hz. Where
   * the start resolves after its frame, as in Chromium, the task runs before
   * the next frame. The report then comes a frame later, never earlier.
   */
  function afterFramesPastStart(frames: number, callback: () => void): void {
    let isPastStartFrame = false;
    setTimer(() => {
      isPastStartFrame = true;
    }, 0);
    const onFrame = (left: number) => {
      const remaining = isPastStartFrame ? left - 1 : left;
      isPastStartFrame = true;
      if (remaining <= 0) {
        callback();
        return;
      }
      requestFrame(() => onFrame(remaining));
    };
    requestFrame(() => onFrame(frames));
  }

  function rest(): void {
    flushReport();
    isSwipeSettle = false;
    const previous = wrapped(settled);
    settled = target;
    const index = wrapped(settled);
    deliver(() => options.onSettle?.(index, previous));
  }

  /**
   * Plays `curve` on the track. Under Reduce Motion, the animator replaces the
   * travel. A settle that a touch's release starts (`touchRelease`)
   * cross-fades on any pointer. Any other motion, such as `goTo` or a mouse's
   * or a pen's release, cross-fades on a coarse pointer. It lands at once on
   * any other pointer.
   */
  function play(curve: MotionCurve, touchRelease = false): void {
    isSwipeSettle = false;
    if (animator == null) {
      return;
    }
    follow(animator.play({x: toTrackCurve(curve, sign())}, {touchRelease}));
  }

  function follow(handle: MotionHandle): void {
    const token = ++settleToken;
    settleHandle = handle;
    if (pendingReport != null) {
      const reportAt = reportToken;
      void handle.started.then(() =>
        afterFramesPastStart(2, () => {
          if (reportAt === reportToken) {
            flushReport();
          }
        }),
      );
    }
    void handle.finished.then(finished => {
      if (token !== settleToken) {
        return;
      }
      settleHandle = null;
      if (finished) {
        rest();
      }
    });
  }

  /**
   * The settle after a pointer lifts (a release, or a hold let go);
   * `touchRelease` when that pointer was a touch.
   */
  function settleFrom(
    position: number,
    velocity: number,
    touchRelease: boolean,
  ): void {
    const to = offsetOf(target);
    // UIKit's integrator, as a playable curve (touch motion stays internal).
    const curve = solvePaging({from: position, velocity, to});
    if (curve.steps === 0) {
      animator?.set({x: positionToX(to)});
      rest();
      return;
    }
    play(curve, touchRelease);
  }

  function measure(): void {
    if (viewport == null) {
      return;
    }
    const width = viewport.clientWidth;
    const rtl = isRtlElement(viewport);
    // A new writing direction mirrors the track, so it re-places it too.
    let changed = width !== pageWidth || rtl !== isRtl;
    isRtl = rtl;
    pageWidth = width;
    if (isChildPages()) {
      const offsets = measureChildOffsets();
      if (!sameOffsets(offsets, childOffsets)) {
        childOffsets = offsets;
        changed = true;
        const pageCount = offsets.length;
        deliver(() => options.onPagesChange?.(pageCount));
      }
    }
    if (!changed) {
      return;
    }
    if (!isDragging && !isLooping() && target > count() - 1) {
      // Fewer pages (children clamped onto one): the last one, as a smaller
      // count clamps. A loop's target is unbounded, so it keeps it.
      goTo(count() - 1, {animated: false, reason: 'controlled'});
      return;
    }
    // A resize lands on the target page at its new offset (a settle in
    // flight ends there), as a paging scroll view does on rotation. A finger
    // that holds a caught track keeps it; its lift settles on the new offsets.
    if (!isDragging && !caughtSettle) {
      stopSettle();
      animator?.set({x: positionToX(offsetOf(target))});
      if (settled !== target) {
        rest();
      }
    }
  }

  function onPan(recognizer: PanGestureRecognizer): void {
    const state = recognizer.state;
    if (state === 'began') {
      // Read before measure(), which can stop the settle on a resize.
      const wasSwipeSettle = settleHandle != null && isSwipeSettle;
      measure();
      clearCatchTimer();
      const current = presentation();
      stopSettle();
      isDragging = true;
      // A track caught past an end is shown rubber-banded: the drag starts
      // from its unbanded position, so the first move keeps it under the
      // finger.
      dragStart = isLooping()
        ? current
        : rubberBandUnclamp(
            current,
            offsetOf(0),
            offsetOf(count() - 1),
            pageWidth > 0 ? pageWidth : 1,
          );
      dragPosition = current;
      // A trackpad swipe that lands while the last swipe's settle runs
      // begins from that settle's page, so back-to-back swipes page on. Any
      // other motion, such as a goTo, hands over the page on screen.
      dragStartIndex =
        wasSwipeSettle && isScrollContact(recognizer)
          ? target
          : nearestPage(current);
      return;
    }
    if (state === 'changed') {
      const dx = recognizer.translation().x;
      // Finger right (dx > 0) moves content toward earlier pages in LTR.
      let raw = dragStart + sign() * dx;
      if (isScrollContact(recognizer) && pageWidth > 0) {
        // A trackpad swipe moves the track at most one page from its start
        // page, across a loop too. The window also holds where the swipe
        // began, so a swipe that catches a longer move starts from the
        // screen. A pager that does not loop keeps the rubber band of its
        // first and last pages below.
        const looping = isLooping();
        const before =
          looping || dragStartIndex > 0
            ? offsetOf(dragStartIndex - 1)
            : -Infinity;
        const after =
          looping || dragStartIndex < count() - 1
            ? offsetOf(dragStartIndex + 1)
            : Infinity;
        raw = Math.min(
          Math.max(raw, Math.min(before, after, dragStart)),
          Math.max(before, after, dragStart),
        );
      }
      dragPosition = isLooping()
        ? raw
        : rubberBandClamp(
            raw,
            offsetOf(0),
            offsetOf(count() - 1),
            pageWidth > 0 ? pageWidth : 1,
          );
      animator?.set({x: positionToX(dragPosition)});
      return;
    }
    if (state === 'ended' || state === 'cancelled') {
      isDragging = false;
      if (state === 'cancelled' && suppressCancelSettle) {
        suppressCancelSettle = false;
        return;
      }
      // A still finger releases at 0, where UIScrollView keeps the speed.
      let velocity =
        state === 'ended' ? sign() * recognizer.scrollVelocity().x : 0;
      // A trackpad swipe that moved under a tenth of a page from where it
      // began, in the pages' own spacing, releases still at any speed. Such a
      // speed spike is not a flick. A finger's and a mouse's flick keep their
      // speed.
      if (
        isScrollContact(recognizer) &&
        Math.abs(pageAt(dragPosition) - pageAt(dragStart)) <
          STILL_RELEASE_FRACTION
      ) {
        velocity = 0;
      }
      const next = releasePage(dragPosition, velocity, dragStartIndex);
      setTarget(next, 'drag', true);
      settleFrom(
        dragPosition,
        pagingSettleVelocity(velocity),
        pan.pointerType === 'touch',
      );
      isSwipeSettle = settleHandle != null && isScrollContact(recognizer);
    }
  }

  // While a finger holds a caught track, the browser's long-press text
  // selection and callout stay off. In UIKit, the touch that stops a scroll
  // view does not reach its content. The gesture system's shared lock is
  // counted per element. So this lock and the gesture host's own lock for the
  // same contact release in either order.
  let releaseSelection: (() => void) | null = null;

  function holdSelection(on: boolean): void {
    if (on && releaseSelection == null && trackElement != null) {
      if (locksSelectionFor(catcher.pointerType ?? 'touch')) {
        releaseSelection = lockSelection([trackElement], null);
      }
    } else if (!on && releaseSelection != null) {
      releaseSelection();
      releaseSelection = null;
    }
  }

  function onCatch(recognizer: LongPressGestureRecognizer): void {
    if (recognizer.state === 'began') {
      holdSelection(true);
      clearCatchTimer();
      caughtSettle = false;
      catchTimer = setTimer(() => {
        catchTimer = null;
        if (settleHandle != null && !isDragging) {
          stopSettle();
          caughtSettle = true;
        }
      }, paging.catchStopMs);
      return;
    }
    if (recognizer.state === 'ended' || recognizer.state === 'cancelled') {
      holdSelection(false);
      if (catchTimer != null) {
        // Lifted before the catch took hold: the settle runs on.
        clearCatchTimer();
        return;
      }
      const wasCaught = caughtSettle;
      caughtSettle = false;
      if (
        wasCaught &&
        !isDragging &&
        settleHandle == null &&
        animator != null
      ) {
        // Held, then lifted without dragging: settle on the nearest page.
        const position = presentation();
        const next = releasePage(position, 0, nearestPage(position));
        setTarget(next, 'drag', true);
        settleFrom(position, 0, catcher.pointerType === 'touch');
      }
    }
  }

  function goTo(index: number, goToOptions: GoToOptions = {}): void {
    if (goToOptions.reason === 'controlled' && deferDepth === 0) {
      // The owner's own move: what it calls back waits for a frame.
      deferringCallbacks(() => goTo(index, goToOptions));
      return;
    }
    const {animated = true, reason = 'goTo'} = goToOptions;
    let next = Math.round(index);
    if (isLooping()) {
      next = nearestLoopCopy(next, target, count());
    } else {
      next = clampIndex(next);
    }
    if (isDragging) {
      suppressCancelSettle = true;
      isDragging = false;
      pan.cancel();
    }
    const from = presentation();
    // A move this one retargets hands on its velocity, from its curve.
    const velocity =
      settleHandle != null && animator != null
        ? sign() * animator.getVelocity('x')
        : undefined;
    if (reason === 'controlled') {
      dropReport();
    }
    stopSettle();
    setTarget(next, reason);
    const to = offsetOf(next);
    if (!animated || animator == null || from === to) {
      animator?.set({x: positionToX(to)});
      rest();
      return;
    }
    play(
      solveAnimatedPageScroll({
        from,
        to,
        durationMs: resolveMotion(
          trackElement,
          paging.animatedScroll,
          'durationMs',
        ),
        curve: resolveMotion(trackElement, paging.animatedScroll.curve),
        velocity,
      }),
    );
  }

  function setOptions(update: Partial<PagerOptions>): void {
    deferringCallbacks(() => applyOptions(update));
  }

  function applyOptions(update: Partial<PagerOptions>): void {
    const wasLooping = isLooping();
    const wasChildPages = isChildPages();
    const previousCount = count();
    const previousOffset = offsetOf(target);
    // A loop's indexes are unbounded. So the page shown and the page last at
    // rest are read under the old count, before the options change.
    const shownBefore = wasLooping ? mod(target, previousCount) : target;
    const settledBefore = wasLooping ? mod(settled, previousCount) : settled;
    options = {...options, ...update};
    if (isChildPages() !== wasChildPages) {
      syncTrackObserver();
    }
    if (isChildPages() && viewport != null && !isDragging) {
      // The children may have changed with the options (a count, a gap).
      const offsets = measureChildOffsets();
      if (!sameOffsets(offsets, childOffsets)) {
        childOffsets = offsets;
        const pageCount = offsets.length;
        deliver(() => options.onPagesChange?.(pageCount));
      }
    }
    if (
      (wasLooping || isLooping()) &&
      (wasLooping !== isLooping() || count() !== previousCount)
    ) {
      if (target < 0 || target > Math.min(previousCount, count()) - 1) {
        rewrap(shownBefore, settledBefore);
        return;
      }
      // The target's slot shows the same page. Only the page last at rest
      // can be a virtual index, so it is read under the old count.
      settled = settledBefore;
    }
    if (!isLooping() && (target < 0 || target > count() - 1)) {
      // A smaller `count` clamps.
      goTo(clampIndex(target), {animated: false, reason: 'controlled'});
      return;
    }
    if (offsetOf(target) !== previousOffset && !isDragging) {
      // A new gap (or children): the target page at its new offset (a settle
      // ends there).
      const wasSettling = settleHandle != null;
      stopSettle();
      animator?.set({x: positionToX(offsetOf(target))});
      if (wasSettling || settled !== target) {
        rest();
      }
    }
  }

  /**
   * Turning `loop` off, or a loop's new count, where the target's slot now
   * shows another page. The page shown keeps its index, and a smaller count
   * clamps it. A release's waiting report names its page under the old count.
   * It reaches the owner only while that page exists.
   */
  function rewrap(shownBefore: number, settledBefore: number): void {
    const next = Math.min(shownBefore, count() - 1);
    const waiting = pendingReport;
    pendingReport = null;
    if (isDragging) {
      suppressCancelSettle = true;
      isDragging = false;
      pan.cancel();
    }
    const wasSettling = settleHandle != null;
    stopSettle();
    if (waiting != null && shownBefore === next) {
      target = next;
      report(waiting);
    }
    setTarget(next, 'controlled');
    animator?.set({x: positionToX(offsetOf(next))});
    settled = next;
    if (wasSettling || settledBefore !== next) {
      deliver(() => options.onSettle?.(next, settledBefore));
    }
  }

  let detachAll: (() => void) | null = null;
  // What a detach carries to the next attach: a release's report that still
  // waits, and whether the detach stopped a motion before the track rested.
  let carriedReport: PagerChangeReason | null = null;
  let carriedEnd = false;

  // Children pages also move when the track's own size changes, as when a
  // child is added, removed or resized. So the track is observed while the
  // pages are its children, from the attach or the options change that makes
  // them so.
  let unobserveTrack: () => void = () => {};
  function syncTrackObserver(): void {
    unobserveTrack();
    unobserveTrack =
      isChildPages() && trackElement != null && detachAll != null
        ? observeResize(trackElement, measure)
        : () => {};
  }

  function attach(nextViewport: HTMLElement, nextTrack: HTMLElement) {
    detachAll?.();
    view = nextViewport.ownerDocument.defaultView;
    viewport = nextViewport;
    trackElement = nextTrack;
    animator = environment.animator ?? animatorFor(nextTrack);
    pageWidth = 0;
    isRtl = isRtlElement(nextViewport);
    pageWidth = nextViewport.clientWidth;
    if (isChildPages()) {
      childOffsets = measureChildOffsets();
      target = clampIndex(target);
      settled = target;
    }
    animator.set({x: positionToX(offsetOf(target))});
    // No pointer check: a mouse and a trackpad page it too.
    const removePanListener = pan.addListener(onPan);
    const removeCatchListener = catcher.addListener(onCatch);
    const host = environment.host ?? getGestureHost(nextViewport.ownerDocument);
    const detachPan = host.attach(nextViewport, pan);
    // The catcher sits on the track, so its long-press styles (no callout, no
    // selection) stay off the pages' text. The viewport's touch-action
    // already covers the touches that land on the track.
    const detachCatch = host.attach(nextTrack, catcher, {
      manageStyle: false,
    });
    const detachGestures = () => {
      detachCatch();
      detachPan();
      removeCatchListener();
      removePanListener();
    };
    const unobserve = observeResize(nextViewport, measure);
    detachAll = () => {
      unobserve();
      unobserveTrack();
      unobserveTrack = () => {};
      // A drag that the detach ends stays on its start page. The report and
      // the end of a motion that the detach stops wait for the next attach,
      // so an unmount calls nothing.
      if (isDragging) {
        suppressCancelSettle = true;
      }
      deferringCallbacks(() => detachGestures());
      suppressCancelSettle = false;
      carriedReport = pendingReport;
      carriedEnd = target !== settled;
      dropReport();
      stopSettle();
      dropDeferred();
      holdSelection(false);
      isDragging = false;
      detachAll = null;
    };
    syncTrackObserver();
    // A motion that the last detach stopped ends here: its report, if it
    // still waited, and its onSettle go out from a frame.
    if (carriedEnd && target !== settled) {
      const report = carriedReport;
      deferringCallbacks(() => {
        pendingReport = report;
        rest();
      });
    }
    carriedReport = null;
    carriedEnd = false;
    return () => detachAll?.();
  }

  return {
    pan,
    get index() {
      return wrapped(target);
    },
    get virtualIndex() {
      return target;
    },
    get pageCount() {
      return count();
    },
    get isSettling() {
      return settleHandle != null;
    },
    get isDragging() {
      return isDragging;
    },
    presentation,
    pageOffset: offsetOf,
    nearestPage: (position: number) => clampIndex(nearestPage(position)),
    goTo,
    setOptions,
    setPanEnabled(enabled: boolean) {
      deferringCallbacks(() => pan.setEnabled(enabled));
    },
    attach,
    dispose() {
      detachAll?.();
    },
  };
}

export interface UsePagerOptions extends PagerOptions {
  /** The gesture surface: the clipped box the pages show through. */
  viewportRef: RefObject<HTMLElement | null>;
  /** The row of pages the pager translates. */
  trackRef: RefObject<HTMLElement | null>;
  /**
   * Controlled target page; a change animates to it (reason 'controlled'),
   * and a page the pager reports that the owner does not take returns it
   * here.
   */
  index?: number;
  /** Live toggle for the pan; turning it off mid-drag cancels the drag. */
  isPanEnabled?: boolean;
}

/**
 * A pager on two elements. Callbacks are read through a ref, so passing new
 * functions each render costs nothing; a gesture never renders.
 *
 * @example
 * ```
 * const pager = usePager({viewportRef, trackRef, count: photos.length, gap: 40,
 *   onIndexChange: setCounter});
 * <div ref={viewportRef} style={{overflow: 'hidden'}}>
 *   <div ref={trackRef} style={{display: 'flex', gap: 40}}>…pages…</div>
 * </div>
 * ```
 */
export function usePager({
  viewportRef,
  trackRef,
  index,
  isPanEnabled = true,
  ...options
}: UsePagerOptions): Pager {
  const latestRef = useRef(options);
  // The controlled `index` of the last commit, read when the pager reports.
  const indexRef = useRef(index);
  // Syncs the callback and controlled-index refs with the newest render; the
  // pager's callbacks read them.
  useIsomorphicLayoutEffect(() => {
    latestRef.current = options;
    indexRef.current = index;
  });
  // Bumped when the pager reports a page while `index` is controlled. The
  // render it causes is batched with the owner's own update. If the owner kept
  // `index`, that render returns the pager to it (the controlled sync below).
  const [reported, setReported] = useState(0);
  const [pager] = useState(() =>
    createPager({
      ...options,
      defaultIndex: index ?? options.defaultIndex,
      onIndexChange: (i, reason) => {
        latestRef.current.onIndexChange?.(i, reason);
        if (indexRef.current != null) {
          setReported(n => n + 1);
        }
      },
      onSettle: (i, previous) => latestRef.current.onSettle?.(i, previous),
      onPagesChange: pageCount => latestRef.current.onPagesChange?.(pageCount),
      shouldBeginPan: direction =>
        latestRef.current.shouldBeginPan?.(direction) ?? true,
    }),
  );

  // Synchronizes the pager (the track's animation and the gesture host) with
  // these props. A clamp it causes is not reported back (reason 'controlled').
  const {count, gap, loop, pages} = options;
  useIsomorphicLayoutEffect(() => {
    pager.setOptions({count, gap, loop, pages});
  }, [pager, count, gap, loop, pages]);

  // Attaches the pager to the viewport and track nodes, and again whenever
  // either node is replaced; detaches at unmount.
  useAttachmentPair(
    viewportRef,
    trackRef,
    (viewport, track) => pager.attach(viewport, track),
    pager,
  );

  // Synchronizes the pan recognizer (the gesture host) with isPanEnabled; what
  // a drag it ends calls back waits for the next frame, after this Effect.
  useEffect(() => {
    pager.setPanEnabled(isPanEnabled);
  }, [pager, isPanEnabled]);

  // Synchronizes the pager, an imperative system outside React (the track's
  // animation and its gesture recognizers), with a controlled `index`. A new
  // `index` moves the pager there. So does the render after a page that it
  // reported and the owner did not take, such as a refused swipe. A
  // controlled input returns to its value the same way. The move is the
  // owner's own, so it is not reported back. It moves only while the two
  // differ.
  useEffect(() => {
    if (index != null && index !== pager.index) {
      pager.goTo(index, {reason: 'controlled'});
    }
  }, [pager, index, reported]);

  return pager;
}
