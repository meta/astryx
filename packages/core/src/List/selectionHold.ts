// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file selectionHold.ts
 * @input A list row under an activation target, the press layer's held state
 *   (the `cell` style of interactionOverlay.stylex.ts), the motion
 *   foundation's animator and Bézier solver (motion/), and the
 *   in-transition deselect clock and curve
 *   (motion/uikit/list.ts, internal constants), and the last input's
 *   modality (focusReturn.ts) for the focus it returns
 * @output Exports `holdSelection`, which keeps a tapped list row selected
 *   while a navigation covers it and deselects it as the navigation pops
 *   (`SelectionHold`), plus its timing types
 * @position Interaction utility. A navigation container (a stack) calls it
 *   with the target of the activation that pushed; Item and TreeList rows are
 *   the rows it finds.
 *
 * UIKit's reference (iOS 26.2): the row a user taps to push stays selected
 * while the pushed screen covers it. The deselect starts when the pop does
 * (the back button, or the edge swipe beginning) and runs inside the
 * navigation transition, linearly over the transition's 0.35 s, so an
 * interactive pop scrubs it with its progress. A cancelled pop re-selects the
 * row at once. VoiceOver focus returns to the row.
 *
 * HOW IT PAINTS. The hold writes `data-astryx-press="held"` on the row, which
 * shows the press layer (the row's `::before`) at full strength; the touch
 * press controller never overwrites a value it did not write. The deselect is
 * the layer's opacity, `1 − progress`, driven by the motion foundation's
 * animator on the `::before` (Web Animations: the compositor runs it while
 * script is busy, on the caller's clock). Its curves are evaluated in closed
 * form, never read back from the DOM: `presentation` answers where the
 * highlight is at a time from the curve itself, so a finger landing
 * mid-animation starts from the value on screen.
 *
 * The deselect's clock and curve are the list table's internal constants
 * (`list.deselect`): no theme variable reaches them. Under reduced motion
 * every deselect that `animate` plays takes the animator's own Reduced
 * Motion handling (`design:reduced-motion`): no spring, opacity only, 200 ms
 * or less under a finger; the hold has no option to keep its curve.
 *
 * Progress, as the navigation measures it: 0 = the pushed screen covers the
 * row, 1 = the row is revealed. Highlight = 1 − progress.
 *
 * SSR-safe: nothing runs at import time.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/List/selectionHold.test.ts
 * - /packages/core/src/List/__tests__/ListSelectionHold.interaction.browser.spec.ts
 * - /packages/core/src/utils/interactionOverlay.stylex.ts (the held arm)
 */

import {
  createAnimator,
  type Animator,
  type MotionCurve,
} from '../motion/animator';
import {cubicBezier} from '../motion/bezier';
import {list} from '../motion/uikit/list';
import {focusForLastInput} from '../utils/focusReturn';
import {
  CELL_PRESS_PROFILE,
  PRESSABLE_ATTRIBUTE,
  PRESSED_ATTRIBUTE,
} from '../utils/pressFeedback';
import {TOUCH_QUERY} from '../utils/touchPresentation';

/** The press state a hold writes; owned by the hold, never by the controller. */
export const HELD_PRESS_STATE = 'held';

/**
 * Written on a held row once its deselect has begun (a pop's animation or an
 * interactive pop's first frame) and removed by a cancel: a deselecting UIKit
 * cell shows its separators again in the deselect's first frame, while its
 * background is still fading, and hides them again when a cancel selects it.
 */
export const DESELECTING_ATTRIBUTE = 'data-astryx-deselecting';

interface StartTime {
  /**
   * Start on the document timeline (ms, `performance.now()` clock). Pass the
   * transition's own start to ride its clock. Without one, a deselect from
   * rest starts when the browser commits it, so a busy first frame delays it
   * rather than skipping into it (motion/animator.ts, start time).
   */
  readonly startTime?: number;
}

/**
 * UIKit's in-transition deselect: `list.deselect`, 350 ms linear.
 */
export type HoldTransitionTiming = StartTime;

/**
 * A spring, described the way the navigation describes its own: physically
 * (`stiffness`, `damping`, `mass` 1 by default), by its perceptual duration
 * and bounce (seconds; 0 settles without overshoot), or by its response and
 * damping ratio (seconds; 1 settles without overshoot).
 */
export type HoldSpring =
  | {
      readonly mass?: number;
      readonly stiffness: number;
      readonly damping: number;
    }
  | {readonly duration: number; readonly bounce: number}
  | {readonly response: number; readonly dampingRatio: number};

/** A cubic Bézier timing curve's two control points: `[x1, y1, x2, y2]`. */
export type HoldCurve = readonly [number, number, number, number];

/** A spring, as the navigation's own (`velocity` in progress per second). */
export interface HoldSpringTiming extends StartTime {
  readonly spring: HoldSpring;
  readonly velocity?: number;
}

/** A fixed duration on a Bézier curve (Reduce Motion's cross-fade). */
export interface HoldCurveTiming extends StartTime {
  readonly durationMs: number;
  readonly curve: HoldCurve;
}

export type HoldTiming =
  HoldTransitionTiming | HoldSpringTiming | HoldCurveTiming;

export interface SelectionHold {
  /** The row kept selected. */
  readonly element: HTMLElement;
  /**
   * Puts the deselect at `progress` (0 covered … 1 revealed) now: the
   * per-frame write of an interactive pop. Stops a running `animate`, whose
   * promise resolves false.
   */
  setProgress(progress: number): void;
  /**
   * Moves the deselect to `to` from its presentation value: 1 when the pop
   * completes, 0 when it cancels. With no spring or duration, UIKit's
   * in-transition deselect (350 ms linear). Resolves true when it arrives,
   * false when `setProgress`, another `animate` or `end` interrupts it.
   */
  animate(to: 0 | 1, timing?: HoldTiming): Promise<boolean>;
  /** The deselect's progress at `time` (default now), from its curve. */
  presentation(time?: number): number;
  /**
   * Focuses the row's own control (the element a screen reader lands on),
   * with a keyboard ring only when the user last used a keyboard.
   */
  focus(options?: FocusOptions): void;
  /**
   * Ends the hold. `true`: the row was revealed for good (a completed pop,
   * or the held screen left the stack another way); the row is deselected at
   * once, with no animation of its own. `false`: the pop was cancelled; the
   * row is selected again at once, and the hold stays for the next pop.
   */
  end(completed: boolean): void;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function defaultNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

/**
 * A fixed duration on a Bézier curve, from `from` to `to`, as the
 * animator plays it (seconds; velocity in units per second).
 */
function bezierCurve(
  from: number,
  to: number,
  durationMs: number,
  points: HoldCurve,
): MotionCurve {
  const ease = cubicBezier(points);
  const duration = Math.max(0, durationMs) / 1000;
  const delta = to - from;
  const progress = (t: number) => (duration <= 0 ? 1 : clamp01(t / duration));
  return {
    duration,
    at: t => from + delta * ease(progress(t)),
    velocity: t => {
      if (duration <= 0) {
        return 0;
      }
      const x = progress(t);
      const x0 = Math.max(0, x - 1e-4);
      const x1 = Math.min(1, x + 1e-4);
      return (delta * (ease(x1) - ease(x0))) / ((x1 - x0) * duration);
    },
  };
}

/**
 * The row's own control: the element focus and a screen reader land on. In a
 * tree, that is the row's treeitem, which holds the tree's roving Tab stop,
 * not a control inside it.
 */
function focusTarget(row: HTMLElement): HTMLElement {
  const item = row.closest<HTMLElement>('[role="treeitem"]');
  if (item != null) {
    return item;
  }
  if (row.matches('a[href], button, [tabindex]:not([tabindex="-1"])')) {
    return row;
  }
  return (
    row.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? row
  );
}

/**
 * The live hold of each row, by its retire function: a second hold on a row
 * takes over from the first, which goes inert without touching the row.
 */
const holds = new WeakMap<HTMLElement, () => void>();

/** A finger is the primary pointer (TOUCH_QUERY, utils/touchPresentation.ts). */
function isTouch(view: Window | null): boolean {
  return (
    view != null &&
    typeof view.matchMedia === 'function' &&
    view.matchMedia(TOUCH_QUERY).matches
  );
}

/**
 * Keeps the list row under `target` selected while a navigation covers it,
 * and returns the handle that deselects it as the navigation pops. Null when
 * `target` is not inside an enabled list row (an Item or TreeList row with an
 * action), and under a mouse: a hold is part of the one touch model, under
 * any finger (a coarse primary pointer, iOS and Android alike); with a mouse
 * the press releases at the lift as before and the caller's `hold?.` calls
 * do nothing.
 *
 * @example
 * ```
 * // In the same task as the activation that pushes:
 * const hold = holdSelection(event.target);
 * // A programmatic pop, on the transition's own clock:
 * await hold?.animate(1, {startTime});
 * hold?.end(true);
 * hold?.focus({preventScroll: true});
 * ```
 */
export function holdSelection(
  target: EventTarget | null | undefined,
  options: {readonly now?: () => number} = {},
): SelectionHold | null {
  if (typeof Element === 'undefined' || !(target instanceof Element)) {
    return null;
  }
  const row = target.closest<HTMLElement>(
    `[${PRESSABLE_ATTRIBUTE}="${CELL_PRESS_PROFILE}"]`,
  );
  if (
    row == null ||
    !isTouch(row.ownerDocument.defaultView) ||
    row.matches(':disabled, [aria-disabled="true"]') ||
    row.closest('[aria-disabled="true"]') != null
  ) {
    return null;
  }
  // A new hold takes the row from any earlier one, even mid-deselect: it
  // starts fully held, so nothing marks the row deselecting and the
  // dividers beside it stay hidden.
  holds.get(row)?.();
  row.removeAttribute(DESELECTING_ATTRIBUTE);

  const now = options.now ?? defaultNow;
  let ended = false;
  /**
   * The layer's opacity (the highlight), once something moves it; until
   * then, and after a cancel, the held state shows it at 1.
   */
  let animator: Animator | null = null;
  const layer = () => {
    animator ??= createAnimator(row, {
      pseudoElement: '::before',
      initial: {opacity: 1},
      now,
    });
    return animator;
  };
  const drop = () => {
    animator?.dispose();
    animator = null;
  };
  const retire = () => {
    drop();
    ended = true;
  };

  const presentation = (time = now()): number =>
    animator == null ? 0 : clamp01(1 - animator.get('opacity', time));

  const hold: SelectionHold = {
    element: row,

    setProgress(progress) {
      if (!ended) {
        row.setAttribute(DESELECTING_ATTRIBUTE, '');
        layer().set({opacity: 1 - clamp01(progress)});
      }
    },

    async animate(to, timing = {}) {
      if (ended) {
        return false;
      }
      // The transition's start when the caller has one; otherwise none, so
      // a deselect from rest starts with the browser's commit.
      const at = timing.startTime;
      const start = at == null ? {} : {at};
      const target = 1 - to;
      if (to === 1) {
        row.setAttribute(DESELECTING_ATTRIBUTE, '');
      } else {
        row.removeAttribute(DESELECTING_ATTRIBUTE);
      }
      const motion = layer();
      if ('spring' in timing) {
        return motion.animate(
          {opacity: target},
          {
            spring: timing.spring,
            // Progress per second; the highlight moves the other way.
            ...(timing.velocity == null
              ? {}
              : {velocity: {opacity: -timing.velocity}}),
          },
          start,
        ).finished;
      }
      const from = motion.get('opacity', at ?? now());
      const durationMs =
        'durationMs' in timing
          ? timing.durationMs
          : // The in-transition deselect covers the whole way in its clock;
            // a partial way (a pop started from a scrubbed value) takes its
            // share.
            list.deselect.navigationPopMs * Math.abs(target - from);
      const points =
        'curve' in timing ? timing.curve : list.deselect.navigationPopCurve;
      return motion.play(
        {opacity: bezierCurve(from, target, durationMs, points)},
        start,
      ).finished;
    },

    presentation,

    focus(focusOptions) {
      if (row.isConnected) {
        // The ring follows the last input (architecture:interaction-modality
        // INV1): after a finger's pop, focus lands with no keyboard ring, as
        // UIKit draws none; after a keyboard's, the ring shows where it went.
        focusForLastInput(focusTarget(row), focusOptions);
      }
    },

    end(completed) {
      if (ended) {
        return;
      }
      drop();
      row.removeAttribute(DESELECTING_ATTRIBUTE);
      if (completed) {
        ended = true;
        if (holds.get(row) === retire) {
          holds.delete(row);
        }
        if (row.getAttribute(PRESSED_ATTRIBUTE) === HELD_PRESS_STATE) {
          row.removeAttribute(PRESSED_ATTRIBUTE);
        }
      } else {
        // Selected again at once; the hold stays for the next pop.
        row.setAttribute(PRESSED_ATTRIBUTE, HELD_PRESS_STATE);
      }
    },
  };

  row.setAttribute(PRESSED_ATTRIBUTE, HELD_PRESS_STATE);
  holds.set(row, retire);
  return hold;
}
