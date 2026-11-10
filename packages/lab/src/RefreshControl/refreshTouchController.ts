// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file refreshTouchController.ts
 * @input The refresh's state and dispatch (refreshModel.ts), the pull's
 *   mapping (refreshPull.ts), and Core's internal touch entry
 * @output useRefreshTouchController: the refresh's touch layer (the pull, the
 *   inset, the indicator's place and every motion) and its refs
 * @position Internal to useRefreshControl; useRefreshControl.ts is its one
 *   import site, so a page loads this code only with the hook.
 *
 * SYNC: When modified, update:
 * - /packages/lab/src/RefreshControl/useRefreshControl.ts
 * - /packages/lab/src/RefreshControl/useRefreshControl.test.tsx
 */

// A pull at the top translates the content by the overscroll that UIKit shows
// for that travel: one write per move, and no React render. The pull applies
// in the nearest element that scrolls and overflows, never on the page
// itself. While that element overflows, it gets `overscroll-behavior-y: none`
// near its top, so the browser draws no rubber band where the pull draws
// instead. A scroll container that fits passes scrolls on to its ancestors,
// so it gets nothing. Scrolling stays native.
//
// The pull triggers with the finger down, and the refresh starts. A release
// settles onto the refreshing inset, or back to the top, on the scroll view's
// bounce. The end slides the content up by the inset. When the content is out
// of view, the end drops the inset and the matching offset in one task. A
// programmatic begin adds the inset with no motion.
//
// The indicator is the app's. The touch layer pins it at the top of the
// scroll view and writes how much of it the pull reveals. It fades it as a
// settle takes the content back.
//
// The settle hands the table's spring to the animator. The end plays
// UIKit's curve over the theme's duration token, read at its start, so the
// theme's tempo scales it. Finger tracking runs on the main thread, because the
// browser has no refresh pull to ride. Every release, settle and end runs on
// the compositor.
//
// Under Reduce Motion, a settle and the end cross-fade through a copy of the
// content. The copy fades out where the list shows, as the list lands and
// fades in. So the list shows on every frame.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefCallback,
} from 'react';
import type {PointerKind} from '@astryxdesign/core/internal/touch';
import {useGestureRecognizer} from '@astryxdesign/core/internal/touch';
import type {MotionCurve} from '@astryxdesign/core/internal/touch';
import {cubicBezier} from '@astryxdesign/core/internal/touch';
import {mapProgress} from '@astryxdesign/core/internal/touch';
import {scroll} from '@astryxdesign/core/internal/touch';
import {playReducedMotionCrossFade} from '@astryxdesign/core/internal/touch';
import type {ReducedMotionCrossFade} from '@astryxdesign/core/internal/touch';
import {reducedMotionFade} from '@astryxdesign/core/internal/touch';
import {observeResize} from '@astryxdesign/core/utils';
import {useMotionEngine} from '../internal/useMotionEngine';
import {
  RefreshPullRecognizer,
  RefreshScrollPullRecognizer,
} from './RefreshPullRecognizer';
import {REFRESH_REVEAL_VAR} from './refreshIndicator';
import type {RefreshEvent, RefreshState} from './refreshModel';
import {
  endMotion,
  endTiming,
  modeAfterTrigger,
  pullOverscroll,
  pullSlope,
  pullTravel,
  REFRESH_HEIGHT,
  releaseTarget,
  revealProgress,
  triggerDistance,
  type PullMode,
} from './refreshPull';

export interface RefreshTouchControllerOptions {
  /** Whether the pull applies. */
  readonly isPullEnabled: boolean;
  /** The state machine's state, shared with the wiring. */
  readonly model: {readonly current: RefreshState};
  /** The wiring's dispatch: the pull's events go to the state machine. */
  readonly dispatchRef: {readonly current: (event: RefreshEvent) => void};
}

export interface RefreshTouchController {
  readonly contentRef: RefCallback<HTMLElement>;
  readonly indicatorRef: RefCallback<HTMLElement>;
  /** A pull triggered: the indicator shows in full; the release settles onto the inset. */
  trigger(): void;
  /** A refresh began without a pull: the inset arrives with no visible motion. */
  begin(): void;
  /** The release settles onto the inset or back to the top. */
  settle(to: 'inset' | 'top'): void;
  /** The refresh ended. */
  end(): void;
}

/** The ancestors of `start` that scroll on y, nearest first, below the page. */
function scrollContainersOf(start: HTMLElement): HTMLElement[] {
  const doc = start.ownerDocument;
  const containers: HTMLElement[] = [];
  for (
    let node = start.parentElement;
    node != null && node !== doc.body && node !== doc.documentElement;
    node = node.parentElement
  ) {
    const overflowY = getComputedStyle(node).overflowY;
    if (
      overflowY === 'auto' ||
      overflowY === 'scroll' ||
      overflowY === 'overlay'
    ) {
      containers.push(node);
    }
  }
  return containers;
}

function overflows(element: HTMLElement): boolean {
  return element.scrollHeight > element.clientHeight;
}

/**
 * The element whose scroll moves the content: the nearest scroll container
 * that overflows. A container that fits passes scrolls on to its ancestors,
 * so it is not the owner. Null when none overflows: the page itself is never
 * the pull's.
 */
function findScrollOwner(start: HTMLElement): HTMLElement | null {
  return scrollContainersOf(start).find(overflows) ?? null;
}

function scrollTopOf(owner: HTMLElement | null): number {
  return owner?.scrollTop ?? 0;
}

function heightOf(owner: HTMLElement): number {
  return owner.clientHeight;
}

function scrollOwnerBy(owner: HTMLElement | null, delta: number): void {
  if (owner != null && delta !== 0) {
    owner.scrollTop += delta;
  }
}

/** A curve from `from` to `to` over `ms` on a cubic bézier. */
function bezierCurve(
  from: number,
  to: number,
  ms: number,
  points: readonly [number, number, number, number],
): MotionCurve {
  const ease = cubicBezier(points);
  const duration = ms / 1000;
  const at = (t: number) =>
    from + (to - from) * ease(Math.min(1, Math.max(0, t / duration)));
  return {duration, at, velocity: derivative(at, duration)};
}

function derivative(
  at: (t: number) => number,
  duration: number,
): (t: number) => number {
  const step = 1 / 1000;
  return t => {
    const a = Math.max(0, t - step);
    const b = Math.min(duration, t + step);
    return b > a ? (at(b) - at(a)) / (b - a) : 0;
  };
}

/**
 * The refresh's touch layer. The wiring owns the state and the
 * announcements; this owns everything a finger drives.
 */
export function useRefreshTouchController({
  isPullEnabled,
  model,
  dispatchRef,
}: RefreshTouchControllerOptions): RefreshTouchController {
  const dispatch = useCallback(
    (event: RefreshEvent) => dispatchRef.current(event),
    [dispatchRef],
  );
  const content = useMotionEngine();
  const indicator = useMotionEngine();
  const contentElement = useRef<HTMLElement | null>(null);
  const indicatorElement = useRef<HTMLElement | null>(null);
  // Whether the content holds the refreshing inset.
  const hasInset = useRef(false);
  // An end waiting for the frame after its render, and that frame.
  const pendingEnd = useRef<(() => void) | null>(null);
  const endFrame = useRef<number | null>(null);
  // Counts ends: each one renders, and the slide starts after that commit.
  const [endTick, setEndTick] = useState(0);
  const cancelPendingEnd = useCallback(() => {
    pendingEnd.current = null;
    if (endFrame.current != null) {
      cancelAnimationFrame(endFrame.current);
      endFrame.current = null;
    }
  }, []);

  const owner = useRef<HTMLElement | null>(null);
  const pull = useRef<{
    travel0: number;
    scrollTop0: number;
    dimension: number;
    floor: number;
    trigger: number;
    mode: PullMode;
  }>({
    travel0: 0,
    scrollTop0: 0,
    dimension: 1,
    floor: 0,
    trigger: triggerDistance(1),
    mode: 'reveal',
  });
  // How fast the overscroll follows the finger at its last move.
  const fingerSlope = useRef(0);
  // The content's speed as the finger lifts, px/s, for the settle it starts.
  const releaseVelocity = useRef(0);

  // -- Indicator ------------------------------------------------------------

  const setReveal = useCallback((value: number) => {
    indicatorElement.current?.style.setProperty(
      REFRESH_REVEAL_VAR,
      String(value),
    );
  }, []);

  /**
   * The pointer of the latest pull. Under Reduce Motion, a finger's release
   * cross-fades, as the animator does for any release under a coarse primary
   * pointer. A trackpad's release lands at once.
   */
  const pullPointer = useRef<PointerKind>('touch');

  /**
   * Places the content at `y` and pins the indicator at the top of the scroll
   * view. The indicator rides on the content's edge, so it moves by the inset
   * minus `y`.
   */
  const place = useCallback(
    (y: number) => {
      content.animator.set({y});
      indicator.animator.set({y: REFRESH_HEIGHT - y});
    },
    [content.animator, indicator.animator],
  );
  // A cross-fade in flight. Stopping it lands the list where it was heading.
  const crossFade = useRef<ReducedMotionCrossFade | null>(null);
  const stopPlacing = useCallback(() => {
    crossFade.current?.cancel();
    crossFade.current = null;
    content.animator.stop(['y']);
    indicator.animator.stop(['y']);
  }, [content.animator, indicator.animator]);
  /**
   * Cross-fades the content into what `land` writes, when Reduce Motion turns
   * the move into a cross-fade. The animator's own form for a move is a dip,
   * which blanks the list between the two states. Returns null when motion
   * plays, when the change is instant, or when the content is too large to
   * copy: the animator then plays the change.
   */
  const crossFadeContent = useCallback(
    (land: () => void, touchRelease: boolean): Promise<boolean> | null => {
      const element = contentElement.current;
      const fade =
        element == null ||
        content.animator.reducedMotion({touchRelease}) !== 'crossfade'
          ? null
          : reducedMotionFade(element, {touchRelease});
      if (element == null || fade == null) {
        return null;
      }
      stopPlacing();
      const played = playReducedMotionCrossFade(
        element,
        fade,
        land,
        owner.current,
      );
      if (played == null) {
        return null;
      }
      crossFade.current = played;
      played.finished.then(() => {
        if (crossFade.current === played) {
          crossFade.current = null;
        }
      });
      return played.finished;
    },
    [content.animator, stopPlacing],
  );

  /**
   * Puts the indicator back to opaque, and writes only if it changed. Each
   * animator write promotes its layer for a while. A release of that layer
   * during a settle costs a layout and a paint.
   */
  const restoreIndicator = useCallback(() => {
    if (indicator.animator.get('opacity') !== 1) {
      indicator.animator.set({opacity: 1});
    }
  }, [indicator.animator]);

  const resetIndicator = useCallback(() => {
    setReveal(0);
    restoreIndicator();
  }, [restoreIndicator, setReveal]);

  /**
   * Ends the indicator's fade and keeps what it shows. A finger that catches
   * the settle back to the top pulls on, or resumes the settle, from the
   * screen.
   */
  const keepShownIndicator = useCallback(() => {
    const opacity = indicator.animator.get('opacity');
    if (opacity === 1) {
      return;
    }
    const shown = Number(
      indicatorElement.current?.style.getPropertyValue(REFRESH_REVEAL_VAR) || 0,
    );
    setReveal(shown * opacity);
    restoreIndicator();
  }, [indicator.animator, restoreIndicator, setReveal]);

  /** The indicator in full: a trigger, or a refresh begun without a pull. */
  const showIndicator = useCallback(() => {
    setReveal(1);
    restoreIndicator();
  }, [restoreIndicator, setReveal]);

  // -- Scroll owner and its top-edge policy ----------------------------------

  const edge = useRef<{element: HTMLElement | null; saved: string | null}>({
    element: null,
    saved: null,
  });

  const releaseEdge = useCallback(() => {
    const state = edge.current;
    if (state.element != null && state.saved != null) {
      state.element.style.overscrollBehaviorY = state.saved;
    }
    edge.current = {element: null, saved: null};
  }, []);

  // Syncs the scroll listener's ref with the committed `isPullEnabled`. A
  // render React discards must not leave its value.
  const isPullEnabledRef = useRef(isPullEnabled);
  useLayoutEffect(() => {
    isPullEnabledRef.current = isPullEnabled;
  });

  /**
   * Near the top, the browser draws no overscroll: the pull does. Only an
   * element that scrolls and overflows: a container that fits, and the
   * page's own top edge, stay the browser's.
   */
  const applyEdge = useCallback(() => {
    const current = owner.current;
    const near =
      isPullEnabledRef.current &&
      current != null &&
      overflows(current) &&
      scrollTopOf(current) < Math.max(heightOf(current), REFRESH_HEIGHT);
    const state = edge.current;
    if (!near || state.element !== current) {
      releaseEdge();
    }
    if (!near || current == null) {
      return;
    }
    if (current.style.overscrollBehaviorY !== 'none') {
      // First claim, or the owner's own render replaced the value.
      edge.current = {
        element: current,
        saved: current.style.overscrollBehaviorY,
      };
      current.style.overscrollBehaviorY = 'none';
    }
  }, [releaseEdge]);

  // The owner's own scroll moves its top edge, so the pull listens there and
  // nowhere else, and only while a finger can pull. The listener moves with
  // the owner.
  const ownerScroll = useRef<{
    isActive: boolean;
    element: HTMLElement | null;
  }>({isActive: false, element: null});
  const onOwnerScroll = useCallback(() => applyEdge(), [applyEdge]);
  const listenToOwner = useCallback(() => {
    const state = ownerScroll.current;
    const next = state.isActive ? owner.current : null;
    if (next !== state.element) {
      state.element?.removeEventListener('scroll', onOwnerScroll);
      next?.addEventListener('scroll', onOwnerScroll, {passive: true});
      state.element = next;
    }
  }, [onOwnerScroll]);

  const resolveOwner = useCallback((): HTMLElement | null => {
    const element = contentElement.current;
    if (element == null) {
      return owner.current;
    }
    const next = findScrollOwner(element);
    if (next !== owner.current) {
      releaseEdge();
      owner.current = next;
      listenToOwner();
    }
    return next;
  }, [listenToOwner, releaseEdge]);

  // Content that mounts after the hook has no owner, listener or resize
  // observation yet, so attaching it runs the edge setup again.
  const setUpEdge = useRef<(() => void) | null>(null);

  useEffect(() => {
    // The pull watches the owner and its top edge only while a finger can
    // pull. Otherwise it holds no listener, and a contact re-resolves the
    // owner. The edge is claimed before a touch lands. The gesture host's
    // listeners are passive, so a claim at touch-down can come after the
    // browser's own overscroll starts.
    if (!isPullEnabled) {
      releaseEdge();
      return undefined;
    }
    ownerScroll.current.isActive = true;
    const update = () => {
      if (contentElement.current == null) {
        // Detached content leaves no owner to claim or listen to.
        releaseEdge();
        owner.current = null;
      } else {
        resolveOwner();
        applyEdge();
      }
      listenToOwner();
    };
    // A container starts or stops overflowing as the content or the
    // container resizes, with no scroll event. So the owner is read again on
    // each resize of the content and of its scroll containers.
    let unobserve: (() => void)[] = [];
    const observe = () => {
      for (const stop of unobserve) {
        stop();
      }
      const element = contentElement.current;
      unobserve =
        element == null
          ? []
          : [element, ...scrollContainersOf(element)].map(node =>
              observeResize(node, update),
            );
    };
    const setUp = () => {
      update();
      observe();
    };
    setUpEdge.current = setUp;
    setUp();
    // A scroll container can scroll only after its own effects run, which is
    // after this effect. ScrollableArea clips its viewport until it measures
    // it. So the owner is read again once those effects render.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(setUp);
    });
    return () => {
      setUpEdge.current = null;
      cancelAnimationFrame(frame);
      for (const stop of unobserve) {
        stop();
      }
      ownerScroll.current.isActive = false;
      listenToOwner();
      releaseEdge();
    };
  }, [applyEdge, isPullEnabled, listenToOwner, releaseEdge, resolveOwner]);

  // -- Motion of the state machine's effects ----------------------------------

  const startSettle = useCallback(
    (to: 'inset' | 'top') => {
      const target = releaseTarget(to === 'inset');
      const from = content.animator.get('y');
      // The settle starts at the content's speed as the finger lifts. A
      // caught settle that resumes starts from rest.
      const velocity = releaseVelocity.current;
      releaseVelocity.current = 0;
      // A finger's release starts the settle as a touch release. So under
      // Reduce Motion it cross-fades instead of moving, as any release does
      // under a coarse primary pointer. A trackpad's release lands at once.
      const touchRelease = pullPointer.current === 'touch';
      const crossFaded = crossFadeContent(() => place(target), touchRelease);
      if (crossFaded != null) {
        if (to === 'top' && !model.current.isRefreshing && from > 0) {
          crossFaded.then(done => {
            if (done && !model.current.isRefreshing) {
              resetIndicator();
            }
          });
        }
        return;
      }
      // No start time: the animator starts the settle when the compositor
      // does, so its first frame is the curve's start.
      const contentSettle = content.animator.animate(
        {y: target},
        {spring: scroll.bounce, velocity: {y: velocity}},
        {touchRelease},
      );
      indicator.animator.animate(
        {y: REFRESH_HEIGHT - target},
        {spring: scroll.bounce, velocity: {y: -velocity}},
        {touchRelease},
      );
      if (to === 'top' && !model.current.isRefreshing && from > 0) {
        // The indicator fades as the content covers it, along the content's
        // own settle curve. Started in the same task, the two start on the
        // same compositor frame. A settle with no curve (an instant one, or
        // the animator's cross-fade) resets the indicator once it ends.
        const curve = contentSettle.curve('y');
        const {dimension} = pull.current;
        const start = revealProgress(from, dimension) || 1;
        const finished =
          curve == null
            ? contentSettle.finished
            : indicator.animator.play(
                {
                  opacity: mapProgress(
                    curve,
                    y => revealProgress(y, dimension) / start,
                  ),
                },
                {touchRelease},
              ).finished;
        finished.then(done => {
          if (done && !model.current.isRefreshing) {
            resetIndicator();
          }
        });
      }
    },
    [
      content.animator,
      crossFadeContent,
      indicator.animator,
      place,
      resetIndicator,
    ],
  );

  const settle = useCallback(
    (to: 'inset' | 'top') => {
      if (to === 'inset') {
        hasInset.current = true;
      }
      // Started in the lift's own task. The frame right after a long task
      // carries the time it was due. An animation started there would begin
      // in the past.
      startSettle(to);
    },
    [startSettle],
  );

  const end = useCallback(() => {
    const hadInset = hasInset.current;
    hasInset.current = false;
    if (model.current.isPulling) {
      // Under the finger: the release settles back to the top, and the
      // indicator retracts with it.
      pull.current.floor = 0;
      return;
    }
    if (!hadInset) {
      // A refresh that never showed (begun without a finger): nothing to move.
      resetIndicator();
      return;
    }
    // From rest: a settle still easing onto the inset stops where it is
    // shown. Ending over it would continue it with a fixed start time, which
    // WebKit skips past when a block follows.
    stopPlacing();
    const current = resolveOwner();
    const {animateTo, scrollBy} = endMotion(scrollTopOf(current));
    if (animateTo == null) {
      place(0);
      scrollOwnerBy(current, scrollBy);
      resetIndicator();
      return;
    }
    // The slide starts two frames after the refresh's end renders, with the
    // app's update and the busy state. WebKit starts an animation created just
    // before a long task at the frame before that task. The first frame after
    // a long task carries the time it was due. Either way, the start of the
    // slide would never show.
    pendingEnd.current = () => {
      // The indicator stays opaque while the content slides up over its gap
      // (UIKit holds it at opacity 1 for nearly the whole end). Under Reduce
      // Motion, the slide cross-fades.
      const from = content.animator.get('y');
      const element = contentElement.current;
      const finish = () => {
        place(0);
        scrollOwnerBy(current, scrollBy);
        if (!model.current.isRefreshing) {
          resetIndicator();
        }
      };
      // The theme's duration token as it applies here, at the end's start.
      // With no token, or a token in a form it cannot read, the end has no
      // slide.
      const timing =
        element == null ? null : endTiming(getComputedStyle(element));
      if (timing == null || timing.ms <= 0) {
        finish();
        return;
      }
      if (crossFadeContent(finish, false) != null) {
        return;
      }
      const {ms, points} = timing;
      indicator.animator.play({
        y: bezierCurve(
          REFRESH_HEIGHT - from,
          REFRESH_HEIGHT - animateTo,
          ms,
          points,
        ),
      });
      content.animator
        .play({y: bezierCurve(from, animateTo, ms, points)})
        .finished.then(done => {
          if (done) {
            finish();
          }
        });
    };
    setEndTick(tick => tick + 1);
  }, [
    content.animator,
    crossFadeContent,
    indicator.animator,
    place,
    resetIndicator,
    resolveOwner,
    stopPlacing,
  ]);

  // Plays a pending end once the refresh's end renders. This effect runs
  // after the commit that carries the end's tick, and the slide starts two
  // frames later. A tick is used, not the rendered `isRefreshing`. A refresh
  // that begins and ends before React renders never changes `isRefreshing`,
  // for example a timer's `refresh()` whose `onRefresh` settles at once.
  useEffect(() => {
    if (pendingEnd.current == null) {
      return;
    }
    endFrame.current = requestAnimationFrame(() => {
      endFrame.current = requestAnimationFrame(() => {
        endFrame.current = null;
        const play = pendingEnd.current;
        pendingEnd.current = null;
        play?.();
      });
    });
  }, [endTick]);
  useEffect(
    () => () => {
      if (endFrame.current != null) {
        cancelAnimationFrame(endFrame.current);
      }
    },
    [],
  );

  // -- The pull -------------------------------------------------------------

  // The pan's vertical translation where the pull starts: null until the
  // content is at its top under a finger moving down.
  const anchor = useRef<number | null>(null);
  const lastTranslation = useRef(0);
  // A settle a finger caught (it stops where it is on touch-down) resumes
  // when no pull follows.
  const resumeSettle = useCallback(() => {
    if (model.current.isPulling) {
      return;
    }
    const target = releaseTarget(model.current.isRefreshing);
    if (Math.abs(content.animator.get('y') - target) > 0.05) {
      settle(model.current.isRefreshing ? 'inset' : 'top');
    }
  }, [content.animator, model, settle]);

  const onPull = (pan: RefreshPullRecognizer) => {
    const state = model.current;
    if (pan.state === 'began' || pan.state === 'changed') {
      const translation = pan.translation().y;
      if (anchor.current == null) {
        // Not pulling yet: the browser can be scrolling the content, in a drag
        // that began as a scroll. The pull starts in the same touch once the
        // content is at its top and the finger moves down. The browser keeps
        // the finger all along, and the pan only watches, so nothing changes
        // hands.
        const current = pan.state === 'began' ? resolveOwner() : owner.current;
        // At `began` the finger's whole move counts, the threshold's
        // included (a slow drag begins at a translation of zero).
        const isMovingDown =
          pan.state === 'began'
            ? translation + pan.travelAtBegan.y > 0
            : translation > lastTranslation.current;
        lastTranslation.current = translation;
        if (!isMovingDown || current == null || scrollTopOf(current) > 0) {
          return;
        }
        // From rest the travel is the pan's (which leaves out its
        // hysteresis, as UIKit's does); past a scroll it starts where the
        // content ran out.
        anchor.current = pan.state === 'began' ? 0 : translation;
        pullPointer.current = pan.pointerType;
        const shown = content.animator.get('y');
        stopPlacing();
        const dimension = heightOf(current);
        const mode: PullMode = state.isRefreshing ? 'band' : 'reveal';
        pull.current = {
          dimension,
          mode,
          trigger: triggerDistance(dimension),
          floor: state.isRefreshing ? REFRESH_HEIGHT : 0,
          travel0: pullTravel(shown, dimension, mode),
          scrollTop0: scrollTopOf(current),
        };
        dispatch({type: 'pullStart'});
      }
      lastTranslation.current = translation;
      const geometry = pull.current;
      // A browser that scrolls the content back as the finger returns
      // (Chromium) takes over from the pull.
      const scrolledBack =
        scrollTopOf(owner.current) - geometry.scrollTop0 > 0.5;
      const travel = scrolledBack
        ? 0
        : geometry.travel0 + (translation - anchor.current);
      const pulled = pullOverscroll(travel, geometry.dimension, geometry.mode);
      const overscroll = Math.max(geometry.floor, pulled);
      // The content follows the finger by the pull's slope, unless the
      // refreshing inset holds it.
      fingerSlope.current =
        pulled > geometry.floor
          ? pullSlope(travel, geometry.dimension, geometry.mode)
          : 0;
      const hadTriggered = model.current.hasTriggered;
      dispatch({type: 'pullMove', overscroll, trigger: geometry.trigger});
      if (!hadTriggered && model.current.hasTriggered) {
        // The frame after the trigger steps onto the finger (within the
        // one-to-one band).
        geometry.mode =
          geometry.mode === 'band' ? 'band' : modeAfterTrigger(travel);
      }
      place(overscroll);
      if (!model.current.isRefreshing) {
        setReveal(revealProgress(overscroll, geometry.dimension));
      }
      return;
    }
    if (pan.state !== 'ended' && pan.state !== 'cancelled') {
      return;
    }
    const wasPulling = anchor.current != null;
    anchor.current = null;
    if (!wasPulling) {
      // A scroll that never reached the top: a settle the finger caught
      // resumes.
      resumeSettle();
      return;
    }
    // A lift hands the content's speed to the settle: the scroll view's
    // release velocity times the pull's slope. A cancelled pull's finger never
    // lifted, so its settle starts from rest.
    releaseVelocity.current =
      pan.state === 'ended' ? pan.scrollVelocity().y * fingerSlope.current : 0;
    dispatch({type: pan.state === 'ended' ? 'pullEnd' : 'pullCancel'});
    releaseVelocity.current = 0;
  };
  // The touch pull takes no scroll. It watches a contact from the start of a
  // drag, so it would take a scroll in the middle of the page.
  const recognizer = useGestureRecognizer(
    contentElement,
    () => new RefreshPullRecognizer(),
    onPull,
  );
  // A trackpad's two-finger scroll pulls through a second pan, which takes
  // only that scroll and never a mouse wheel's notches. It begins only where
  // nothing under the pointer could scroll: the owner at its top and the
  // content moving down. It claims what it takes, so its blocking `wheel`
  // listener is a claimer's.
  const scrollRecognizer = useGestureRecognizer(
    contentElement,
    () => new RefreshScrollPullRecognizer(),
    onPull,
  );
  // Syncs whether the pull applies with the recognizer, an object outside
  // React. Turned off mid-pull, the recognizer reports `cancelled` to the
  // listener above. The listener settles the content back and ends the pull,
  // where the hook's own `isEnabled` would end it silently.
  useEffect(() => {
    recognizer.setEnabled(isPullEnabled);
    scrollRecognizer.setEnabled(isPullEnabled);
  }, [isPullEnabled, recognizer, scrollRecognizer]);

  useEffect(() => {
    // A finger landing on a settle in flight stops it (UIScrollView brakes),
    // as a trackpad's scroll starting does; if no pull follows, the settle
    // resumes.
    const pans = [recognizer, scrollRecognizer];
    const stops = pans.map(pan => {
      pan.onTouchDown = () => {
        resolveOwner();
        applyEdge();
        cancelPendingEnd();
        stopPlacing();
        keepShownIndicator();
      };
      return pan.addTransitionListener(current => {
        if (current.state === 'failed') {
          resumeSettle();
        }
      });
    });
    return () => {
      for (const pan of pans) {
        pan.onTouchDown = null;
      }
      for (const stop of stops) {
        stop();
      }
    };
  }, [
    applyEdge,
    cancelPendingEnd,
    keepShownIndicator,
    recognizer,
    resolveOwner,
    resumeSettle,
    scrollRecognizer,
    stopPlacing,
  ]);

  const contentRef = useCallback(
    (element: HTMLElement | null) => {
      contentElement.current = element;
      content.ref(element);
      setUpEdge.current?.();
    },
    [content],
  );
  const indicatorRef = useCallback(
    (element: HTMLElement | null) => {
      indicatorElement.current = element;
      indicator.ref(element);
    },
    [indicator],
  );

  const trigger = useCallback(() => {
    // Only a pull triggers: it settles onto the inset.
    hasInset.current = true;
    showIndicator();
  }, [showIndicator]);

  const begin = useCallback(() => {
    showIndicator();
    if (!model.current.isPulling) {
      // The inset arrives with no visible motion, as beginRefreshing().
      cancelPendingEnd();
      const current = resolveOwner();
      place(REFRESH_HEIGHT);
      scrollOwnerBy(current, REFRESH_HEIGHT);
      hasInset.current = true;
    }
  }, [cancelPendingEnd, model, place, resolveOwner, showIndicator]);

  return useMemo(
    () => ({
      contentRef,
      indicatorRef,
      trigger,
      begin,
      settle,
      end,
    }),
    [begin, contentRef, end, indicatorRef, settle, trigger],
  );
}
