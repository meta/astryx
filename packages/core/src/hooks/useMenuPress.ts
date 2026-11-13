// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useMenuPress.ts
 * @input The menu root, its trigger, the enabled-row selector, and callbacks
 *   for opening, highlighting, activating and dismissing
 * @output useMenuPress, the marker attributes and the activation mark
 * @position Core hook for DropdownMenu, ContextMenu, DropdownMenuSubMenu,
 *   Selector, MenuBottomSheetActionList and the navigation menus. The
 *   transition table lives in menuPressGesture.ts.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 * - /packages/core/src/hooks/useMenuPress.doc.mjs
 * - /packages/core/src/hooks/useMenuPress.test.tsx
 * - /packages/core/src/hooks/menuPressGesture.ts
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {currentGesture} from '../Layer/gestureCounter';
import {useCommittedRef} from './useCommittedRef';
import {isInputShield} from '../Layer/inputHold';
import {
  IDLE_MENU_PRESS,
  menuPressTransition,
  type MenuPressOutcome,
  type MenuPressInput,
  type MenuPressState,
  type MenuPressPointerType,
} from './menuPressGesture';
import {MENU_PRESS_MARKER} from './menuPressMarker';
import {
  useLongPressDetector,
  type LongPressDetectorHandlers,
  type LongPressTolerance,
} from './useLongPress';
import {LONG_PRESS_DURATION_MS} from '../motion/uikit/longPress';
import {DELAYS_CONTENT_TOUCHES_MS} from '../motion/uikit/scroll';
import {isInsideScrollView} from '../utils/scrollView';
import {edgeAutoscroll} from '../utils/edgeAutoscroll';
import {subscribeInput} from '../utils/inputStream';
import {focusForLastInput} from '../utils/focusReturn';
import {useInteractionModalityTrackingFor} from '../utils/interactionModality';
import {
  clearMenuPressLit,
  holdMenuPressPaint,
  markMenuPressLit,
  releaseMenuPressPaint,
} from '../privateAttributes/menuPressLit.stylex';
import {
  __resetClickGuardForTest,
  armClickGuard,
  CLICK_GUARD_WINDOW_MS,
  withoutClickGuard,
} from '../utils/clickGuard';

export {MENU_PRESS_MARKER};
const MENU_PRESS_ROOT_SELECTOR = `[${MENU_PRESS_MARKER}]`;
/**
 * Carried by a menu root that another root renders beside itself rather than
 * inside it, naming that root's `id`: the menu of a sub-menu with a header or
 * footer, in a dialog beside the root's menu, is nested in that root for the
 * press model, as a flyout inside the root's DOM is. Nothing else beside the
 * root carries it, so a picker placed in a header or footer stays its own root.
 */
export const MENU_PRESS_SURFACE_ATTR = 'data-astryx-menu-press-surface';

/**
 * How long after a tracked release the browser's click is still swallowed:
 * the shared click guard's window (utils/clickGuard.ts).
 */
export const MENU_PRESS_STRAY_CLICK_MS = CLICK_GUARD_WINDOW_MS;
/**
 * How long a finger rests on the trigger before the menu opens under it,
 * with the 'pointer' touch model and no `longPressDelayMs`. A tap released
 * sooner opens the menu through the trigger's click.
 */
export const MENU_PRESS_LONG_PRESS_MS = LONG_PRESS_DURATION_MS;

/**
 * How far a finger held on a DropdownMenu trigger may move before the open,
 * in CSS px, under every primary pointer. It is the same 13 pt that a
 * trigger in a scroll view allows: a 12 pt move still opens a native menu.
 * ContextMenu keeps the long press's own allowable movement.
 */
export const MENU_PRESS_TRIGGER_DRIFT_PX = 13;

const TRIGGER_TOLERANCE: LongPressTolerance = {
  moveCancelPx: MENU_PRESS_TRIGGER_DRIFT_PX,
};

/** What the trigger half reads and drives of the model. */
interface MenuTriggerContext {
  readonly optionsRef: RefObject<{
    isEnabled?: boolean;
    onTriggerPress?: (pointerType: MenuPressPointerType) => boolean;
    touchModel?: 'pointer' | 'uikit';
    isInScrollView?: (control: Element) => boolean;
  }>;
  readonly gestureRef: RefObject<MenuPressState<HTMLElement>>;
  // The model's own state changes through these calls, never through a
  // write to one of its refs. React Compiler reads a write through a hook
  // argument as mutating it.
  /** Marks the gesture whose long press opened the menu. */
  readonly setTriggerGesture: (gesture: number | null) => void;
  /**
   * This render's two hold detectors, in a scroll view or not; the model
   * keeps the one the live press uses.
   */
  readonly setHoldDetectors: (detectors: {
    plain: LongPressDetectorHandlers;
    scroller: LongPressDetectorHandlers;
  }) => void;
  /**
   * Starts the live press's hold, in a scroll view or not, at a point, with
   * the press's own tolerance when it has one.
   */
  readonly startHold: (
    kind: 'plain' | 'scroller',
    at: {x: number; y: number},
    tolerance?: LongPressTolerance,
  ) => void;
  readonly setLastPointerEvent: (event: PointerEvent) => void;
  /** Whether the model ignores this pointer; a match is cleared. */
  readonly takeIgnoredPointer: (pointerId: number) => boolean;
  readonly installTouchMovePreventer: () => void;
  readonly step: (
    event: MenuPressInput<HTMLElement>,
    native?: PointerEvent,
  ) => void;
  readonly attach: (pointerId: number) => void;
}
/** Distance from a scrolling menu's edge within which a resting pointer scrolls. */
export const MENU_PRESS_AUTOSCROLL_ZONE_PX = 24;
const AUTOSCROLL_STEP_PX = 6;
const AUTOSCROLL_INTERVAL_MS = 16;

const FOCUSABLE_ROW_SELECTOR =
  '[tabindex], a[href], button, input, select, textarea, [contenteditable]';
const INNER_CONTROL_SELECTOR = 'a[href], button, [tabindex]';

let isModelActivation = false;

/**
 * Whether a menu row activation dispatched by the press model is in flight.
 * True for the synchronous extent of that dispatch, so a row that forwards
 * the activation to a control inside it (a link) can tell the model's click
 * from the browser's stray one.
 */
export function isMenuPressActivation(): boolean {
  return isModelActivation;
}

/** Test-only: forget an armed click guard between cases. */
export function __resetMenuPressForTest(): void {
  __resetClickGuardForTest();
}

export interface UseMenuPressOptions {
  /** The menu (or listbox) root: the surface whose rows the press picks from. */
  menuRef: RefObject<HTMLElement | null>;
  /** The control that opens the menu, when the press may start there. */
  triggerRef?: RefObject<HTMLElement | null>;
  /**
   * Selector matching the ENABLED rows. A pointer over anything else inside
   * the menu — a divider, a heading, a disabled row — highlights nothing.
   */
  itemSelector: string;
  /**
   * A mouse pressed the trigger, or a finger opened it. With no
   * `longPressDelayMs`, a finger opens it as it presses; with one, once it
   * has rested for that delay. Open the menu under the held pointer. Return
   * whether it opened; a `false` (the press closed an open menu instead) ends
   * the gesture. The click the
   * trigger receives for this same gesture is reported by
   * {@link UseMenuPressReturn.isTriggerClickFromPress} so the caller can
   * leave it alone.
   */
  onTriggerPress?: (pointerType: MenuPressPointerType) => boolean;
  /**
   * Move the highlight. `null` clears it. Defaults to moving DOM focus with
   * `preventScroll` onto the row (or the control inside it), and onto the
   * menu root when there is no row — a picker that highlights through
   * `aria-activedescendant` supplies its own.
   */
  onHighlight?: (row: HTMLElement | null) => void;
  /**
   * Act on the row under the release. Defaults to dispatching a click on the
   * row that carries the release's button and modifier keys, so the row acts
   * exactly as its own click would.
   */
  onActivate?: (row: HTMLElement, release: PointerEvent) => void;
  /** Close the menu: a MOUSE was released outside it with nothing acting. */
  onDismiss?: () => void;
  /**
   * The element to scroll while a tracked pointer rests near its edge.
   * Defaults to the menu root when it overflows; return `null` for none.
   */
  getScroller?: () => HTMLElement | null;
  /**
   * Resolve the element under a viewport point. Defaults to
   * `elementFromPoint` on the menu's own document or shadow root, falling back
   * to the event target where the document lacks it (jsdom). A test seam.
   */
  hitTest?: (x: number, y: number) => Element | null;
  /**
   * How long a finger rests on the trigger before the menu opens under it.
   * Unset, a finger on every device waits as on UIMenu: not at all in a fixed
   * bar, and 150 ms in a scroll view. The opening finger then picks after
   * UIMenu's handoff. Set, it is that wait everywhere, as released.
   */
  longPressDelayMs?: number;
  /** Whether the model is live. @default true */
  isEnabled?: boolean;
}

/**
 * The options the model runs on: the public ones, plus the touch model the
 * hook picks from the delay and the scroll-view probe.
 */
interface MenuPressConfig extends UseMenuPressOptions {
  /**
   * How a finger on the trigger opens the menu and picks from it.
   * `'pointer'`: after `longPressDelayMs`, and the opening press follows the
   * settle rule. `'uikit'`: as the finger presses on a trigger in a fixed bar,
   * or in a scroll view once the content-touch delay passes with no scroll.
   * The opening finger then picks only after UIMenu's handoff distance. A
   * mouse is unaffected.
   */
  touchModel?: 'pointer' | 'uikit';
  /**
   * Whether the trigger is in a scroll view, where the touch model waits for
   * the content-touch delay.
   */
  isInScrollView?: (control: Element) => boolean;
}

export interface UseMenuPressReturn {
  /** Spread onto the menu root: claims presses that begin inside it. */
  menuProps: {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    [MENU_PRESS_MARKER]: '';
  };
  /**
   * Spread onto the trigger: a mouse press opens. A finger opens as it
   * presses when no delay is given, or else once held for it.
   */
  triggerProps: {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    onContextMenu: (event: React.MouseEvent<HTMLElement>) => void;
  };
  /**
   * Whether the click reaching the trigger belongs to the gesture that just
   * pressed it — the press already opened or closed the menu, so the click
   * must neither toggle nor reopen it.
   */
  isTriggerClickFromPress: () => boolean;
  /** End the gesture in flight with nothing acting (the menu closed). */
  cancel: () => void;
}

/**
 * Where a pointer is, for a finger's handoff distance. Positions reach the
 * machine only under `touchModel: 'uikit'`. Without them, it keeps the settle
 * rule.
 */
function handoffPosition(
  event: PointerEvent,
  hasHandoff: boolean,
): {x?: number; y?: number} {
  return hasHandoff ? {x: event.clientX, y: event.clientY} : {};
}

function normalizePointerType(type: string): MenuPressPointerType | null {
  return type === 'mouse' || type === 'touch' || type === 'pen' ? type : null;
}

/**
 * The identifier of the touch that a pointer's touchstart started. WebKit
 * gives the touch the pointer's id. Chromium gives it its own id, so a lone
 * changed touch is the pointer's. Several changed touches, none with the
 * pointer's id, name no touch.
 */
function touchOfPointer(
  changed: TouchList | undefined,
  pointerId: number,
): number | null {
  if (changed == null) {
    return null;
  }
  const touches = Array.from(changed);
  if (touches.some(touch => touch.identifier === pointerId)) {
    return pointerId;
  }
  return touches.length === 1 ? touches[0].identifier : null;
}

function isRowFocusable(row: HTMLElement): boolean {
  return row.matches(FOCUSABLE_ROW_SELECTOR);
}

/** The outermost marked root: a flyout is a DOM descendant of its parent menu. */
function getOutermostRoot(menu: HTMLElement): HTMLElement {
  let root = menu;
  for (;;) {
    const parent =
      root.parentElement?.closest<HTMLElement>(MENU_PRESS_ROOT_SELECTOR) ??
      getSurfaceOwner(root);
    if (parent == null || parent === root) {
      return root;
    }
    root = parent;
  }
}

/**
 * The menu root that renders `menu` beside itself, if any (see
 * `MENU_PRESS_SURFACE_ATTR`). Read off the menu itself, never an ancestor, so
 * a root placed in a region of that surface is not adopted.
 */
function getSurfaceOwner(menu: HTMLElement): HTMLElement | null {
  const ownerId = menu.getAttribute(MENU_PRESS_SURFACE_ATTR);
  if (!ownerId) {
    return null;
  }
  const owner = menu.ownerDocument.getElementById(ownerId);
  return owner?.matches(MENU_PRESS_ROOT_SELECTOR) === true ? owner : null;
}

/**
 * Whether `element` is inside the menu tree whose outermost root is `root`:
 * inside the root itself, or inside a menu nested in it through a surface
 * the root renders beside itself. Anything else in such a surface (a header
 * field, say) is outside the menu, as the root's own regions are.
 */
function isInMenuTree(element: Element, root: HTMLElement): boolean {
  if (root.contains(element)) {
    return true;
  }
  const owner = element.closest<HTMLElement>(MENU_PRESS_ROOT_SELECTOR);
  return owner != null && getOutermostRoot(owner) === root;
}

interface ResolvedPoint {
  row: HTMLElement | null;
  isInMenu: boolean;
  isOnTrigger: boolean;
}

/**
 * The press model for a menu: the row under the release acts, the highlight
 * follows a held pointer, and a mouse opens the menu on press.
 *
 * - The document tracks the pointer by `pointerId`. A finger's events stay
 *   with the element it landed on, so the menu never sees a finger that slid
 *   onto it.
 * - The release acts on its row as the row's own click would, with the
 *   release's button and modifier keys.
 * - The browser's stray `click` after a tracked release is swallowed at the
 *   window, in the capture phase. A click with `detail === 0` always passes.
 * - With no `longPressDelayMs`, a finger opens the menu as it presses the
 *   trigger, after the content-touch delay inside a scroll view. It picks
 *   once it travels the 10 px handoff. With a delay set, a finger held that
 *   long opens it, and the settle rule decides its release.
 * - `pointercancel`, a second pointer, or a window blur ends the gesture, and
 *   nothing acts.
 * - A pointer that rests near the edge of an overflowing menu scrolls it.
 * - The root carries `data-astryx-menu-press`, so a nested flyout can tell
 *   which level owns a press.
 *
 * @example
 * ```
 * const menuPress = useMenuPress({
 *   menuRef: listRef,
 *   triggerRef: buttonRef,
 *   itemSelector: MENU_ITEM_SELECTOR,
 *   onTriggerPress: () => openMenu(),
 *   onDismiss: closeMenu,
 * });
 * <button {...menuPress.triggerProps} onClick={e => {
 *   if (menuPress.isTriggerClickFromPress()) return;
 *   toggle();
 * }} />
 * <div ref={listRef} role="menu" {...menuPress.menuProps}>…</div>
 * ```
 */
export function useMenuPress(input: UseMenuPressOptions): UseMenuPressReturn {
  // The touch model is the hook's own: an untyped caller's `touchModel` does
  // not reach the model.
  const {touchModel: _touchModel, ...publicOptions} = input as MenuPressConfig;
  // An unset delay follows UIMenu for a finger on every device, with its
  // scroll-view wait. A set one keeps the released wait.
  const options: MenuPressConfig = {
    ...publicOptions,
    touchModel:
      publicOptions.longPressDelayMs === undefined ? 'uikit' : 'pointer',
    isInScrollView: isInsideScrollView,
  };
  const optionsRef = useCommittedRef(options);
  // The highlight, and the hover focus of the rows in this menu, follow the
  // last input, which this tracks for the menu's own document.
  useInteractionModalityTrackingFor(options.menuRef);

  const gestureRef = useRef<MenuPressState<HTMLElement>>(IDLE_MENU_PRESS);
  const pointerIdRef = useRef<number | null>(null);
  const touchIdentifierRef = useRef<number | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  // `useLongPress` detects the held finger, as in ContextMenu, so the hold
  // time and the movement tolerance have one home. A ref holds the handle,
  // because the pointer handlers below are stable and the hook is created
  // after `fireLongPress`.
  const longPressApiRef = useRef<LongPressDetectorHandlers | null>(null);
  const holdKindRef = useRef<'plain' | 'scroller'>('plain');
  const touchMovePreventerRef = useRef<(() => void) | null>(null);
  // The edge autoscroll running now: its scroller, its direction, and the
  // re-read of the row under the resting pointer after each step.
  const autoscrollRef = useRef<{
    scroller: HTMLElement;
    direction: 1 | -1;
    reread: () => void;
  } | null>(null);
  const [autoscroll] = useState(() =>
    edgeAutoscroll({
      intervalMs: AUTOSCROLL_INTERVAL_MS,
      immediate: true,
      step: () => (autoscrollRef.current?.direction ?? 0) * AUTOSCROLL_STEP_PX,
      apply: delta => {
        const running = autoscrollRef.current;
        if (running == null) {
          return 0;
        }
        const before = running.scroller.scrollTop;
        running.scroller.scrollTop = before + delta;
        const moved = running.scroller.scrollTop - before;
        if (moved === 0) {
          // The edge is reached. There is nothing more to show.
          autoscrollRef.current = null;
          return 0;
        }
        running.reread();
        return moved;
      },
    }),
  );
  const lastPointerEventRef = useRef<PointerEvent | null>(null);
  const triggerGestureRef = useRef<number | null>(null);
  // The second pointer that ended a gesture must not start the next one.
  const ignoredPointerIdRef = useRef<number | null>(null);

  const getDocument = useCallback((): Document => {
    return (
      optionsRef.current.menuRef.current?.ownerDocument ??
      optionsRef.current.triggerRef?.current?.ownerDocument ??
      document
    );
  }, [optionsRef]);

  const resolvePoint = useCallback(
    (event: PointerEvent): ResolvedPoint => {
      const {menuRef, triggerRef, itemSelector, hitTest} = optionsRef.current;
      const menu = menuRef.current;
      const doc = getDocument();
      let element: Element | null;
      if (hitTest != null) {
        element = hitTest(event.clientX, event.clientY);
      } else if (typeof doc.elementFromPoint === 'function') {
        // Hit-test in the menu's own tree: inside a shadow root the document
        // answers with the shadow host, never the row under the pointer.
        const tree = menu?.getRootNode();
        const scope: Pick<Document, 'elementFromPoint' | 'elementsFromPoint'> =
          tree != null &&
          tree !== doc &&
          typeof (tree as ShadowRoot).elementFromPoint === 'function'
            ? (tree as ShadowRoot)
            : doc;
        element = scope.elementFromPoint(event.clientX, event.clientY);
        if (
          isInputShield(element) &&
          typeof scope.elementsFromPoint === 'function'
        ) {
          // An input hold's shield covers the viewport while the menu enters.
          // It keeps new input away, but the press in flight still reaches the
          // row under it. So the hit test sees through that shield only.
          element =
            scope
              .elementsFromPoint(event.clientX, event.clientY)
              .find(candidate => !isInputShield(candidate)) ?? null;
        }
      } else {
        element = event.target instanceof Element ? event.target : null;
      }
      const root = menu == null ? null : getOutermostRoot(menu);
      const isInMenu =
        root != null && element != null && isInMenuTree(element, root);
      const trigger = triggerRef?.current ?? null;
      const isOnTrigger =
        trigger != null && element != null && trigger.contains(element);
      let row: HTMLElement | null = null;
      if (isInMenu && element != null) {
        row = element.closest<HTMLElement>(itemSelector);
        if (row != null && !isInMenuTree(row, root)) {
          row = null;
        }
      }
      return {row, isInMenu, isOnTrigger};
    },
    [getDocument, optionsRef],
  );

  const stopAutoscroll = useCallback(() => {
    autoscroll.stop();
    autoscrollRef.current = null;
  }, [autoscroll]);

  const litRowRef = useRef<HTMLElement | null>(null);
  const heldMenuRef = useRef<HTMLElement | null>(null);
  const endGesture = useCallback(() => {
    longPressApiRef.current?.cancel();
    if (litRowRef.current != null) {
      clearMenuPressLit(litRowRef.current);
      litRowRef.current = null;
    }
    if (heldMenuRef.current != null) {
      releaseMenuPressPaint(heldMenuRef.current);
      heldMenuRef.current = null;
    }
    touchMovePreventerRef.current?.();
    touchMovePreventerRef.current = null;
    stopAutoscroll();
    detachRef.current?.();
    detachRef.current = null;
    pointerIdRef.current = null;
    lastPointerEventRef.current = null;
    gestureRef.current = IDLE_MENU_PRESS;
  }, [stopAutoscroll]);

  const highlight = useCallback(
    (row: HTMLElement | null) => {
      // A held finger or pen marks the row it lights, for the row's pressed
      // paint. A held mouse keeps the hover tint, as on a desktop.
      const gesture = gestureRef.current;
      const isHeld =
        gesture.phase !== 'idle' && gesture.pointerType !== 'mouse';
      const lit = isHeld ? row : null;
      if (litRowRef.current !== lit) {
        if (litRowRef.current != null) {
          clearMenuPressLit(litRowRef.current);
        }
        litRowRef.current = lit;
        if (lit != null) {
          markMenuPressLit(lit);
        }
      }
      const {onHighlight, menuRef} = optionsRef.current;
      // The row the press began on stays :active where a pointer hovers, so
      // the menu holds every row but the lit one off that paint.
      const held = isHeld ? menuRef.current : null;
      if (heldMenuRef.current !== held) {
        if (heldMenuRef.current != null) {
          releaseMenuPressPaint(heldMenuRef.current);
        }
        heldMenuRef.current = held;
        if (held != null) {
          holdMenuPressPaint(held);
        }
      }
      if (onHighlight != null) {
        onHighlight(row);
        return;
      }
      // In a menu the highlight is focus. A row that takes no focus is
      // highlighted through its inner control. Over nothing, the menu root
      // holds focus, so no row is lit. A held press is pointer input, so the
      // row must not match :focus-visible. A plain focus() would keep the
      // modality of the earlier focus.
      const target =
        row == null
          ? menuRef.current
          : isRowFocusable(row)
            ? row
            : row.querySelector<HTMLElement>(INNER_CONTROL_SELECTOR);
      if (target != null && target !== getDocument().activeElement) {
        focusForLastInput(target, {preventScroll: true});
      }
    },
    [getDocument, optionsRef],
  );

  const activate = useCallback(
    (row: HTMLElement, release: PointerEvent) => {
      // Every click this dispatches passes the shared click guard.
      withoutClickGuard(() => {
        const {onActivate} = optionsRef.current;
        isModelActivation = true;
        try {
          if (onActivate != null) {
            onActivate(row, release);
            return;
          }
          // The row acts as its own click would. `detail: 0` marks a dispatched
          // activation, as a keyboard's does, so the click guard lets it pass.
          // The button and the modifiers are the release's.
          row.dispatchEvent(
            new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              composed: true,
              detail: 0,
              button: release.button,
              clientX: release.clientX,
              clientY: release.clientY,
              screenX: release.screenX,
              screenY: release.screenY,
              ctrlKey: release.ctrlKey,
              shiftKey: release.shiftKey,
              altKey: release.altKey,
              metaKey: release.metaKey,
            }),
          );
        } finally {
          isModelActivation = false;
        }
      });
    },
    [optionsRef],
  );

  const applyEffect = useCallback(
    (
      effect: MenuPressOutcome<HTMLElement>,
      gesture: MenuPressState<HTMLElement>,
      native: PointerEvent | undefined,
    ) => {
      const doc = getDocument();
      switch (effect.type) {
        case 'none':
          return;
        case 'open': {
          const pointerType =
            gesture.phase === 'open' ? gesture.pointerType : 'mouse';
          triggerGestureRef.current = currentGesture();
          const didOpen =
            optionsRef.current.onTriggerPress?.(pointerType) ?? false;
          if (!didOpen) {
            endGesture();
          }
          return;
        }
        case 'highlight':
          highlight(effect.row);
          return;
        case 'clear':
          highlight(null);
          return;
        case 'act': {
          // Detach before acting: the activation usually closes the menu.
          endGesture();
          // Once armed, the one swallower stays installed.
          armClickGuard(doc, {
            staysInstalled: true,
            cancelsTouchEnd: native?.pointerType === 'touch',
            touchIdentifier: touchIdentifierRef.current ?? undefined,
          });
          if (native != null) {
            activate(effect.row, native);
          }
          return;
        }
        case 'withdraw': {
          // The window's blur withdrew a finger's gesture. It stays tracked to
          // its release, but nothing drives the menu any more (the hold, the
          // autoscroll, the page lock). A row a finger lit clears.
          longPressApiRef.current?.cancel();
          stopAutoscroll();
          touchMovePreventerRef.current?.();
          touchMovePreventerRef.current = null;
          if (effect.clear === true) {
            highlight(null);
          }
          return;
        }
        case 'settle': {
          // A finger's lit row clears on a cancel, on every surface. The
          // machine sets `clear` only for a finger or pen, so a mouse keeps its
          // highlight.
          if (effect.clear === true) {
            highlight(null);
          }
          endGesture();
          if (effect.stray) {
            armClickGuard(doc, {
              staysInstalled: true,
              cancelsTouchEnd: native?.pointerType === 'touch',
              touchIdentifier: touchIdentifierRef.current ?? undefined,
            });
          }
          if (effect.dismiss) {
            optionsRef.current.onDismiss?.();
          }
          return;
        }
      }
    },
    [activate, endGesture, getDocument, highlight, optionsRef, stopAutoscroll],
  );

  const step = useCallback(
    (event: MenuPressInput<HTMLElement>, native?: PointerEvent) => {
      const result = menuPressTransition(gestureRef.current, event);
      gestureRef.current = result.gesture;
      applyEffect(result.effect, result.gesture, native);
    },
    [applyEffect],
  );
  // The trigger context is built once, so it calls `step` through this ref.
  const stepRef = useCommittedRef(step);

  const getScroller = useCallback((): HTMLElement | null => {
    const {getScroller: custom, menuRef} = optionsRef.current;
    if (custom != null) {
      return custom();
    }
    const menu = menuRef.current;
    if (menu == null) {
      return null;
    }
    return menu.scrollHeight > menu.clientHeight + 1 ? menu : null;
  }, [optionsRef]);

  const updateAutoscroll = useCallback(
    (event: PointerEvent) => {
      if (gestureRef.current.phase !== 'tracking') {
        stopAutoscroll();
        return;
      }
      const scroller = getScroller();
      if (scroller == null) {
        stopAutoscroll();
        return;
      }
      const rect = scroller.getBoundingClientRect();
      if (rect.height <= 0) {
        stopAutoscroll();
        return;
      }
      let direction: 1 | -1 | 0 = 0;
      if (event.clientY <= rect.top + MENU_PRESS_AUTOSCROLL_ZONE_PX) {
        direction = -1;
      } else if (event.clientY >= rect.bottom - MENU_PRESS_AUTOSCROLL_ZONE_PX) {
        direction = 1;
      }
      if (direction === 0) {
        stopAutoscroll();
        return;
      }
      if (autoscrollRef.current?.direction === direction) {
        return;
      }
      stopAutoscroll();
      autoscrollRef.current = {
        scroller,
        direction,
        // The rows moved under the resting pointer: re-read the row under it.
        reread: () => {
          const last = lastPointerEventRef.current;
          if (last != null) {
            const point = resolvePoint(last);
            step(
              {
                type: 'move',
                row: point.row,
                isInMenu: point.isInMenu,
                time: Date.now(),
              },
              last,
            );
          }
        },
      };
      autoscroll.update();
    },
    [autoscroll, getScroller, resolvePoint, step, stopAutoscroll],
  );

  const attach = useCallback(
    (pointerId: number) => {
      detachRef.current?.();
      const doc = getDocument();
      const view = doc.defaultView;
      pointerIdRef.current = pointerId;
      touchIdentifierRef.current = null;

      // The touchstart after this pointerdown names the touch, so the guard
      // at the lift cancels only that touch's touchend.
      let stopTouchStart: (() => void) | null = null;
      if (view != null) {
        stopTouchStart = subscribeInput(view, 'touchstart', event => {
          stopTouchStart?.();
          stopTouchStart = null;
          touchIdentifierRef.current = touchOfPointer(
            event.changedTouches,
            pointerId,
          );
        });
      }
      const onMove = (event: PointerEvent) => {
        if (event.pointerId !== pointerIdRef.current) {
          return;
        }
        lastPointerEventRef.current = event;
        const gesture = gestureRef.current;
        if (gesture.phase === 'triggerPress') {
          // A finger that moves past the drift allowance is scrolling, not
          // holding.
          const isPending = longPressApiRef.current?.moveTo({
            x: event.clientX,
            y: event.clientY,
          });
          if (isPending === false) {
            step({type: 'cancel'});
          }
          return;
        }
        const point = resolvePoint(event);
        step(
          {
            type: 'move',
            row: point.row,
            isInMenu: point.isInMenu,
            time: Date.now(),
            ...handoffPosition(
              event,
              optionsRef.current.touchModel === 'uikit',
            ),
          },
          event,
        );
        updateAutoscroll(event);
      };
      const onUp = (event: PointerEvent) => {
        if (event.pointerId !== pointerIdRef.current) {
          return;
        }
        const point = resolvePoint(event);
        step(
          {
            type: 'up',
            row: point.row,
            isInMenu: point.isInMenu,
            isOnTrigger: point.isOnTrigger,
            time: Date.now(),
            ...handoffPosition(
              event,
              optionsRef.current.touchModel === 'uikit',
            ),
          },
          event,
        );
      };
      const onCancel = (event: PointerEvent) => {
        if (event.pointerId !== pointerIdRef.current) {
          return;
        }
        step({type: 'cancel'});
      };
      const onOtherPointerDown = (event: PointerEvent) => {
        // Any press ends a withdrawn gesture: its finger lifted where the
        // page could not see it, and the new press's click must act.
        if (gestureRef.current.phase === 'withdrawn') {
          step({type: 'cancel'});
          return;
        }
        // A second pointer ends the gesture: two fingers are a pinch or a
        // scroll, never a pick.
        if (event.pointerId !== pointerIdRef.current) {
          ignoredPointerIdRef.current = event.pointerId;
          step({type: 'cancel'});
        }
      };
      const onBlur = () => {
        // A finger's or pen's gesture is withdrawn, not ended. The browser can
        // keep the touch alive past the blur, so the gesture stays tracked on
        // these listeners until its release. That release acts on nothing, and
        // its click is swallowed. A mouse press ends as a cancel and keeps its
        // click.
        step({type: 'withdraw'});
      };

      doc.addEventListener('pointermove', onMove, true);
      doc.addEventListener('pointerup', onUp, true);
      doc.addEventListener('pointercancel', onCancel, true);
      doc.addEventListener('pointerdown', onOtherPointerDown, true);
      view?.addEventListener('blur', onBlur);
      detachRef.current = () => {
        stopTouchStart?.();
        doc.removeEventListener('pointermove', onMove, true);
        doc.removeEventListener('pointerup', onUp, true);
        doc.removeEventListener('pointercancel', onCancel, true);
        doc.removeEventListener('pointerdown', onOtherPointerDown, true);
        view?.removeEventListener('blur', onBlur);
      };
    },
    [getDocument, optionsRef, resolvePoint, step, updateAutoscroll],
  );

  // `touch-action` was decided when the finger landed; the page must not
  // scroll under a finger that is now driving a menu. Taken off when the
  // gesture ends.
  const installTouchMovePreventer = useCallback(() => {
    touchMovePreventerRef.current?.();
    const doc = getDocument();
    const prevent = (event: TouchEvent) => {
      if (event.cancelable) {
        event.preventDefault();
      }
    };
    doc.addEventListener('touchmove', prevent, {passive: false, capture: true});
    touchMovePreventerRef.current = () => {
      doc.removeEventListener('touchmove', prevent, true);
    };
  }, [getDocument]);

  // The trigger half below drives the model through this stable context.
  const installRef = useCommittedRef(installTouchMovePreventer);
  const attachRef = useCommittedRef(attach);
  const holdDetectorsRef = useRef<{
    plain: LongPressDetectorHandlers;
    scroller: LongPressDetectorHandlers;
  } | null>(null);
  const [triggerContext] = useState<MenuTriggerContext>(() => ({
    optionsRef,
    gestureRef,
    setTriggerGesture: gesture => {
      triggerGestureRef.current = gesture;
    },
    setHoldDetectors: detectors => {
      holdDetectorsRef.current = detectors;
      longPressApiRef.current =
        holdKindRef.current === 'scroller'
          ? detectors.scroller
          : detectors.plain;
    },
    startHold: (kind, at, tolerance) => {
      holdKindRef.current = kind;
      const detectors = holdDetectorsRef.current;
      if (detectors == null) {
        return;
      }
      const hold = kind === 'scroller' ? detectors.scroller : detectors.plain;
      longPressApiRef.current = hold;
      hold.start(at, tolerance);
    },
    setLastPointerEvent: event => {
      lastPointerEventRef.current = event;
    },
    takeIgnoredPointer: pointerId => {
      if (pointerId !== ignoredPointerIdRef.current) {
        return false;
      }
      ignoredPointerIdRef.current = null;
      return true;
    },
    installTouchMovePreventer: () => installRef.current(),
    step: (event, native) => stepRef.current(event, native),
    attach: pointerId => attachRef.current(pointerId),
  }));

  const handleMenuPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const {menuRef, isEnabled = true} = optionsRef.current;
      const menu = menuRef.current;
      if (!isEnabled || menu == null) {
        return;
      }
      if (event.pointerId === ignoredPointerIdRef.current) {
        ignoredPointerIdRef.current = null;
        return;
      }
      if (gestureRef.current.phase !== 'idle') {
        // A second pointer landed inside the menu.
        step({type: 'cancel'});
        return;
      }
      const pointerType = normalizePointerType(event.pointerType);
      if (pointerType == null) {
        return;
      }
      if (pointerType === 'mouse' && event.button !== 0) {
        return;
      }
      // The innermost model owns the press: a flyout is a DOM descendant of
      // its parent menu, and both would otherwise track the same pointer.
      const target = event.target as Element | null;
      if (target?.closest(MENU_PRESS_ROOT_SELECTOR) !== menu) {
        return;
      }
      if (pointerType !== 'mouse') {
        // Cancelling pointerdown stops the compatibility mouse events that a
        // finger fires at its landing row when it lifts. That mousedown would
        // light the origin row again. touch-action controls scrolling, so
        // scrolling does not change.
        event.preventDefault();
      }
      const native = event.nativeEvent;
      attach(native.pointerId);
      lastPointerEventRef.current = native;
      const point = resolvePoint(native);
      step(
        {
          type: 'down',
          target: 'menu',
          pointerType,
          row: point.row,
          time: Date.now(),
        },
        native,
      );
    },
    [attach, optionsRef, resolvePoint, step],
  );

  const isTriggerClickFromPress = useCallback((): boolean => {
    return (
      triggerGestureRef.current != null &&
      triggerGestureRef.current === currentGesture()
    );
  }, []);

  const cancel = useCallback(() => {
    // The host closed the menu under the gesture: end it with no effect of
    // its own.
    endGesture();
  }, [endGesture]);

  // Syncs the document listeners of the menu gesture counter with this mount.
  // Unmount ends the gesture.
  useEffect(() => {
    // Install the gesture counter's listeners before the first press.
    currentGesture();
    return () => {
      endGesture();
    };
  }, [endGesture]);

  const surface = useMemo<Omit<UseMenuPressReturn, 'triggerProps'>>(
    () => ({
      menuProps: {
        onPointerDown: handleMenuPointerDown,
        [MENU_PRESS_MARKER]: '',
      },
      isTriggerClickFromPress,
      cancel,
    }),
    [handleMenuPointerDown, isTriggerClickFromPress, cancel],
  );

  // The trigger half. A menu that never spreads `triggerProps` never runs it.
  const ctx = triggerContext;
  const fireLongPress = useCallback(() => {
    const gesture = ctx.gestureRef.current;
    if (gesture.phase !== 'triggerPress') {
      return;
    }
    ctx.setTriggerGesture(currentGesture());
    const didOpen =
      ctx.optionsRef.current.onTriggerPress?.(gesture.pointerType) ?? false;
    if (!didOpen) {
      ctx.step({type: 'cancel'});
      return;
    }
    ctx.installTouchMovePreventer();
    ctx.step({type: 'opened', time: Date.now()});
  }, [ctx]);

  // The long-press detector ContextMenu uses, fed from this model's pointer
  // stream. Only its timer, hold time and drift allowance are used. Under the
  // touch model a trigger in a fixed bar opens on press. In a scroll view it
  // waits for the content-touch delay, so a scroll can claim the touch.
  const isUikit = options.touchModel === 'uikit';
  const pointerHoldMs = options.longPressDelayMs ?? MENU_PRESS_LONG_PRESS_MS;
  const plainHold = useLongPressDetector({
    onLongPress: fireLongPress,
    delayMs: pointerHoldMs,
  });
  const scrollerHold = useLongPressDetector({
    onLongPress: fireLongPress,
    delayMs: isUikit ? DELAYS_CONTENT_TOUCHES_MS : pointerHoldMs,
    ...(isUikit ? {moveCancelPx: MENU_PRESS_TRIGGER_DRIFT_PX} : {}),
  });
  ctx.setHoldDetectors({plain: plainHold, scroller: scrollerHold});

  const handleTriggerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const {isEnabled = true} = ctx.optionsRef.current;
      if (ctx.takeIgnoredPointer(event.pointerId)) {
        return;
      }
      if (!isEnabled || ctx.gestureRef.current.phase !== 'idle') {
        return;
      }
      const pointerType = normalizePointerType(event.pointerType);
      if (pointerType == null || event.button !== 0) {
        return;
      }
      if (pointerType === 'mouse' && event.ctrlKey) {
        // Control-click is the context menu's on macOS.
        return;
      }
      const native = event.nativeEvent;
      const down = {
        type: 'down',
        target: 'trigger',
        pointerType,
        row: null,
        time: Date.now(),
      } as const;
      const isUikitFinger =
        pointerType !== 'mouse' &&
        ctx.optionsRef.current.touchModel === 'uikit';
      // Only the touch model waits differently inside a scroll view, so only
      // it asks the probe.
      const inScrollView =
        isUikitFinger &&
        (ctx.optionsRef.current.isInScrollView?.(event.currentTarget) ?? false);
      if (isUikitFinger && !inScrollView) {
        // Stop the finger's compatibility mouse events. Their mousedown would
        // take focus back from the menu.
        event.preventDefault();
        ctx.attach(native.pointerId);
        ctx.setLastPointerEvent(native);
        ctx.step(down, native);
        fireLongPress();
        return;
      }
      ctx.attach(native.pointerId);
      ctx.setLastPointerEvent(native);
      if (pointerType !== 'mouse') {
        ctx.startHold(
          inScrollView ? 'scroller' : 'plain',
          {x: native.clientX, y: native.clientY},
          TRIGGER_TOLERANCE,
        );
      }
      ctx.step(down, native);
    },
    [ctx, fireLongPress],
  );

  const handleTriggerContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      // A finger held on the trigger is opening the menu, not asking for the
      // browser's own context menu.
      const gesture = ctx.gestureRef.current;
      if (gesture.phase !== 'idle' && gesture.pointerType !== 'mouse') {
        event.preventDefault();
      }
    },
    [ctx],
  );

  const triggerProps = useMemo(
    () => ({
      onPointerDown: handleTriggerPointerDown,
      onContextMenu: handleTriggerContextMenu,
    }),
    [handleTriggerPointerDown, handleTriggerContextMenu],
  );
  return useMemo(() => ({...surface, triggerProps}), [surface, triggerProps]);
}
