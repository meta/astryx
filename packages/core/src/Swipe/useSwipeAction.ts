// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSwipeAction.ts
 * @input Per side, the panel window and its entries (callback refs; the row
 *   root is the window's parent). The shared drag path (createSnapDrag, in
 *   createDragToSnapPoints.ts: the trackpad splitter, the pan, the snap-point
 *   drag and the animator). The UIKit constants table
 * @output Exports useSwipeAction — the stops, the actions and the finger's
 *   model behind a row's swipe actions (where each part sits for the travel
 *   is SwipeActionsLayer's styles). Also the release rules: resolveRelease,
 *   confirmPoint and confirmedOffset
 * @position Internal to swipe actions, through SwipeActionsLayer (the only
 *   module that imports it); tested through Item.test.tsx, the interaction
 *   proofs, and swipeRelease.test.ts for the release rules
 *
 * A row's swipe runs the shared drag path every followed pan runs: the
 * splitter, the pan, the snap-point drag and the animator. The row declares its
 * stops per side: rest, the open width, and out past the row's edge for a full
 * swipe. It also declares its actions. The drag draws the row's travel into one
 * custom property on the root, which every part of the panel reads
 * (SwipeActionsLayer). A settle writes its end there at once, and each part
 * plays the way there on the compositor, all on one clock.
 *
 * What a drag does depends on what drives it:
 *
 * - A trackpad's horizontal swipe follows the fingers one for one from its
 *   first event past the pan's 8 px start. Its release settles to the nearest
 *   stop by position and velocity (Core's one release policy), from the
 *   fingers' speed at their last move.
 * - A finger's or a pen's drag begins at the row's 8 px claim. From then until
 *   the release, the row is at the finger's travel since touch-down. The full
 *   swipe confirms on UIKit's measure, from UIKit's 25 px dead zone. The row
 *   then runs ahead to the confirmation offset and keeps that lead. The
 *   release goes by UIKit's rule (resolveRelease, below), on UIKit's settle spring
 *   from the row's own velocity.
 *
 * Either way a drag stays on its side: within one gesture an open row only
 * closes, never passing rest to its other side. Dragged past the confirm point,
 * when the side's outermost entry can fire, a full swipe confirms. On a side
 * with two or more entries, only a drag from the open row confirms. The row
 * runs ahead to UIKit's confirmation offset, and the outermost entry covers the
 * space. The panel reads that from a second custom property, the confirm;
 * backing out undoes it. A lift still confirmed slides the row out and fires
 * the outermost entry, at any speed. Speed alone never fires one, so a full
 * swipe is the one stop a flick never reaches. Whenever the row slides out (a
 * full swipe, or a tapped entry with `hasRemoval`), the entry fires once the
 * row's content has left its box. Then the row springs back, or holds out when
 * the entry has `hasRemoval`.
 *
 * A mouse drag and a mouse wheel's notches never swipe a row
 *: the pan takes touches, pens and a trackpad's
 * scroll. A finger that lands while another is down, on the row or anywhere
 * else, never starts the pan: the page pinches.
 *
 * An open row closes on a pointer landing outside it. It counts as open while
 * resting, or while settling to rest open: UIKit counts a row open from the
 * release that opens it. It also closes on a scroll of anything that holds it
 * while focus is outside its open panel. Escape closes it with focus inside it.
 * A press by any pointer on its own content closes it too, and activates
 * nothing on the row.
 *
 * Under Reduce Motion the drag itself is direct manipulation and follows one
 * for one. But what a release, a confirm or a close starts never travels or
 * springs. After a finger, the row lands at the bottom of an opacity dip. A
 * pen's or a trackpad's lands at once on a fine primary pointer.
 *
 * Directions are logical: `leading` is uncovered by a drag toward the inline
 * end, and sits at the inline start. `trailing` is the reverse. Both are read
 * against the root's computed `direction` when the drag begins.
 */

import type {KeyboardEvent as ReactKeyboardEvent} from 'react';
import {useCallback, useRef, useState} from 'react';
import {
  createSnapDrag,
  DEFAULT_FLICK_THRESHOLD,
  type SnapDrag,
  type SnapDragLanding,
  type SnapDragMove,
  type SnapDragRelease,
  type SnapDragTarget,
} from '../dragToSnapPoints/createDragToSnapPoints';
import {getGestureHost} from '../gestures/GestureHost';
import {TapGestureRecognizer} from '../gestures/TapGestureRecognizer';
import type {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
import {useGestureRecognizer} from '../gestures/useGestureRecognizer';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {isRtlElement} from '../hooks/isRtlElement';
import type {MotionHandle} from '../motion/animator';
import {reducedMotionFade} from '../motion/reducedMotion';
import {resolveMotion} from '../motion/resolveMotion';
import {resolveSnapPoint} from '../motion/resolveSnapPoint';
import {
  solveSpring,
  toSpring,
  type SpringCurve,
  type SpringDescription,
} from '../motion/spring';
import {swipeActions as SWIPE} from '../motion/uikit/swipeActions';
import {setPressHeld} from '../privateAttributes/pressHeld.stylex';
import {subscribeInput} from '../utils/inputStream';
import {lockSelection} from '../utils/selectionLock';
import type {CompositorPart} from '../dragToSnapPoints/compositorSettle';

// A UIKit list row fires its outermost action only from a confirmed full swipe.
// The finger dragged past the confirm point, and is still past it when it
// lifts, at any speed. A swipe that confirmed and then backed out closes the
// row. Any other release goes by its speed first. One at `releaseVelocity` or
// faster goes the way it moves: open when opening, closed when closing. A
// slower one goes by where it is, against `openFraction` of the open width. So
// a flick opens the row even from a short drag, closes it from anywhere, and
// never fires. Travel and velocity here are logical: measured toward the side
// being uncovered, whatever the writing direction.

/** What a swipe does (`createSwipe`'s `behavior`). */
export type SwipeReleaseBehavior = 'reveal' | 'commit';

/** Where a release lands. */
export type SwipeRelease = 'closed' | 'open' | 'perform';

/**
 * Where a release lands. `travel` (px, ≥ 0) and `velocity` (px/s) are logical:
 * positive toward the side being uncovered. `isConfirmed`: the finger is past
 * the confirm point as it lifts. `wasConfirmed`: it was past it at some point
 * during this swipe. A confirmed release fires the outermost entry, whatever
 * its velocity. Under `commit`, nothing else fires and nothing rests. A swipe
 * that confirmed and backed out closes under either model. Otherwise, under
 * `reveal`, a release at `releaseVelocity` or faster opens the row if it is
 * opening, and closes it if it is closing. A slower one opens it past
 * `openFraction` of its open width, and closes it short of that.
 */
export function resolveRelease({
  travel,
  velocity,
  openWidth,
  isConfirmed,
  wasConfirmed,
  behavior,
}: {
  travel: number;
  velocity: number;
  openWidth: number;
  isConfirmed: boolean;
  wasConfirmed: boolean;
  behavior: SwipeReleaseBehavior;
}): SwipeRelease {
  if (isConfirmed) {
    return 'perform';
  }
  if (behavior === 'commit' || wasConfirmed) {
    return 'closed';
  }
  if (velocity >= SWIPE.releaseVelocity) {
    return 'open';
  }
  if (velocity <= -SWIPE.releaseVelocity) {
    return 'closed';
  }
  return travel >= SWIPE.openFraction * openWidth ? 'open' : 'closed';
}

/**
 * The swipe at which a full swipe confirms. It is `confirmFraction` of the way
 * from the open width to the confirmation offset, and never short of the open
 * width. The confirmation offset is the row width less `confirmInset`.
 */
export function confirmPoint(openWidth: number, rowWidth: number): number {
  const confirmAt = rowWidth - SWIPE.confirmInset;
  return Math.max(
    openWidth,
    openWidth + (confirmAt - openWidth) * SWIPE.confirmFraction,
  );
}

/** The row's offset once a full swipe has confirmed (UIKit's `confirmationThreshold`). */
export function confirmedOffset(rowWidth: number): number {
  return rowWidth - SWIPE.confirmInset;
}

// =============================================================================
// Types
// =============================================================================

export type SwipeSide = 'leading' | 'trailing';
export type SwipeBehavior = 'reveal' | 'commit';
export type SwipePhase =
  /** At rest, closed. */
  | 'idle'
  /** A drag drives the row. */
  | 'dragging'
  /** Settling where the release, a tap or a close sent it. */
  | 'settling'
  /** Resting open with the side's panel tappable (`reveal` only). */
  | 'resting'
  /** Out, after an entry with `hasRemoval` fired. */
  | 'held';

export interface SwipeState {
  phase: SwipePhase;
  /** The side whose panel is uncovered, or will be. */
  side: SwipeSide;
  /** A confirmed full swipe: letting go now fires the outermost entry. */
  isArmed: boolean;
  /**
   * The entry that covers the side's panel, by its index on that side. From a
   * full swipe's confirm, it is the outermost until the row is home or held
   * out. For a tapped entry, it is that entry while its row returns or holds
   * out.
   */
  cover: number | null;
  /** Where the settle in progress lands (`settling` only). */
  landing?: 'idle' | 'resting' | 'held';
}

/**
 * The row is open: resting, or settling to rest open. UIKit counts a row open
 * from the release that opens it, not from when it comes to rest. An open row
 * closes on a tap on its content, a pointer outside it, a scroll or Escape.
 * Its root takes no press.
 */
export function isSwipeOpen(state: SwipeState): boolean {
  return (
    state.phase === 'resting' ||
    (state.phase === 'settling' && state.landing === 'resting')
  );
}

/** The row's travel, physical px, on the root: every part reads it. */
export const SWIPE_TRAVEL_PROPERTY = '--_item-swipe-travel';
/** How far a full swipe has confirmed, 0 to 1, on the root. */
export const SWIPE_CONFIRM_PROPERTY = '--_item-swipe-confirm';

/**
 * A side's geometry, written on its window when a drag begins. The pin
 * (physical px) is where the entries sit against the track, so they stay at the
 * outer edge. The side's physical sign is +1 on the left. Then its open width
 * (px), and the outermost entry's slide on a confirmed full swipe (physical
 * px). The entries' and the outermost entry's transforms read them.
 */
export const SWIPE_PIN_PROPERTY = '--_item-swipe-pin';
export const SWIPE_SIGN_PROPERTY = '--_item-swipe-sign';
export const SWIPE_OPEN_PROPERTY = '--_item-swipe-open';
export const SWIPE_SLIDE_PROPERTY = '--_item-swipe-slide';

/** Callback refs for the elements of one side's panel the gesture reads. */
export interface SwipePanelRefs {
  /** The window over the row's resting box; the side's pin is written on it. */
  panel: (element: HTMLElement | null) => void;
  /**
   * Each entry other than the outermost: the ref for the entry with `key`
   * (its React key), stable per key. Their natural widths together, the
   * outermost entry's included, are how far the row opens.
   */
  entry: (key: string) => (element: HTMLElement | null) => void;
  /** The outermost entry, which slides to the row's edge on a full swipe. */
  outer: (element: HTMLElement | null) => void;
}

export interface UseSwipeActionOptions {
  behavior: SwipeBehavior;
  /**
   * How many entries each side has. A drag toward a side without any never
   * begins. A side with two or more confirms a full swipe only from the row
   * open on that side.
   */
  sides: {leading: number; trailing: number};
  /**
   * Fire the side's outermost entry. Returns whether the row holds out
   * afterwards (the entry's `hasRemoval`).
   */
  fireOutermost: (side: SwipeSide) => boolean;
  /** Whether the side's outermost entry can fire: a disabled one never confirms a full swipe. */
  canConfirm: (side: SwipeSide) => boolean;
}

export interface UseSwipeActionResult {
  state: SwipeState;
  /** Attach each side's moving panel parts. */
  panelRefs: Record<SwipeSide, SwipePanelRefs>;
  /**
   * A resting panel's entry was tapped. Without `hasRemoval` (`holdsOut`), it
   * fires at once and the row closes. With it, the row slides out, the entry
   * fires once the row's content has left its box, and the row holds out. The
   * tapped entry, at index `cover` on its side, covers the panel meanwhile.
   */
  activateEntry: (fire: () => void, holdsOut: boolean, cover: number) => void;
  /** Close an open row. */
  close: () => void;
  /** Escape closes an open row with focus inside it. */
  onKeyDown: (event: ReactKeyboardEvent) => void;
  /** The row root the gesture attaches to, once the panels have mounted. */
  rootRef: {readonly current: HTMLElement | null};
}

// =============================================================================
// Geometry (pure)
// =============================================================================

export interface SwipeLayout {
  side: SwipeSide;
  /** +1 when the inline end is to the right (LTR), −1 under RTL. */
  inlineSign: 1 | -1;
  /** The side's entries at their natural widths together: how far the row opens. */
  openWidth: number;
  /** The outermost entry's width. */
  outerWidth: number;
  /** The row's width. */
  rowWidth: number;
}

/** +1 when the side's panel is on the physical left, −1 on the right. */
export function physicalSign(side: SwipeSide, inlineSign: 1 | -1): 1 | -1 {
  return side === 'leading' ? inlineSign : inlineSign === 1 ? -1 : 1;
}

/** How far out a row goes when an entry fires and the row leaves (logical px). */
/**
 * The finger's travel from touch-down at which its swipe begins: the row's
 * claim on the touch. From there the row is at the finger's travel.
 */
const FINGER_SWIPE_START = SWIPE.claim;

/** How close to its target a lead in flight counts as grown, in px. */
const LEAD_REST = 0.25;

/** A finger's lead at `now` (performance.now() ms): grown, or in flight. */
function leadNow(drag: Drag, now: number): number {
  const motion = drag.leadMotion;
  if (motion == null) {
    return drag.lead;
  }
  const t = (now - motion.start) / 1000;
  return t < motion.curve.settleTime(LEAD_REST)
    ? motion.curve.value(t)
    : drag.lead;
}

/** How fast a finger's lead moves at `now`, in px/s. */
function leadVelocity(drag: Drag, now: number): number {
  const motion = drag.leadMotion;
  return motion == null
    ? 0
    : motion.curve.velocity((now - motion.start) / 1000);
}

function outTravel(layout: SwipeLayout): number {
  return layout.rowWidth + SWIPE.slideOutOvershoot;
}

/**
 * A side's stops, physical px along x, ascending: rest, the open width, and
 * out past the row's edge (a full swipe). Item declares these and nothing
 * of the drag's own motion.
 */
function stopsOf(layout: SwipeLayout): number[] {
  const sign = physicalSign(layout.side, layout.inlineSign);
  return [0, sign * layout.openWidth, sign * outTravel(layout)].sort(
    (a, b) => a - b,
  );
}

/** Which stop: rest, open, or out. */
type Stop = 'rest' | 'open' | 'out';

function stopIndex(layout: SwipeLayout, stop: Stop): number {
  const sign = physicalSign(layout.side, layout.inlineSign);
  const value =
    stop === 'rest'
      ? 0
      : stop === 'open'
        ? sign * layout.openWidth
        : sign * outTravel(layout);
  return stopsOf(layout).indexOf(value);
}

function stopAt(layout: SwipeLayout, index: number): Stop {
  const value = stopsOf(layout)[index] ?? 0;
  return value === 0
    ? 'rest'
    : Math.abs(value) === layout.openWidth
      ? 'open'
      : 'out';
}

/**
 * What started a settle: a touch drag ending (its release, or the browser
 * taking the touch), or anything else. Anything else is Escape, a pointer
 * outside, a tapped entry, a tap on the content, a scroll, or a pen's or a
 * trackpad's release.
 */
type SettleCause = 'release' | 'other';

// =============================================================================
// The hook
// =============================================================================

const IDLE_STATE: SwipeState = {
  cover: null,
  isArmed: false,
  phase: 'idle',
  side: 'leading',
};

/** Below this the row is at rest, closed. */
const AT_REST_PX = 0.5;

/**
 * A side's panel as the gesture reads it: the window it writes the side's pin
 * on, and the entries. Their natural widths together open the row.
 */
interface SidePanel {
  window: HTMLElement | null;
  /** The entries other than the outermost, by React key. */
  entries: Map<string, HTMLElement>;
  /** The callback ref for the entry with `key`, stable per key. */
  entryRef: (key: string) => (element: HTMLElement | null) => void;
  outer: HTMLElement | null;
}

function createSidePanel(): SidePanel {
  const entries = new Map<string, HTMLElement>();
  const refs = new Map<string, (element: HTMLElement | null) => void>();
  return {
    entries,
    entryRef: key => {
      let ref = refs.get(key);
      if (ref == null) {
        ref = element => {
          if (element == null) {
            entries.delete(key);
          } else {
            entries.set(key, element);
          }
        };
        refs.set(key, ref);
      }
      return ref;
    },
    outer: null,
    window: null,
  };
}

/** The entries' natural widths together, the outermost's included: how far the row opens. */
function openWidthOf(side: SidePanel): number {
  let width = side.outer?.offsetWidth ?? 0;
  for (const entry of side.entries.values()) {
    width += entry.offsetWidth;
  }
  return width;
}

interface Drag {
  layout: SwipeLayout;
  /** The swipe at which the full swipe confirms. */
  confirmAt: number;
  /**
   * The full swipe can confirm: the side's outermost entry can fire, and a
   * side with two or more entries was open when the drag began.
   */
  canConfirm: boolean;
  /** A trackpad's scroll drives it, not a finger or a pen. */
  isScroll: boolean;
  /** The swipe began: the row follows. */
  started: boolean;
  /** Which way the swipe began: +1 toward the side, -1 away. */
  startSign: number;
  /** The travel the row had when the swipe began (logical, ≥ 0). */
  baseTravel: number;
  /**
   * The swipe's travel toward the side on UIKit's measure, counted from its
   * dead zone for a finger (logical, ≥ 0: never past rest). The full swipe
   * confirms on it.
   */
  raw: number;
  /**
   * Where the row is drawn toward the side, less any lead (logical, ≥ 0). A
   * finger's row is at the finger's travel since touch-down.
   */
  held: number;
  /**
   * How far a confirmed finger's row runs ahead of the finger once its lead
   * has grown (logical); 0 when not confirmed.
   */
  lead: number;
  /** The lead's growth or shrink in flight, and when it began (ms). */
  leadMotion: {curve: SpringCurve; start: number} | null;
  /** Confirmed: the swipe is past the confirm point. */
  isArmed: boolean;
  /** The full swipe confirmed at some point in this swipe. */
  wasConfirmed: boolean;
  /**
   * Under Reduce Motion, when the cross-fade a confirm or a back-out started
   * ends (performance.now() ms): until then the moves leave it alone.
   */
  dipUntil?: number;
}

/**
 * Subscribes the closes of an open row. A pointer landing anywhere outside it
 * closes it, which is also how a drag on a neighbour closes it. So one row rests
 * open at a time, with no shared state. A scroll of anything that moves it (the
 * list, the page) closes it too, as a UIKit row closes when its table scrolls.
 * A scroll that starts on the row itself lands no pointer outside it. Returns
 * the unsubscribe.
 */
function subscribeOpenRowCloses(
  root: HTMLElement,
  openSide: () => SwipeSide | undefined,
  close: (start?: 'next-frame') => void,
): () => void {
  const view = root.ownerDocument.defaultView;
  if (view == null) {
    return () => {};
  }
  const onOutside = (event: PointerEvent) => {
    if (event.target instanceof Node && !root.contains(event.target)) {
      close('next-frame');
    }
  };
  const onScroll = (event: Event) => {
    const {target} = event;
    if (!(
      target === view.document ||
      (target instanceof Element && target.contains(root))
    )) {
      return;
    }
    // Focus inside the open panel means the scroll may be the browser
    // bringing the focused entry into view (keyboard or VoiceOver): the row
    // stays. Focus anywhere else, the row's own content included, closes it.
    const side = openSide();
    const panel =
      side == null ? null : root.querySelector(`[data-swipe-panel="${side}"]`);
    if (panel?.contains(view.document.activeElement) !== true) {
      close();
    }
  };
  const stops = [
    subscribeInput(view, 'pointerdown', onOutside),
    subscribeInput(view, 'scroll', onScroll),
  ];
  return () => {
    for (const stop of stops) {
      stop();
    }
  };
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
  // The row's own document and realm, so a row in another frame works too.
  const active = root.ownerDocument.activeElement;
  const view = root.ownerDocument.defaultView;
  if (view != null && active instanceof view.HTMLElement) {
    active.blur();
  }
}

export function useSwipeAction({
  behavior,
  sides,
  fireOutermost,
  canConfirm,
}: UseSwipeActionOptions): UseSwipeActionResult {
  // The latest options, read by listeners and completions that outlive a render.
  // Synchronizes the gesture system (pan callbacks, settle completions, the
  // slide-out's fire timer) with the committed options.
  const latestRef = useRef({
    behavior,
    canConfirm,
    fireOutermost,
    sides,
  });
  // Syncs the shared drag's model, which runs outside React for the root's
  // life, with the caller's newest options.
  useIsomorphicLayoutEffect(() => {
    latestRef.current = {
      behavior,
      canConfirm,
      fireOutermost,
      sides,
    };
  });

  const [state, setState] = useState<SwipeState>(IDLE_STATE);
  // The state the pan callbacks and the input listeners read outside React.
  // `setSwipeState`, the one way the state changes, writes it.
  const stateRef = useRef(state);
  /** The layout of the side that moved last: where the row is, and how to move it. */
  const layoutRef = useRef<SwipeLayout | null>(null);
  // `close`, for the open row's closes. It is set once: `close` never changes.
  const closeRef = useRef<((start?: 'next-frame') => void) | null>(null);
  const stopClosesRef = useRef<(() => void) | null>(null);
  // Every transition goes through here. So the one that opens or closes the row
  // holds or frees its root's press at once, from the handler that caused it.
  // An open row's root takes no press, so a tap on its content only closes it.
  // That matches UIKit, where the cell never sees that touch. The root stays a
  // pressable surface. The same transition subscribes or unsubscribes the
  // row's closes.
  const setSwipeState = useCallback((next: SwipeState) => {
    const wasOpen = isSwipeOpen(stateRef.current);
    const isOpen = isSwipeOpen(next);
    stateRef.current = next;
    setState(next);
    if (wasOpen !== isOpen) {
      const root = rootRef.current;
      stopClosesRef.current?.();
      stopClosesRef.current = null;
      if (root != null) {
        setPressHeld(root, isOpen);
        if (isOpen) {
          stopClosesRef.current = subscribeOpenRowCloses(
            root,
            () => layoutRef.current?.side,
            start => closeRef.current?.(start),
          );
        }
      }
    }
  }, []);

  const [panels] = useState<Record<SwipeSide, SidePanel>>(() => ({
    leading: createSidePanel(),
    trailing: createSidePanel(),
  }));
  const dragRef = useRef<Drag | null>(null);
  /** The shared drag on the root. */
  const snapRef = useRef<SnapDrag | null>(null);
  /** The frame that draws a finger's lead in flight. */
  const leadFrameRef = useRef<number | null>(null);
  /** The row is open (see `isSwipeOpen`), read by listeners and recognizers. */
  const isOpen = useCallback(() => isSwipeOpen(stateRef.current), []);

  // The row root: the drag's element and the element that translates. A panel
  // is its child. A panel's ref is set before this hook's layout effects run,
  // while a ref on the root itself is set after them.
  const rootRef = useRef<HTMLElement | null>(null);
  const [panelRefs] = useState<Record<SwipeSide, SwipePanelRefs>>(() => {
    const refsFor = (side: SidePanel): SwipePanelRefs => ({
      entry: key => side.entryRef(key),
      outer: element => {
        side.outer = element;
      },
      panel: element => {
        if (element?.parentElement != null) {
          rootRef.current = element.parentElement;
        }
        side.window = element;
      },
    });
    return {
      leading: refsFor(panels.leading),
      trailing: refsFor(panels.trailing),
    };
  });

  /** The row's travel on screen now, physical px. */
  const presentedX = useCallback(
    (): number => snapRef.current?.position() ?? 0,
    [],
  );

  /** The row's travel on screen now, logical, on `layout`'s side. */
  const travelNow = useCallback(
    (layout: SwipeLayout): number =>
      Math.max(0, presentedX() * physicalSign(layout.side, layout.inlineSign)),
    [presentedX],
  );

  /**
   * The full swipe's confirm for a travel (physical px). It is 0 short of the
   * confirm point, 1 at UIKit's confirmation offset, and in step with the row
   * between them. So the outermost entry covers the space as the row runs
   * ahead, and gives it back as the row backs out. It is 0 while the side's
   * outermost entry does not cover the panel. Drawn from the travel in the same
   * animation (the shared drag's companion), it cannot drift from the row.
   */
  const confirmOf = (x: number): number => {
    const layout = layoutRef.current;
    const state = stateRef.current;
    // Only the outermost entry's cover moves it. A drag that cannot confirm
    // leaves every entry where it is.
    if (
      layout == null ||
      state.side !== layout.side ||
      state.cover !== latestRef.current.sides[layout.side] - 1 ||
      !latestRef.current.canConfirm(layout.side)
    ) {
      return 0;
    }
    const travel = x * physicalSign(layout.side, layout.inlineSign);
    const from = confirmPoint(layout.openWidth, layout.rowWidth);
    const to = confirmedOffset(layout.rowWidth);
    if (to <= from) {
      return travel >= to ? 1 : 0;
    }
    return Math.min(1, Math.max(0, (travel - from) / (to - from)));
  };

  /** The settle spring of what drives the row: UIKit's for a finger's model. */
  const settleSpringFor = (isScroll: boolean): SpringDescription | undefined =>
    isScroll ? undefined : SWIPE.settle;

  /** The shared drag settled on a stop: the row lands there. */
  const landed = useCallback(
    (index: number) => {
      const layout = layoutRef.current;
      if (layout == null) {
        return;
      }
      const stop = stopAt(layout, index);
      if (stop === 'out') {
        // Out after a fire: holding (`hasRemoval`), unless the fire already
        // started the spring back.
        if (stateRef.current.phase === 'settling') {
          setSwipeState({
            cover: stateRef.current.cover,
            isArmed: false,
            phase: 'held',
            side: layout.side,
          });
        }
        return;
      }
      setSwipeState(
        stop === 'rest'
          ? IDLE_STATE
          : {cover: null, isArmed: false, phase: 'resting', side: layout.side},
      );
    },
    [setSwipeState],
  );

  /** The moving parts of the row, each with its own offset at a travel. */
  const settleParts = (root: HTMLElement): CompositorPart[] => {
    const parts: CompositorPart[] = [{element: root, offset: travel => travel}];
    for (const side of ['leading', 'trailing'] as const) {
      const panel = panels[side].window;
      const track = panel?.firstElementChild;
      if (panel == null || !(track instanceof HTMLElement)) {
        continue;
      }
      // The side's geometry, with the fallbacks its CSS reads.
      const read = (name: string, fallback: number) => {
        const value = parseFloat(panel.style.getPropertyValue(name));
        return Number.isNaN(value) ? fallback : value;
      };
      const pin = read(SWIPE_PIN_PROPERTY, 0);
      const sign = read(SWIPE_SIGN_PROPERTY, 1);
      const open = read(SWIPE_OPEN_PROPERTY, 0);
      const slide = read(SWIPE_SLIDE_PROPERTY, 0);
      const entryX = (travel: number) =>
        pin - sign * Math.min(sign * travel, open);
      // The entries stop riding the row at the open width, and the
      // outermost slides between the confirm point and the confirmation
      // offset.
      const layout = layoutRef.current;
      const confirmBends =
        layout == null || layout.side !== side
          ? []
          : [
              sign * confirmPoint(layout.openWidth, layout.rowWidth),
              sign * confirmedOffset(layout.rowWidth),
            ];
      parts.push(
        {element: panel, offset: travel => -travel},
        {element: track, offset: travel => travel},
      );
      const entries = Array.from(track.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement,
      );
      entries.forEach((entry, index) => {
        const isOuter = index === entries.length - 1;
        parts.push({
          element: entry,
          offset: isOuter
            ? travel => entryX(travel) + slide * confirmOf(travel)
            : entryX,
          bends: isOuter ? [sign * open, ...confirmBends] : [sign * open],
        });
      });
    }
    return parts;
  };

  /**
   * Settle the row on a stop and land in `phase`. The shared drag reports the
   * landing (onSettle) unless something interrupts it: a drag catches the row,
   * or another settle starts. Returns the settle's motion.
   */
  const settle = useCallback(
    (
      layout: SwipeLayout,
      stop: Stop,
      phase: 'idle' | 'resting' | 'held',
      options: {
        cause?: SettleCause;
        velocity?: number;
        spring?: SpringDescription;
        onPass?: {offset: number; direction: 1 | -1; call: () => void};
        /** Asked for in an input event's own task (see createSnapDrag). */
        start?: 'next-frame';
        /** The entry that covers the panel while the row settles. */
        cover?: number | null;
      } = {},
    ): MotionHandle | null => {
      const snap = snapRef.current;
      if (snap == null) {
        return null;
      }
      layoutRef.current = layout;
      setSwipeState({
        cover: options.cover ?? null,
        isArmed: false,
        landing: phase,
        phase: 'settling',
        side: layout.side,
      });
      const touchRelease = options.cause === 'release';
      // UIKit's settle spring unless the settle names one; a trackpad's names
      // none on purpose: the shared drag's own settle spring.
      const spring = 'spring' in options ? options.spring : SWIPE.settle;
      snap.setSnapPoints(stopsOf(layout));
      const index = stopIndex(layout, stop);
      return snap.settleTo(index, {
        spring,
        touchRelease,
        ...(options.velocity != null ? {velocity: options.velocity} : {}),
        ...(options.onPass != null ? {onPass: options.onPass} : {}),
        ...(options.start != null ? {start: options.start} : {}),
      });
    },
    [setSwipeState],
  );

  /**
   * Slide the row out toward the edge it travelled toward, and fire once its
   * content has left its box. UIKit calls the handler at the lift or the tap.
   * Firing when the content is gone means a row its app removes at once never
   * vanishes mid-slide. The shared drag calls back on the first frame the
   * settle's curve has carried the row past its edge. Under Reduce Motion, that
   * is the frame it lands out of its box, at the bottom of the cross-fade. A
   * settle or a drag that replaces the slide-out first fires nothing.
   */
  const slideOutThenFire = useCallback(
    (
      layout: SwipeLayout,
      fire: () => boolean,
      options: {
        cause: SettleCause;
        velocity?: number;
        spring?: SpringDescription;
        start?: 'next-frame';
        cover: number;
      },
    ) => {
      const sign = physicalSign(layout.side, layout.inlineSign);
      settle(layout, 'out', 'held', {
        ...options,
        onPass: {
          offset: sign * layout.rowWidth,
          direction: sign,
          call: () => {
            // `fire` returns true when the row holds out. Past its box the row
            // is out of sight, so its settle ends there now. Whatever takes
            // the row next, such as a list's exit, then finds it still.
            if (fire()) {
              snapRef.current?.finishSettle();
            }
          },
        },
      });
    },
    [settle],
  );

  /**
   * A confirmed full swipe: out with the outermost entry covering the row's
   * place. The entry fires as the row leaves, then the row holds out or springs
   * back.
   */
  const slideOutAndFire = useCallback(
    (
      layout: SwipeLayout,
      cause: SettleCause,
      motion: {velocity?: number; spring?: SpringDescription} = {},
    ) => {
      const cover = latestRef.current.sides[layout.side] - 1;
      slideOutThenFire(
        layout,
        () => {
          if (latestRef.current.fireOutermost(layout.side)) {
            return true;
          }
          settle(layout, 'rest', 'idle', {cause, ...motion, cover});
          return false;
        },
        {cause, ...motion, cover},
      );
    },
    [settle, slideOutThenFire],
  );

  /**
   * Closes an open row. `start: 'next-frame'` when asked for in an input
   * event's own task: a key, a press, a tap. The close then starts at the first
   * frame after that task. So a later listener of the event that holds the main
   * thread delays it, instead of letting it skip into its curve.
   */
  const close = useCallback(
    (start?: 'next-frame') => {
      const layout = layoutRef.current;
      if (!isOpen() || layout == null) {
        return;
      }
      const root = rootRef.current;
      if (root != null && root.contains(root.ownerDocument.activeElement)) {
        focusRowContent(root);
      }
      settle(layout, 'rest', 'idle', start != null ? {start} : {});
    },
    [isOpen, settle],
  );
  if (closeRef.current == null) {
    closeRef.current = close;
  }

  const activateEntry = useCallback(
    (fire: () => void, holdsOut: boolean, cover: number) => {
      const layout = layoutRef.current;
      // From the release that opens the row, not only once it rests.
      if (!isSwipeOpen(stateRef.current) || layout == null) {
        return;
      }
      const root = rootRef.current;
      if (root != null && root.contains(root.ownerDocument.activeElement)) {
        focusRowContent(root);
      }
      // An entry is activated in its press's or key's own task.
      if (holdsOut) {
        const fireAndHold = () => {
          fire();
          return true;
        };
        slideOutThenFire(layout, fireAndHold, {
          cause: 'other',
          start: 'next-frame',
          cover,
        });
        return;
      }
      fire();
      settle(layout, 'rest', 'idle', {start: 'next-frame', cover});
    },
    [settle, slideOutThenFire],
  );

  // ---------------------------------------------------------------------------
  // The drag's model: where a drag draws the row, and where a release lands.

  /** The side a drag from a closed row uncovers: toward the inline end is leading. */
  const sideFor = (dx: number, inlineSign: 1 | -1): SwipeSide =>
    dx * inlineSign > 0 ? 'leading' : 'trailing';

  const begin = (move: SnapDragMove): boolean => {
    const root = rootRef.current;
    if (root == null) {
      return false;
    }
    const inlineSign: 1 | -1 = isRtlElement(root) ? -1 : 1;
    // An open or moving row continues on its side (closing it or going
    // further); a closed one takes the side the drag moves toward.
    const side: SwipeSide =
      Math.abs(move.start) > AT_REST_PX
        ? move.start * inlineSign > 0
          ? 'leading'
          : 'trailing'
        : sideFor(move.total, inlineSign);
    const layout: SwipeLayout = {
      inlineSign,
      openWidth: openWidthOf(panels[side]),
      outerWidth: panels[side].outer?.offsetWidth ?? 0,
      rowWidth: root.clientWidth,
      side,
    };
    // The entries keep their place against the track for the geometry written
    // last. A first drag, or new entries, writes it now, while the track still
    // hides them.
    const sign = physicalSign(side, inlineSign);
    const panel = panels[side].window;
    panel?.style.setProperty(
      SWIPE_PIN_PROPERTY,
      `${sign * layout.openWidth}px`,
    );
    panel?.style.setProperty(SWIPE_SIGN_PROPERTY, String(sign));
    panel?.style.setProperty(SWIPE_OPEN_PROPERTY, `${layout.openWidth}px`);
    panel?.style.setProperty(
      SWIPE_SLIDE_PROPERTY,
      `${sign * (layout.openWidth - layout.outerWidth)}px`,
    );
    layoutRef.current = layout;
    snapRef.current?.setSnapPoints(stopsOf(layout));
    // With two or more entries, a side confirms a full swipe only from the row
    // open on that side. A panel its outermost entry covers confirms too. A
    // drag from a closed row opens it instead.
    const current = stateRef.current;
    const isFromOpen =
      current.side === side &&
      (isSwipeOpen(current) ||
        current.cover === latestRef.current.sides[side] - 1);
    dragRef.current = {
      baseTravel: 0,
      canConfirm:
        latestRef.current.canConfirm(side) &&
        (latestRef.current.sides[side] < 2 || isFromOpen),
      confirmAt: confirmPoint(layout.openWidth, layout.rowWidth),
      isArmed: false,
      isScroll: move.input === 'scroll',
      raw: 0,
      held: 0,
      lead: 0,
      leadMotion: null,
      started: false,
      startSign: 1,
      wasConfirmed: false,
      layout,
    };
    return true;
  };

  const track = (move: SnapDragMove): SnapDragTarget | null => {
    const drag = dragRef.current;
    if (drag == null) {
      return null;
    }
    const {layout} = drag;
    const sign = physicalSign(layout.side, layout.inlineSign);
    if (!drag.started) {
      // A trackpad's swipe follows from its first event past the pan's start. A
      // finger's begins at FINGER_SWIPE_START, counted from where the touch
      // landed. Before that, the row stays where it was caught.
      if (!drag.isScroll && Math.abs(move.total) < FINGER_SWIPE_START) {
        return null;
      }
      // The swipe begins: the row is caught where it is, and so is the confirm.
      // The shared drag catches it with this first target. A timer a settle set
      // acts no more.
      drag.started = true;
      drag.startSign = Math.sign(move.total * sign) || 1;
      drag.baseTravel = travelNow(layout);
      setSwipeState({
        cover: drag.isArmed ? latestRef.current.sides[layout.side] - 1 : null,
        isArmed: drag.isArmed,
        phase: 'dragging',
        side: layout.side,
      });
    }
    // On UIKit's measure, a finger's swipe counts from UIKit's dead zone, and a
    // trackpad's from the pan's start.
    const swipe = drag.isScroll
      ? move.translation * sign
      : move.total * sign - drag.startSign * SWIPE.hysteresis;
    // Within one gesture the row stays on its side: never past rest.
    const raw = Math.max(0, drag.baseTravel + swipe);
    drag.raw = raw;
    // A finger's row is at the finger's travel since touch-down: the part of
    // the row under the finger stays under it.
    const held = drag.isScroll
      ? raw
      : Math.max(0, drag.baseTravel + move.total * sign);
    drag.held = held;
    // The full swipe confirms on UIKit's measure, where UIKit's own threshold
    // was measured. It confirms only when the outermost entry can fire.
    const isArmed = drag.canConfirm && raw >= drag.confirmAt;
    const flipped = isArmed !== drag.isArmed;
    const fade = reducedMotionFade(rootRef.current);
    const now = performance.now();
    if (flipped) {
      // Confirmed, a finger's row gains a lead that grows to UIKit's
      // confirmation offset on UIKit's tracking spring, as UIKit's row runs
      // ahead. Backed out, the lead shrinks on it. The base stays at the
      // finger's travel throughout. Under Reduce Motion the lead changes at
      // once, inside the cross-fade below.
      const from = leadNow(drag, now);
      const velocity = leadVelocity(drag, now);
      drag.lead = isArmed
        ? Math.max(0, confirmedOffset(layout.rowWidth) - held)
        : 0;
      drag.leadMotion =
        drag.isScroll || fade != null
          ? null
          : {
              curve: solveSpring(
                toSpring(resolveMotion(rootRef.current, SWIPE.tracking)),
                {from, to: drag.lead, velocity},
              ),
              start: now,
            };
      if (drag.leadMotion != null && leadFrameRef.current == null) {
        leadFrameRef.current = requestAnimationFrame(drawLeadFrame);
      }
      drag.isArmed = isArmed;
      drag.wasConfirmed ||= isArmed;
      setSwipeState({
        cover: isArmed ? latestRef.current.sides[layout.side] - 1 : null,
        isArmed,
        phase: 'dragging',
        side: layout.side,
      });
    }
    // A confirmed trackpad's row runs ahead to UIKit's confirmation offset and
    // waits there for its fingers.
    const travel = drag.isScroll
      ? isArmed
        ? Math.max(raw, confirmedOffset(layout.rowWidth))
        : raw
      : held + leadNow(drag, now);
    const offset = sign * travel;
    if (fade == null) {
      // A finger's row is drawn where it is, with no spring. A trackpad's
      // confirm or back-out springs the row to its new place.
      return drag.isScroll && flipped
        ? {offset, spring: SWIPE.tracking}
        : {offset};
    }
    if (flipped) {
      // Confirming and backing out are changes of state, not the drag. Under
      // Reduce Motion they cross-fade, and the moves leave that fade alone
      // until it ends.
      drag.dipUntil = now + fade.duration;
      return {offset, spring: SWIPE.tracking};
    }
    if (drag.dipUntil != null && now < drag.dipUntil) {
      return null;
    }
    // Otherwise the row follows one for one: the drag itself is direct
    // manipulation.
    drag.dipUntil = undefined;
    return {offset};
  };

  const stopLeadFrames = () => {
    if (leadFrameRef.current != null) {
      cancelAnimationFrame(leadFrameRef.current);
      leadFrameRef.current = null;
    }
  };

  // Draws a finger's row while its lead grows or shrinks, also on frames with
  // no move. The base stays at the finger's travel, and the lead moves on.
  const drawLeadFrame = () => {
    leadFrameRef.current = null;
    const drag = dragRef.current;
    const snap = snapRef.current;
    if (drag?.leadMotion == null || snap == null) {
      return;
    }
    const {layout, leadMotion} = drag;
    const now = performance.now();
    const sign = physicalSign(layout.side, layout.inlineSign);
    snap.animator.set({x: sign * (drag.held + leadNow(drag, now))});
    if (
      (now - leadMotion.start) / 1000 <
      leadMotion.curve.settleTime(LEAD_REST)
    ) {
      leadFrameRef.current = requestAnimationFrame(drawLeadFrame);
    } else {
      drag.leadMotion = null;
    }
  };

  const release = (end: SnapDragRelease): SnapDragLanding | null => {
    const drag = dragRef.current;
    dragRef.current = null;
    stopLeadFrames();
    // A drag that never became a swipe changed nothing: the row stays where
    // it was caught.
    if (drag == null || !drag.started) {
      return null;
    }
    const {layout} = drag;
    const sign = physicalSign(layout.side, layout.inlineSign);
    const velocity = end.velocity * sign;
    const cause: SettleCause = end.input === 'touch' ? 'release' : 'other';
    const {behavior: currentBehavior} = latestRef.current;
    let landing: 'closed' | 'open' | 'perform';
    if (drag.isScroll) {
      // A trackpad's release settles to the nearest stop by position and
      // velocity: Core's one release policy, from where the swipe
      // began. The full swipe is reached by position only: speed alone never
      // fires an entry.
      if (drag.isArmed) {
        landing = 'perform';
      } else {
        const {index} = resolveSnapPoint({
          points: currentBehavior === 'commit' ? [0] : [0, layout.openWidth],
          position: drag.raw,
          velocity,
          flickThreshold: DEFAULT_FLICK_THRESHOLD,
          start: drag.baseTravel,
        });
        landing = index === 1 ? 'open' : 'closed';
      }
    } else {
      landing = resolveRelease({
        behavior: currentBehavior,
        isConfirmed: drag.isArmed,
        openWidth: layout.openWidth,
        travel: drag.held,
        velocity,
        wasConfirmed: drag.wasConfirmed,
      });
    }
    // A finger's settle starts from the row's own velocity, the finger's, on
    // UIKit's spring. A trackpad's starts from the fingers' speed at their last
    // move, on the shared settle spring.
    const motion = {
      velocity: end.velocity,
      spring: settleSpringFor(drag.isScroll),
    };
    if (landing === 'perform') {
      slideOutAndFire(layout, cause, motion);
    } else if (landing === 'open') {
      settle(layout, 'open', 'resting', {cause, ...motion});
    } else {
      settle(layout, 'rest', 'idle', {cause, ...motion});
    }
    // The settle above is the row's; the shared drag starts none of its own.
    return null;
  };

  const cancel = (): SnapDragLanding | null => {
    const drag = dragRef.current;
    dragRef.current = null;
    stopLeadFrames();
    // The browser took a touch the row was following: it closes.
    if (drag != null && drag.started) {
      settle(drag.layout, 'rest', 'idle', {
        cause: 'release',
        spring: settleSpringFor(drag.isScroll),
      });
    }
    return null;
  };

  // The shared drag on the root, created once the root is known: the
  // splitter, the pan, the snap-point drag and the animator.
  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (root == null) {
      return undefined;
    }
    const snap = createSnapDrag(root, {
      axis: 'x',
      snapPoints: [0],
      // The travel, and the full swipe's confirm drawn from it in the same
      // animation (the panel reads both).
      customProperty: {
        name: SWIPE_TRAVEL_PROPERTY,
        syntax: '<length>',
        companion: {
          name: SWIPE_CONFIRM_PROPERTY,
          syntax: '<number>',
          map: confirmOf,
        },
      },
      // The settles move the row's parts on the compositor.
      compositorParts: () => settleParts(root),
      onSettle: landed,
      pan: {
        // A finger, a pen and a trackpad's two-finger scroll swipe a row; a
        // mouse drag and a mouse wheel's notches never do.
        allowedPointerTypes: ['touch', 'pen'],
        allowedScrollTypes: ['continuous'],
        hysteresis: SWIPE.claim,
        maximumNumberOfTouches: 1,
        name: 'Item.swipe',
        // The drag moves the row: text selection and the touch callout stay
        // off for the press it holds.
        selectionLock: lockSelection,
        shouldBegin: (pan: PanGestureRecognizer) => {
          // A finger that is not the only one down is part of a pinch, even
          // when the first finger is off the row. The page zooms.
          if (getGestureHost(root.ownerDocument).fingersDown() > 1) {
            return false;
          }
          if (stateRef.current.phase === 'held') {
            return false;
          }
          const inlineSign: 1 | -1 = isRtlElement(root) ? -1 : 1;
          return (
            Math.abs(presentedX()) > AT_REST_PX ||
            latestRef.current.sides[
              sideFor(pan.totalTranslation().x, inlineSign)
            ] > 0
          );
        },
      },
      model: {begin, move: track, release, cancel},
    });
    snapRef.current = snap;
    return () => {
      snapRef.current = null;
      snap.destroy();
      // The root outlives the swipe: it gets its own styles back.
      root.style.removeProperty(SWIPE_TRAVEL_PROPERTY);
      root.style.removeProperty(SWIPE_CONFIRM_PROPERTY);
    };
    // The model reads the latest state and options through refs, and the
    // callbacks it reaches are stable: one shared drag for the root's life.
  }, [landed]);

  // A tap on an open row's own content closes it and activates nothing, as
  // UIKit's dismissal does. The tap recognizes at the lift. The host keeps the
  // click it would have made from the row. It cancels the touch, or, where the
  // primary pointer is fine, its click guard swallows the click. Any pointer's
  // press dismisses, since a trackpad opens a row too. The panel's entries keep
  // their own taps, and a closed row never offers this recognizer a touch.
  useGestureRecognizer(
    rootRef,
    () =>
      new TapGestureRecognizer({
        name: 'item-swipe-dismiss',
        shouldReceiveTouch: (_tap, touch) =>
          isOpen() &&
          !(
            touch.target instanceof Element &&
            touch.target.closest('[data-swipe-panel]') != null
          ),
      }),
    tap => {
      // Recognized at the lift, in its pointer event's own task.
      if (tap.state === 'ended') {
        close('next-frame');
      }
    },
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (event.key === 'Escape' && isOpen()) {
        event.stopPropagation();
        close('next-frame');
      }
    },
    [close, isOpen],
  );

  // A row that loses its swipe while open takes presses again, and drops its
  // closes and the frames of a lead in flight.
  useIsomorphicLayoutEffect(
    () => () => {
      stopClosesRef.current?.();
      stopClosesRef.current = null;
      if (leadFrameRef.current != null) {
        cancelAnimationFrame(leadFrameRef.current);
        leadFrameRef.current = null;
      }
      const root = rootRef.current;
      if (root != null) {
        setPressHeld(root, false);
      }
    },
    [],
  );

  return {activateEntry, close, onKeyDown, panelRefs, rootRef, state};
}
