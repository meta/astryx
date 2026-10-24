// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useMenuPress.ts
 * @input The menu root, its trigger, the enabled-row selector, and callbacks
 *   for opening, highlighting, activating and dismissing
 * @output Exports useMenuPress, the marker attribute, and the module-level
 *   activation mark
 * @position Core hook; mounted by DropdownMenu, ContextMenu,
 *   DropdownMenuSubMenu, Selector and MenuBottomSheetActionList. The pure
 *   transition table lives in menuPressGesture.ts.
 *
 * One press in a menu, from the trigger or from inside, owned end to end:
 *
 * - The pointer is tracked at DOCUMENT level by `pointerId`. A finger's
 *   pointer events stay with the element it landed on (implicit capture), so a
 *   menu container never sees a finger that slid onto it — the document does.
 * - The highlight follows the pointer (DOM focus with `preventScroll` in a
 *   menu, its indicator following the last input; a callback for a picker
 *   that highlights by index).
 * - The row under the RELEASE acts, the way its own click would, carrying the
 *   release's button and modifier keys.
 * - The browser's stray `click` for a tracked gesture is swallowed at the
 *   window in the capture phase, ahead of React's own listener. It arms at a
 *   tracked release and disarms at the next pointer press or after a short
 *   window; a click with `detail === 0` (a keyboard's or a screen reader's)
 *   always passes.
 * - A mouse press on the trigger opens the menu at once; a finger held on the
 *   trigger opens it after the long-press delay. The settle rule decides
 *   whether the opening gesture's release may act (see menuPressGesture.ts).
 * - `pointercancel`, a second pointer, or the window losing focus end the
 *   gesture with nothing acting; the model never re-implements scrolling.
 * - While a press is tracked in an overflowing menu, a pointer resting near
 *   the top or bottom edge scrolls the menu toward that edge.
 *
 * The menu root is marked `data-astryx-menu-press` so a nested flyout (a DOM
 * descendant of its parent menu) can tell which level owns a press, and so a
 * surface can be recognised as carrying this model. A menu the root renders
 * beside itself names the root with `data-astryx-menu-press-surface` and counts
 * as nested in it.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 * - /packages/core/src/hooks/useMenuPress.doc.mjs
 * - /packages/core/src/hooks/useMenuPress.test.tsx
 * - /packages/core/src/hooks/menuPressGesture.ts
 */

import {useCallback, useEffect, useMemo, useRef, type RefObject} from 'react';
import {currentGesture} from '../Layer/gestureCounter';
import {
  IDLE_MENU_PRESS,
  menuPressStep,
  type MenuPressEffect,
  type MenuPressEvent,
  type MenuPressGesture,
  type MenuPressPointerType,
} from './menuPressGesture';
import {useLongPress, type UseLongPressHandlers} from './useLongPress';
import {focusForLastInput} from '../utils/focusReturn';
import {useInteractionModalityTracking} from '../utils/interactionModality';

/** Marks a menu root that carries this press model. */
export const MENU_PRESS_MARKER = 'data-astryx-menu-press';
const MENU_PRESS_ROOT_SELECTOR = `[${MENU_PRESS_MARKER}]`;
/**
 * Carried by a menu root that another root renders beside itself rather than
 * inside it, naming that root's `id`: the menu of a sub-menu with a header or
 * footer, in a dialog beside the root's menu, is nested in that root for the
 * press model, as a flyout inside the root's DOM is. Nothing else beside the
 * root carries it, so a picker placed in a header or footer stays its own root.
 */
export const MENU_PRESS_SURFACE_ATTR = 'data-astryx-menu-press-surface';

/** How long after a tracked release the browser's click is still swallowed. */
export const MENU_PRESS_STRAY_CLICK_MS = 400;
/** How long a finger must rest on the trigger before the menu opens under it. */
export const MENU_PRESS_LONG_PRESS_MS = 500;
/** Distance from a scrolling menu's edge within which a resting pointer scrolls. */
export const MENU_PRESS_AUTOSCROLL_ZONE_PX = 24;
const AUTOSCROLL_STEP_PX = 6;
const AUTOSCROLL_INTERVAL_MS = 16;

const FOCUSABLE_ROW_SELECTOR =
  '[tabindex], a[href], button, input, select, textarea, [contenteditable]';
const INNER_CONTROL_SELECTOR = 'a[href], button, [tabindex]';

// =============================================================================
// Module state: the activation mark and the stray-click swallower
// =============================================================================

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

interface StrayClickSwallower {
  doc: Document;
  isArmed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

let swallower: StrayClickSwallower | null = null;

function disarmStrayClick(): void {
  if (swallower == null) {
    return;
  }
  swallower.isArmed = false;
  if (swallower.timer != null) {
    clearTimeout(swallower.timer);
    swallower.timer = null;
  }
}

function onWindowClickCapture(event: MouseEvent): void {
  if (swallower == null || !swallower.isArmed) {
    return;
  }
  // A keyboard's or a screen reader's activation reports detail 0, as does the
  // model's own dispatch. Those are never the browser's stray click.
  if (event.detail === 0 || isModelActivation) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  disarmStrayClick();
}

function armStrayClick(doc: Document): void {
  const view = doc.defaultView;
  if (view == null) {
    return;
  }
  if (swallower == null || swallower.doc !== doc) {
    if (swallower != null) {
      swallower.doc.defaultView?.removeEventListener(
        'click',
        onWindowClickCapture,
        true,
      );
      swallower.doc.removeEventListener('pointerdown', disarmStrayClick, true);
    }
    // The window, capture phase: ahead of React's root listener and of any
    // document listener, so no framework sees the click.
    view.addEventListener('click', onWindowClickCapture, true);
    // The next press is a new gesture; its click must never be eaten.
    doc.addEventListener('pointerdown', disarmStrayClick, true);
    swallower = {doc, isArmed: false, timer: null};
  }
  disarmStrayClick();
  swallower.isArmed = true;
  swallower.timer = setTimeout(disarmStrayClick, MENU_PRESS_STRAY_CLICK_MS);
}

/** Test-only: forget an armed swallower between cases. */
export function __resetMenuPressForTest(): void {
  disarmStrayClick();
}

// =============================================================================
// Options
// =============================================================================

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
   * A mouse pressed the trigger, or a finger has rested on it for the
   * long-press delay: open the menu under the held pointer. Return whether
   * it opened; a `false` (the press closed an open menu instead) ends the
   * gesture. The click the trigger receives for this same gesture is reported
   * by {@link UseMenuPressReturn.isTriggerClickFromPress} so the caller can
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
  /** A MOUSE was released outside the menu with nothing acting: close it. */
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
  /** @default 500 */
  longPressDelayMs?: number;
  /** Whether the model is live. @default true */
  isEnabled?: boolean;
}

export interface UseMenuPressReturn {
  /** Spread onto the menu root: claims presses that begin inside it. */
  menuProps: {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    [MENU_PRESS_MARKER]: '';
  };
  /** Spread onto the trigger: a mouse press opens; a held finger opens. */
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

// =============================================================================
// Helpers
// =============================================================================

function normalizePointerType(type: string): MenuPressPointerType | null {
  return type === 'mouse' || type === 'touch' || type === 'pen' ? type : null;
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

// =============================================================================
// Hook
// =============================================================================

/**
 * The press model for a menu: the row under the release acts, the highlight
 * follows a held pointer, a mouse opens on press. See the file header.
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
export function useMenuPress(options: UseMenuPressOptions): UseMenuPressReturn {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  // The highlight, and the hover focus of the rows in this menu, follow the
  // last input, which this tracks for the document.
  useInteractionModalityTracking();

  const gestureRef = useRef<MenuPressGesture<HTMLElement>>(IDLE_MENU_PRESS);
  const pointerIdRef = useRef<number | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  // The held finger is detected by `useLongPress`, the same hook ContextMenu
  // uses, so the hold duration and the movement tolerance have one home. The
  // handle is held in a ref because the pointer handlers below are stable
  // callbacks and the hook is created further down, once `fireLongPress`
  // exists.
  const longPressApiRef = useRef<UseLongPressHandlers | null>(null);
  const touchMovePreventerRef = useRef<(() => void) | null>(null);
  const autoscrollRef = useRef<{
    timer: ReturnType<typeof setInterval>;
    direction: 1 | -1;
  } | null>(null);
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
  }, []);

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
        const scope: Pick<Document, 'elementFromPoint'> =
          tree != null &&
          tree !== doc &&
          typeof (tree as ShadowRoot).elementFromPoint === 'function'
            ? (tree as ShadowRoot)
            : doc;
        element = scope.elementFromPoint(event.clientX, event.clientY);
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
    [getDocument],
  );

  const stopAutoscroll = useCallback(() => {
    if (autoscrollRef.current != null) {
      clearInterval(autoscrollRef.current.timer);
      autoscrollRef.current = null;
    }
  }, []);

  const endGesture = useCallback(() => {
    longPressApiRef.current?.cancel();
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
      const {onHighlight, menuRef} = optionsRef.current;
      if (onHighlight != null) {
        onHighlight(row);
        return;
      }
      // In a menu the highlight IS focus. A row whose root takes no
      // focus is highlighted through the control inside it; over nothing,
      // the menu root holds focus so no row is lit. The focus follows the
      // last input (`architecture:interaction-modality` INV1): a held press
      // is pointer input, so the row does not match :focus-visible, which a
      // plain focus() would inherit from the focus before it.
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
    [getDocument],
  );

  const activate = useCallback((row: HTMLElement, release: PointerEvent) => {
    const {onActivate} = optionsRef.current;
    isModelActivation = true;
    try {
      if (onActivate != null) {
        onActivate(row, release);
        return;
      }
      // The row acts as its own click would. `detail: 0` marks a dispatched
      // activation, as a keyboard's does, so the stray-click swallower lets
      // it through; the button and modifiers are the release's.
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
  }, []);

  // Declared before `step` so the mutual recursion through refs type-checks.
  const stepRef = useRef<
    (event: MenuPressEvent<HTMLElement>, native?: PointerEvent) => void
  >(() => {});

  const applyEffect = useCallback(
    (
      effect: MenuPressEffect<HTMLElement>,
      gesture: MenuPressGesture<HTMLElement>,
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
          armStrayClick(doc);
          if (native != null) {
            activate(effect.row, native);
          }
          return;
        }
        case 'settle': {
          endGesture();
          if (effect.stray) {
            armStrayClick(doc);
          }
          if (effect.dismiss) {
            optionsRef.current.onDismiss?.();
          }
          return;
        }
      }
    },
    [activate, endGesture, getDocument, highlight],
  );

  const step = useCallback(
    (event: MenuPressEvent<HTMLElement>, native?: PointerEvent) => {
      const result = menuPressStep(gestureRef.current, event);
      gestureRef.current = result.gesture;
      applyEffect(result.effect, result.gesture, native);
    },
    [applyEffect],
  );
  stepRef.current = step;

  // --- Edge autoscroll -----------------------------------------------

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
  }, []);

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
      const tick = () => {
        const before = scroller.scrollTop;
        scroller.scrollTop = before + direction * AUTOSCROLL_STEP_PX;
        if (scroller.scrollTop === before) {
          // The edge is reached; nothing more to reveal.
          stopAutoscroll();
          return;
        }
        // The rows moved under the resting pointer: re-read the row under it.
        const last = lastPointerEventRef.current;
        if (last != null) {
          const point = resolvePoint(last);
          stepRef.current(
            {
              type: 'move',
              row: point.row,
              isInMenu: point.isInMenu,
              time: Date.now(),
            },
            last,
          );
        }
      };
      autoscrollRef.current = {
        direction,
        timer: setInterval(tick, AUTOSCROLL_INTERVAL_MS),
      };
      tick();
    },
    [getScroller, resolvePoint, stopAutoscroll],
  );

  // --- Document-level tracking ----------------------------------------------

  const attach = useCallback(
    (pointerId: number) => {
      detachRef.current?.();
      const doc = getDocument();
      const view = doc.defaultView;
      pointerIdRef.current = pointerId;

      const onMove = (event: PointerEvent) => {
        if (event.pointerId !== pointerIdRef.current) {
          return;
        }
        lastPointerEventRef.current = event;
        const gesture = gestureRef.current;
        if (gesture.phase === 'triggerPress') {
          // A finger that travels is scrolling, not holding. The tolerance is
          // the shared hook's, so it cannot drift from ContextMenu's.
          const isPending = longPressApiRef.current?.moveTo({
            x: event.clientX,
            y: event.clientY,
          });
          if (isPending === false) {
            stepRef.current({type: 'cancel'});
          }
          return;
        }
        const point = resolvePoint(event);
        stepRef.current(
          {
            type: 'move',
            row: point.row,
            isInMenu: point.isInMenu,
            time: Date.now(),
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
        stepRef.current(
          {
            type: 'up',
            row: point.row,
            isInMenu: point.isInMenu,
            isOnTrigger: point.isOnTrigger,
            time: Date.now(),
          },
          event,
        );
      };
      const onCancel = (event: PointerEvent) => {
        if (event.pointerId !== pointerIdRef.current) {
          return;
        }
        stepRef.current({type: 'cancel'});
      };
      const onOtherPointerDown = (event: PointerEvent) => {
        // A second pointer ends the gesture: two fingers are a pinch or a
        // scroll, never a pick.
        if (event.pointerId !== pointerIdRef.current) {
          ignoredPointerIdRef.current = event.pointerId;
          stepRef.current({type: 'cancel'});
        }
      };
      const onBlur = () => {
        stepRef.current({type: 'cancel'});
      };

      doc.addEventListener('pointermove', onMove, true);
      doc.addEventListener('pointerup', onUp, true);
      doc.addEventListener('pointercancel', onCancel, true);
      doc.addEventListener('pointerdown', onOtherPointerDown, true);
      view?.addEventListener('blur', onBlur);
      detachRef.current = () => {
        doc.removeEventListener('pointermove', onMove, true);
        doc.removeEventListener('pointerup', onUp, true);
        doc.removeEventListener('pointercancel', onCancel, true);
        doc.removeEventListener('pointerdown', onOtherPointerDown, true);
        view?.removeEventListener('blur', onBlur);
      };
    },
    [getDocument, resolvePoint, updateAutoscroll],
  );

  // --- The held finger on the trigger ----------------------------

  const fireLongPress = useCallback(() => {
    const gesture = gestureRef.current;
    if (gesture.phase !== 'triggerPress') {
      return;
    }
    triggerGestureRef.current = currentGesture();
    const didOpen =
      optionsRef.current.onTriggerPress?.(gesture.pointerType) ?? false;
    if (!didOpen) {
      step({type: 'cancel'});
      return;
    }
    // `touch-action` on the trigger was decided when the finger landed; the
    // page must not scroll under a finger that is now driving a menu.
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
    step({type: 'opened', time: Date.now()});
  }, [getDocument, step]);

  // One long-press detector for the system: the same hook ContextMenu spreads
  // onto its trigger, driven here from the pointer stream this model already
  // observes. Its touch handlers go unused; the hold duration, the movement
  // tolerance and the timer are what matter, and they now have one home.
  longPressApiRef.current = useLongPress({
    onLongPress: fireLongPress,
    delayMs: options.longPressDelayMs ?? MENU_PRESS_LONG_PRESS_MS,
  });

  // --- Handlers ------------------------------------------------------------

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
        // Cancelling pointerdown suppresses the compatibility mouse events a
        // finger would otherwise fire at the row it LANDED on when it lifts —
        // the mousedown that would light the origin row a second time.
        // Scrolling is governed by touch-action and is unaffected.
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
    [attach, resolvePoint, step],
  );

  const handleTriggerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const {isEnabled = true} = optionsRef.current;
      if (event.pointerId === ignoredPointerIdRef.current) {
        ignoredPointerIdRef.current = null;
        return;
      }
      if (!isEnabled || gestureRef.current.phase !== 'idle') {
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
      attach(native.pointerId);
      lastPointerEventRef.current = native;
      if (pointerType !== 'mouse') {
        longPressApiRef.current?.start({x: native.clientX, y: native.clientY});
      }
      step(
        {
          type: 'down',
          target: 'trigger',
          pointerType,
          row: null,
          time: Date.now(),
        },
        native,
      );
    },
    [attach, step],
  );

  const handleTriggerContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      // A finger held on the trigger is opening the menu, not asking for the
      // browser's own context menu.
      const gesture = gestureRef.current;
      if (gesture.phase !== 'idle' && gesture.pointerType !== 'mouse') {
        event.preventDefault();
      }
    },
    [],
  );

  const isTriggerClickFromPress = useCallback((): boolean => {
    return (
      triggerGestureRef.current != null &&
      triggerGestureRef.current === currentGesture()
    );
  }, []);

  const cancel = useCallback(() => {
    if (gestureRef.current.phase !== 'idle') {
      step({type: 'cancel'});
    }
    endGesture();
  }, [endGesture, step]);

  useEffect(() => {
    // Install the gesture counter's listeners before the first press.
    currentGesture();
    return () => {
      endGesture();
    };
  }, [endGesture]);

  return useMemo<UseMenuPressReturn>(
    () => ({
      menuProps: {
        onPointerDown: handleMenuPointerDown,
        [MENU_PRESS_MARKER]: '',
      },
      triggerProps: {
        onPointerDown: handleTriggerPointerDown,
        onContextMenu: handleTriggerContextMenu,
      },
      isTriggerClickFromPress,
      cancel,
    }),
    [
      handleMenuPointerDown,
      handleTriggerPointerDown,
      handleTriggerContextMenu,
      isTriggerClickFromPress,
      cancel,
    ],
  );
}
