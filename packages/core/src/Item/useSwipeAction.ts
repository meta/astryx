// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSwipeAction.ts
 * @input Per side, the panel parts that move (callback refs; the row root
 *   is their parent); the gesture foundation (PanGestureRecognizer) and the
 *   compositor animator; the UIKit constants table and swipeRelease.ts
 * @output Exports useSwipeAction — the gesture and the motion behind Item's
 *   `swipeActions` — and swipeParts, where every moving part sits for a
 *   travel (where a release lands is swipeRelease.ts)
 * @position Internal to Item, through ItemSwipeLayer (the only module that
 *   imports it); tested through Item.test.tsx and useSwipeAction.test.ts
 *
 * A UIKit list swipe: drag a row sideways and the side's panel is uncovered.
 * Under `reveal` a fast release goes the way it moves and a slow one rests
 * the row open past half the open width, with every entry tappable. A drag
 * on past the confirm point confirms a full swipe: the row runs ahead to
 * UIKit's confirmation offset and the outermost entry covers the space, and
 * letting go there fires it; backing out undoes the look, and a swipe that
 * backed out closes. Under `commit` only a confirmed full swipe fires, and
 * nothing rests (swipeRelease.ts). The outermost entry fires once the row's
 * content has left its box, at once when the release is already past that
 * edge: UIKit calls the handler at the lift, and firing when the content is
 * gone means a row its app removes at once never vanishes mid-slide. After
 * an entry fires the row springs back, or holds out when the entry has
 * `hasRemoval`.
 *
 * Touch only (the recognizer's pointer types), by pointer type rather than
 * by breakpoint: a mouse has the row's own controls and a keyboard has the
 * verb already; the gesture is an accelerator for a verb the row exposes
 * elsewhere, never the only way to reach one.
 *
 * The pan is the gesture foundation's (named `Item.swipe`, a debugging
 * label). It claims the touch after 8 px of
 * sideways travel (a drag more vertical than horizontal belongs to the
 * scroller and fails it), toward a side with entries or on a row that is open
 * or moving: a browser commits to scrolling a touch at about 10 px, so the
 * row must claim before that. The swipe itself begins where UIKit's does,
 * after 25 px, from 0, and in between the row carries on as it was. The pan
 * attaches for every pointer (`spec:AST-094` FR43) and takes a finger and a
 * pen, as `spec:AST-057` says: either swipes the row whatever the primary
 * pointer, and a mouse drag never starts it, one rule on every device. The
 * foundation tells the browser (`touch-action: pan-y
 * pinch-zoom`, `touchmove` cancelled only while the pan owns the touch, the
 * click the browser synthesizes swallowed) and leaves a pinch to the page: a
 * finger that lands while another is down, on the row or anywhere else, never
 * starts the pan, a second finger that lands before the claim fails it and
 * leaves its touch to the browser's pinch, and once the row has claimed its
 * finger a second finger leaves the swipe going (spec:AST-094 FR10).
 *
 * An open row (resting, or settling to rest open: UIKit counts a row open
 * from the release that opens it) closes on a pointer landing outside it, on
 * a scroll of anything that holds it while focus is outside it, on Escape
 * with focus inside it, and on a tap on its own content. That tap activates
 * nothing on the row, as in UIKit: a foundation tap recognizer takes it at
 * the lift, so the browser never clicks.
 *
 * Motion is UIKit's, on the compositor. Every move of the finger starts a
 * spring toward the finger's offset from the row's presentation value and
 * velocity, so the row trails a moving finger and catches up when it stops;
 * the release starts the same spring toward where the row lands, still from
 * the presentation velocity. A finger that lands on a moving row catches it
 * where it is. The row's root translates; each side's panel is a window over
 * the row's resting box (translated back by the travel, so it stays put and
 * clips to that box), a track inside it that moves with the row (so it clips
 * the entries to exactly the space the row vacates), and each entry inside
 * the track, translated back again so the entries stay pinned at the outer
 * edge; past the open width they ride the row and the outermost entry's
 * colour, painted beside it, stretches it out to the outer edge. The entries
 * move as one block with no wrapper around them (minimal DOM,
 * `architecture:component-style-authoring` INV7): every entry plays the same
 * pin, the outermost one adds its own slide to it, and the others fade each
 * on its own opacity. The animators share one clock, and every curve is an
 * affine image of the root's or one of the full swipe's (the outermost
 * entry's slide and the others' fade, on the same spring): they cannot drift
 * apart, nothing lays out, and they keep moving while the main thread is
 * busy. A drag costs no React render; the
 * claim, the confirming and the landing each cost one.
 *
 * A finger or a pen swipes the row on every device, whatever the primary
 * pointer, and so does a trackpad's or a mouse wheel's horizontal scroll
 * (`spec:AST-057` FR4, DEC-7); a mouse drag never does.
 *
 * Under Reduce Motion (`design:reduced-motion`) the finger's own drag is
 * direct manipulation and follows it one for one, but nothing a release or
 * a close starts travels or springs: the row lands at the bottom of an
 * opacity dip (DR2).
 *
 * Directions are logical: `leading` is uncovered by a drag toward the inline
 * end and sits at the inline start, `trailing` the reverse, read against the
 * root's computed `direction` when the pan begins, so under `dir="rtl"` the
 * finger, the uncovered edge and the panel agree.
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import type {KeyboardEvent as ReactKeyboardEvent} from 'react';
import {
  PanGestureRecognizer,
  TapGestureRecognizer,
  getGestureHost,
  useGestureRecognizer,
} from '../gestures';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {isRtlElement} from '../hooks/isRtlElement';
import {
  createAnimator,
  type Animator,
  type MotionHandle,
} from '../motion/animator';
import {createInteractiveTransition} from '../motion/interactive';
import type {SpringDescription} from '../motion/spring';
import {reducedMotionFade} from '../motion/reducedMotion';
import {swipeActions as SWIPE} from '../motion/uikit/swipeActions';
import {
  confirmPoint,
  swipeReleaseRule,
  swipeTrackRule,
  type SwipeRelease,
  type SwipeReleaseContext,
  type SwipeTrack,
} from './swipeRelease';

export type SwipeSide = 'leading' | 'trailing';
export type SwipeBehavior = 'reveal' | 'commit';
export type SwipePhase =
  /** At rest, closed. */
  | 'idle'
  /** The finger drives the row. */
  | 'dragging'
  /** Springing to where the release, a tap or a close sent it. */
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
 * from the release that opens it, not from when its spring comes to rest: an
 * open row closes on a tap on its content, a pointer outside it, a scroll or
 * Escape, and its root takes no press.
 */
export function isSwipeOpen(state: SwipeState): boolean {
  return (
    state.phase === 'resting' ||
    (state.phase === 'settling' && state.landing === 'resting')
  );
}

/** The side an open row is open on (see `isSwipeOpen`), or `null`. */
function openSideOf(state: SwipeState): SwipeSide | null {
  return isSwipeOpen(state) ? state.side : null;
}

/** Callback refs for the elements of one side's panel that move. */
export interface SwipePanelRefs {
  /** The window over the row's resting box. */
  panel: (element: HTMLElement | null) => void;
  /** The fill that moves with the row, clipped by the window. */
  track: (element: HTMLElement | null) => void;
  /**
   * Each entry other than the outermost, pinned at the outer edge inside the
   * track and fading on a confirmed full swipe: the ref for the entry with
   * `key` (its React key), stable per key.
   */
  entry: (key: string) => (element: HTMLElement | null) => void;
  /**
   * The outermost entry, pinned with the others, which slides to the row's
   * edge on a confirmed full swipe.
   */
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
  /**
   * Told the side the row opens on from the transition that opens it (open
   * is `isSwipeOpen`), and `null` from the one that closes it. A row that
   * leaves while open is not told: its owner, which decides whether the
   * layer renders, drops its side as it renders.
   */
  onOpenChange?: (side: SwipeSide | null) => void;
}

export interface UseSwipeActionResult {
  state: SwipeState;
  /** Attach each side's moving panel parts. */
  panelRefs: Record<SwipeSide, SwipePanelRefs>;
  /**
   * A resting panel's entry was tapped: fire it, then hold the row out
   * (`hasRemoval`) or close.
   */
  activateEntry: (fire: () => boolean) => void;
  /** Close a resting row. */
  close: () => void;
  /**
   * Open the row on `side` as a swipe opens it, from wherever it is: a row
   * open on the other side closes first. Nothing while a finger holds the
   * row, while it holds out after a fire, or toward a side without entries.
   */
  reveal: (side: SwipeSide) => void;
  /** Escape closes a resting row with focus inside it. */
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
}

/** +1 when the side's panel is on the physical left, −1 on the right. */
export function physicalSign(side: SwipeSide, inlineSign: 1 | -1): 1 | -1 {
  return side === 'leading' ? inlineSign : inlineSign === 1 ? -1 : 1;
}

/**
 * Where every moving part sits for a travel (logical px toward the side,
 * ≥ 0), as a physical translation, and how far a full swipe has confirmed
 * (`confirm`, 0 or 1). The root moves by the travel, the panel window
 * cancels it (fixed over the resting box) and the track moves with the row.
 * Up to the open width the entries cancel the track, pinned at the outer
 * edge where the track's painted part uncovers them; past it they ride the
 * row, and the track's colour (the outermost entry's) fills behind them out
 * to the outer edge, so the outermost entry stretches. Confirmed, the
 * outermost entry slides to the row's edge and the others fade (`fade`): its
 * colour covers everything the row uncovered.
 */
export function swipeParts(
  travel: number,
  {side, inlineSign, openWidth, outerWidth}: SwipeLayout,
  confirm = 0,
): {
  root: number;
  panel: number;
  track: number;
  entries: number;
  outer: number;
  fade: number;
} {
  const sign = physicalSign(side, inlineSign);
  const x = sign * travel;
  return {
    root: x,
    panel: -x,
    track: x,
    entries: sign * (openWidth - Math.min(travel, openWidth)),
    outer: sign * (openWidth - outerWidth) * confirm,
    fade: 1 - confirm,
  };
}

/** The longest a slide-out takes to leave the row's box (ms): beyond it, never. */
const SLIDE_OUT_HORIZON_MS = 3000;

/**
 * When `animator`, on the curve it now plays, first carries the row to
 * `edge` (physical px) or past it, in ms after `start`: 0 when it is there
 * already, null when it never gets there. The animator reads its own curve
 * back analytically.
 */
function timeToPass(
  animator: Animator,
  start: number,
  edge: number,
): number | null {
  const sign = Math.sign(edge) || 1;
  const reached = (t: number) =>
    animator.get('x', start + t) * sign >= Math.abs(edge);
  if (reached(0)) {
    return 0;
  }
  for (let t = 1; t <= SLIDE_OUT_HORIZON_MS; t += 1) {
    if (reached(t)) {
      return t;
    }
  }
  return null;
}

/**
 * What started a settle: a finger's drag ending (its release, or the browser
 * taking the touch), which cross-fades under Reduce Motion whatever the
 * primary pointer (design:reduced-motion DR2), or anything else: a pen's or a
 * wheel's release, Escape, a pointer outside, a tapped entry, a tap on the
 * content, a scroll. Those follow the primary pointer: a cross-fade where it
 * is coarse, at once where it is fine (DR3, `spec:AST-094` FR43).
 */
type SettleCause = 'release' | 'other';

/** Whether a pan's contact is a finger's: not a pen's, and not a wheel's scroll. */
function isFingerContact(pan: PanGestureRecognizer): boolean {
  const touch = pan.trackedTouches[0];
  return (
    touch != null && touch.pointerType === 'touch' && touch.scrollType == null
  );
}

// =============================================================================
// The hook
// =============================================================================

/** Scratch: a trackpad drag tracks and settles on a quick, critically damped spring. */
const TRACKPAD_SPRING = {mass: 1, stiffness: 1600, damping: 80};

const IDLE_STATE: SwipeState = {isArmed: false, phase: 'idle', side: 'leading'};

/** Below this the row is at rest, closed. */
const AT_REST_PX = 0.5;

/**
 * Sent from a row's root when a control opens the row with no pointer (a key,
 * assistive technology): every other open row closes on it, as it does on a
 * pointer landing outside it, so one row rests open at a time.
 */
const ROW_OPENED = 'astryxswiperowopened';

interface SideAnimators {
  panel: Animator;
  track: Animator;
  /**
   * The track's confirm fill (its `::before`): the outermost entry's colour,
   * which shows through the others as they fade on a confirmed full swipe.
   */
  fill: Animator;
  /** The entries other than the outermost. */
  entries: EntryAnimators;
  outer: Animator;
}

/**
 * A side's entries, each its own moving element on the same motion, so they
 * move as one block with no wrapper around them.
 */
interface EntryAnimators {
  /** The callback ref for the entry with `key`, stable per key. */
  ref: (key: string) => (element: HTMLElement | null) => void;
  /** The entries' animators, in the order they mounted. */
  members: () => Animator[];
  /** Where the entries are (they share it); at rest before any has mounted. */
  get: (property: 'x' | 'opacity', time?: number) => number;
  set: Animator['set'];
  animate: (...args: Parameters<Animator['animate']>) => void;
  play: (...args: Parameters<Animator['play']>) => void;
  /** Their natural widths together. */
  width: () => number;
}

function createEntries(): EntryAnimators {
  const byKey = new Map<string, Animator>();
  const refs = new Map<string, (element: HTMLElement | null) => void>();
  const any = (): Animator | undefined => byKey.values().next().value;
  return {
    ref: key => {
      let ref = refs.get(key);
      if (ref == null) {
        ref = element => {
          const current = byKey.get(key);
          if (element == null) {
            current?.dispose();
            byKey.delete(key);
          } else if (current != null) {
            current.attach(element);
          } else {
            // A new entry joins the block where the others are.
            const animator = createAnimator(null);
            const other = any();
            if (other != null) {
              animator.set({x: other.get('x'), opacity: other.get('opacity')});
            }
            byKey.set(key, animator);
            animator.attach(element);
          }
        };
        refs.set(key, ref);
      }
      return ref;
    },
    members: () => [...byKey.values()],
    get: (property, time) =>
      any()?.get(property, time) ?? (property === 'opacity' ? 1 : 0),
    set: values => {
      for (const animator of byKey.values()) {
        animator.set(values);
      }
    },
    animate: (...args) => {
      for (const animator of byKey.values()) {
        animator.animate(...args);
      }
    },
    play: (...args) => {
      for (const animator of byKey.values()) {
        animator.play(...args);
      }
    },
    width: () => {
      let width = 0;
      for (const animator of byKey.values()) {
        width += animator.element?.offsetWidth ?? 0;
      }
      return width;
    },
  };
}

interface Animators {
  root: Animator;
  leading: SideAnimators;
  trailing: SideAnimators;
}

interface Drag {
  layout: SwipeLayout;
  rowWidth: number;
  /** The finger's swipe at which the full swipe confirms. */
  confirmAt: number;
  /** The side's outermost entry can fire (not disabled). */
  canConfirm: boolean;
  /** A finger drives the swipe, not a pen or a wheel: its release cross-fades on every pointer. */
  isFinger: boolean;
  /** Scratch: a trackpad scroll drives this drag (tracks 1:1, settles fast). */
  viaScroll?: boolean;
  /** Past UIKit's threshold: the row follows the finger. */
  started: boolean;
  /** Which way the finger crossed the threshold: +1 toward the side, -1 away. */
  startSign: number;
  /** The travel the row had when the swipe began (logical, ≥ 0). */
  baseTravel: number;
  /** The finger's travel along the side. */
  raw: number;
  /** Confirmed: the finger is past the confirm point. */
  isArmed: boolean;
  /** The full swipe confirmed at some point in this swipe. */
  wasConfirmed: boolean;
  /**
   * Under Reduce Motion, when the cross-fade a confirm or a back-out started
   * ends (performance.now() ms): until then the moves leave it alone.
   */
  dipUntil?: number;
}

function createSide(): SideAnimators {
  return {
    entries: createEntries(),
    fill: createAnimator(null, {
      initial: {opacity: 0},
      pseudoElement: '::before',
    }),
    outer: createAnimator(null),
    panel: createAnimator(null),
    track: createAnimator(null),
  };
}

function allOf(animators: Animators): Animator[] {
  return [
    animators.root,
    ...[animators.leading, animators.trailing].flatMap(side => [
      side.panel,
      side.track,
      side.fill,
      side.outer,
      ...side.entries.members(),
    ]),
  ];
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
  // Synchronizes the gesture system (recognizer callbacks, animation
  // completions, the slide-out's fire timer) with the committed options.
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
  // Synchronizes the gesture system with the committed state: its recognizer
  // callbacks and the document listeners run outside React and read it here.
  // Idempotent: it rewrites the ref with the committed value.
  useIsomorphicLayoutEffect(() => {
    stateRef.current = state;
  });
  // Every transition goes through here, so the one that opens or closes the
  // row reports it at once, from the handler that caused it.
  const setSwipeState = useCallback((next: SwipeState) => {
    const report = latestRef.current.onOpenChange;
    const was = openSideOf(stateRef.current);
    const now = openSideOf(next);
    stateRef.current = next;
    setState(next);
    if (was !== now) {
      report?.(now);
    }
  }, []);

  const [animators] = useState<Animators>(() => ({
    leading: createSide(),
    root: createAnimator(null),
    trailing: createSide(),
  }));
  /** The layout of the side that moved last: where the row is, and how to move it. */
  const layoutRef = useRef<SwipeLayout | null>(null);
  const dragRef = useRef<Drag | null>(null);
  /**
   * Counts the row's motions: a timer started for one motion acts only if
   * no other motion has started since (a finger caught the row, a close).
   */
  const motionRef = useRef(0);
  /** The root's motion in progress, when a spring drives it. */
  const rootMotionRef = useRef<MotionHandle | null>(null);
  /** That motion once it has started on screen (its `started` resolved). */
  const startedMotionRef = useRef<MotionHandle | null>(null);
  const fireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Releases the browser timer a slide-out set for its fire when the row
  // leaves, and drops a fire still waiting for its slide-out to start.
  useEffect(
    () => () => {
      motionRef.current += 1;
      if (fireTimerRef.current != null) {
        clearTimeout(fireTimerRef.current);
      }
    },
    [],
  );
  /** The row is open (see `isSwipeOpen`), read by listeners and recognizers. */
  const isOpen = useCallback(() => isSwipeOpen(stateRef.current), []);

  // The row root: the gesture's target and the element that translates. A
  // panel is its child, and a panel's ref is set before this hook's layout
  // effects run, while a ref on the root itself is set after them.
  const rootRef = useRef<HTMLElement | null>(null);
  // The parts attach as they mount (a side's panel exists only while it has
  // entries); attaching writes where the part is now.
  const [panelRefs] = useState<Record<SwipeSide, SwipePanelRefs>>(() => {
    const refsFor = (side: SideAnimators): SwipePanelRefs => ({
      entry: key => side.entries.ref(key),
      outer: element => side.outer.attach(element),
      panel: element => {
        if (element?.parentElement != null) {
          rootRef.current = element.parentElement;
        }
        side.panel.attach(element);
      },
      track: element => {
        side.track.attach(element);
        side.fill.attach(element);
      },
    });
    return {
      leading: refsFor(animators.leading),
      trailing: refsFor(animators.trailing),
    };
  });
  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    animators.root.attach(root);
    return () => {
      for (const animator of allOf(animators)) {
        animator.dispose();
      }
      // The root outlives the layer: give it back its own translation.
      root?.style.removeProperty('translate');
    };
  }, [animators, rootRef]);

  /** The row's travel on screen now, logical, on `layout`'s side. */
  const travelNow = useCallback(
    (layout: SwipeLayout): number =>
      Math.max(
        0,
        animators.root.get('x') * physicalSign(layout.side, layout.inlineSign),
      ),
    [animators],
  );

  /**
   * The side's moving parts as one interactive transition
   * (motion/interactive.ts): the root's translation drives; the window, the
   * track and the entries follow it (`swipeParts`: the window cancels it,
   * the track rides with it, the entries stay pinned up to the open width and
   * ride past it), and the full swipe's look follows the drag's confirmation.
   */
  const transitionFor = useCallback(
    (layout: SwipeLayout) => {
      const sign = physicalSign(layout.side, layout.inlineSign);
      const side = animators[layout.side];
      const {openWidth, outerWidth} = layout;
      const confirmOf = (track: SwipeTrack) => (track.isConfirmed ? 1 : 0);
      // The entries' pin: at the outer edge up to the open width, riding the
      // row past it (`swipeParts`).
      const pin = (x: number) =>
        sign * (openWidth - Math.min(sign * x, openWidth));
      return createInteractiveTransition<
        SwipeRelease,
        SwipeReleaseContext,
        SwipeTrack
      >({
        driver: {animator: animators.root, property: 'x'},
        layers: [
          {animator: side.panel, property: 'x', map: x => -x},
          {animator: side.track, property: 'x', map: x => x},
          // Each entry other than the outermost: pinned, and fading on a
          // confirmed full swipe, on its own opacity.
          ...side.entries.members().flatMap(entry => [
            {animator: entry, property: 'x' as const, map: pin},
            {
              animator: entry,
              property: 'opacity' as const,
              value: (track: SwipeTrack) => 1 - confirmOf(track),
              spring: SWIPE.tracking,
            },
          ]),
          // The outermost entry: the pin plus its full-swipe slide, one
          // translate (an offset layer).
          {
            animator: side.outer,
            property: 'x',
            map: pin,
            offset: track => sign * (openWidth - outerWidth) * confirmOf(track),
          },
          // The track's confirm fill shows through the fading entries.
          {
            animator: side.fill,
            property: 'opacity',
            value: track => confirmOf(track),
            spring: SWIPE.tracking,
          },
        ],
        rule: swipeReleaseRule,
      });
    },
    [animators],
  );

  /**
   * Spring every part of the side to `travel` on one clock, from the
   * presentation values and velocities. Resolves with the root's completion.
   */
  const springTo = useCallback(
    async (
      layout: SwipeLayout,
      travel: number,
      spring: SpringDescription,
      confirm = 0,
      // A settle a touch drag's release started: under Reduce Motion it
      // cross-fades whatever the pointer (design:reduced-motion DR2).
      touchRelease = false,
    ): Promise<boolean> => {
      layoutRef.current = layout;
      motionRef.current += 1;
      const sign = physicalSign(layout.side, layout.inlineSign);
      // From rest no start is pinned: the driver and every layer start when
      // the browser commits them, together, so a frame held back (iOS during a
      // smooth scroll) delays the settle instead of skipping into it. A move
      // that continues motion on screen (the next move's spring, the release,
      // a catch: the root's motion has started and not ended) would start
      // each layer at its own call time, so the parts share one pinned start.
      // UIKit sets the full swipe's look inside the same per-move animator.
      const previous = rootMotionRef.current;
      const isMoving =
        previous != null &&
        startedMotionRef.current === previous &&
        (previous.velocity('x') !== 0 ||
          previous.value('x') !== previous.value('x', Infinity));
      const run = transitionFor(layout).to(sign * travel, spring, {
        velocity: animators.root.getVelocity('x'),
        touchRelease,
        ...(isMoving ? {now: performance.now()} : {startAtCommit: true}),
        state: {isConfirmed: confirm === 1, wasConfirmed: confirm === 1},
      });
      const handle = run.handle;
      rootMotionRef.current = handle;
      // On screen from its start: a move from rest waits for the browser's
      // commit, so until then the next move is from rest too.
      void handle?.started.then(() => {
        if (rootMotionRef.current === handle) {
          startedMotionRef.current = handle;
        }
      });
      return handle?.finished ?? run.finished;
    },
    [animators, transitionFor],
  );

  /**
   * Every part of the side at `travel` now: the row following the finger one
   * for one under Reduce Motion.
   */
  const moveTo = useCallback(
    (layout: SwipeLayout, travel: number, confirm = 0) => {
      layoutRef.current = layout;
      motionRef.current += 1;
      rootMotionRef.current = null;
      const sign = physicalSign(layout.side, layout.inlineSign);
      transitionFor(layout).place(sign * travel, {
        state: {isConfirmed: confirm === 1, wasConfirmed: confirm === 1},
      });
    },
    [transitionFor],
  );

  /**
   * Settle the row at `travel` and land in `phase`. The landing is skipped
   * when something interrupts the settle (a finger catches the row, another
   * settle starts).
   */
  /** Scratch: the next settle is a trackpad drag's (a quicker spring). */
  const fastSettleRef = useRef(false);
  const settle = useCallback(
    (
      layout: SwipeLayout,
      travel: number,
      phase: 'idle' | 'resting' | 'held',
      afterSettle?: () => boolean,
      cause: SettleCause = 'other',
      confirm = 0,
    ) => {
      setSwipeState({
        isArmed: false,
        landing: phase,
        phase: 'settling',
        side: layout.side,
      });
      // Under Reduce Motion the animator cross-fades or lands at once
      // (design:reduced-motion); what a release started always cross-fades.
      const touchRelease = cause === 'release';
      const fast = fastSettleRef.current;
      fastSettleRef.current = false;
      const motion = springTo(
        layout,
        travel,
        fast ? TRACKPAD_SPRING : SWIPE.settle,
        confirm,
        touchRelease,
      );
      void motion.then(finished => {
        if (!finished) {
          return;
        }
        // A settle that fires an entry may start the spring back itself; the
        // landing below is then that settle's to make.
        if (afterSettle?.() === true) {
          return;
        }
        setSwipeState(
          phase === 'idle'
            ? IDLE_STATE
            : {isArmed: false, phase, side: layout.side},
        );
      });
    },
    [setSwipeState, springTo],
  );

  /** How far out a row goes when an entry fires and the row leaves. */
  const outTravel = useCallback(
    () => (rootRef.current?.clientWidth ?? 0) + SWIPE.slideOutOvershoot,
    [rootRef],
  );

  /**
   * A confirmed full swipe: out with the outermost entry covering the row's
   * place; the entry fires as the row leaves, then it holds out or springs
   * back.
   */
  const slideOutAndFire = useCallback(
    (layout: SwipeLayout, cause: SettleCause) => {
      const fire = () => {
        const holdsOut = latestRef.current.fireOutermost(layout.side);
        if (holdsOut) {
          return false;
        }
        settle(layout, 0, 'idle', undefined, cause);
        return true;
      };
      // UIKit calls the handler at the lift. The row fires once its content
      // has left its box, so a row its app removes at once never vanishes
      // mid-slide; at once when the release is already past that edge.
      const sign = physicalSign(layout.side, layout.inlineSign);
      const edge = sign * (rootRef.current?.clientWidth ?? 0);
      settle(layout, outTravel(), 'held', undefined, cause, 1);
      const motion = motionRef.current;
      const handle = rootMotionRef.current;
      const fade = reducedMotionFade(rootRef.current, {
        touchRelease: cause === 'release',
      });
      // One pending fire at a time: a new slide-out replaces an older one's.
      if (fireTimerRef.current != null) {
        clearTimeout(fireTimerRef.current);
        fireTimerRef.current = null;
      }
      let timer: ReturnType<typeof setTimeout> | null = null;
      const fireIfStill = () => {
        if (fireTimerRef.current === timer) {
          fireTimerRef.current = null;
        }
        if (motionRef.current === motion) {
          fire();
        }
      };
      if (
        handle == null ||
        (fade == null &&
          timeToPass(animators.root, performance.now(), edge) === 0)
      ) {
        fireIfStill();
        return;
      }
      // Timed from when the slide-out starts on screen: one from rest waits
      // for the browser's first frame (longer on a busy page), and until then
      // the row is where it was. Under Reduce Motion the row never travels:
      // it lands out of its box at the bottom of the cross-fade, and fires
      // there; otherwise when the curve the animator plays carries it past
      // the edge, read back from the animator itself.
      void handle.started.then(startedAt => {
        if (motionRef.current !== motion) {
          return;
        }
        const delay =
          fade != null
            ? fade.duration / 2
            : timeToPass(animators.root, startedAt, edge);
        if (delay == null) {
          return;
        }
        const wait = Math.max(0, startedAt + delay - performance.now());
        if (wait === 0) {
          fireIfStill();
          return;
        }
        timer = setTimeout(fireIfStill, wait);
        fireTimerRef.current = timer;
      });
    },
    [animators, outTravel, rootRef, settle],
  );

  const close = useCallback(() => {
    const layout = layoutRef.current;
    if (!isOpen() || layout == null) {
      return;
    }
    const root = rootRef.current;
    if (root != null && root.contains(document.activeElement)) {
      focusRowContent(root);
    }
    settle(layout, 0, 'idle');
  }, [isOpen, rootRef, settle]);

  /** The layout of `side` now, as a drag or a reveal that uncovers it takes it. */
  const layoutFor = useCallback(
    (side: SwipeSide, root: HTMLElement): SwipeLayout => {
      const outerWidth = animators[side].outer.element?.offsetWidth ?? 0;
      return {
        inlineSign: isRtlElement(root) ? -1 : 1,
        openWidth: animators[side].entries.width() + outerWidth,
        outerWidth,
        side,
      };
    },
    [animators],
  );

  // The entries keep their place against the track only for the width they
  // were placed with; a first drag or reveal (or new entries) puts them in
  // place, while the track still hides them.
  const placeEntries = useCallback(
    (layout: SwipeLayout) => {
      const side = animators[layout.side];
      const expected = swipeParts(travelNow(layout), layout).entries;
      const pinned =
        side.entries.members().length > 0
          ? side.entries.get('x')
          : side.outer.get('x');
      if (Math.abs(pinned - expected) > AT_REST_PX) {
        side.entries.set({x: expected});
        side.outer.set({x: expected});
      }
    },
    [animators, travelNow],
  );

  // A control in the row opens it, as UIKit's edit-mode delete control does:
  // the row settles open on the side exactly as a release past half the panel
  // leaves it, so it closes by the same tap, pointer, scroll or Escape.
  const reveal = useCallback(
    (side: SwipeSide) => {
      const {phase, landing} = stateRef.current;
      if (
        dragRef.current != null ||
        !latestRef.current.sides[side] ||
        phase === 'held' ||
        (phase === 'settling' && landing === 'held')
      ) {
        return;
      }
      const root = rootRef.current;
      if (root == null) {
        return;
      }
      const layout = layoutFor(side, root);
      if (layout.openWidth <= 0) {
        return;
      }
      const open = () => {
        placeEntries(layout);
        settle(layout, layout.openWidth, 'resting');
        root.dispatchEvent(new Event(ROW_OPENED, {bubbles: true}));
      };
      // A row open or moving on the other side closes first.
      const current = layoutRef.current;
      if (
        current != null &&
        current.side !== side &&
        Math.abs(animators.root.get('x')) > AT_REST_PX
      ) {
        settle(current, 0, 'idle', () => {
          open();
          return true;
        });
        return;
      }
      open();
    },
    [animators, layoutFor, placeEntries, rootRef, settle],
  );

  const activateEntry = useCallback(
    (fire: () => boolean) => {
      const layout = layoutRef.current;
      // From the release that opens the row, not only once it rests.
      if (!isSwipeOpen(stateRef.current) || layout == null) {
        return;
      }
      const root = rootRef.current;
      if (root != null && root.contains(document.activeElement)) {
        focusRowContent(root);
      }
      if (fire()) {
        settle(layout, outTravel(), 'held');
      } else {
        settle(layout, 0, 'idle');
      }
    },
    [outTravel, rootRef, settle],
  );

  // An open row closes on a pointer landing anywhere outside it, which is
  // also how a drag on a neighbour closes it, and when a control opens
  // another row with no pointer: one row rests open at a time with no shared
  // state. It also closes when anything scrolling it moves
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
        close();
      }
    };
    const onScroll = (event: Event) => {
      const root = rootRef.current;
      const {target} = event;
      if (
        root != null &&
        (target === document ||
          (target instanceof Element && target.contains(root))) &&
        // Focus inside the row means the scroll may be the browser bringing
        // the focused entry into view (keyboard or VoiceOver): the row stays.
        !root.contains(document.activeElement)
      ) {
        close();
      }
    };
    const onRowOpened = (event: Event) => {
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
    document.addEventListener(ROW_OPENED, onRowOpened, true);
    // A scroll closes the row, as UIKit's table does.
    document.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener(ROW_OPENED, onRowOpened, true);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [close, isOpen, rootRef, state.phase]);

  // ---------------------------------------------------------------------------
  // The pan

  /** The side a drag from a closed row uncovers: toward the inline end is leading. */
  const sideFor = (dx: number, inlineSign: 1 | -1): SwipeSide =>
    dx * inlineSign > 0 ? 'leading' : 'trailing';

  // Two thresholds. The touch is claimed from the browser at `claim` px of
  // sideways travel, before a browser commits to scrolling it; the swipe
  // itself begins where UIKit's does, at `hysteresis` px, and starts from 0
  // there. In between the row does whatever it was doing (resting,
  // settling) and the browser does nothing.
  const begin = (pan: PanGestureRecognizer) => {
    const root = rootRef.current;
    if (root == null) {
      return;
    }
    const inlineSign: 1 | -1 = isRtlElement(root) ? -1 : 1;
    const x = animators.root.get('x');
    // An open or moving row continues on its side (closing it or going
    // further); a closed one takes the side the finger moves toward.
    const side: SwipeSide =
      Math.abs(x) > AT_REST_PX
        ? x * inlineSign > 0
          ? 'leading'
          : 'trailing'
        : sideFor(pan.totalTranslation().x, inlineSign);
    const layout = layoutFor(side, root);
    const rowWidth = root.clientWidth;
    placeEntries(layout);
    dragRef.current = {
      baseTravel: 0,
      canConfirm: latestRef.current.canConfirm(side),
      confirmAt: confirmPoint(layout.openWidth, rowWidth),
      isArmed: false,
      isFinger: isFingerContact(pan),
      viaScroll: pan.trackedTouches[0]?.scrollType != null,
      layout,
      raw: 0,
      rowWidth,
      started: false,
      startSign: 1,
      wasConfirmed: false,
    };
    track(pan);
  };

  const track = (pan: PanGestureRecognizer) => {
    const drag = dragRef.current;
    if (drag == null) {
      return;
    }
    const {layout} = drag;
    // The finger's travel toward the side since it landed.
    const along =
      pan.totalTranslation().x * physicalSign(layout.side, layout.inlineSign);
    // UIKit's dead zone: the swipe counts from where the finger crosses it.
    const threshold = SWIPE.hysteresis;
    if (!drag.started) {
      if (Math.abs(along) < threshold) {
        return;
      }
      // The swipe begins: the row is caught where it is, and the tracking
      // spring takes over from its presentation value and velocity.
      drag.started = true;
      drag.startSign = Math.sign(along);
      drag.baseTravel = travelNow(layout);
      setSwipeState({
        isArmed: drag.isArmed,
        phase: 'dragging',
        side: layout.side,
      });
    }
    // The threshold's travel is not part of the swipe, as in UIKit: the
    // swipe counts from where the finger crossed it.
    const swipe = along - drag.startSign * threshold;
    const raw = Math.max(0, drag.baseTravel + swipe);
    drag.raw = raw;
    // The swipe's track rule (swipeRelease.ts): the full swipe confirms on
    // the finger's travel, not the row's (which trails it on the spring), and
    // only when the outermost entry can fire; confirmed, the row runs ahead
    // of the finger to UIKit's confirmation offset; backed out, it follows
    // the finger again.
    const sign = physicalSign(layout.side, layout.inlineSign);
    const step = swipeTrackRule({
      sign,
      confirmAt: drag.confirmAt,
      canConfirm: drag.canConfirm,
      rowWidth: drag.rowWidth,
    })(sign * raw, {
      isConfirmed: drag.isArmed,
      wasConfirmed: drag.wasConfirmed,
    });
    const isArmed = step.state.isConfirmed;
    const flipped = isArmed !== drag.isArmed;
    drag.isArmed = isArmed;
    drag.wasConfirmed = step.state.wasConfirmed;
    if (flipped) {
      setSwipeState({isArmed, phase: 'dragging', side: layout.side});
    }
    const travel = step.position * sign;
    const confirm = isArmed ? 1 : 0;
    const follow = drag.viaScroll ? TRACKPAD_SPRING : (step.follow ?? SWIPE.tracking);
    if (animators.root.reducedMotion() === 'off') {
      void springTo(layout, travel, follow, confirm);
    } else if (flipped) {
      // Confirming and backing out are changes of state, not the finger's
      // drag: under Reduce Motion they cross-fade (design:reduced-motion
      // DR2), and the moves leave that fade alone until it ends.
      void springTo(layout, travel, follow, confirm);
      const fade = reducedMotionFade(rootRef.current);
      drag.dipUntil =
        fade == null ? undefined : performance.now() + fade.duration;
    } else if (drag.dipUntil == null || performance.now() >= drag.dipUntil) {
      // Otherwise the row follows the finger one for one: the finger's own
      // drag is direct manipulation (design:reduced-motion).
      drag.dipUntil = undefined;
      moveTo(layout, travel, confirm);
    }
  };

  const release = (pan: PanGestureRecognizer) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag == null) {
      return;
    }
    // A claimed touch that never became a swipe changed nothing: the row
    // carries on as it is, a settle under it landing as it would have.
    if (!drag.started) {
      return;
    }
    const {layout} = drag;
    // The swipe's release rule (swipeRelease.ts), on the finger's travel and
    // the drag's confirmation, in the row's physical px.
    const sign = physicalSign(layout.side, layout.inlineSign);
    const landing = swipeReleaseRule(
      {
        position: animators.root.get('x'),
        finger: sign * drag.raw,
        velocity: pan.velocity().x,
      },
      {
        behavior: latestRef.current.behavior,
        openWidth: layout.openWidth,
        outTravel: outTravel(),
        sign,
        track: {isConfirmed: drag.isArmed, wasConfirmed: drag.wasConfirmed},
      },
    ).outcome;
    const cause: SettleCause = drag.isFinger ? 'release' : 'other';
    fastSettleRef.current = drag.viaScroll === true;
    if (landing === 'perform') {
      slideOutAndFire(layout, cause);
    } else if (landing === 'open') {
      settle(layout, layout.openWidth, 'resting', undefined, cause);
    } else {
      settle(layout, 0, 'idle', undefined, cause);
    }
  };

  const cancel = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag == null) {
      return;
    }
    if (!drag.started) {
      return;
    }
    settle(
      drag.layout,
      0,
      'idle',
      undefined,
      drag.isFinger ? 'release' : 'other',
    );
  };

  useGestureRecognizer(
    rootRef,
    () =>
      new PanGestureRecognizer({
        // Recognizers attach for every pointer (`spec:AST-094` FR43); a
        // finger or a pen drags the row, and a mouse never starts the swipe
        // (`spec:AST-057` FR4, FR6, AR2). A trackpad's horizontal scroll and
        // a mouse wheel's horizontal notches swipe it as a finger does
        // (DEC-7) through the pan's default scroll input (FR43): the same
        // contact, moving with the content.
        allowedPointerTypes: ['touch', 'pen'],
        allowedScrollTypes: ['continuous'],
        direction: 'horizontal',
        hysteresis: SWIPE.claim,
        maximumNumberOfTouches: 1,
        name: 'Item.swipe',
        shouldBegin: pan => {
          // A finger that is not the only one down is part of a pinch, even
          // when the first finger is off the row: the page zooms
          // (spec:AST-094 FR10).
          const doc = rootRef.current?.ownerDocument ?? document;
          if (getGestureHost(doc).fingersDown() > 1) {
            return false;
          }
          if (stateRef.current.phase === 'held') {
            return false;
          }
          if (Math.abs(animators.root.get('x')) > AT_REST_PX) {
            return true;
          }
          const root = rootRef.current;
          const inlineSign: 1 | -1 = isRtlElement(root) ? -1 : 1;
          return latestRef.current.sides[
            sideFor(pan.totalTranslation().x, inlineSign)
          ];
        },
      }),
    pan => {
      switch (pan.state) {
        case 'began':
          begin(pan);
          break;
        case 'changed':
          track(pan);
          break;
        case 'ended':
          release(pan);
          break;
        case 'cancelled':
          cancel();
          break;
        case 'possible':
        case 'failed':
          break;
      }
    },
  );

  // A tap on an open row's own content closes it and activates nothing, as
  // UIKit's dismissal does: the tap recognizes at the lift, and the host
  // keeps the click it would have made from the row (it cancels the touch,
  // or where the primary pointer is fine its click guard swallows the
  // click). Any pointer's press dismisses, since a trackpad or a mouse wheel
  // opens a row too (`spec:AST-057` DEC-7). The panel's entries keep their
  // own taps, and a closed row never offers this recognizer a touch.
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
      if (tap.state === 'ended') {
        close();
      }
    },
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (event.key === 'Escape' && isOpen()) {
        event.stopPropagation();
        close();
      }
    },
    [close, isOpen],
  );

  return {activateEntry, close, onKeyDown, panelRefs, reveal, state};
}
