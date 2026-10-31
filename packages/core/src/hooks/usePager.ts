// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file usePager.ts
 * @input A viewport element (the gesture surface) and a track element (the
 *   row of pages it translates), a page count and gap (or the track's children
 *   as the pages), the gesture system and the motion animator
 * @output Exports `createPager` (the framework-free pager), `usePager` (its
 *   React face) and their types
 * @position Shared hook for core components that page like a UIKit paging
 *   scroll view (Carousel's paging presentation, Lightbox's viewer)
 *
 * The pager is UIKit's `isPagingEnabled` scroll view (and the scroll view
 * inside UIPageViewController) driven by the gesture system and played on the
 * compositor, not native scrolling: a native scroll-snap container on iOS is
 * a UIScrollView with the fast deceleration rate bent onto WebKit's own snap
 * target, not the paging integrator, and it cannot share a gesture with a
 * pinch.
 *
 * - A horizontal pan moves the track 1:1, one `translate` write per move, no
 *   layout read and no React render; past the first or last page it follows
 *   UIKit's rubber band with d = the page width. Which drags are the pager's
 *   follows UIKit: inside a scroll view, the dominant axis
 *   (`paging.nestedPanAxisRatio`, the tie to the pager), claimed when the pan
 *   begins (its 10 pt hysteresis; nothing claims a pan earlier); inside a sheet
 *   (an enclosing vertical pan takes part in the touch), within
 *   atan(1 ÷ `paging.panAxisRatio`) of horizontal, and neither between that
 *   and 45°.
 * - At the lift the page is chosen with UIKit's measured rule
 *   (`pageForRelease`, on the release policy in motion/resolveSnapPoint.ts)
 *   and the track settles on UIKit's paging integrator from the
 *   lift position and velocity (`solvePaging`), baked into keyframes.
 * - A finger landing on a settling pager catches it `paging.catchStopMs`
 *   after the touch (as UIKit does); dragging catches it at once from the
 *   analytic value on screen.
 * - `goTo` runs `setContentOffset(_:animated:)`'s curve and cancels a drag
 *   in progress.
 * - Reduce Motion (design:reduced-motion): the drag still follows the
 *   finger; after the lift nothing travels. A touch's release cross-fades in
 *   200 ms on any pointer (a touch release, DR2); `goTo`, and a mouse's or a
 *   pen's release, cross-fade on a coarse pointer and land at once on any
 *   other (DR3).
 * - Callbacks: `onIndexChange` when the target page changes: for a release,
 *   once its settle runs on the compositor (two frames after the frame it
 *   started in, so
 *   the owner's render cannot freeze the hand-off in Mobile Safari); for
 *   `goTo`, at once; never for a controlled change (the owner's own). A
 *   release's report still waiting when the pager detaches, or when a
 *   controlled move replaces its page, is dropped: no callback runs from an
 *   unmount or from the owner's own update. `onSettle` when the track rests.
 * - A controlled `index` wins, as a controlled input's value does: a page
 *   the pager reports (a swipe, or `goTo`) that the owner does not take
 *   returns the pager to `index`, unreported.
 * - The pan and the catch attach for every pointer (`spec:AST-094` FR19,
 *   FR43): a mouse drags the track as a finger does, and the pan also takes
 *   a trackpad's scroll and a mouse wheel's notches along its axis, released
 *   at the scroll's end with its velocity.
 *
 * Positions are content offsets in px, 0 at page 0 and growing toward later
 * pages; the track is translated by −position, or +position when the
 * viewport is right-to-left. Pages sit at index × (page width + gap), or,
 * with `pages: 'children'`, at each child's start edge (see that option); how
 * they are rendered (all of them, a window, a wrapped copy for looping) is
 * the owner's. With `loop`, indexes are unbounded ("virtual"); `index` wraps
 * them into [0, count).
 *
 * Give the current page and its neighbours their own layers
 * (`will-change: transform`): through a busy main thread, Mobile Safari
 * moves the track but cannot paint what it had not painted, and leaves the
 * unpainted part of a page that slides in blank until the thread is free
 * (iOS 26.2 simulator); a page on its own layer is painted whole before it
 * moves.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/usePager.test.ts
 * - /packages/core/src/hooks/__tests__/usePager.interaction.browser.spec.ts
 */

import {useEffect, useRef, useState, type RefObject} from 'react';
import {getGestureHost, type GestureHost} from '../gestures/GestureHost';
import {LongPressGestureRecognizer} from '../gestures/LongPressGestureRecognizer';
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
import {resolveSnapPoint} from '../motion/resolveSnapPoint';
import {rubberBandClamp, rubberBandUnclamp} from '../motion/rubberBand';
import {paging} from '../motion/uikit/paging';
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
 * The page a release settles on: UIKit's measured paging rule
 * (uikit/paging.ts `release`), on the motion foundation's release policy
 * (resolveSnapPoint.ts) with the pager's own pages and thresholds.
 *
 * - At least `advanceSpeed`, a flick: the next page in the direction of the
 *   velocity from wherever the content is.
 * - Slower, the page nearest the content: UIKit's measured `commitFraction`
 *   is half a page, the policy's nearest snap point.
 * - A release whose velocity points back toward the page the drag started on
 *   settles there, whatever the travel (`spec:AST-094` FR37), through the
 *   policy's `start`.
 * - Never more than `maxPagesFromStart` from the start page (`maxSteps`),
 *   and clamped to the pages unless looping: the policy sees only the pages
 *   that reach allows around the start page, so a looping target may leave
 *   the range and the owner wraps it.
 *
 * The velocity stays px/s for children pages (their positions are in pages):
 * the policy reads it only against `advanceSpeed` and for its direction.
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
   * What a page is. `'viewport'`: every page is the viewport's width, at
   * index × (width + `gap`). `'children'`: each child of the track is a page
   * at its own start edge, as `scroll-snap-align: start` places it in a
   * scroll container: the viewport's padding stays an inset, and a child
   * whose start lies past the point where the track's end meets the end of
   * the viewport's content box rests at that point, so the last children can
   * share one page. The count is then the number of distinct pages measured
   * (`pageCount`); `count` and `gap` serve only before the first measure, and
   * children pages do not loop. The pager measures the children when it
   * attaches, when the viewport or the track resizes, when the options
   * change and when a drag begins, never while a finger moves.
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
   * Called when the pan would begin, with the drag's initial physical
   * direction on screen (the same in RTL); return false to leave the touch
   * to someone else (a zoomed photo that can still pan that way).
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
  /** Attach to the elements; returns a detach function. */
  attach(viewport: HTMLElement, track: HTMLElement): () => void;
  /** Detach and stop everything (attaching again restarts it). */
  dispose(): void;
}

/**
 * The copy of page `index` nearest virtual page `from` in a loop of `count`
 * pages; of two copies equally near (two pages, or half an even count away),
 * `index` itself when it is one of them, so a step to `from + 1` always goes
 * forward.
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
  /** Timers for the catch delay; the window's by default. */
  setTimeout?: (callback: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  /** The next animation frame; `requestAnimationFrame` by default. */
  requestFrame?: (callback: () => void) => void;
}

/**
 * Creates a pager. Attach it to its viewport and track; it measures the page
 * width there (on attach, on resize, and when a drag begins) and never reads
 * layout while a finger moves.
 */
/**
 * The pager's pan: its release is a pan's `scrollVelocity()`, the one
 * UIScrollView hands `scrollViewWillEndDragging`
 * (but after a silent hold; spec:AST-100 FR2).
 * Inside a scroll view it takes UIKit's rule: a drag is the
 * pager's when its dominant axis is horizontal (`paging.nestedPanAxisRatio`,
 * the tie included) and the page's otherwise. Its moves are cancelled from
 * the moment it begins, at the pan's 10 pt hysteresis, as every pan's are:
 * nothing claims a touch earlier. Inside a sheet, which the arena
 * shows as an enclosing vertical pan taking part in the touch, it keeps the
 * sheet's rule (`axisRatio`, `paging.panAxisRatio`): neither moves between
 * atan(1 ÷ that) and 45°.
 */
class PagerPanGestureRecognizer extends PanGestureRecognizer {
  /**
   * The kind of pointer the pan follows. Under Reduce Motion a touch's
   * release cross-fades (design:reduced-motion DR2); a mouse's or a pen's
   * lands at once on a fine pointer (DR3).
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
        other instanceof PanGestureRecognizer &&
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
 * It never claims the touch, so a vertical swipe or a pinch that starts on a
 * settling track still reaches the page, as UIKit hands the outer scroll view
 * a vertical drag after the paging view's content stopped.
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

export function createPager(
  initial: PagerOptions,
  environment: PagerEnvironment = {},
): Pager {
  const setTimer =
    environment.setTimeout ??
    ((callback: () => void, ms: number) => setTimeout(callback, ms));
  const clearTimer =
    environment.clearTimeout ??
    ((handle: unknown) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>));
  const requestFrame =
    environment.requestFrame ??
    ((callback: () => void) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => callback());
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
   * Children pages: each child's start edge from the track's start (the
   * track's own translate moves both alike, so it cancels), clamped to the
   * travel that keeps the track's end at or past the end of the viewport's
   * content box; children clamped onto one offset share its page. Rects are
   * read in the track's own CSS pixels, the ones its `translate` moves in:
   * an ancestor's `zoom` scales them, so its scale (the rect's width over the
   * track's used width) is divided out.
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
  let settleToken = 0;
  let isDragging = false;

  // Drag state, captured when the pan begins.
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
    // pan (gesture delegates); instances are told apart by their element.
    name: 'Carousel.pager',
    direction: 'horizontal',
    axisRatio: options.panOptions?.axisRatio ?? paging.panAxisRatio,
    // On the web a pan also takes a trackpad's scroll and a mouse wheel's
    // notches, along its axis (spec:AST-094 FR43).
    allowedScrollTypes: options.panOptions?.allowedScrollTypes ?? ['continuous'],
    shouldBegin: recognizer => {
      if (options.panOptions?.shouldBegin?.(recognizer) === false) {
        return false;
      }
      const dx = recognizer.totalTranslation().x;
      const direction = dx < 0 ? 'left' : 'right';
      return options.shouldBeginPan?.(direction) ?? true;
    },
  });

  // Catches a settling track when a finger lands on it: begins on the touch
  // itself, only while the track moves on its own, alongside the pan.
  const catcher = new SettleCatcher({
    minimumPressDuration: 0,
    allowableMovement: Number.POSITIVE_INFINITY,
    // Its own hold does nothing, so it brings no selection lock: a finger on
    // a resting track keeps the browser's native long press (spec:AST-094
    // FR41). Stopping a settle does something; `holdSelection` locks then.
    selectionLock: null,
    shouldBegin: () => settleHandle != null && !isDragging,
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
    if (settleHandle != null) {
      settleToken += 1;
      settleHandle = null;
      animator?.stop(['x']);
    }
  }

  function wrapped(index: number): number {
    return isLooping() ? mod(index, count()) : index;
  }

  // Callbacks caused by the owner's own update (setOptions, a controlled
  // goTo), which the owner passes from an Effect, run from a frame callback,
  // never from inside that Effect (architecture:react-component-runtime
  // INV2). A detach drops those still waiting.
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

  // The page last reported through onIndexChange, and a report that waits
  // for a release's settle to reach the compositor.
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
   * A release reports its page once the settle has reached the compositor
   * (two frames after the frame it started in): in Mobile Safari a
   * main-thread block that
   * starts within about two frames of the touch freezes a motion started in
   * that touch's handler, and the owner's render of the new page is such a
   * block. UIKit tells its delegate at the lift (scrollViewWillEndDragging);
   * the page is known then too (`index`).
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
   * Runs `callback` in the `frames`-th animation frame after the frame a
   * motion started in; called when its start resolves. WebKit resolves an
   * animation's start inside that frame's rendering update, before the
   * frame's animation-frame callbacks, and no task runs inside a rendering
   * update: a first frame that runs before a task queued at the resolution
   * is the start's own frame, and does not count. (Timestamps cannot tell:
   * WebKit stamps that frame's callbacks 0–4 ms after the animation's start
   * time, measured, as far apart as two frames at 240 Hz.) Where the start
   * resolves after its frame, as in Chromium, the task runs before the next
   * frame, or the report comes a frame later, never earlier.
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
    const previous = wrapped(settled);
    settled = target;
    const index = wrapped(settled);
    deliver(() => options.onSettle?.(index, previous));
  }

  /**
   * Plays `curve` on the track. Under Reduce Motion the animator replaces the
   * travel (design:reduced-motion): a settle a touch's release starts
   * (`touchRelease`) cross-fades on any pointer; any other motion (`goTo`, a
   * mouse's or a pen's release) cross-fades on a coarse pointer and lands at
   * once on any other.
   */
  function play(curve: MotionCurve, touchRelease = false): void {
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
    isRtl = isRtlElement(viewport);
    let changed = width !== pageWidth;
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
    if (!isDragging && target > count() - 1) {
      // Fewer pages (children clamped onto one): the last one, as a smaller
      // count clamps.
      goTo(count() - 1, {animated: false, reason: 'controlled'});
      return;
    }
    // A resize lands on the target page at its new offset (a settle in
    // flight ends there), as a paging scroll view does on rotation.
    if (!isDragging) {
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
      measure();
      clearCatchTimer();
      const current = presentation();
      const wasSettling = settleHandle != null;
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
      // Scratch: a swipe that lands while a trackpad swipe's settle runs
      // starts from that settle's page, so back-to-back swipes page on.
      dragStartIndex =
        wasSettling && recognizer.trackedTouches[0]?.scrollType != null
          ? target
          : nearestPage(current);
      return;
    }
    if (state === 'changed') {
      const dx = recognizer.translation().x;
      // Finger right (dx > 0) moves content toward earlier pages in LTR.
      let raw = dragStart + sign() * dx;
      if (!isLooping() && recognizer.trackedTouches[0]?.scrollType != null && pageWidth > 0) {
        // Scratch: never more than one page from where the swipe began; the
        // first and last pages keep their rubber band below.
        const lo = dragStartIndex > 0 ? offsetOf(dragStartIndex - 1) : -Infinity;
        const hi = dragStartIndex < count() - 1 ? offsetOf(dragStartIndex + 1) : Infinity;
        raw = Math.min(Math.max(raw, Math.min(lo, hi)), Math.max(lo, hi));
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
      // The pan's `scrollVelocity()`: spec:AST-100's one filter, read as
      // UIScrollView reads it. A finger still for more than 40 ms before the
      // lift releases at 0 (FR2), where UIScrollView keeps the speed. The
      // content moves against the finger in LTR (sign()).
      let velocity =
        state === 'ended' ? sign() * recognizer.scrollVelocity().x : 0;
      if (
        pan.pointerType !== 'touch' &&
        Math.abs(dragPosition - offsetOf(dragStartIndex)) < 0.1 * pageWidth
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
    }
  }

  // While a finger holds a caught track, the browser's long-press text
  // selection and callout stay off: in UIKit the touch that stops a scroll
  // view does not reach its content. The gesture system's shared lock,
  // counted per element, so the gesture host's own lock for the same
  // contact and this one release in either order.
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
    // A move this one retargets hands on its velocity, from its curve
    // (spec:AST-094 FR6).
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
        durationMs: paging.animatedScroll.durationMs,
        curve: paging.animatedScroll.curve,
        velocity,
      }),
    );
  }

  function setOptions(update: Partial<PagerOptions>): void {
    deferringCallbacks(() => applyOptions(update));
  }

  function applyOptions(update: Partial<PagerOptions>): void {
    const wasLooping = isLooping();
    const previousOffset = offsetOf(target);
    options = {...options, ...update};
    if (isChildPages() && viewport != null && !isDragging) {
      // The children may have changed with the options (a count, a gap).
      const offsets = measureChildOffsets();
      if (!sameOffsets(offsets, childOffsets)) {
        childOffsets = offsets;
        const pageCount = offsets.length;
        deliver(() => options.onPagesChange?.(pageCount));
      }
    }
    if (!isLooping() && (target < 0 || target > count() - 1)) {
      // Turning `loop` off keeps the page shown; a smaller `count` clamps.
      const shown = wasLooping ? mod(target, count()) : target;
      goTo(clampIndex(shown), {animated: false, reason: 'controlled'});
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

  let detachAll: (() => void) | null = null;

  function attach(nextViewport: HTMLElement, nextTrack: HTMLElement) {
    detachAll?.();
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
    // The recognizers, for every pointer (FR19, FR43).
    const removePanListener = pan.addListener(onPan);
    const removeCatchListener = catcher.addListener(onCatch);
    const host = environment.host ?? getGestureHost(nextViewport.ownerDocument);
    const detachPan = host.attach(nextViewport, pan);
    // The catcher sits on the track so its long-press styles (no callout,
    // no selection) stay off the pages' text: the viewport's touch-action
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
    // Children pages also move when the track's own size changes (a child
    // added, removed or resized).
    const unobserveTrack = isChildPages()
      ? observeResize(nextTrack, measure)
      : () => {};
    detachAll = () => {
      unobserve();
      unobserveTrack();
      detachGestures();
      dropReport();
      stopSettle();
      dropDeferred();
      holdSelection(false);
      isDragging = false;
      detachAll = null;
    };
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
    nearestPage: (position: number) => clampIndex(Math.round(pageAt(position))),
    goTo,
    setOptions,
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
  useIsomorphicLayoutEffect(() => {
    latestRef.current = options;
    indexRef.current = index;
  });
  // Bumped when the pager reports a page while `index` is controlled: the
  // render it causes, batched with the owner's own update, returns the pager
  // to `index` if the owner kept it (the controlled sync below).
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
  // either node is replaced: it runs after every commit and does nothing
  // while they stay the same.
  const attachedRef = useRef<{
    viewport: HTMLElement | null;
    track: HTMLElement | null;
    detach: (() => void) | null;
  }>({viewport: null, track: null, detach: null});
  useIsomorphicLayoutEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const attached = attachedRef.current;
    if (viewport === attached.viewport && track === attached.track) {
      return;
    }
    attached.detach?.();
    attached.viewport = viewport;
    attached.track = track;
    attached.detach =
      viewport != null && track != null ? pager.attach(viewport, track) : null;
  });
  useIsomorphicLayoutEffect(
    () => () => {
      attachedRef.current.detach?.();
      attachedRef.current = {
        viewport: null,
        track: null,
        detach: null,
      };
    },
    [pager],
  );

  // Synchronizes the pan recognizer (the gesture host) with isPanEnabled.
  useEffect(() => {
    pager.pan.setEnabled(isPanEnabled);
  }, [pager, isPanEnabled]);

  // Synchronizes the pager, an imperative system outside React (the track's
  // animation and its gesture recognizers), with a controlled `index`: a new
  // `index` moves it there, and so does the render that follows a page it
  // reported and the owner did not take (a refused swipe or goTo), as a
  // controlled input returns to its value. The move is the owner's own: it
  // is not reported back. Idempotent: it moves only while the two differ.
  useEffect(() => {
    if (index != null && index !== pager.index) {
      pager.goTo(index, {reason: 'controlled'});
    }
  }, [pager, index, reported]);

  return pager;
}
