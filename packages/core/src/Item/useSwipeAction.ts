// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSwipeAction.ts
 * @input Per side, the panel window and its entries (callback refs; the row
 *   root is the window's parent); the shared drag path (createSnapDrag.ts:
 *   the trackpad splitter, the pan, the snap-point drag and the animator),
 *   the UIKit constants table and swipeRelease.ts
 * @output Exports useSwipeAction — the stops, the actions and the finger's
 *   model behind Item's `swipeActions` (where each part sits for the travel
 *   is ItemSwipeLayer's styles)
 * @position Internal to Item, through ItemSwipeLayer (the only module that
 *   imports it); tested through Item.test.tsx and the interaction proofs
 *
 * A row's swipe runs the shared drag path every followed pan runs
 * (`spec:AST-094` FR43, DEC-24): the splitter, the pan, the snap-point drag
 * and the animator. The row declares its stops, per side (rest, the open
 * width, and out past the row's edge for a full swipe), and its actions;
 * the drag draws the row's travel into one custom property on the root
 * (`spec:AST-057` FR2) that every part of the panel reads (ItemSwipeLayer).
 *
 * What a drag does depends on what drives it:
 *
 * - A trackpad's horizontal swipe (FR43) follows the fingers one for one
 *   from its first event past the pan's 8 px start, and its release settles
 *   to the nearest stop by position and velocity (Core's one release policy)
 *   from the fingers' speed, which the release keeps from their last move.
 * - A finger's or a pen's drag stays on `spec:AST-057`'s UIKit model: the
 *   swipe begins after UIKit's 25 px dead zone and counts from 0 there, the
 *   row trails the finger on UIKit's tracking spring and catches up when it
 *   stops, and the release goes by UIKit's rule (swipeRelease.ts) on UIKit's
 *   settle spring from the row's own velocity.
 *
 * Either way a drag stays on its side: within one gesture an open row only
 * closes, never passing rest to its other side. Dragged past the confirm
 * point (when the side's outermost entry can fire), a full swipe confirms:
 * the row runs ahead to UIKit's confirmation offset and the outermost entry
 * covers the space (a second custom property, the confirm, which the panel
 * reads too); backing out undoes it. A lift still confirmed slides the row
 * out and fires the outermost entry, at any speed; speed alone never fires
 * one (`spec:AST-057` FR5), so a full swipe is the one stop a flick never
 * reaches. Whenever the row slides out (a full swipe, or a tapped entry with
 * `hasRemoval`) the entry fires once the row's content has left its box; then
 * the row springs back, or holds out when the entry has `hasRemoval`.
 *
 * A mouse drag and a mouse wheel's notches never swipe a row
 * (`spec:AST-057` AR2, DEC-7): the pan takes touches, pens and a trackpad's
 * scroll. A finger that lands while another is down, on the row or anywhere
 * else, never starts the pan: the page pinches (`spec:AST-094` FR10).
 *
 * An open row (resting, or settling to rest open: UIKit counts a row open
 * from the release that opens it) closes on a pointer landing outside it, on
 * a scroll of anything that holds it while focus is outside its open panel,
 * on Escape with focus inside it, and on a tap on its own content, which
 * activates nothing on the row (`spec:AST-057` FR7).
 *
 * Under Reduce Motion (`design:reduced-motion`) the drag itself is direct
 * manipulation and follows one for one, but what a release, a confirm or a
 * close starts never travels or springs: the row lands at the bottom of an
 * opacity dip after a finger (DR2), and a pen's or a trackpad's lands at once
 * on a fine primary pointer (DR3).
 *
 * Directions are logical: `leading` is uncovered by a drag toward the inline
 * end and sits at the inline start, `trailing` the reverse, read against the
 * root's computed `direction` when the drag begins (`spec:AST-057` FR8).
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import type {KeyboardEvent as ReactKeyboardEvent} from 'react';
import {
  createSnapDrag,
  DEFAULT_FLICK_THRESHOLD,
  type SnapDrag,
  type SnapDragLanding,
  type SnapDragMove,
  type SnapDragRelease,
  type SnapDragTarget,
} from '../dragToSnapPoints/createSnapDrag';
import {getGestureHost} from '../gestures/GestureHost';
import {TapGestureRecognizer} from '../gestures/TapGestureRecognizer';
import type {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
import {useGestureRecognizer} from '../gestures/useGestureRecognizer';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {isRtlElement} from '../hooks/isRtlElement';
import type {MotionHandle} from '../motion/animator';
import {reducedMotionFade} from '../motion/reducedMotion';
import {resolveSnapPoint} from '../motion/resolveSnapPoint';
import type {SpringDescription} from '../motion/spring';
import {swipeActions as SWIPE} from '../motion/uikit/swipeActions';
import {lockSelection} from '../utils/selectionLock';
import {confirmedOffset, confirmPoint, resolveRelease} from './swipeRelease';

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
  /** Where the settle in progress lands (`settling` only). */
  landing?: 'idle' | 'resting' | 'held';
}

/**
 * The row is open: resting, or settling to rest open. UIKit counts a row open
 * from the release that opens it, not from when it comes to rest: an open
 * row closes on a tap on its content, a pointer outside it, a scroll or
 * Escape, and its root takes no press.
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
 * A side's geometry, written on its window when a drag begins: the pin
 * (physical px, where the entries sit against the track so they stay at the
 * outer edge), the side's physical sign (+1 on the left), its open width
 * (px) and the outermost entry's slide on a confirmed full swipe (physical
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
  /** Which sides have entries. A drag toward a side without any never begins. */
  sides: {leading: boolean; trailing: boolean};
  /**
   * Fire the side's outermost entry. Returns whether the row holds out
   * afterwards (the entry's `hasRemoval`).
   */
  fireOutermost: (side: SwipeSide) => boolean;
  /** Whether the side's outermost entry can fire: a disabled one never confirms a full swipe. */
  canConfirm: (side: SwipeSide) => boolean;
  /** Told from the transition that opens or closes the row (open is `isSwipeOpen`). */
  onOpenChange?: (isOpen: boolean) => void;
}

export interface UseSwipeActionResult {
  state: SwipeState;
  /** Attach each side's moving panel parts. */
  panelRefs: Record<SwipeSide, SwipePanelRefs>;
  /**
   * A resting panel's entry was tapped. Without `hasRemoval` (`holdsOut`) it
   * fires at once and the row closes; with it the row slides out, the entry
   * fires once the row's content has left its box, and the row holds out.
   */
  activateEntry: (fire: () => void, holdsOut: boolean) => void;
  /** Close an open row. */
  close: () => void;
  /** Escape closes an open row with focus inside it. */
  onKeyDown: (event: ReactKeyboardEvent) => void;
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
 * taking the touch), or anything else (Escape, a pointer outside, a tapped
 * entry, a tap on the content, a scroll, a pen's or a trackpad's release).
 */
type SettleCause = 'release' | 'other';

// =============================================================================
// The hook
// =============================================================================

const IDLE_STATE: SwipeState = {isArmed: false, phase: 'idle', side: 'leading'};

/** Below this the row is at rest, closed. */
const AT_REST_PX = 0.5;

/**
 * A side's panel as the gesture reads it: the window it writes the side's pin
 * on, and the entries, whose natural widths together open the row.
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
  /** The side's outermost entry can fire (not disabled). */
  canConfirm: boolean;
  /** A trackpad's scroll drives it (FR43), not a finger or a pen. */
  isScroll: boolean;
  /** Past the dead zone: the row follows. */
  started: boolean;
  /** Which way the finger crossed the dead zone: +1 toward the side, -1 away. */
  startSign: number;
  /** The travel the row had when the swipe began (logical, ≥ 0). */
  baseTravel: number;
  /** The swipe's travel toward the side (logical, ≥ 0: never past rest). */
  raw: number;
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
  behavior,
  sides,
  fireOutermost,
  canConfirm,
  onOpenChange,
}: UseSwipeActionOptions): UseSwipeActionResult {
  // The latest options, read by listeners and completions that outlive a render.
  // Synchronizes the gesture system (pan callbacks, settle completions, the
  // slide-out's fire timer) with the committed options.
  const latestRef = useRef({
    behavior,
    canConfirm,
    fireOutermost,
    onOpenChange,
    sides,
  });
  useIsomorphicLayoutEffect(() => {
    latestRef.current = {
      behavior,
      canConfirm,
      fireOutermost,
      onOpenChange,
      sides,
    };
  });

  const [state, setState] = useState<SwipeState>(IDLE_STATE);
  const stateRef = useRef(state);
  // Synchronizes the gesture system with the committed state: its pan
  // callbacks and the document listeners run outside React and read it here.
  // Idempotent: it rewrites the ref with the committed value.
  useIsomorphicLayoutEffect(() => {
    stateRef.current = state;
  });
  // Every transition goes through here, so the one that opens or closes the
  // row reports it at once, from the handler that caused it.
  const setSwipeState = useCallback((next: SwipeState) => {
    const report = latestRef.current.onOpenChange;
    const wasOpen = isSwipeOpen(stateRef.current);
    const isOpen = isSwipeOpen(next);
    stateRef.current = next;
    setState(next);
    if (wasOpen !== isOpen) {
      report?.(isOpen);
    }
  }, []);

  const [panels] = useState<Record<SwipeSide, SidePanel>>(() => ({
    leading: createSidePanel(),
    trailing: createSidePanel(),
  }));
  /** The layout of the side that moved last: where the row is, and how to move it. */
  const layoutRef = useRef<SwipeLayout | null>(null);
  const dragRef = useRef<Drag | null>(null);
  /** The shared drag on the root. */
  const snapRef = useRef<SnapDrag | null>(null);
  /** The row is open (see `isSwipeOpen`), read by listeners and recognizers. */
  const isOpen = useCallback(() => isSwipeOpen(stateRef.current), []);

  // The row root: the drag's element and the element that translates. A
  // panel is its child, and a panel's ref is set before this hook's layout
  // effects run, while a ref on the root itself is set after them.
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

  /** The row's travel on screen now, logical, on `layout`'s side. */
  const travelNow = useCallback(
    (layout: SwipeLayout): number =>
      Math.max(
        0,
        (snapRef.current?.animator.get('x') ?? 0) *
          physicalSign(layout.side, layout.inlineSign),
      ),
    [],
  );

  /**
   * The full swipe's confirm for a travel (physical px): 0 short of the
   * confirm point, 1 at UIKit's confirmation offset, in step with the row
   * between them, so the outermost entry covers the space as the row runs
   * ahead and gives it back as the row backs out; 0 throughout when the
   * side's outermost entry cannot fire. Drawn from the travel in the same
   * animation (the shared drag's companion), it cannot drift from the row.
   */
  const confirmOf = (x: number): number => {
    const layout = layoutRef.current;
    if (layout == null || !latestRef.current.canConfirm(layout.side)) {
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

  /**
   * Settle the row on a stop and land in `phase`; the shared drag reports
   * the landing (onSettle) unless something interrupts it (a drag catches
   * the row, another settle starts). Returns the settle's motion.
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
      } = {},
    ): MotionHandle | null => {
      const snap = snapRef.current;
      if (snap == null) {
        return null;
      }
      layoutRef.current = layout;
      setSwipeState({
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
      return snap.settleTo(stopIndex(layout, stop), {
        spring,
        touchRelease,
        ...(options.velocity != null ? {velocity: options.velocity} : {}),
        ...(options.onPass != null ? {onPass: options.onPass} : {}),
        ...(options.start != null ? {start: options.start} : {}),
      });
    },
    [setSwipeState],
  );

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
          setSwipeState({isArmed: false, phase: 'held', side: layout.side});
        }
        return;
      }
      setSwipeState(
        stop === 'rest'
          ? IDLE_STATE
          : {isArmed: false, phase: 'resting', side: layout.side},
      );
    },
    [setSwipeState],
  );

  /**
   * Slide the row out toward the edge it travelled toward, and fire once its
   * content has left its box (`spec:AST-057` FR5): UIKit calls the handler at
   * the lift or the tap, and firing when the content is gone means a row its
   * app removes at once never vanishes mid-slide. The shared drag calls back
   * on the first frame the settle's curve has carried the row past its edge
   * (under Reduce Motion, the frame it lands out of its box at the bottom of
   * the cross-fade); a settle or a drag that replaces the slide-out first
   * fires nothing.
   */
  const slideOutThenFire = useCallback(
    (
      layout: SwipeLayout,
      fire: () => void,
      options: {
        cause: SettleCause;
        velocity?: number;
        spring?: SpringDescription;
        start?: 'next-frame';
      },
    ) => {
      const sign = physicalSign(layout.side, layout.inlineSign);
      settle(layout, 'out', 'held', {
        ...options,
        onPass: {offset: sign * layout.rowWidth, direction: sign, call: fire},
      });
    },
    [settle],
  );

  /**
   * A confirmed full swipe: out with the outermost entry covering the row's
   * place; the entry fires as the row leaves, then it holds out or springs
   * back.
   */
  const slideOutAndFire = useCallback(
    (
      layout: SwipeLayout,
      cause: SettleCause,
      motion: {velocity?: number; spring?: SpringDescription} = {},
    ) => {
      slideOutThenFire(
        layout,
        () => {
          if (!latestRef.current.fireOutermost(layout.side)) {
            settle(layout, 'rest', 'idle', {cause, ...motion});
          }
        },
        {cause, ...motion},
      );
    },
    [settle, slideOutThenFire],
  );

  /**
   * Closes an open row. `start: 'next-frame'` when asked for in an input
   * event's own task (a key, a press, a tap): the close then starts at the
   * first frame after that task, so a later listener of the event that holds
   * the main thread delays it instead of letting it skip into its curve.
   */
  const close = useCallback(
    (start?: 'next-frame') => {
      const layout = layoutRef.current;
      if (!isOpen() || layout == null) {
        return;
      }
      const root = rootRef.current;
      if (root != null && root.contains(document.activeElement)) {
        focusRowContent(root);
      }
      settle(layout, 'rest', 'idle', start != null ? {start} : {});
    },
    [isOpen, settle],
  );

  const activateEntry = useCallback(
    (fire: () => void, holdsOut: boolean) => {
      const layout = layoutRef.current;
      // From the release that opens the row, not only once it rests.
      if (!isSwipeOpen(stateRef.current) || layout == null) {
        return;
      }
      const root = rootRef.current;
      if (root != null && root.contains(document.activeElement)) {
        focusRowContent(root);
      }
      // An entry is activated in its press's or key's own task.
      if (holdsOut) {
        slideOutThenFire(layout, fire, {cause: 'other', start: 'next-frame'});
        return;
      }
      fire();
      settle(layout, 'rest', 'idle', {start: 'next-frame'});
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
    // The entries keep their place against the track for the geometry
    // written last; a first drag (or new entries) writes it now, while the
    // track still hides them.
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
    dragRef.current = {
      baseTravel: 0,
      canConfirm: latestRef.current.canConfirm(side),
      confirmAt: confirmPoint(layout.openWidth, layout.rowWidth),
      isArmed: false,
      isScroll: move.input === 'scroll',
      raw: 0,
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
      // A trackpad's swipe follows from its first event past the pan's start
      // (FR43); a finger's begins after UIKit's dead zone, counted from where
      // the touch landed, and in between the row stays where it was caught.
      if (!drag.isScroll && Math.abs(move.total) < SWIPE.hysteresis) {
        return null;
      }
      // The swipe begins: the row is caught where it is (the shared drag
      // catches it with this first target), and so is the confirm; a timer a
      // settle set acts no more.
      drag.started = true;
      drag.startSign = Math.sign(move.total * sign) || 1;
      drag.baseTravel = travelNow(layout);
      setSwipeState({
        isArmed: drag.isArmed,
        phase: 'dragging',
        side: layout.side,
      });
    }
    // The finger's swipe counts from where it crossed the dead zone, as in
    // UIKit; a trackpad's from the pan's start.
    const swipe = drag.isScroll
      ? move.translation * sign
      : move.total * sign - drag.startSign * SWIPE.hysteresis;
    // Within one gesture the row stays on its side: never past rest.
    const raw = Math.max(0, drag.baseTravel + swipe);
    drag.raw = raw;
    // The full swipe confirms on the swipe's travel, not the row's (which
    // trails a finger on the spring), and only when the outermost entry can
    // fire.
    const isArmed = drag.canConfirm && raw >= drag.confirmAt;
    const flipped = isArmed !== drag.isArmed;
    if (flipped) {
      drag.isArmed = isArmed;
      drag.wasConfirmed ||= isArmed;
      setSwipeState({isArmed, phase: 'dragging', side: layout.side});
    }
    // Confirmed, the row runs ahead to UIKit's confirmation offset; backed
    // out, it follows again.
    const travel = isArmed
      ? Math.max(raw, confirmedOffset(layout.rowWidth))
      : raw;
    const offset = sign * travel;
    const fade = reducedMotionFade(rootRef.current);
    if (fade == null) {
      // A finger's row trails it on UIKit's tracking spring; a trackpad's
      // follows its fingers one for one (FR43). A confirm or a back-out
      // springs the row to its new place either way.
      return drag.isScroll && !flipped
        ? {offset}
        : {offset, spring: SWIPE.tracking};
    }
    if (flipped) {
      // Confirming and backing out are changes of state, not the drag:
      // under Reduce Motion they cross-fade (design:reduced-motion DR2), and
      // the moves leave that fade alone until it ends.
      drag.dipUntil = performance.now() + fade.duration;
      return {offset, spring: SWIPE.tracking};
    }
    if (drag.dipUntil != null && performance.now() < drag.dipUntil) {
      return null;
    }
    // Otherwise the row follows one for one: the drag itself is direct
    // manipulation (design:reduced-motion).
    drag.dipUntil = undefined;
    return {offset};
  };

  const release = (end: SnapDragRelease): SnapDragLanding | null => {
    const drag = dragRef.current;
    dragRef.current = null;
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
      // velocity (FR43): Core's one release policy, from where the swipe
      // began. The full swipe is reached by position only: speed alone never
      // fires an entry (`spec:AST-057` FR5).
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
        travel: drag.raw,
        velocity,
        wasConfirmed: drag.wasConfirmed,
      });
    }
    // A finger's settle starts from the row's own velocity on UIKit's
    // spring; a trackpad's from the fingers' speed, which the release keeps
    // from their last move (FR43), on the shared settle spring.
    const motion = drag.isScroll
      ? {velocity: end.velocity, spring: settleSpringFor(true)}
      : {spring: settleSpringFor(false)};
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
  // splitter, the pan, the snap-point drag and the animator (FR43, DEC-24).
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
      onSettle: landed,
      pan: {
        // A finger, a pen and a trackpad's two-finger scroll swipe a row; a
        // mouse drag and a mouse wheel's notches never do (`spec:AST-057`
        // AR2, DEC-7; `spec:AST-094` FR43).
        allowedPointerTypes: ['touch', 'pen'],
        allowedScrollTypes: ['continuous'],
        hysteresis: SWIPE.claim,
        maximumNumberOfTouches: 1,
        name: 'Item.swipe',
        // The drag moves the row: text selection and the touch callout stay
        // off for the press it holds (`spec:AST-094` FR41).
        selectionLock: lockSelection,
        shouldBegin: (pan: PanGestureRecognizer) => {
          // A finger that is not the only one down is part of a pinch, even
          // when the first finger is off the row: the page zooms
          // (spec:AST-094 FR10).
          if (getGestureHost(root.ownerDocument).fingersDown() > 1) {
            return false;
          }
          if (stateRef.current.phase === 'held') {
            return false;
          }
          if (Math.abs(snap.animator.get('x')) > AT_REST_PX) {
            return true;
          }
          const inlineSign: 1 | -1 = isRtlElement(root) ? -1 : 1;
          return latestRef.current.sides[
            sideFor(pan.totalTranslation().x, inlineSign)
          ];
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

  // An open row closes on a pointer landing anywhere outside it, which is
  // also how a drag on a neighbour closes it: one row rests open at a time
  // with no shared state. It also closes when anything scrolling it moves
  // (the list, the page), as a UIKit row closes when its table scrolls: a
  // scroll that starts on the row itself lands no pointer outside it.
  useEffect(() => {
    if (!isOpen()) {
      return undefined;
    }
    const onOutside = (event: PointerEvent) => {
      const root = rootRef.current;
      if (
        root != null &&
        event.target instanceof Node &&
        !root.contains(event.target)
      ) {
        close('next-frame');
      }
    };
    const onScroll = (event: Event) => {
      const root = rootRef.current;
      const {target} = event;
      if (
        root == null ||
        !(
          target === document ||
          (target instanceof Element && target.contains(root))
        )
      ) {
        return;
      }
      // Focus inside the open panel means the scroll may be the browser
      // bringing the focused entry into view (keyboard or VoiceOver): the row
      // stays. Focus anywhere else, the row's own content included, closes it
      // (spec:AST-057 FR7).
      const side = layoutRef.current?.side;
      const panel =
        side == null
          ? null
          : root.querySelector(`[data-swipe-panel="${side}"]`);
      if (panel?.contains(document.activeElement) !== true) {
        close();
      }
    };
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [close, isOpen, state.phase]);

  // A tap on an open row's own content closes it and activates nothing, as
  // UIKit's dismissal does: the tap recognizes at the lift, and the host
  // keeps the click it would have made from the row (it cancels the touch,
  // or where the primary pointer is fine its click guard swallows the
  // click). Any pointer's press dismisses, since a trackpad opens a row too
  // (`spec:AST-057` DEC-7). The panel's entries keep their own taps, and a
  // closed row never offers this recognizer a touch.
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

  return {activateEntry, close, onKeyDown, panelRefs, state};
}
