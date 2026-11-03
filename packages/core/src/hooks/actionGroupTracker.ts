// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file actionGroupTracker.ts
 * @input The tracked elements, the action selector and hit expansion, and the
 *   press paint and fade clocks
 * @output createActionGroupTracker, ActionGroupTracker,
 *   ActionGroupTrackerOptions, ActionGroupTarget
 * @position Internal core tracker for a held finger that slides across a
 *   group of actions. Gesture recognizers drive it.
 *
 * SYNC: When modified, update actionGroupTracker.test.ts
 */

import {clickAndReport, clickForLift} from '../utils/browserClickWait';
import {armClickGuard} from '../utils/clickGuard';
import {PRESSED_ATTRIBUTE} from '../utils/pressFeedback';
import {PRESS_FADE_MS} from '../utils/pressGesture';

/** An action that is not enabled takes no highlight and does not run. */
const DISABLED = ':disabled, [aria-disabled="true"]';

/** A target the tracker measured: its element and viewport rect, px. */
export interface ActionGroupTarget {
  readonly element: HTMLElement;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface ActionGroupTrackerOptions {
  /** The elements whose actions are tracked, read when a press begins. */
  roots: () => Iterable<Element | null | undefined>;
  /** Selects the actions inside the roots. */
  itemSelector: string;
  /** How far outside an action the finger keeps it highlighted, px. */
  highlightExpansion: number;
  /**
   * Paint the highlighted action with the press attribute (`on`, then
   * `fading` at the lift). @default true
   */
  paintsHighlight?: boolean;
  /**
   * Called whenever the highlighted action changes (null: none), with the
   * one it replaces.
   */
  onHighlightChange?: (
    item: HTMLElement | null,
    previous: HTMLElement | null,
  ) => void;
  /** Runs the action under the finger at the lift. @default its own click */
  onActivate?: (item: HTMLElement) => void;
  /**
   * Picks the target for a finger at viewport (x, y) from the enabled
   * targets measured at the press's begin, in document order. Returning a
   * target past the group's ends commits the lift there wherever the finger
   * lifts.
   * @default the target whose rect, grown by `highlightExpansion`, holds the
   *   point, the one the press landed on where several do; none between or
   *   outside them
   */
  resolveTarget?: (
    x: number,
    y: number,
    targets: ReadonlyArray<ActionGroupTarget>,
  ) => HTMLElement | null;
  /** Every finger position it is given (the begin and each move), first. */
  onMove?: (x: number, y: number) => void;
  /**
   * After the lift ran an action through its own click: whether a click
   * handler cancelled it (`preventDefault()`). Not called with `onActivate`.
   */
  onActivated?: (item: HTMLElement, cancelled: boolean) => void;
  /**
   * After the lift ran an action, the shared click guard takes the browser's
   * own click for that touch, so the action runs once. A recognizer that did
   * not claim the touch leaves that click to the browser. @default false
   */
  swallowsNativeClick?: boolean;
}

export interface ActionGroupTracker {
  /**
   * A press began at viewport (x, y): read the actions' rects once and
   * highlight the one under it. An inert press is taken but tracks nothing.
   * `landed` is the node the press landed on.
   */
  begin(
    x: number,
    y: number,
    options?: {inert?: boolean; landed?: Node | null},
  ): void;
  /** The finger moved to viewport (x, y). */
  move(x: number, y: number): void;
  /**
   * The lift: the highlighted action's paint fades and the action runs.
   * Call it from the lift's event. Returns the action that ran, if any. The
   * highlight is left to the activation (no onHighlightChange): an owner
   * that shows it as focus keeps focus on the action it runs.
   */
  end(): HTMLElement | null;
  /** The press was taken away (a cancel): the highlight is cut, nothing runs. */
  cancel(): void;
  /**
   * The tracked content moved by (dx, dy) under the finger (an autoscroll):
   * shift the cached rects without reading layout.
   */
  offsetBy(dx: number, dy: number): void;
  /**
   * The targets moved in a way the owner cannot express as an offset (a
   * scroll it did not run, a view that changed): read their rects again and
   * resolve the finger's last position against them.
   */
  remeasure(): void;
  /** The action highlighted now. */
  readonly highlighted: HTMLElement | null;
  /** The target the press began on (null: none, or an inert press). */
  readonly beganOn: HTMLElement | null;
  /** Whether a press is being tracked (between begin and end or cancel). */
  readonly isTracking: boolean;
  /**
   * Finish every pending release fade now (its paint comes off) and forget
   * the press: for the owner's unmount.
   */
  dispose(): void;
}

interface TrackedAction {
  readonly element: HTMLElement;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Create a tracker. `getOptions` is read on every call, so a hook can pass
 * the latest props without recreating it.
 *
 * The tracker treats a group of actions as one control, as UIKit does:
 * - The action under the finger highlights. Between or outside the actions,
 *   nothing highlights.
 * - The lift runs the action under the finger, and its highlight fades.
 * - An inert press is taken but paints and runs nothing.
 *
 * Layout is read only in `begin`. `offsetBy` shifts the cached rects when
 * the content moves under a still finger. The action runs through its own
 * `click()` in `end`, so call `end` from the lift's event to keep the user
 * activation. useMenuPress.ts has its own copy of this loop. Do not add a
 * third copy.
 */
export function createActionGroupTracker(
  getOptions: () => ActionGroupTrackerOptions,
): ActionGroupTracker {
  let actions: TrackedAction[] = [];
  let highlighted: HTMLElement | null = null;
  let beganOn: HTMLElement | null = null;
  let landedOn: Node | null = null;
  let isTracking = false;
  let isInert = false;
  // The finger's last position: `remeasure` resolves it again.
  let lastX = 0;
  let lastY = 0;
  const fades = new Map<Element, ReturnType<typeof setTimeout>>();

  const paints = () => getOptions().paintsHighlight !== false;

  const clearFade = (element: Element) => {
    const fade = fades.get(element);
    if (fade != null) {
      clearTimeout(fade);
      fades.delete(element);
    }
  };
  const paint = (element: HTMLElement) => {
    if (!paints()) {
      return;
    }
    clearFade(element);
    element.setAttribute(PRESSED_ATTRIBUTE, 'on');
  };
  const cut = (element: HTMLElement) => {
    if (!paints()) {
      return;
    }
    clearFade(element);
    element.removeAttribute(PRESSED_ATTRIBUTE);
  };
  const release = (element: HTMLElement) => {
    if (!paints()) {
      return;
    }
    clearFade(element);
    element.setAttribute(PRESSED_ATTRIBUTE, 'fading');
    fades.set(
      element,
      setTimeout(() => {
        fades.delete(element);
        if (element.getAttribute(PRESSED_ATTRIBUTE) === 'fading') {
          element.removeAttribute(PRESSED_ATTRIBUTE);
        }
      }, PRESS_FADE_MS),
    );
  };

  const highlight = (next: HTMLElement | null) => {
    if (next === highlighted) {
      return;
    }
    const previous = highlighted;
    if (previous != null) {
      cut(previous);
    }
    highlighted = next;
    if (next != null) {
      paint(next);
    }
    getOptions().onHighlightChange?.(next, previous);
  };

  const measure = (): TrackedAction[] => {
    const {roots, itemSelector} = getOptions();
    const next: TrackedAction[] = [];
    for (const root of roots()) {
      if (root == null) {
        continue;
      }
      for (const element of root.querySelectorAll<HTMLElement>(itemSelector)) {
        if (element.matches(DISABLED)) {
          continue;
        }
        const rect = element.getBoundingClientRect();
        next.push({
          element,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        });
      }
    }
    return next;
  };

  const actionAt = (x: number, y: number): HTMLElement | null => {
    const {resolveTarget, highlightExpansion: margin} = getOptions();
    if (resolveTarget != null) {
      return actions.length === 0 ? null : resolveTarget(x, y, actions);
    }
    // Rects that share an edge, or that have no layout (a test renderer), can
    // both hold the point: the one the press landed on wins.
    let first: HTMLElement | null = null;
    for (const action of actions) {
      if (
        x >= action.left - margin &&
        x <= action.right + margin &&
        y >= action.top - margin &&
        y <= action.bottom + margin
      ) {
        if (landedOn != null && action.element.contains(landedOn)) {
          return action.element;
        }
        first ??= action.element;
      }
    }
    return first;
  };

  const reset = () => {
    actions = [];
    highlighted = null;
    beganOn = null;
    landedOn = null;
    isTracking = false;
    isInert = false;
  };

  return {
    begin(x, y, {inert = false, landed = null} = {}) {
      // A press can begin while another is tracked, when a second recognizer
      // takes over the finger (a trigger's held press, then the menu's): the
      // action the first one lit loses its paint.
      const previous = highlighted;
      if (previous != null) {
        cut(previous);
      }
      // An inert press tracks no action: nothing to paint, nothing to run.
      actions = inert ? [] : measure();
      highlighted = null;
      isTracking = true;
      isInert = inert;
      landedOn = landed;
      lastX = x;
      lastY = y;
      getOptions().onMove?.(x, y);
      const target = actionAt(x, y);
      beganOn = target;
      if (target != null) {
        highlighted = target;
        paint(target);
      }
      if (target !== previous) {
        getOptions().onHighlightChange?.(target, previous);
      }
    },
    move(x, y) {
      if (!isTracking) {
        return;
      }
      lastX = x;
      lastY = y;
      getOptions().onMove?.(x, y);
      highlight(actionAt(x, y));
    },
    end() {
      const lifted = highlighted;
      const wasTracking = isTracking;
      reset();
      if (!wasTracking || lifted == null) {
        return null;
      }
      release(lifted);
      if (lifted.matches(DISABLED)) {
        return null;
      }
      const {onActivate, onActivated, swallowsNativeClick} = getOptions();
      if (onActivate != null) {
        onActivate(lifted);
        if (swallowsNativeClick === true) {
          armClickGuard(lifted.ownerDocument);
        }
      } else {
        const cancelled =
          swallowsNativeClick === true
            ? clickForLift(lifted)
            : clickAndReport(lifted);
        onActivated?.(lifted, cancelled);
      }
      return lifted;
    },
    cancel() {
      const current = highlighted;
      const wasTracking = isTracking;
      reset();
      if (current != null) {
        cut(current);
        if (wasTracking) {
          getOptions().onHighlightChange?.(null, current);
        }
      }
    },
    offsetBy(dx, dy) {
      for (const action of actions) {
        action.left += dx;
        action.right += dx;
        action.top += dy;
        action.bottom += dy;
      }
    },
    remeasure() {
      if (!isTracking || isInert) {
        return;
      }
      actions = measure();
      highlight(actionAt(lastX, lastY));
    },
    get highlighted() {
      return highlighted;
    },
    get beganOn() {
      return beganOn;
    },
    get isTracking() {
      return isTracking;
    },
    dispose() {
      for (const [element, fade] of fades) {
        clearTimeout(fade);
        if (element.getAttribute(PRESSED_ATTRIBUTE) === 'fading') {
          element.removeAttribute(PRESSED_ATTRIBUTE);
        }
      }
      fades.clear();
      reset();
    },
  };
}
