// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTabBarMinimize.ts
 * @input The capsule, whether minimizing applies, and the search tab's state.
 *   Core's animator, pan recognizer and finger-scroll reader (internal/touch)
 *   and uikitTabBar.ts.
 * @output useTabBarMinimize: whether the bar is minimized (UIKit's
 *   `.onScrollDown`) and a way to expand it. It also returns the refs TabBar
 *   puts on the platter, the items, the badges, the circle and the accessory.
 * @position Part of TabBar's touch layer (TabBarTouch.ts)
 *
 * SYNC: When modified, update TabBar.tsx, useTabBarLens.ts,
 * useTabBarSearch.ts and __tests__/TabBar.interaction.browser.spec.ts.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  isRtlElement,
  PanGestureRecognizer,
  useFingerScroll,
  useGestureRecognizer,
} from '@astryxdesign/core/internal/touch';
import {observeResize} from '@astryxdesign/core';
import {accessoryBox} from './tabBarModel';
import {useMotionAnimator} from '../internal/useMotionAnimator';
import {tabBar} from './uikitTabBar';

export interface UseTabBarMinimizeOptions {
  readonly capsuleRef: RefObject<HTMLDivElement | null>;
  /** A search tab sits at the bar's trailing end. */
  readonly hasSearch: boolean;
  /** The search tab is selected: the bar collapses as it does minimized. */
  readonly isSearching: boolean;
  /** `minimizeBehavior="onScrollDown"` under a finger. */
  readonly isEnabled: boolean;
  /**
   * Until when (ms, the document timeline) the search tab's glass keeps its
   * minimized size as the bar expands. The search field's Cancel wobbles at
   * that size first, as UIKit's does.
   */
  readonly searchGlassHoldRef?: RefObject<number>;
}

export interface TabBarMinimize {
  /** Minimized by the page's scrolling. */
  readonly isMinimized: boolean;
  /** Drawn collapsed: minimized, or the search tab selected. */
  readonly isCollapsed: boolean;
  /** Expands a minimized bar (the circle activated, a tap or the keys; or focus on the search tab, which stays in reach). */
  readonly expand: () => void;
  /** The capsule: its document is the page whose scrolling minimizes the bar. */
  readonly capsule: (element: HTMLElement | null) => void;
  /** The platter: shrinks to the circle about the leading cap's centre. */
  readonly platter: (element: HTMLElement | null) => void;
  /** The platter's middle: narrows to nothing. */
  readonly platterMiddle: (element: HTMLElement | null) => void;
  /** The platter's trailing cap: slides onto the leading one. */
  readonly platterEnd: (element: HTMLElement | null) => void;
  /** The items' layer (every tab button): fades as one. */
  readonly items: (element: HTMLElement | null) => void;
  /** The badges: fade with the items. */
  readonly badges: (element: HTMLElement | null) => void;
  /** The minimized circle's icon: fades in. */
  readonly circleIcon: (element: HTMLElement | null) => void;
  /** The bottom accessory: moves between its two places. */
  readonly accessory: (element: HTMLElement | null) => void;
  /** The accessory glass's middle: its width. */
  readonly accessoryMiddle: (element: HTMLElement | null) => void;
  /** The accessory glass's trailing cap: its width. */
  readonly accessoryEnd: (element: HTMLElement | null) => void;
  /** The search tab's glass: shrinks to the minimized size about its centre. */
  readonly searchGlass: (element: HTMLElement | null) => void;
  /** The accessory content's window: its trailing edge rides the cap. */
  readonly accessoryClip: (element: HTMLElement | null) => void;
  /** The accessory's content: held in place inside its moving window. */
  readonly accessoryContent: (element: HTMLElement | null) => void;
}

/** No scroller to watch: the server, or minimizing is off. */
const NO_SCROLLER = {current: null};

/**
 * Follows the person's scrolling of the page: minimizes after
 * `minimizeDistance` down, expands at the top. The person's scrolling starts as
 * a vertical pan on the page that never claims its touch (`claimsTouches:
 * false`). The gesture host gives it only passive listeners, so the page
 * scrolls exactly as it would without it. From the pan's start until the
 * person's scroll ends, and only then, a passive scroll listener follows the
 * offset. The gesture host's finger-scroll reader says when the scroll ends,
 * and it counts the coast after the lift as the person's.
 */
function useScrollMinimize(isEnabled: boolean) {
  const [isMinimized, setIsMinimized] = useState(false);
  // The bar's own document, which an iframe or another window can hold, and
  // its root for the pan below. The capsule's ref fills both.
  const docRef = useRef<Document | null>(null);
  const rootRef = useRef<Element | null>(null);
  // The downward run, across the person's scrolls: where it started and
  // where the page was last seen.
  const runRef = useRef<ScrollRun>({lastY: Number.NaN, downFrom: null});
  const capsule = useCallback((element: HTMLElement | null) => {
    const doc = element?.ownerDocument ?? null;
    if (doc === docRef.current) {
      return;
    }
    docRef.current = doc;
    rootRef.current = doc?.documentElement ?? null;
    // A bar now in another document starts its run where that page is.
    runRef.current = {
      lastY: doc?.defaultView?.scrollY ?? Number.NaN,
      downFrom: null,
    };
  }, []);
  // Whose scroll the page's is, from the gesture host: watched only while
  // minimizing is on.
  const isFingerScroll = useFingerScroll(isEnabled ? docRef : NO_SCROLLER);
  const watchRef = useRef<{lift: () => void; stop: () => void} | null>(null);
  useGestureRecognizer(
    rootRef,
    () =>
      new PanGestureRecognizer({
        name: 'tab-bar-page-scroll',
        direction: 'vertical',
        claimsTouches: false,
        allowedPointerTypes: ['touch'],
      }),
    pan => {
      const view = docRef.current?.defaultView;
      if (pan.state === 'began' && view != null) {
        watchRef.current?.stop();
        watchRef.current = watchScroll(
          view,
          runRef.current,
          // The finger's travel since it landed (up scrolls the page down).
          -pan.totalTranslation().y,
          setIsMinimized,
          isFingerScroll,
          () => {
            watchRef.current = null;
          },
        );
      } else if (pan.state === 'ended' || pan.state === 'cancelled') {
        watchRef.current?.lift();
      }
    },
    {isEnabled},
  );
  // Minimizing turned off: the bar is expanded again, read during render,
  // so a later turn on starts expanded.
  const [wasEnabled, setWasEnabled] = useState(isEnabled);
  if (wasEnabled !== isEnabled) {
    setWasEnabled(isEnabled);
    if (!isEnabled) {
      setIsMinimized(false);
    }
  }
  useEffect(() => {
    const view = docRef.current?.defaultView;
    if (!isEnabled || view == null) {
      return;
    }
    // The run starts where the page is when the watching starts.
    runRef.current = {lastY: view.scrollY, downFrom: null};
    return () => watchRef.current?.stop();
  }, [isEnabled]);
  // Expanding starts the downward run over, in place, since a watch running now
  // holds the same run. So an expanded bar takes another `minimizeDistance`
  // down before it minimizes again.
  const expand = useCallback(() => {
    runRef.current.lastY = docRef.current?.defaultView?.scrollY ?? Number.NaN;
    runRef.current.downFrom = null;
    setIsMinimized(false);
  }, []);
  return {isMinimized: isEnabled && isMinimized, expand, capsule};
}

interface ScrollRun {
  lastY: number;
  /** Where the current downward run started. */
  downFrom: number | null;
}

/**
 * Follows one scroll of the page by the person, from the finger's pan to the
 * page's rest. Call its `lift` when the finger lifts. The listeners go at the
 * `scrollend` that follows, or at once if the scroll has already ended
 * (`isFingerScroll`, the gesture host's reader). Where the browser sends no
 * `scrollend`, they go when the reader says the person's scroll ended.
 */
function watchScroll(
  view: Window,
  run: ScrollRun,
  fingerTravel: number,
  setIsMinimized: (isMinimized: boolean) => void,
  isFingerScroll: () => boolean,
  onStop: () => void,
) {
  const moved = view.scrollY - run.lastY;
  // Since the person last scrolled, the page moved on its own (a script, the
  // keys), unless this finger's travel since it landed covers the move. The
  // browser may start scrolling before the pan begins. On its own, the downward
  // run starts over.
  const isThisFinger =
    Math.sign(moved) === Math.sign(fingerTravel) &&
    Math.abs(moved) <= Math.abs(fingerTravel);
  if (!Number.isFinite(moved) || (moved !== 0 && !isThisFinger)) {
    run.lastY = view.scrollY;
    run.downFrom = null;
  }
  let isLifted = false;
  const onScroll = () => {
    const y = view.scrollY;
    if (y > run.lastY) {
      run.downFrom ??= run.lastY;
      if (y - run.downFrom >= tabBar.minimizeDistance) {
        setIsMinimized(true);
      }
    } else if (y < run.lastY) {
      run.downFrom = null;
      if (y <= 0) {
        setIsMinimized(false);
      }
    }
    run.lastY = y;
  };
  const onScrollEnd = () => {
    if (isLifted) {
      finish();
    }
  };
  // Where the browser sends no `scrollend`, the person's scroll ends when the
  // gesture host's reader says so. The reader has its own fallback after the
  // last scroll event, and this reads it once a frame from the lift.
  let frame = 0;
  const waitForReader = () => {
    frame = view.requestAnimationFrame(() => {
      if (isFingerScroll()) {
        waitForReader();
      } else {
        finish();
      }
    });
  };
  const stop = () => {
    view.cancelAnimationFrame(frame);
    view.removeEventListener('scroll', onScroll);
    view.removeEventListener('scrollend', onScrollEnd);
    onStop();
  };
  // Where the page is when the person's scroll ends is theirs. The browser
  // sends at most one scroll event a frame, so the last moves may not have
  // arrived yet.
  const finish = () => {
    onScroll();
    stop();
  };
  view.addEventListener('scroll', onScroll, {passive: true});
  view.addEventListener('scrollend', onScrollEnd, {passive: true});
  return {
    lift: () => {
      isLifted = true;
      if (!isFingerScroll()) {
        finish();
      } else if (!('onscrollend' in view)) {
        waitForReader();
      }
    },
    stop,
  };
}

/**
 * WHEN (uikitTabBar.ts, measured on iOS 26.2)
 *
 * The bar minimizes once the person has scrolled the page down
 * `minimizeDistance` from where the downward scroll started. Scrolling back up
 * does not expand it; reaching the top does, and so does a tap on the circle
 * (`expand`). Only the person's scrolling counts: a finger's drag and the coast
 * after it. The gesture host reads it as a pan on the page that never claims
 * its touch. So a script scrolling the page to the top leaves the bar
 * minimized, as on iOS.
 *
 * HOW IT MORPHS
 *
 * The capsule's glass is drawn in three pieces: a leading cap, a middle and a
 * trailing cap. Collapsing, the middle narrows to nothing from its leading side
 * while the trailing cap slides onto the leading one. So the outline stays a
 * capsule all the way to a circle, and the whole platter shrinks to
 * `minimizedSize` about the leading cap's centre (`collapseSize`). The items
 * and their badges fade out (`minimizeFade`) and the selected icon fades in at
 * the circle's centre; useTabBarLens.ts carries the lens into the circle. A
 * search tab's circle shrinks to `minimizedSize` about its centre, its glyph
 * unchanged. The bottom accessory moves down inline beside the circle
 * (`accessoryCollapse`), ending before the search tab when there is one. Its
 * box changes in CSS and it starts where it was. Its glass is drawn in the same
 * three pieces, so transforms change its width too. Its content is laid out at
 * once for its new place. It shows through a window whose trailing edge rides
 * the glass's trailing cap, so it never shows past the glass. A move turned
 * around keeps its speed. Expanding plays the same motion back
 * (`accessoryExpand` for the accessory). Choosing the search tab collapses the
 * bar the same way (useTabBarSearch.ts shows its field) and the accessory steps
 * aside. Every animation runs on the compositor, transforms and opacity only.
 *
 * The collapse runs on UIKit's springs, under a finger only. The bar minimizes
 * there and the search tab collapses it there (under a mouse the search tab
 * selects in place).
 */
export function useTabBarMinimize({
  capsuleRef,
  hasSearch,
  isSearching,
  isEnabled,
  searchGlassHoldRef,
}: UseTabBarMinimizeOptions): TabBarMinimize {
  const {isMinimized, expand, capsule} = useScrollMinimize(isEnabled);
  const isCollapsed = isMinimized || isSearching;
  const platter = useMotionAnimator();
  const platterMiddle = useMotionAnimator();
  const platterEnd = useMotionAnimator();
  const badges = useMotionAnimator();
  const circleIcon = useMotionAnimator({initial: {opacity: 0}});
  const items = useMotionAnimator();
  const accessory = useMotionAnimator();
  const accessoryMiddle = useMotionAnimator();
  const accessoryEnd = useMotionAnimator();
  const searchGlass = useMotionAnimator();
  const accessoryClip = useMotionAnimator();
  const accessoryContent = useMotionAnimator();

  const previousRef = useRef(isCollapsed);
  useLayoutEffect(() => {
    const was = previousRef.current;
    previousRef.current = isCollapsed;
    const element = capsuleRef.current;
    if (was === isCollapsed || element == null) {
      return;
    }
    const isRtl = isRtlElement(element);
    // The trailing cap's travel onto the leading one.
    const travel = element.offsetWidth - tabBar.barHeight;
    // From rest every curve starts when the browser commits the frame, with the
    // lens's (useTabBarLens.ts). So a busy main thread delays the morph instead
    // of skipping into it. A morph already on screen continues.
    const now = performance.now();
    const options =
      platterMiddle.animator.getVelocity('scaleX', now) !== 0 ? {at: now} : {};
    const size = {spring: tabBar.collapseSize};
    const fade = {spring: tabBar.minimizeFade};
    platterMiddle.animator.animate(
      {scaleX: isCollapsed ? 0 : 1},
      size,
      options,
    );
    platterEnd.animator.animate(
      {x: isCollapsed ? (isRtl ? travel : -travel) : 0},
      size,
      options,
    );
    platter.animator.animate(
      {scale: isCollapsed ? tabBar.minimizedSize / tabBar.barHeight : 1},
      size,
      options,
    );
    // The tabs fade as one layer: one animation, not one per tab.
    items.animator.animate({opacity: isCollapsed ? 0 : 1}, fade, options);
    badges.animator.animate({opacity: isCollapsed ? 0 : 1}, fade, options);
    circleIcon.animator.animate(
      {opacity: isCollapsed ? 1 : 0},
      isCollapsed ? size : fade,
      options,
    );
    // The search tab's glass shrinks to the minimized size, its glyph kept.
    // Expanding as the search field's Cancel releases, it keeps that size
    // until Cancel's wobble rests.
    const glassHold = searchGlassHoldRef?.current ?? 0;
    searchGlass.animator.animate(
      {scale: isCollapsed ? tabBar.minimizedSize / tabBar.barHeight : 1},
      size,
      !isCollapsed && glassHold > now ? {at: glassHold} : options,
    );
    // The accessory's box changed in CSS this frame: it starts where it was
    // on screen (its offset and width carried over) and springs to rest. It
    // spans the whole bar: the capsule and the search tab.
    const width = element.parentElement?.offsetWidth ?? element.offsetWidth;
    const from = accessoryBox(width, was, hasSearch);
    const to = accessoryBox(width, isCollapsed, hasSearch);
    const sign = isRtl ? -1 : 1;
    const cap = tabBar.accessoryHeight;
    const moved = {
      x: accessory.animator.get('x', now) + sign * (from.start - to.start),
      y: accessory.animator.get('y', now) + (from.top - to.top),
    };
    const end =
      accessoryEnd.animator.get('x', now) + sign * (from.width - to.width);
    const middle =
      (accessoryMiddle.animator.get('scaleX', now) * (from.width - cap)) /
      (to.width - cap);
    // A move turned around mid-flight keeps its speed:
    // each spring starts from the velocity it had (the middle's scaled with
    // its value).
    const velocity = {
      x: accessory.animator.getVelocity('x', now),
      y: accessory.animator.getVelocity('y', now),
      end: accessoryEnd.animator.getVelocity('x', now),
      middle:
        (accessoryMiddle.animator.getVelocity('scaleX', now) *
          (from.width - cap)) /
        (to.width - cap),
    };
    // The content is laid out at once for its new box. While the glass grows
    // into it, the content's window keeps its trailing edge on the glass's
    // trailing cap (the content counter-moves, so it stays put). A shrinking
    // glass already holds the narrower content: no window then.
    const clip = sign * Math.min(0, sign * end);
    const clipVelocity = clip === 0 ? 0 : velocity.end;
    accessory.animator.set(moved);
    accessoryEnd.animator.set({x: end});
    accessoryMiddle.animator.set({scaleX: middle});
    accessoryClip.animator.set({x: clip});
    accessoryContent.animator.set({x: -clip});
    const spring = isCollapsed
      ? tabBar.accessoryCollapse
      : tabBar.accessoryExpand;
    accessory.animator.animate(
      {x: 0, y: 0},
      {spring, velocity: {x: velocity.x, y: velocity.y}},
      options,
    );
    accessoryEnd.animator.animate(
      {x: 0},
      {spring, velocity: {x: velocity.end}},
      options,
    );
    accessoryMiddle.animator.animate(
      {scaleX: 1},
      {spring, velocity: {scaleX: velocity.middle}},
      options,
    );
    accessoryClip.animator.animate(
      {x: 0},
      {spring, velocity: {x: clipVelocity}},
      options,
    );
    accessoryContent.animator.animate(
      {x: 0},
      {spring, velocity: {x: -clipVelocity}},
      options,
    );
  }, [
    isCollapsed,
    capsuleRef,
    platter,
    platterMiddle,
    platterEnd,
    badges,
    circleIcon,
    items,
    accessory,
    accessoryMiddle,
    accessoryEnd,
    searchGlass,
    hasSearch,
    accessoryClip,
    accessoryContent,
  ]);

  // Minimized, the bar's width can still change (a rotation, a split view):
  // the trailing cap stays closed on the circle.
  useEffect(() => {
    const element = capsuleRef.current;
    if (!isCollapsed || element == null) {
      return;
    }
    let width = element.offsetWidth;
    // Core's shared observer. Its first call, at once, finds the same width.
    return observeResize(element, () => {
      const next = element.offsetWidth;
      if (next === width) {
        return;
      }
      width = next;
      const travel = next - tabBar.barHeight;
      const isRtl = isRtlElement(element);
      platterEnd.animator.set({x: isRtl ? travel : -travel});
    });
  }, [isCollapsed, capsuleRef, platterEnd]);
  // While the search tab is selected the accessory steps aside.
  const wasSearchingRef = useRef(isSearching);
  useLayoutEffect(() => {
    if (wasSearchingRef.current === isSearching) {
      return;
    }
    wasSearchingRef.current = isSearching;
    accessory.animator.animate(
      {opacity: isSearching ? 0 : 1},
      {spring: tabBar.minimizeFade},
    );
  }, [isSearching, capsuleRef, accessory]);

  return {
    isMinimized,
    isCollapsed,
    expand,
    capsule,
    platter: platter.ref,
    platterMiddle: platterMiddle.ref,
    platterEnd: platterEnd.ref,
    items: items.ref,
    badges: badges.ref,
    circleIcon: circleIcon.ref,
    accessory: accessory.ref,
    accessoryMiddle: accessoryMiddle.ref,
    accessoryEnd: accessoryEnd.ref,
    searchGlass: searchGlass.ref,
    accessoryClip: accessoryClip.ref,
    accessoryContent: accessoryContent.ref,
  };
}
