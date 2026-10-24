// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSwipeAction.ts
 * @input Pointer events on a row's root; the root element to translate
 * @output Exports useSwipeAction — the gesture behind Item's `swipeActions`
 * @position Internal to Item, through ItemSwipeLayer (the only module that
 *   imports it, loaded on demand); tested through Item.test.tsx
 *
 * A native-list swipe: drag a row sideways and the side's panel is uncovered.
 * Under `reveal` a release past half the panel leaves the row resting open
 * with every entry tappable, and a long drag or a fling fires the outermost
 * entry; under `commit` a release past the commit point slides the row out
 * and fires the outermost entry, and nothing rests. After an entry fires the
 * row springs back, or holds out when the entry has `hasRemoval`. A release
 * short of the threshold springs back under both.
 *
 * Touch only, by pointer type rather than by breakpoint: a mouse has the
 * row's own controls and a keyboard has the verb already; the gesture is an
 * accelerator for a verb the row exposes elsewhere, never the only way to
 * reach one.
 *
 * The axis is decided once, at 10 px of travel: a drag more vertical than
 * horizontal belongs to the scroller and is never claimed. The claim is told
 * to the browser: `touch-action: pan-y` is not enough on iOS Safari, whose
 * scroller takes any drag with a vertical component as a pan (a 4:1 drag got
 * `pointercancel` 40 px in; the same drag after a one-second hold, which
 * fails the native pan, ran to the end), so a non-passive `touchmove`
 * listener cancels the default while the row owns the drag, which is the one
 * signal WebKit honours. Before the axis is decided, and for a drag the
 * scroller got, nothing is cancelled.
 *
 * A pinch is the browser's: the root's `touch-action` keeps `pinch-zoom`, and
 * a second finger that lands anywhere before the axis is decided turns the
 * touch into a pinch, so the row lets it go and cancels nothing. A finger
 * that is not the first one down never starts a drag. Once the row owns a
 * drag, a second finger does not break it.
 *
 * The drag's travel is one custom property written on the root, coalesced to
 * one write per frame; the root's transform reads it and the panels'
 * transforms read its negation, so the row moves and the panel appears fixed
 * in the space the row vacates. Settling (the spring back, the slide out)
 * writes a duration the same elements read as their transition clock, so
 * everything derived from the travel moves together. A drag costs no React
 * render; the claim and the settle each cost one.
 *
 * Directions are logical: `leading` is a drag toward the inline end and
 * `trailing` a drag toward the inline start, read against the root's computed
 * `direction` at the touch and written beside the travel as a sign the
 * transforms multiply by, so under `dir="rtl"` the finger, the uncovered edge
 * and the panel's logical inset agree.
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import type {
  PointerEvent as ReactPointerEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import {isRtlElement} from '../hooks/isRtlElement';

/** The travel, in physical px, written on the row root during a drag. */
export const SWIPE_TRAVEL_PROPERTY = '--_item-swipe-travel';
/** +1 when the inline end is to the right (LTR), -1 under RTL. */
export const SWIPE_DIRECTION_PROPERTY = '--_item-swipe-dir';
/** The clock a settle runs on; `0s` while the finger drives the row. */
export const SWIPE_DURATION_PROPERTY = '--_item-swipe-duration';

/** Travel before the axis is decided. */
const AXIS_LOCK_PX = 10;
/** The commit point: this far past the side's panel, or this fraction of the row, whichever is greater. */
const COMMIT_PAST_PANEL_PX = 48;
const COMMIT_FRACTION = 0.5;
/** Under `reveal`, a release this far into the panel rests the row open. */
const REST_FRACTION = 0.5;
/** Travel past the commit point moves the row this much per pixel of finger. */
const OVERSHOOT_RESISTANCE = 0.35;
/** A release at this speed commits from FLING_MIN_PX, short of the commit point. */
const FLING_VELOCITY_PX_PER_MS = 0.6;
const FLING_MIN_PX = 44;
/** How far past the row's edge a slide-out travels. */
const SLIDE_OUT_OVERSHOOT_PX = 24;
/** The slide-out after a commit, and the spring back after a release. */
export const SWIPE_SETTLE_MS = 200;
/** A click the browser synthesizes after a swipe is not a tap on the row. */
const CLICK_SUPPRESS_MS = 400;

export type SwipeSide = 'leading' | 'trailing';
export type SwipeBehavior = 'reveal' | 'commit';
export type SwipePhase =
  /** At rest, closed. */
  | 'idle'
  /** The finger drives the row. */
  | 'dragging'
  /** Springing back or sliding out, on the settle clock. */
  | 'settling'
  /** Resting open with the side's panel tappable (`reveal` only). */
  | 'resting'
  /** Slid out after an entry with `hasRemoval` fired. */
  | 'held';

export interface SwipeState {
  phase: SwipePhase;
  /** The side whose panel is uncovered, or will be. */
  side: SwipeSide;
  /** Past the commit point: letting go now fires the outermost entry. */
  isArmed: boolean;
}

export interface UseSwipeActionOptions {
  /** Off: the handlers do nothing and no row moves. */
  isEnabled: boolean;
  behavior: SwipeBehavior;
  /** Which sides have entries. A drag toward a side without any is not claimed. */
  sides: {leading: boolean; trailing: boolean};
  /** The natural width of a side's panel, read when a drag begins. */
  measurePanel: (side: SwipeSide) => number;
  /**
   * Fire the side's outermost entry. Returns whether the row holds out
   * afterwards (the entry's `hasRemoval`).
   */
  fireOutermost: (side: SwipeSide) => boolean;
  /** Skip the slide and spring animations. */
  isReducedMotion?: boolean;
  /** The row root: the gesture's target and the element that translates. */
  rootRef: React.RefObject<HTMLElement | null>;
}

export interface SwipeHandlers {
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
  onPointerCancel: (event: ReactPointerEvent) => void;
  onClickCapture: (event: ReactMouseEvent) => void;
  onKeyDown: (event: ReactKeyboardEvent) => void;
}

export interface UseSwipeActionResult {
  state: SwipeState;
  handlers: SwipeHandlers;
  /**
   * A resting panel's entry was tapped: fire it, then hold the row out
   * (`hasRemoval`) or close.
   */
  activateEntry: (fire: () => boolean) => void;
  /** Close a resting row. */
  close: () => void;
  /** Whether a click arriving now is the one the browser synthesized after a drag. */
  shouldSuppressClick: () => boolean;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  /** The travel the row already had when the finger landed (a resting row). */
  baseTravel: number;
  /** null until the axis is decided; false once it went to the scroller. */
  claimed: boolean | null;
  side: SwipeSide;
  panelWidth: number;
  commitPx: number;
  lastX: number;
  lastTime: number;
  prevX: number;
  prevTime: number;
  /** Logical travel toward the side, before resistance. */
  travel: number;
  inlineSign: 1 | -1;
}

const IDLE_STATE: SwipeState = {isArmed: false, phase: 'idle', side: 'leading'};

/** The logical sign of a side: +1 toward the inline end, -1 toward the start. */
function signOf(side: SwipeSide): number {
  return side === 'trailing' ? -1 : 1;
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

/**
 * The first focusable thing in the row outside its swipe panels, for focus to
 * land on when a resting panel closes under it.
 */
function focusRowContent(root: HTMLElement): void {
  const candidates = root.querySelectorAll<HTMLElement>(
    'button, a[href], input, [tabindex]:not([tabindex="-1"])',
  );
  for (const el of candidates) {
    if (el.closest('[data-swipe-panel]') == null) {
      el.focus();
      return;
    }
  }
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

export function useSwipeAction({
  isEnabled,
  behavior,
  sides,
  measurePanel,
  fireOutermost,
  isReducedMotion = false,
  rootRef,
}: UseSwipeActionOptions): UseSwipeActionResult {
  const dragRef = useRef<DragState | null>(null);
  const travelRef = useRef(0);
  const inlineSignRef = useRef<1 | -1>(1);
  const suppressClickUntilRef = useRef(0);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  /** Removes the document listener that watches for a pinch's second finger. */
  const stopPinchWatchRef = useRef<(() => void) | null>(null);
  const [state, setState] = useState<SwipeState>(IDLE_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  // The latest callbacks, read by handlers and timers that outlive a render.
  const measurePanelRef = useRef(measurePanel);
  const fireOutermostRef = useRef(fireOutermost);
  const sidesRef = useRef(sides);
  const behaviorRef = useRef(behavior);
  const reducedMotionRef = useRef(isReducedMotion);
  useEffect(() => {
    measurePanelRef.current = measurePanel;
    fireOutermostRef.current = fireOutermost;
    sidesRef.current = sides;
    behaviorRef.current = behavior;
    reducedMotionRef.current = isReducedMotion;
  });

  useEffect(
    () => () => {
      if (settleTimerRef.current != null) {
        clearTimeout(settleTimerRef.current);
      }
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }
      stopPinchWatchRef.current?.();
      stopPinchWatchRef.current = null;
    },
    [],
  );

  const stopWatchingForPinch = useCallback(() => {
    stopPinchWatchRef.current?.();
    stopPinchWatchRef.current = null;
  }, []);

  /**
   * Until the axis is decided, a second finger anywhere on the page makes
   * the touch a pinch: the row gives it up and cancels nothing, so the
   * browser zooms. The finger can land off the row, so the document listens.
   */
  const watchForPinch = useCallback(
    (drag: DragState) => {
      stopWatchingForPinch();
      const onAnyPointerDown = (event: PointerEvent) => {
        if (
          event.pointerType === 'touch' &&
          event.pointerId !== drag.pointerId &&
          drag.claimed === null
        ) {
          drag.claimed = false;
          stopWatchingForPinch();
        }
      };
      document.addEventListener('pointerdown', onAnyPointerDown, {
        capture: true,
        passive: true,
      });
      stopPinchWatchRef.current = () => {
        document.removeEventListener('pointerdown', onAnyPointerDown, {
          capture: true,
        });
      };
    },
    [stopWatchingForPinch],
  );

  /** Write the travel (physical px) the transforms read. */
  const writeTravel = useCallback(
    (travel: number) => {
      const root = rootRef.current;
      if (!root) {
        return;
      }
      travelRef.current = travel;
      root.style.setProperty(SWIPE_TRAVEL_PROPERTY, `${travel}px`);
    },
    [rootRef],
  );

  const writeDuration = useCallback(
    (ms: number) => {
      const root = rootRef.current;
      if (!root) {
        return;
      }
      if (ms > 0) {
        root.style.setProperty(SWIPE_DURATION_PROPERTY, `${ms}ms`);
      } else {
        root.style.setProperty(SWIPE_DURATION_PROPERTY, '0s');
      }
    },
    [rootRef],
  );

  const clearInlineProperties = useCallback(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    root.style.removeProperty(SWIPE_TRAVEL_PROPERTY);
    root.style.removeProperty(SWIPE_DIRECTION_PROPERTY);
    root.style.removeProperty(SWIPE_DURATION_PROPERTY);
    travelRef.current = 0;
  }, [rootRef]);

  const cancelPendingPaint = useCallback(() => {
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = null;
    pendingRef.current = null;
  }, []);

  /** One write per frame while the finger drives the row. */
  const paintOnNextFrame = useCallback(
    (travel: number) => {
      pendingRef.current = travel;
      if (frameRef.current != null) {
        return;
      }
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const next = pendingRef.current;
        pendingRef.current = null;
        if (next != null) {
          writeTravel(next);
        }
      });
    },
    [writeTravel],
  );

  /**
   * Move the row to `travel` on the settle clock, then land in `phase`. A
   * zero clock (reduced motion) lands at once.
   */
  const settle = useCallback(
    (
      side: SwipeSide,
      travel: number,
      phase: 'idle' | 'resting' | 'held',
      afterSlide?: () => boolean,
    ) => {
      cancelPendingPaint();
      const duration = reducedMotionRef.current ? 0 : SWIPE_SETTLE_MS;
      setState({isArmed: false, phase: 'settling', side});
      writeDuration(duration);
      writeTravel(travel);
      if (settleTimerRef.current != null) {
        clearTimeout(settleTimerRef.current);
      }
      settleTimerRef.current = setTimeout(() => {
        settleTimerRef.current = null;
        writeDuration(0);
        // A settle that fires an entry may start the spring back itself; the
        // landing below is then that settle's to make.
        if (afterSlide?.() === true) {
          return;
        }
        if (phase === 'idle') {
          clearInlineProperties();
        }
        setState(phase === 'idle' ? IDLE_STATE : {isArmed: false, phase, side});
      }, duration);
    },
    [cancelPendingPaint, clearInlineProperties, writeDuration, writeTravel],
  );

  /**
   * The outermost entry fires. Under both models the row first travels to
   * its slide-out, fires, then holds out (`hasRemoval`) or springs back.
   */
  const slideOutAndFire = useCallback(
    (side: SwipeSide, inlineSign: 1 | -1) => {
      const root = rootRef.current;
      const width = root?.clientWidth ?? 0;
      const out = signOf(side) * inlineSign * (width + SLIDE_OUT_OVERSHOOT_PX);
      settle(side, out, 'held', () => {
        const holdsOut = fireOutermostRef.current(side);
        if (holdsOut) {
          return false;
        }
        settle(side, 0, 'idle');
        return true;
      });
    },
    [rootRef, settle],
  );

  const close = useCallback(() => {
    const current = stateRef.current;
    if (current.phase !== 'resting') {
      return;
    }
    const root = rootRef.current;
    if (root != null && root.contains(document.activeElement)) {
      focusRowContent(root);
    }
    settle(current.side, 0, 'idle');
  }, [rootRef, settle]);

  // A resting row closes on a pointer landing anywhere outside it, which is
  // also how a drag on a neighbour closes it: one row rests open at a time
  // with no shared state.
  useEffect(() => {
    if (state.phase !== 'resting') {
      return undefined;
    }
    const onOutside = (event: PointerEvent) => {
      const root = rootRef.current;
      if (
        root != null &&
        event.target instanceof Node &&
        !root.contains(event.target)
      ) {
        close();
      }
    };
    document.addEventListener('pointerdown', onOutside, true);
    return () => {
      document.removeEventListener('pointerdown', onOutside, true);
    };
  }, [close, rootRef, state.phase]);

  // The browser's half of the claim (see the header). React's own touch
  // listeners are passive, so this one is attached by hand; it is removed
  // with the element.
  useEffect(() => {
    const root = rootRef.current;
    if (root == null || !isEnabled) {
      return undefined;
    }
    const onTouchMove = (event: TouchEvent) => {
      if (dragRef.current?.claimed === true && event.cancelable) {
        event.preventDefault();
      }
    };
    root.addEventListener('touchmove', onTouchMove, {passive: false});
    return () => {
      root.removeEventListener('touchmove', onTouchMove);
    };
  }, [isEnabled, rootRef]);

  const activateEntry = useCallback(
    (fire: () => boolean) => {
      const current = stateRef.current;
      if (current.phase !== 'resting') {
        return;
      }
      const root = rootRef.current;
      if (root != null && root.contains(document.activeElement)) {
        focusRowContent(root);
      }
      const holdsOut = fire();
      if (holdsOut) {
        const width = root?.clientWidth ?? 0;
        const out =
          signOf(current.side) *
          inlineSignRef.current *
          (width + SLIDE_OUT_OVERSHOOT_PX);
        settle(current.side, out, 'held');
      } else {
        settle(current.side, 0, 'idle');
      }
    },
    [rootRef, settle],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      const current = stateRef.current;
      const inFlight = dragRef.current;
      if (inFlight != null) {
        // A second finger before the axis is decided: a pinch, not a swipe.
        if (
          event.pointerType === 'touch' &&
          event.pointerId !== inFlight.pointerId &&
          inFlight.claimed === null
        ) {
          inFlight.claimed = false;
          stopWatchingForPinch();
        }
        return;
      }
      if (
        !isEnabled ||
        event.pointerType !== 'touch' ||
        // Another finger is already down: this one is part of a pinch.
        event.isPrimary === false ||
        current.phase === 'settling' ||
        current.phase === 'held'
      ) {
        return;
      }
      const root = rootRef.current;
      const inlineSign: 1 | -1 = isRtlElement(root) ? -1 : 1;
      inlineSignRef.current = inlineSign;
      const startTime = now();
      const drag: DragState = {
        // Logical: the physical travel through the inline sign.
        baseTravel: travelRef.current * inlineSign,
        claimed: null,
        commitPx: 0,
        inlineSign,
        lastTime: startTime,
        lastX: event.clientX,
        panelWidth: 0,
        pointerId: event.pointerId,
        prevTime: startTime,
        prevX: event.clientX,
        side: current.phase === 'resting' ? current.side : 'leading',
        startX: event.clientX,
        startY: event.clientY,
        travel: 0,
      };
      dragRef.current = drag;
      watchForPinch(drag);
    },
    [isEnabled, rootRef, stopWatchingForPinch, watchForPinch],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const drag = dragRef.current;
      if (
        drag == null ||
        drag.pointerId !== event.pointerId ||
        drag.claimed === false
      ) {
        return;
      }
      // Logical travel: positive toward the inline end.
      const deltaX = (event.clientX - drag.startX) * drag.inlineSign;
      const deltaY = event.clientY - drag.startY;
      if (drag.claimed === null) {
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < AXIS_LOCK_PX) {
          return;
        }
        // The axis is decided now, whichever way: a later finger is the
        // swipe's to ignore or the scroller's to use.
        stopWatchingForPinch();
        // More horizontal than vertical is the row's, the rest the scroller's.
        if (Math.abs(deltaX) <= Math.abs(deltaY)) {
          drag.claimed = false;
          return;
        }
        const resting = stateRef.current.phase === 'resting';
        // From rest, the drag continues the open side (closing it or going
        // further); from closed, the drag's direction names the side.
        const side: SwipeSide = resting
          ? drag.side
          : deltaX > 0
            ? 'leading'
            : 'trailing';
        if (!sidesRef.current[side]) {
          drag.claimed = false;
          return;
        }
        drag.claimed = true;
        drag.side = side;
        drag.panelWidth = measurePanelRef.current(side);
        const width = rootRef.current?.clientWidth ?? 0;
        drag.commitPx = Math.max(
          drag.panelWidth + COMMIT_PAST_PANEL_PX,
          width * COMMIT_FRACTION,
        );
        if (rootRef.current != null) {
          rootRef.current.style.setProperty(
            SWIPE_DIRECTION_PROPERTY,
            String(drag.inlineSign),
          );
        }
        writeDuration(0);
        setState({isArmed: false, phase: 'dragging', side});
        try {
          rootRef.current?.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is a nicety (keeps the drag when the finger
          // leaves the row); a platform without it still drags.
        }
      }
      const sign = signOf(drag.side);
      // Travel toward the side, counted from where the row already was.
      const raw = Math.max(0, deltaX * sign + drag.baseTravel * sign);
      const offset =
        raw <= drag.commitPx
          ? raw
          : drag.commitPx + (raw - drag.commitPx) * OVERSHOOT_RESISTANCE;
      const isArmed = raw >= drag.commitPx;
      if (isArmed !== drag.travel >= drag.commitPx) {
        setState({isArmed, phase: 'dragging', side: drag.side});
      }
      drag.travel = raw;
      drag.prevX = drag.lastX;
      drag.prevTime = drag.lastTime;
      drag.lastX = event.clientX;
      drag.lastTime = now();
      paintOnNextFrame(sign * drag.inlineSign * offset);
    },
    [paintOnNextFrame, rootRef, stopWatchingForPinch, writeDuration],
  );

  const endGesture = useCallback(
    (event: ReactPointerEvent, cancelled: boolean) => {
      const drag = dragRef.current;
      if (drag == null || drag.pointerId !== event.pointerId) {
        return;
      }
      dragRef.current = null;
      stopWatchingForPinch();
      if (drag.claimed !== true) {
        return;
      }
      suppressClickUntilRef.current = now() + CLICK_SUPPRESS_MS;
      try {
        rootRef.current?.releasePointerCapture(event.pointerId);
      } catch {
        // See setPointerCapture above.
      }
      const {side, inlineSign} = drag;
      const restTravel = signOf(side) * inlineSign * drag.panelWidth;
      if (cancelled) {
        settle(side, 0, 'idle');
        return;
      }
      const elapsed = Math.max(1, drag.lastTime - drag.prevTime);
      const velocity =
        (signOf(side) * inlineSign * (drag.lastX - drag.prevX)) / elapsed;
      const flung =
        velocity >= FLING_VELOCITY_PX_PER_MS && drag.travel >= FLING_MIN_PX;
      if (drag.travel >= drag.commitPx || flung) {
        slideOutAndFire(side, inlineSign);
        return;
      }
      if (
        behaviorRef.current === 'reveal' &&
        drag.travel >= drag.panelWidth * REST_FRACTION
      ) {
        settle(side, restTravel, 'resting');
        return;
      }
      settle(side, 0, 'idle');
    },
    [rootRef, settle, slideOutAndFire, stopWatchingForPinch],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent) => endGesture(event, false),
    [endGesture],
  );
  const onPointerCancel = useCallback(
    (event: ReactPointerEvent) => endGesture(event, true),
    [endGesture],
  );
  const shouldSuppressClick = useCallback(
    () => now() < suppressClickUntilRef.current,
    [],
  );
  const onClickCapture = useCallback(
    (event: ReactMouseEvent) => {
      // A tap on a resting panel's entry is a tap, however soon after the
      // drag that opened it; the synthesized click lands on the row's content.
      if (
        !shouldSuppressClick() ||
        (event.target instanceof Element &&
          event.target.closest('[data-swipe-panel]') != null)
      ) {
        return;
      }
      suppressClickUntilRef.current = 0;
      event.preventDefault();
      event.stopPropagation();
    },
    [shouldSuppressClick],
  );
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (event.key === 'Escape' && stateRef.current.phase === 'resting') {
        event.stopPropagation();
        close();
      }
    },
    [close],
  );

  return {
    activateEntry,
    close,
    handlers: {
      onClickCapture,
      onKeyDown,
      onPointerCancel,
      onPointerDown,
      onPointerMove,
      onPointerUp,
    },
    shouldSuppressClick,
    state,
  };
}
