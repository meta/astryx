// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createMenuPress.ts
 * @input A menu root, its trigger, the enabled-row selector, and callbacks for
 *   opening, highlighting, activating and dismissing
 * @output createMenuPress, its option and handle types, the marker attributes,
 *   the press constants and the activation mark
 * @position Core factory; useMenuPress is its React wrapper. The transition
 *   table lives in menuPressGesture.ts. Importing it does no DOM work.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 * - /packages/core/src/hooks/useMenuPress.ts
 * - /packages/core/src/hooks/useMenuPress.doc.mjs
 * - /packages/core/src/hooks/createMenuPress.test.ts
 * - /packages/core/src/hooks/menuPressGesture.ts
 */

import {currentGesture} from '../Layer/gestureCounter';
import {
  IDLE_MENU_PRESS,
  menuPressTransition,
  type MenuPressOutcome,
  type MenuPressInput,
  type MenuPressState,
  type MenuPressPointerType,
} from './menuPressGesture';
import {
  createLongPressDetector,
  type LongPressTolerance,
} from './longPressDetector';
import {MENU_PRESS_MARKER} from './menuPressMarker';
import {edgeAutoscroll} from '../utils/edgeAutoscroll';
import {focusForLastInput} from '../utils/focusReturn';
import {trackInteractionModalityIn} from '../utils/interactionModality';
import {LONG_PRESS_DURATION_MS} from '../motion/uikit/longPress';
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
/** How long a finger must rest on the trigger before the menu opens under it. */
export const MENU_PRESS_LONG_PRESS_MS = LONG_PRESS_DURATION_MS;
/**
 * How far a finger held on a DropdownMenu trigger may move before the open,
 * in CSS px, under every primary pointer. A native menu still opens after a
 * 12 pt move. ContextMenu keeps the long press's own allowable movement.
 */
export const MENU_PRESS_TRIGGER_DRIFT_PX = 13;

/** A held finger on the trigger gets the same drift allowance under every primary pointer. */
const TRIGGER_TOLERANCE: LongPressTolerance = {
  moveCancelPx: MENU_PRESS_TRIGGER_DRIFT_PX,
};
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

export interface CreateMenuPressOptions {
  /** The control that opens the menu, when the press may start there. */
  trigger?: HTMLElement | null;
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
   * by `isTriggerClickFromPress` so the caller can leave it alone.
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
  /**
   * Where a press in the menu may start. `'menu'` takes a press anywhere in
   * the menu. `'items'` takes only a press that lands on an item, with the
   * main button. A press on other content in the menu stays the browser's. So
   * does a Ctrl, Cmd or Shift mouse press on a link item, which opens the link
   * in a new tab or window.
   * @default 'menu'
   */
  startBehavior?: 'menu' | 'items';
}

export interface CreateMenuPressReturn {
  /**
   * Whether the click reaching the trigger belongs to the gesture that just
   * pressed it — the press already opened or closed the menu, so the click
   * must neither toggle nor reopen it.
   */
  isTriggerClickFromPress: () => boolean;
  /** End the gesture in flight with nothing acting (the menu closed). */
  cancel: () => void;
  /**
   * Merge new options. They apply from the next event, and a gesture in
   * progress goes on. A new `trigger` moves the trigger's listeners to it.
   */
  update: (options: Partial<CreateMenuPressOptions>) => void;
  /**
   * Hand the press a `pointerdown` the menu received through a handler of the
   * caller's. The press takes each event once. The menu's own listener runs
   * before any React `onPointerDown` handler and already takes a mouse's or
   * pen's press-down, so a forward does not order it.
   */
  handleMenuPointerDown: (event: MenuPressDownEvent) => void;
  /**
   * Hand the press a `pointerdown` the trigger received through a handler of
   * the caller's, as above.
   */
  handleTriggerPointerDown: (event: MenuPressDownEvent) => void;
  /** Hand the press the trigger's `contextmenu`, as above. */
  handleTriggerContextMenu: (event: {
    preventDefault: () => void;
    nativeEvent?: Event;
  }) => void;
  /**
   * Remove every listener the press added, end a press in flight with nothing
   * acting, and take the marker off the menu root. A second call does nothing.
   */
  destroy: () => void;
}

// The core reads its menu, trigger and options at event time. createMenuPress
// drives it from its own listeners; the options form of useMenuPress drives
// it from the props it returns.

/**
 * @internal How the finger that opened the menu from the trigger picks.
 * `'pointer'`: its opening press follows the settle rule. `'uikit'`: it
 * picks only after UIMenu's handoff distance, so the row that appeared under
 * it never acts on a still lift. A mouse is unaffected.
 */
export type MenuPressTouchModel = 'pointer' | 'uikit';

/**
 * @internal Core's menus' options: the public ones, plus DropdownMenu's touch
 * model, which the public factory never reads.
 */
export interface CoreMenuPressOptions extends CreateMenuPressOptions {
  /** How the finger that opened the menu from the trigger picks. */
  touchModel?: MenuPressTouchModel;
}

/**
 * @internal createForwardedMenuPress's handle: its update() takes the touch
 * model.
 */
export interface CoreMenuPressReturn extends CreateMenuPressReturn {
  update: (options: Partial<CoreMenuPressOptions>) => void;
}

/** @internal What the core reads at event time. */
export interface MenuPressSource {
  getMenu: () => HTMLElement | null;
  getTrigger: () => HTMLElement | null;
  getOptions: () => Omit<CreateMenuPressOptions, 'trigger'>;
  /** DropdownMenu's touch model. Without it, the press keeps the settle rule. */
  getTouchModel?: () => MenuPressTouchModel;
}

/**
 * Where a pointer is, for a finger's handoff distance. Positions reach the
 * machine only under the `'uikit'` touch model. Without them, it keeps the
 * settle rule.
 */
function handoffPosition(
  event: PointerEvent,
  hasHandoff: boolean,
): {x?: number; y?: number} {
  return hasHandoff ? {x: event.clientX, y: event.clientY} : {};
}

/**
 * A pointer press the press takes: a DOM `PointerEvent`, or a React one,
 * which carries the DOM event as `nativeEvent`.
 */
export interface MenuPressDownEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly button: number;
  readonly ctrlKey: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly target: EventTarget | null;
  preventDefault: () => void;
  readonly nativeEvent?: PointerEvent;
}

/** @internal The press model's entry points (see createMenuPressCore). */
export interface MenuPressCore {
  /**
   * A press that begins inside the menu, at `target`: the event's own target
   * unless the caller read it earlier.
   */
  handleMenuPointerDown: (
    event: MenuPressDownEvent,
    target?: EventTarget | null,
  ) => void;
  /** A press on the trigger: a mouse opens; a held finger opens. */
  handleTriggerPointerDown: (event: MenuPressDownEvent) => void;
  /** The trigger's `contextmenu`: a held finger is opening the menu. */
  handleTriggerContextMenu: (event: {preventDefault: () => void}) => void;
  isTriggerClickFromPress: () => boolean;
  cancel: () => void;
  /**
   * Start what a press needs from the page (input modality, the gesture
   * counter); returns its end, which also ends a press in flight.
   */
  connect: () => () => void;
}

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

/**
 * @internal The press model over a menu, a trigger and options read at event
 * time. createMenuPress and the options form of useMenuPress are its two
 * drivers; nothing else has behavior of its own.
 */
export function createMenuPressCore(source: MenuPressSource): MenuPressCore {
  let gesture: MenuPressState<HTMLElement> = IDLE_MENU_PRESS;
  let pointerId: number | null = null;
  let detach: (() => void) | null = null;
  let touchMovePreventer: (() => void) | null = null;
  // The edge autoscroll running now: its scroller, its direction, and the
  // re-read of the row under the resting pointer after each step.
  let running: {
    scroller: HTMLElement;
    direction: 1 | -1;
    reread: () => void;
  } | null = null;
  let lastPointerEvent: PointerEvent | null = null;
  let triggerGesture: number | null = null;
  // The second pointer that ended a gesture must not start the next one.
  let ignoredPointerId: number | null = null;

  const autoscroll = edgeAutoscroll({
    intervalMs: AUTOSCROLL_INTERVAL_MS,
    immediate: true,
    step: () => (running?.direction ?? 0) * AUTOSCROLL_STEP_PX,
    apply: delta => {
      const current = running;
      if (current == null) {
        return 0;
      }
      const before = current.scroller.scrollTop;
      current.scroller.scrollTop = before + delta;
      const moved = current.scroller.scrollTop - before;
      if (moved === 0) {
        // The edge is reached. There is nothing more to show.
        running = null;
        return 0;
      }
      current.reread();
      return moved;
    },
  });

  // The system's one long-press detector, the one ContextMenu's useLongPress
  // wraps, detects the held finger. So the hold duration and the movement
  // tolerance have one home. Its delay is read as each press starts.
  const longPress = createLongPressDetector({
    onLongPress: () => fireLongPress(),
  });

  function getDocument(): Document {
    return (
      source.getMenu()?.ownerDocument ??
      source.getTrigger()?.ownerDocument ??
      document
    );
  }

  function resolvePoint(
    event: PointerEvent,
    target: EventTarget | null = event.target,
  ): ResolvedPoint {
    const {itemSelector, hitTest} = source.getOptions();
    const menu = source.getMenu();
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
      element = target instanceof Element ? target : null;
    }
    const root = menu == null ? null : getOutermostRoot(menu);
    const isInMenu =
      root != null && element != null && isInMenuTree(element, root);
    const trigger = source.getTrigger();
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
  }

  function stopAutoscroll(): void {
    autoscroll.stop();
    running = null;
  }

  // The row a held finger or pen lights, and the menu that holds the other
  // rows off their pressed paint meanwhile.
  let litRow: HTMLElement | null = null;
  let heldMenu: HTMLElement | null = null;

  function endGesture(): void {
    longPress.cancel();
    if (litRow != null) {
      clearMenuPressLit(litRow);
      litRow = null;
    }
    if (heldMenu != null) {
      releaseMenuPressPaint(heldMenu);
      heldMenu = null;
    }
    touchMovePreventer?.();
    touchMovePreventer = null;
    stopAutoscroll();
    detach?.();
    detach = null;
    pointerId = null;
    lastPointerEvent = null;
    gesture = IDLE_MENU_PRESS;
  }

  function highlight(row: HTMLElement | null): void {
    // A held finger or pen marks the row it lights, for the row's pressed
    // paint. A held mouse keeps the hover tint, as on a desktop.
    const isHeld = gesture.phase !== 'idle' && gesture.pointerType !== 'mouse';
    const lit = isHeld ? row : null;
    if (litRow !== lit) {
      if (litRow != null) {
        clearMenuPressLit(litRow);
      }
      litRow = lit;
      if (lit != null) {
        markMenuPressLit(lit);
      }
    }
    // The row the press began on stays :active where a pointer hovers, so
    // the menu holds every row but the lit one off that paint.
    const held = isHeld ? source.getMenu() : null;
    if (heldMenu !== held) {
      if (heldMenu != null) {
        releaseMenuPressPaint(heldMenu);
      }
      heldMenu = held;
      if (held != null) {
        holdMenuPressPaint(held);
      }
    }
    const {onHighlight} = source.getOptions();
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
        ? source.getMenu()
        : isRowFocusable(row)
          ? row
          : row.querySelector<HTMLElement>(INNER_CONTROL_SELECTOR);
    if (target != null && target !== getDocument().activeElement) {
      focusForLastInput(target, {preventScroll: true});
    }
  }

  function activate(row: HTMLElement, release: PointerEvent): void {
    // Every click this dispatches passes the shared click guard.
    withoutClickGuard(() => {
      const {onActivate} = source.getOptions();
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
  }

  function applyEffect(
    effect: MenuPressOutcome<HTMLElement>,
    next: MenuPressState<HTMLElement>,
    native: PointerEvent | undefined,
  ): void {
    const doc = getDocument();
    switch (effect.type) {
      case 'none':
        return;
      case 'open': {
        const pointerType = next.phase === 'open' ? next.pointerType : 'mouse';
        triggerGesture = currentGesture();
        const didOpen =
          source.getOptions().onTriggerPress?.(pointerType) ?? false;
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
        });
        if (native != null) {
          activate(effect.row, native);
        }
        return;
      }
      case 'settle': {
        endGesture();
        if (effect.stray) {
          armClickGuard(doc, {
            staysInstalled: true,
            cancelsTouchEnd: native?.pointerType === 'touch',
          });
        }
        if (effect.dismiss) {
          source.getOptions().onDismiss?.();
        }
        return;
      }
    }
  }

  function step(event: MenuPressInput<HTMLElement>, native?: PointerEvent) {
    const result = menuPressTransition(gesture, event);
    gesture = result.gesture;
    applyEffect(result.effect, result.gesture, native);
  }

  function getScroller(): HTMLElement | null {
    const {getScroller: custom} = source.getOptions();
    if (custom != null) {
      return custom();
    }
    const menu = source.getMenu();
    if (menu == null) {
      return null;
    }
    return menu.scrollHeight > menu.clientHeight + 1 ? menu : null;
  }

  function updateAutoscroll(event: PointerEvent): void {
    if (gesture.phase !== 'tracking') {
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
    if (running?.direction === direction) {
      return;
    }
    stopAutoscroll();
    running = {
      scroller,
      direction,
      // The rows moved under the resting pointer: re-read the row under it.
      reread: () => {
        const last = lastPointerEvent;
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
  }

  function attach(id: number): void {
    detach?.();
    const doc = getDocument();
    const view = doc.defaultView;
    pointerId = id;

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) {
        return;
      }
      lastPointerEvent = event;
      if (gesture.phase === 'triggerPress') {
        // A finger that moves past the drift allowance is scrolling, not
        // holding.
        const isPending = longPress.moveTo({
          x: event.clientX,
          y: event.clientY,
        });
        if (!isPending) {
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
          ...handoffPosition(event, source.getTouchModel?.() === 'uikit'),
        },
        event,
      );
      updateAutoscroll(event);
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) {
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
          ...handoffPosition(event, source.getTouchModel?.() === 'uikit'),
        },
        event,
      );
    };
    const onCancel = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) {
        return;
      }
      step({type: 'cancel'});
    };
    const onOtherPointerDown = (event: PointerEvent) => {
      // A second pointer ends the gesture: two fingers are a pinch or a
      // scroll, never a pick.
      if (event.pointerId !== pointerId) {
        ignoredPointerId = event.pointerId;
        step({type: 'cancel'});
      }
    };
    const onBlur = () => {
      step({type: 'cancel'});
    };

    doc.addEventListener('pointermove', onMove, true);
    doc.addEventListener('pointerup', onUp, true);
    doc.addEventListener('pointercancel', onCancel, true);
    doc.addEventListener('pointerdown', onOtherPointerDown, true);
    view?.addEventListener('blur', onBlur);
    detach = () => {
      doc.removeEventListener('pointermove', onMove, true);
      doc.removeEventListener('pointerup', onUp, true);
      doc.removeEventListener('pointercancel', onCancel, true);
      doc.removeEventListener('pointerdown', onOtherPointerDown, true);
      view?.removeEventListener('blur', onBlur);
    };
  }

  function fireLongPress(): void {
    if (gesture.phase !== 'triggerPress') {
      return;
    }
    triggerGesture = currentGesture();
    const didOpen =
      source.getOptions().onTriggerPress?.(gesture.pointerType) ?? false;
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
    touchMovePreventer = () => {
      doc.removeEventListener('touchmove', prevent, true);
    };
    step({type: 'opened', time: Date.now()});
  }

  return {
    handleMenuPointerDown(event, origin = event.target) {
      const {isEnabled = true} = source.getOptions();
      const menu = source.getMenu();
      if (!isEnabled || menu == null) {
        return;
      }
      if (event.pointerId === ignoredPointerId) {
        ignoredPointerId = null;
        return;
      }
      if (gesture.phase !== 'idle') {
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
      const target = origin as Element | null;
      if (target?.closest(MENU_PRESS_ROOT_SELECTOR) !== menu) {
        return;
      }
      // Only a press on an item counts here. Other content keeps its own
      // click, and a modified mouse press on a link opens it as the browser
      // does.
      const {startBehavior = 'menu', itemSelector} = source.getOptions();
      if (
        startBehavior === 'items' &&
        (event.button !== 0 ||
          target.closest(itemSelector) == null ||
          (pointerType === 'mouse' &&
            (event.ctrlKey ||
              event.metaKey === true ||
              event.shiftKey === true) &&
            target.closest('a[href]') != null))
      ) {
        return;
      }
      if (pointerType !== 'mouse') {
        // Cancelling pointerdown stops the compatibility mouse events that a
        // finger fires at its landing row when it lifts. That mousedown would
        // light the origin row again. touch-action controls scrolling, so
        // scrolling does not change.
        event.preventDefault();
      }
      const native = event.nativeEvent ?? (event as unknown as PointerEvent);
      attach(native.pointerId);
      lastPointerEvent = native;
      const point = resolvePoint(native, origin);
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

    handleTriggerPointerDown(event) {
      const {isEnabled = true, longPressDelayMs} = source.getOptions();
      if (event.pointerId === ignoredPointerId) {
        ignoredPointerId = null;
        return;
      }
      if (!isEnabled || gesture.phase !== 'idle') {
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
      const native = event.nativeEvent ?? (event as unknown as PointerEvent);
      attach(native.pointerId);
      lastPointerEvent = native;
      if (pointerType !== 'mouse') {
        // The trigger's press takes one drift allowance under every primary
        // pointer, so no menu, row or trigger reads the pointer query.
        longPress.setOptions({
          onLongPress: () => fireLongPress(),
          delayMs: longPressDelayMs ?? MENU_PRESS_LONG_PRESS_MS,
        });
        longPress.start(
          {x: native.clientX, y: native.clientY},
          TRIGGER_TOLERANCE,
        );
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

    handleTriggerContextMenu(event) {
      // A finger held on the trigger is opening the menu, not asking for the
      // browser's own context menu.
      if (gesture.phase !== 'idle' && gesture.pointerType !== 'mouse') {
        event.preventDefault();
      }
    },

    isTriggerClickFromPress() {
      return triggerGesture != null && triggerGesture === currentGesture();
    },

    cancel() {
      if (gesture.phase !== 'idle') {
        step({type: 'cancel'});
      }
      endGesture();
    },

    connect() {
      // Install the gesture counter's listeners before the first press.
      currentGesture();
      return () => {
        endGesture();
      };
    },
  };
}

/**
 * Run the menu press model on `menu`, with no React. The row under a release
 * acts, and the highlight follows a held pointer. A mouse press on `trigger`
 * opens the menu; a finger held on it opens it after the long-press delay.
 * Destroy it to remove every listener it added. `update` changes its options
 * or trigger from the next event. A mouse's or pen's press-down acts at once
 * at the menu's or trigger's own listener. A finger's acts once it bubbles to
 * its window, after the page's own press-down handlers. A finger's press-down
 * that one of them stops or cancels starts no press. On a page that cancels
 * every press-down, touch menus lose press-drag-release; plain taps still
 * work. A script's own finger press-down must set `bubbles: true`.
 *
 * - The document tracks the pointer by `pointerId`. A finger's events stay
 *   with the element it landed on, so the menu never sees a finger that slid
 *   onto it.
 * - The release acts on its row as the row's own click would, with the
 *   release's button and modifier keys.
 * - The browser's stray `click` after a tracked release is swallowed at the
 *   window, in the capture phase. A click with `detail === 0` always passes.
 * - The settle rule in menuPressGesture.ts decides if the opening gesture's
 *   release can act.
 * - `pointercancel`, a second pointer, or a window blur ends the gesture, and
 *   nothing acts.
 * - A pointer that rests near the edge of an overflowing menu scrolls it.
 * - The root carries `data-astryx-menu-press`, so a nested flyout can tell
 *   which level owns a press.
 * - The highlight follows the last input of the menu's own document, tracked
 *   until `destroy`.
 *
 * @example
 * ```
 * const press = createMenuPress(list, {
 *   trigger: button,
 *   itemSelector: '[role="menuitem"]:not([aria-disabled="true"])',
 *   onTriggerPress: () => {
 *     list.showPopover();
 *     return true;
 *   },
 *   onDismiss: () => list.hidePopover(),
 * });
 * button.addEventListener('click', () => {
 *   if (!press.isTriggerClickFromPress()) list.togglePopover();
 * });
 * // Later:
 * press.destroy();
 * ```
 */
export function createMenuPress(
  menu: HTMLElement,
  options: CreateMenuPressOptions,
): CreateMenuPressReturn {
  return startMenuPress(menu, options, 'listeners', false);
}

/**
 * @internal Core's menus: a mouse's or pen's press-down reaches this press only
 * through the handle methods. The menus call them from React handlers, in the
 * order the options form's props ran. DropdownMenu's touch model applies
 * ({@link CoreMenuPressOptions.touchModel}).
 */
export function createForwardedMenuPress(
  menu: HTMLElement,
  options: CoreMenuPressOptions,
): CoreMenuPressReturn {
  return startMenuPress(menu, options, 'forwards', true);
}

/** Where a mouse's or pen's press-down reaches the press. */
type FinePointerEntry = 'listeners' | 'forwards';

function isFinger(event: {readonly pointerType?: string}): boolean {
  return event.pointerType === 'touch';
}

function startMenuPress(
  menu: HTMLElement,
  options: CoreMenuPressOptions,
  finePointers: FinePointerEntry,
  hasTouchModel: boolean,
): CoreMenuPressReturn {
  let current = options;
  let trigger: HTMLElement | null = null;
  let isDestroyed = false;
  const core = createMenuPressCore({
    getMenu: () => menu,
    getTrigger: () => trigger,
    getOptions: () => current,
    getTouchModel: hasTouchModel
      ? () => current.touchModel ?? 'pointer'
      : undefined,
  });
  const disconnect = core.connect();
  // The highlight follows the last input in the menu's document. The press
  // tracks the page's document, and the menu's own one when it differs, until
  // destroy.
  const releasePage =
    typeof document === 'undefined'
      ? () => {}
      : trackInteractionModalityIn(document);
  const releaseOwn =
    typeof document !== 'undefined' && menu.ownerDocument === document
      ? () => {}
      : trackInteractionModalityIn(menu.ownerDocument);
  const hadMarker = menu.hasAttribute(MENU_PRESS_MARKER);
  menu.setAttribute(MENU_PRESS_MARKER, '');

  // The press listens on the menu and the trigger themselves. A finger's
  // press-down acts once it bubbles to the window, the last stop of its way.
  // The page's own handlers run first, React's delegated ones and the
  // document's included. A finger's press-down that one of them stops or
  // cancels starts no press. That window listener lives only while the
  // press-down dispatches. A mouse's or pen's press-down acts at once at the
  // menu's or trigger's own listener, before any React `onPointerDown`
  // handler. Core's menus forward it from React handlers instead, so their
  // own listeners leave it alone. The press takes each event once.
  const taken = new WeakSet<Event>();
  const take = (event: Event): boolean => {
    if (isDestroyed || taken.has(event)) {
      return false;
    }
    taken.add(event);
    return true;
  };
  /** Runs `act` once `event` bubbles to its window; never if it is stopped. */
  const afterPageHandlers = (event: Event, act: () => void) => {
    const doc =
      (event.currentTarget as Node | null)?.ownerDocument ?? menu.ownerDocument;
    const view = doc.defaultView;
    const end: EventTarget = view ?? doc;
    // A forwarded press-down whose dispatch ended, or that bubbles through the
    // window now, has met every page handler on its way.
    if (
      !(event.eventPhase > 0) ||
      (event.currentTarget === end && event.eventPhase === Event.BUBBLING_PHASE)
    ) {
      act();
      return;
    }
    const settle = (reached: Event) => {
      // A press-down that a page handler dispatches during this one reaches
      // the window first. Keep waiting for this one.
      if (reached !== event) {
        return;
      }
      end.removeEventListener(event.type, settle);
      view?.clearTimeout(timer);
      act();
    };
    // Core's input stream (inputStream.ts) listens on the window's capture
    // phase, before the page's handlers. This press acts after them, so it
    // adds its own bubble listener.
    end.addEventListener(event.type, settle);
    // A press-down stopped on its way never reaches the window. Its listener
    // goes at the next task.
    const timer = view?.setTimeout(() => {
      end.removeEventListener(event.type, settle);
    }, 0);
  };
  const onMenuPointerDown = (event: PointerEvent) => {
    // A press-down on a trigger inside the menu is the trigger's.
    if (trigger != null && event.composedPath().includes(trigger)) {
      return;
    }
    if (isFinger(event)) {
      // At the window, the target of a press-down from a shadow root is its
      // host. So the press reads the target here, at the menu's own listener.
      const {target} = event;
      afterPageHandlers(event, () => {
        if (!event.defaultPrevented && take(event)) {
          core.handleMenuPointerDown(event, target);
        }
      });
    } else if (finePointers === 'listeners' && take(event)) {
      core.handleMenuPointerDown(event);
    }
  };
  const onTriggerPointerDown = (event: PointerEvent) => {
    if (isFinger(event)) {
      afterPageHandlers(event, () => {
        if (!event.defaultPrevented && take(event)) {
          core.handleTriggerPointerDown(event);
        }
      });
    } else if (finePointers === 'listeners' && take(event)) {
      core.handleTriggerPointerDown(event);
    }
  };
  const onTriggerContextMenu = (event: MouseEvent) => {
    afterPageHandlers(event, () => {
      if (take(event)) {
        core.handleTriggerContextMenu(event);
      }
    });
  };
  menu.addEventListener('pointerdown', onMenuPointerDown);
  const setTrigger = (next: HTMLElement | null) => {
    if (next === trigger) {
      return;
    }
    trigger?.removeEventListener('pointerdown', onTriggerPointerDown);
    trigger?.removeEventListener('contextmenu', onTriggerContextMenu);
    trigger = next;
    trigger?.addEventListener('pointerdown', onTriggerPointerDown);
    trigger?.addEventListener('contextmenu', onTriggerContextMenu);
  };
  setTrigger(current.trigger ?? null);

  return {
    isTriggerClickFromPress: () => core.isTriggerClickFromPress(),
    cancel: () => core.cancel(),
    update(next) {
      if (isDestroyed) {
        return;
      }
      current = {...current, ...next};
      if ('trigger' in next) {
        setTrigger(next.trigger ?? null);
      }
    },
    handleMenuPointerDown(event) {
      const native = event.nativeEvent ?? (event as unknown as Event);
      if (!isFinger(event)) {
        if (take(native)) {
          core.handleMenuPointerDown(event);
        }
        return;
      }
      // A press-down on a trigger inside the menu is the trigger's.
      if (
        trigger != null &&
        typeof native.composedPath === 'function' &&
        native.composedPath().includes(trigger)
      ) {
        return;
      }
      // The window sees a shadow host as the target, so read it now.
      const {target} = event;
      afterPageHandlers(native, () => {
        if (!native.defaultPrevented && take(native)) {
          core.handleMenuPointerDown(event, target);
        }
      });
    },
    handleTriggerPointerDown(event) {
      const native = event.nativeEvent ?? (event as unknown as Event);
      if (!isFinger(event)) {
        if (take(native)) {
          core.handleTriggerPointerDown(event);
        }
        return;
      }
      afterPageHandlers(native, () => {
        if (!native.defaultPrevented && take(native)) {
          core.handleTriggerPointerDown(event);
        }
      });
    },
    handleTriggerContextMenu(event) {
      if (take(event.nativeEvent ?? (event as unknown as Event))) {
        core.handleTriggerContextMenu(event);
      }
    },
    destroy() {
      if (isDestroyed) {
        return;
      }
      isDestroyed = true;
      disconnect();
      releaseOwn();
      releasePage();
      menu.removeEventListener('pointerdown', onMenuPointerDown);
      setTrigger(null);
      if (!hadMarker) {
        menu.removeAttribute(MENU_PRESS_MARKER);
      }
    },
  };
}
