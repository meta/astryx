// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file PageControlTouch.ts
 * @input The control's elements, page state and request function; the
 *   gesture system, the animator, the Reduce Motion policy and `flushSync`
 * @output usePageControlTouch: the scrub and its jog, the held platter, the
 *   window's slide and the fades
 * @position Internal to PageControl: its one touch module, imported once
 *
 * SYNC: When modified, update PageControl.tsx, PageControl.test.tsx and
 * __tests__/PageControl.interaction.browser.spec.ts.
 */

import {useEffect, useLayoutEffect, useRef, type RefObject} from 'react';
import {flushSync} from 'react-dom';
import {
  animatorFor,
  isRtlElement,
  LongPressGestureRecognizer,
  PanGestureRecognizer,
  reducedMotionFade,
  TapGestureRecognizer,
  useGestureRecognizer,
} from '@astryxdesign/core/internal/touch';
import {pageControl} from './pageControlTable';
import {
  BOX,
  PITCH,
  SWITCH,
  clampPage,
  fadeOf,
  indicatorSize,
  jogInterval,
  pageControlLayout,
  renderedPages,
  scrubTarget,
  tapTarget,
  type ChangeKind,
  type Latest,
} from './pageControlModel';

const PC = pageControl;

/**
 * Under Reduce Motion, the held look's release takes the one policy's fade:
 * 200 ms on a coarse pointer, and none on any other. It is null when motion
 * is not reduced.
 */
function reducedFadeOf(root: Element): string | null {
  const fade = reducedMotionFade(root);
  if (fade == null) {
    return null;
  }
  return fade.duration === 0
    ? 'none'
    : `opacity ${fade.duration / 1000}s ${fade.easing}`;
}

/** What the touch layer reads from the control and writes back. */
export interface PageControlTouch {
  /** The touch presentation is on (a coarse primary pointer). */
  readonly isTouch: boolean;
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly stripRef: RefObject<HTMLSpanElement | null>;
  /** The control's state after each render, for gestures and timers. */
  readonly latestRef: RefObject<Latest>;
  /** The page last asked for and what asked (a tap fades faster). */
  readonly requestRef: RefObject<{page: number; kind: ChangeKind} | null>;
  /** Asks the app for a page. */
  readonly request: (page: number, kind: ChangeKind) => void;
  /** Shows or hides the platter and dims the other indicators. */
  readonly setInteracting: (isInteracting: boolean) => void;
  /** Whether a scrub runs: a mouse's cropped row holds still meanwhile. */
  readonly setScrubbing: (isScrubbing: boolean) => void;
  readonly pages: number;
  readonly current: number;
  readonly windowStart: number;
}

/**
 * PageControl's input and its touch presentation. The recognizers take every
 * pointer: a mouse taps and scrubs as a finger does, over the row it sees.
 * The platter, the window's slide and the fades are the touch presentation,
 * on only while `isTouch`.
 */
export function usePageControlTouch({
  isTouch,
  rootRef,
  stripRef,
  latestRef,
  requestRef,
  request,
  setInteracting,
  setScrubbing,
  pages,
  current,
  windowStart,
}: PageControlTouch): void {
  // Timers run on the control's own window, as an iframe or another window
  // throttles its own.
  const view = (): Window =>
    rootRef.current?.ownerDocument.defaultView ?? window;
  const geometry = () => {
    const root = rootRef.current;
    if (root == null) {
      return null;
    }
    const rect = root.getBoundingClientRect();
    const isRtl = isRtlElement(root);
    const rowStart =
      (rect.width - pageControlLayout(latestRef.current.pages).rowWidth) / 2;
    const firstCenter = rowStart + PC.indicatorSize / 2;
    /** Px along the row (mirrored in RTL) from the window's first slot's centre. */
    const along = (x: number) =>
      isRtl ? rect.right - firstCenter - x : x - rect.left - firstCenter;
    /** Px past the edge of the content: positive past the end, negative past the start. */
    const past = (x: number) => {
      const start = rect.left + PC.horizontalPadding;
      const end = rect.right - PC.horizontalPadding;
      const beyond = x > end ? x - end : x < start ? x - start : 0;
      return isRtl ? -beyond : beyond;
    };
    return {along, past};
  };

  /**
   * With a mouse, the full row: each page's dot centre on screen, read when a
   * scrub begins (the geometry above is the touch presentation's window).
   */
  const rowCentres = (): ReadonlyArray<{page: number; x: number}> => {
    const strip = stripRef.current;
    if (strip == null) {
      return [];
    }
    return Array.from(strip.querySelectorAll<HTMLElement>('[data-page]')).map(
      dot => {
        const box = dot.getBoundingClientRect();
        return {page: Number(dot.dataset.page), x: box.left + box.width / 2};
      },
    );
  };

  const gestureRef = useRef({
    startX: 0,
    lastX: 0,
    isScrubbing: false,
    /**
     * The control's geometry, read once when the scrub begins: nothing reads
     * layout while the finger moves.
     */
    geo: null as ReturnType<typeof geometry>,
    /** With a mouse, the row's dot centres, read once when the scrub begins. */
    centres: [] as ReadonlyArray<{page: number; x: number}>,
    interactTimer: 0,
    jogTimer: 0,
    /** When the finger crossed the edge or the last jog step was due, ms. */
    jogFrom: null as number | null,
    /** When the pending jog step runs, ms. */
    jogDue: 0,
  });

  const stopJog = () => {
    const g = gestureRef.current;
    if (g.jogTimer !== 0) {
      view().clearTimeout(g.jogTimer);
      g.jogTimer = 0;
    }
    g.jogFrom = null;
  };

  // Past the content's edge of a windowed control, the page steps on its own.
  // Each step comes 1 / rate after the previous one was due, or after the
  // finger crossed the edge. The rate follows how far past the finger is now,
  // so moving further brings the next step closer. Steps count from when one
  // was due, so a late timer does not slow the run. After a stall longer than
  // a step, the next one counts from the late step, with no burst.
  const jog = () => {
    const g = gestureRef.current;
    const geo = g.geo;
    const latest = latestRef.current;
    if (
      geo == null ||
      !g.isScrubbing ||
      !pageControlLayout(latest.pages).isWindowed
    ) {
      stopJog();
      return;
    }
    const beyond = geo.past(g.lastX);
    const direction = Math.sign(beyond);
    const interval =
      direction === 0 ? Infinity : jogInterval(Math.abs(beyond), direction);
    if (!Number.isFinite(interval)) {
      stopJog();
      return;
    }
    const now = performance.now();
    g.jogFrom ??= now;
    const due = g.jogFrom + interval * 1000;
    if (g.jogTimer !== 0) {
      if (Math.abs(due - g.jogDue) < 1) {
        return;
      }
      view().clearTimeout(g.jogTimer);
    }
    g.jogDue = due;
    g.jogTimer = view().setTimeout(
      () => {
        g.jogTimer = 0;
        const ranAt = performance.now();
        g.jogFrom = ranAt - due > interval * 1000 ? ranAt : due;
        const step = Math.sign(geo.past(g.lastX));
        if (step !== 0) {
          const current = latestRef.current;
          const from = requestRef.current?.page ?? current.current;
          // The step commits in this task. A render scheduled after it can
          // wait behind a busy page's other tasks past the next step. Then
          // two steps would show as one.
          flushSync(() => {
            request(clampPage(from + step, current.pages), 'other');
          });
        }
        jog();
      },
      Math.max(0, due - now),
    );
  };

  const scrubTo = (x: number) => {
    const geo = gestureRef.current.geo;
    const latest = latestRef.current;
    if (!isTouch) {
      // With a mouse: the page whose dot is nearest the pointer, on the full
      // row; nothing jogs past its ends.
      let nearest: {page: number; x: number} | null = null;
      for (const centre of gestureRef.current.centres) {
        if (
          nearest == null ||
          Math.abs(centre.x - x) < Math.abs(nearest.x - x)
        ) {
          nearest = centre;
        }
      }
      if (nearest != null) {
        request(clampPage(nearest.page, latest.pages), 'other');
      }
      return;
    }
    if (geo == null) {
      return;
    }
    if (geo.past(x) === 0 || !pageControlLayout(latest.pages).isWindowed) {
      stopJog();
      request(
        scrubTarget(geo.along(x), latest.pages, latest.windowStart),
        'other',
      );
    }
    jog();
  };

  // Under Reduce Motion the held look, the platter and the dots' dimming,
  // shows at once and takes the policy's fade on the release. It is written
  // before the look changes.
  const writeHeldFade = (isRelease: boolean) => {
    const root = rootRef.current;
    if (!isTouch || root == null) {
      return;
    }
    const reduced = reducedFadeOf(root);
    if (reduced == null) {
      return;
    }
    const transition = isRelease ? reduced : 'none';
    // The platter is the root's ::before: its fade is a custom property.
    root.style.setProperty('--_page-control-platter-transition', transition);
    for (const dot of Array.from(
      stripRef.current?.children ?? [],
    ) as HTMLElement[]) {
      dot.style.transition = transition;
    }
  };

  const finish = () => {
    const g = gestureRef.current;
    if (g.interactTimer !== 0) {
      view().clearTimeout(g.interactTimer);
      g.interactTimer = 0;
    }
    stopJog();
    g.isScrubbing = false;
    g.geo = null;
    g.centres = [];
    writeHeldFade(true);
    setInteracting(false);
    setScrubbing(false);
  };
  // The platter and the dimmed indicators are the touch presentation.
  const showHeld = () => {
    if (isTouch) {
      writeHeldFade(false);
      setInteracting(true);
    }
  };

  // A pointer on the control, a finger or a mouse, is decided within 10 px.
  // So a swipe that starts vertical stays the page's scroll:
  // - a horizontal pan, from 10 px, scrubs once the pointer is 16 px from
  //   where it landed; a drag that starts vertical fails it;
  // - a pointer held still for 155 ms (UIPageControl's interaction delay)
  //   scrubs the same way from there, under a finger on the platter;
  // - a tap steps one page.
  // Whichever begins first holds the press and fails the others. The scrub's
  // 16 px count from where the pointer landed, as UIKit counts them.
  const landingX = (
    recognizer: {trackedTouches: ReadonlyArray<{startX: number}>},
    fallback: number,
  ) => recognizer.trackedTouches[0]?.startX ?? fallback;
  const begin = (startX: number) => {
    const g = gestureRef.current;
    g.startX = startX;
    g.lastX = startX;
    g.isScrubbing = false;
  };
  const track = (x: number) => {
    const g = gestureRef.current;
    g.lastX = x;
    if (
      !g.isScrubbing &&
      Math.abs(x - g.startX) >= PC.scrubStartDistance &&
      latestRef.current.pages > 1
    ) {
      g.isScrubbing = true;
      g.geo = geometry();
      g.centres = isTouch ? [] : rowCentres();
      setScrubbing(true);
      showHeld();
    }
    if (g.isScrubbing) {
      scrubTo(x);
    }
  };
  // A tap, or a pan or hold that lifts before it scrubs: one page toward the
  // finger's side of the current indicator.
  const step = (x: number) => {
    const latest = latestRef.current;
    if (!isTouch) {
      // With a mouse: toward the pointer's side of the current dot, on the
      // row as drawn.
      const root = rootRef.current;
      const dot = stripRef.current?.querySelector(
        `[data-page="${latest.current}"]`,
      );
      if (root == null || dot == null || latest.pages < 2) {
        return;
      }
      const box = dot.getBoundingClientRect();
      request(
        tapTarget(
          x,
          box.left + box.width / 2,
          latest.current,
          latest.pages,
          isRtlElement(root),
        ),
        'tap',
      );
      return;
    }
    const geo = geometry();
    if (geo == null || latest.pages < 2) {
      return;
    }
    const slot =
      latest.current -
      (pageControlLayout(latest.pages).isWindowed ? latest.windowStart : 0);
    request(
      tapTarget(
        geo.along(x),
        slot * PITCH,
        latest.current,
        latest.pages,
        false,
      ),
      'tap',
    );
  };
  const lift = (x: number) => {
    if (!gestureRef.current.isScrubbing) {
      step(x);
    }
    finish();
  };

  useGestureRecognizer(
    rootRef,
    () => new PanGestureRecognizer({direction: 'horizontal'}),
    pan => {
      const {x} = pan.location();
      switch (pan.state) {
        case 'began': {
          begin(landingX(pan, x - pan.travelAtBegan.x));
          const g = gestureRef.current;
          g.interactTimer = view().setTimeout(() => {
            g.interactTimer = 0;
            flushSync(showHeld);
          }, PC.interactionDelayMs);
          track(x);
          break;
        }
        case 'changed':
          track(x);
          break;
        case 'ended':
          lift(x);
          break;
        case 'cancelled':
          finish();
          break;
        default:
          break;
      }
    },
  );

  useGestureRecognizer(
    rootRef,
    () =>
      new LongPressGestureRecognizer({
        minimumPressDuration: PC.interactionDelayMs,
      }),
    hold => {
      const {x} = hold.location();
      switch (hold.state) {
        case 'began':
          begin(landingX(hold, x));
          // The held look commits in the task where the hold begins. A render
          // scheduled after it can wait behind a busy page's other tasks.
          flushSync(showHeld);
          break;
        case 'changed':
          track(x);
          break;
        case 'ended':
          lift(x);
          break;
        case 'cancelled':
          finish();
          break;
        default:
          break;
      }
    },
  );

  useGestureRecognizer(
    rootRef,
    () => new TapGestureRecognizer(),
    tap => {
      if (tap.state === 'ended') {
        step(tap.location().x);
      }
    },
  );

  // Timers end with the control. Its window is read at mount: at unmount
  // the ref is already detached.
  useEffect(() => {
    const owner = view();
    return () => {
      const g = gestureRef.current;
      owner.clearTimeout(g.interactTimer);
      owner.clearTimeout(g.jogTimer);
    };
  }, []);

  const shownPageRef = useRef(current);
  // Syncs the indicators' opacity transitions with the page. The old current
  // indicator fades, faster after a tap; every other opacity change is a
  // switch. Under Reduce Motion the highlight is a selection colour, so it
  // changes at once. This runs before the window effect: its style reads
  // would start the transitions on the previous values.
  useLayoutEffect(() => {
    const old = shownPageRef.current;
    shownPageRef.current = current;
    if (old === current) {
      return;
    }
    const kind =
      requestRef.current?.page === current ? requestRef.current.kind : 'other';
    // Clear it. A later change from the app then fades as other.
    requestRef.current = null;
    const root = rootRef.current;
    if (!isTouch || root == null) {
      return;
    }
    const isReduced = reducedMotionFade(root) != null;
    const fade = fadeOf(
      kind === 'tap' ? PC.tapFadeOutMs : PC.fadeOutMs,
      PC.fadeOutCurve,
    );
    const other = isReduced ? 'none' : SWITCH;
    let fading: HTMLElement | null = null;
    for (const dot of Array.from(
      stripRef.current?.children ?? [],
    ) as HTMLElement[]) {
      const isFading = !isReduced && Number(dot.dataset.page) === old;
      dot.style.transition = isFading ? fade : other;
      if (isFading) {
        fading = dot;
      }
    }
    if (fading != null) {
      // The style read starts the fade with the duration written above. A
      // running transition keeps its duration, so the dot's next change is a
      // switch again at once. A hidden control starts no fade.
      void getComputedStyle(fading).opacity;
      fading.style.transition = SWITCH;
    }
  }, [current, isTouch]);

  const shownRef = useRef<{windowStart: number; pages: number} | null>(null);
  // Syncs each element's animator with the window: the strip's offset and
  // every indicator's size.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const root = rootRef.current;
    if (strip == null || root == null) {
      return undefined;
    }
    const isRtl = isRtlElement(root);
    const offsetFor = (start: number) => (isRtl ? 1 : -1) * start * PITCH;
    const dots = Array.from(strip.children) as HTMLElement[];
    const pageOf = (dot: HTMLElement) => Number(dot.dataset.page);
    const scaleFor = (start: number, page: number) =>
      indicatorSize(pages, start, page) / BOX;
    if (!isTouch) {
      shownRef.current = null;
      return undefined;
    }
    const before = shownRef.current;
    shownRef.current = {windowStart, pages};
    if (
      before == null ||
      before.pages !== pages ||
      before.windowStart === windowStart
    ) {
      animatorFor(strip).set({x: offsetFor(windowStart)});
      for (const dot of dots) {
        animatorFor(dot).set({scale: scaleFor(windowStart, pageOf(dot))});
      }
      return undefined;
    }
    // Dots that just mounted start at their size in the old window.
    const [wasFirst, wasLast] = renderedPages(pages, before.windowStart);
    for (const dot of dots) {
      const page = pageOf(dot);
      if (page < wasFirst || page >= wasLast) {
        animatorFor(dot).set({scale: scaleFor(before.windowStart, page)});
      }
    }
    // The move starts windowSlideDelay after the change. The strip and every
    // dot share one start time on the document timeline. A busy main thread
    // cannot push that back, as it would a timer.
    const at = performance.now() + PC.windowSlideDelayMs;
    const transition = {spring: PC.windowSlide};
    const stripAnimator = animatorFor(strip);
    stripAnimator.animate({x: offsetFor(windowStart)}, transition, {at});
    if (stripAnimator.reducedMotion() === 'off') {
      for (const dot of dots) {
        animatorFor(dot).animate(
          {scale: scaleFor(windowStart, pageOf(dot))},
          transition,
          {at},
        );
      }
      return undefined;
    }
    // Under Reduce Motion, the strip's cross-fade carries the whole change.
    // The dots take their new sizes at its middle, while it is transparent.
    // Fades of their own would fight their page opacity.
    const half = (reducedMotionFade(root)?.duration ?? 0) / 2;
    const resizeTimer = view().setTimeout(() => {
      for (const dot of dots) {
        animatorFor(dot).set({scale: scaleFor(windowStart, pageOf(dot))});
      }
    }, PC.windowSlideDelayMs + half);
    return () => {
      view().clearTimeout(resizeTimer);
    };
  }, [windowStart, pages, isTouch]);
}
