// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file actionGroupTracker.ts
 * @input The elements whose actions are tracked, the actions' selector and
 *   hit expansion, and the press paint and fade clocks
 * @output Exports createActionGroupTracker, ActionGroupTracker,
 *   ActionGroupTrackerOptions and ActionGroupTarget: UIKit's tracking of a
 *   held finger across a group of targets, as a plain object any gesture
 *   recognizer can drive
 * @position The one tracker for a held finger that slides onto an action,
 *   internal to core. Gesture recognizers drive it: an alert's or an action
 *   sheet's long press on its group of actions, a menu trigger whose held
 *   finger slides into the menu it opened, a menu's list, a segmented
 *   control's segments, a page control's dots
 *
 * UIKit tracks a group of actions (an alert's, an action sheet's, a menu's)
 * as one control, not as separate buttons (measured on iOS 26.2):
 *
 * - the action under the finger highlights; sliding off it cuts its highlight
 *   and sliding onto another highlights that one; between or outside the
 *   actions nothing is highlighted;
 * - lifting runs the action under the finger, and nothing when there is none;
 *   the lifted action's highlight fades (PRESS_FADE_MS);
 * - a press the owner calls inert (an alert during its transitions) is taken
 *   but paints and runs nothing.
 *
 * Which target a finger is on is the hit test above by default; an owner
 * whose targets are a row of segments or dots resolves it itself
 * (`resolveTarget`: the nearest segment along the axis, the end one past the
 * ends), from the same rects. The finger's raw position reaches `onMove`
 * (a lens that chases it), and an owner that shows the highlight another way
 * (focus, a dimmed title) turns the paint off and follows
 * `onHighlightChange(next, previous)`.
 *
 * Nothing reads layout after a press begins: the actions' rects are read once
 * in `begin`, then hit-tested; `offsetBy` shifts them when the content moves
 * under a still finger (autoscroll). A move costs at most two attribute writes
 * and never a render. The action runs through its own `click()` inside `end`,
 * so the recognizer must call `end` from the lift's event (its touchend): that
 * keeps the user activation and every click handler. `onActivated` learns
 * whether a handler cancelled that click (`preventDefault()` vetoes, and the
 * owner can undo its visual at once). A recognizer that does not claim the
 * touch leaves the browser its own click for it; `swallowsNativeClick` takes
 * that one click, so the action runs exactly once (the swallower listens only
 * from that lift until the click, or the next press or key).
 *
 * This is core's one track-across-items loop. Menus still run their own copy
 * of it in useMenuPress.ts; the change after the in-flight menu press work
 * moves that copy here, and useMenuPress keeps only its menu-only parts (a
 * trigger's press or held finger opening the menu, the settle rule, edge
 * autoscroll, the highlight as DOM focus). Add no third copy meanwhile.
 * Nothing in core drives this tracker yet; its first adopters (the segmented
 * control and the action groups) arrive in their own changes.
 *
 * SYNC: When modified, update actionGroupTracker.test.ts
 */

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
   *   point; none between or outside them
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
   * After the lift ran an action, take the browser's own click for that
   * touch (left to it by a recognizer that did not claim the touch), so the
   * action runs once. @default false
   */
  swallowsNativeClick?: boolean;
}

export interface ActionGroupTracker {
  /**
   * A press began at viewport (x, y): read the actions' rects once and
   * highlight the one under it. An inert press is taken but tracks nothing.
   */
  begin(x: number, y: number, options?: {inert?: boolean}): void;
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
 * The browser's own click for a touch the lift already acted on: swallowed
 * once, by listeners that exist only from that lift until the click, or the
 * next press or key (whichever comes first). An activation with
 * `detail === 0` (a key, assistive technology) is not that click: it always
 * passes, and the swallower keeps waiting (`spec:AST-094` FR21).
 */
function swallowNextClick(view: Window): void {
  const disarm = () => {
    view.removeEventListener('click', onClick, true);
    view.removeEventListener('pointerdown', disarm, true);
    view.removeEventListener('keydown', disarm, true);
  };
  const onClick = (event: MouseEvent) => {
    if (!event.isTrusted || event.detail === 0) {
      return;
    }
    disarm();
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  view.addEventListener('click', onClick, true);
  view.addEventListener('pointerdown', disarm, true);
  view.addEventListener('keydown', disarm, true);
}

/**
 * Click `element` (its own `click()`, so its activation behavior and every
 * handler run as for any click) and report whether a handler cancelled it.
 * The event is read from a capture listener that exists only for the call.
 */
function clickAndReport(element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView;
  let clicked: Event | null = null;
  const grab = (event: Event) => {
    if (clicked == null && event.target === element) {
      clicked = event;
    }
  };
  view?.addEventListener('click', grab, true);
  try {
    element.click();
  } finally {
    view?.removeEventListener('click', grab, true);
  }
  return (clicked as Event | null)?.defaultPrevented === true;
}

/**
 * Create a tracker. `getOptions` is read on every call, so a hook can pass
 * the latest props without recreating it.
 */
export function createActionGroupTracker(
  getOptions: () => ActionGroupTrackerOptions,
): ActionGroupTracker {
  let actions: TrackedAction[] = [];
  let highlighted: HTMLElement | null = null;
  let beganOn: HTMLElement | null = null;
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
    for (const action of actions) {
      if (
        x >= action.left - margin &&
        x <= action.right + margin &&
        y >= action.top - margin &&
        y <= action.bottom + margin
      ) {
        return action.element;
      }
    }
    return null;
  };

  const reset = () => {
    actions = [];
    highlighted = null;
    beganOn = null;
    isTracking = false;
    isInert = false;
  };

  return {
    begin(x, y, {inert = false} = {}) {
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
      } else {
        const cancelled = clickAndReport(lifted);
        onActivated?.(lifted, cancelled);
      }
      const view = lifted.ownerDocument.defaultView;
      if (swallowsNativeClick === true && view != null) {
        swallowNextClick(view);
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
