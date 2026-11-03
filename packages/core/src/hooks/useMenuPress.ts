// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useMenuPress.ts
 * @input The menu's ref, and createMenuPress's options with the trigger as a
 *   ref
 * @output Exports useMenuPress, createMenuPress's React form, and the
 *   internal useDropdownMenuPress entry with its touch model. Re-exports the
 *   marker attributes, the press constants and the activation mark.
 * @position Core hook; a thin wrapper over createMenuPress, in its ref form
 *   for ContextMenu, DropdownMenuSubMenu, MenuBottomSheetActionList, Selector
 *   and TabMenu. The options form, which returns props to spread, stays with
 *   DropdownMenu (its trigger's props), BreadcrumbItem, NavHeadingMenu,
 *   TopNavMenu, and the SideNav and TopNav heading menus.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 * - /packages/core/src/hooks/useMenuPress.doc.mjs
 * - /packages/core/src/hooks/useMenuPress.test.tsx
 * - /packages/core/src/hooks/useMenuPress.factory.test.tsx
 * - /packages/core/src/hooks/createMenuPress.ts
 */

import {useEffect, useMemo, useRef, useState, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from './useIsomorphicLayoutEffect';
import {
  createMenuPress,
  createMenuPressCore,
  MENU_PRESS_MARKER,
  type CreateMenuPressOptions,
  type CreateMenuPressReturn,
  type MenuPressCore,
  type MenuPressTouchModel,
} from './createMenuPress';
import type {MenuPressPointerType} from './menuPressGesture';
import {useInteractionModalityTrackingFor} from '../utils/interactionModality';

export {
  MENU_PRESS_MARKER,
  MENU_PRESS_SURFACE_ATTR,
  MENU_PRESS_STRAY_CLICK_MS,
  MENU_PRESS_LONG_PRESS_MS,
  MENU_PRESS_TRIGGER_DRIFT_PX,
  MENU_PRESS_AUTOSCROLL_ZONE_PX,
  isMenuPressActivation,
  __resetMenuPressForTest,
} from './createMenuPress';

// =============================================================================
// Options
// =============================================================================

/** The ref form's options: createMenuPress's, with the trigger as a ref. */
export interface UseMenuPressRefOptions extends Omit<
  CreateMenuPressOptions,
  'trigger'
> {
  /**
   * The control that opens the menu, when the press may start there. It gets
   * the press only while the menu element is mounted.
   */
  triggerRef?: RefObject<HTMLElement | null>;
}

/** What the ref form returns: the press's reads; the hook owns its life. */
export type UseMenuPressRefReturn = Pick<
  CreateMenuPressReturn,
  'isTriggerClickFromPress' | 'cancel'
>;

/** The options form's options: the menu and the trigger as refs. */
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

/** What the options form returns: props to spread on the menu and the trigger. */
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

const FACTORY_CALLBACKS = [
  'onTriggerPress',
  'onHighlight',
  'onActivate',
  'onDismiss',
  'getScroller',
  'hitTest',
] as const;

/** What the ref form's factory is created from. */
interface FactoryKey {
  menu: HTMLElement | null;
  ownerDocument: Document | null;
  trigger: HTMLElement | null;
  itemSelector: string;
  longPressDelayMs: number | undefined;
  isEnabled: boolean | undefined;
  callbacks: string;
}

function factoryKeyOf(
  menu: HTMLElement | null,
  options: UseMenuPressRefOptions,
): FactoryKey {
  return {
    menu,
    ownerDocument: menu?.ownerDocument ?? null,
    trigger: options.triggerRef?.current ?? null,
    itemSelector: options.itemSelector,
    longPressDelayMs: options.longPressDelayMs,
    isEnabled: options.isEnabled,
    // The press falls back to its own behavior for an absent callback. So a
    // change in which callbacks are given needs a new factory.
    callbacks: FACTORY_CALLBACKS.filter(name => options[name] != null).join(
      ',',
    ),
  };
}

function isSameFactoryKey(a: FactoryKey, b: FactoryKey): boolean {
  return (
    a.menu === b.menu &&
    a.ownerDocument === b.ownerDocument &&
    a.trigger === b.trigger &&
    a.itemSelector === b.itemSelector &&
    a.longPressDelayMs === b.longPressDelayMs &&
    a.isEnabled === b.isEnabled &&
    a.callbacks === b.callbacks
  );
}

/**
 * The factory's options: the key's values, and callbacks that call the latest
 * ones.
 */
function factoryOptionsOf(
  key: FactoryKey,
  latest: () => UseMenuPressRefOptions,
): CreateMenuPressOptions {
  const given = new Set(key.callbacks.split(','));
  const options: CreateMenuPressOptions = {
    trigger: key.trigger,
    itemSelector: key.itemSelector,
  };
  if (key.longPressDelayMs !== undefined) {
    options.longPressDelayMs = key.longPressDelayMs;
  }
  if (key.isEnabled !== undefined) {
    options.isEnabled = key.isEnabled;
  }
  if (given.has('onTriggerPress')) {
    options.onTriggerPress = pointerType =>
      latest().onTriggerPress?.(pointerType) ?? false;
  }
  if (given.has('onHighlight')) {
    options.onHighlight = row => latest().onHighlight?.(row);
  }
  if (given.has('onActivate')) {
    options.onActivate = (row, release) => latest().onActivate?.(row, release);
  }
  if (given.has('onDismiss')) {
    options.onDismiss = () => latest().onDismiss?.();
  }
  if (given.has('getScroller')) {
    options.getScroller = () => latest().getScroller?.() ?? null;
  }
  if (given.has('hitTest')) {
    options.hitTest = (x, y) => latest().hitTest?.(x, y) ?? null;
  }
  return options;
}

/**
 * DropdownMenu's options for the press model: everything the public hook
 * takes, plus its touch model. DropdownMenu reaches the touch model through
 * its `presentation`, so the public hook has no such option.
 *
 * @internal
 */
export interface DropdownMenuPressOptions extends UseMenuPressOptions {
  /**
   * How the finger that opened the menu from the trigger picks.
   * `'pointer'`: its opening press follows the settle rule. `'uikit'`: it
   * picks only after UIMenu's handoff distance, so the row that appeared
   * under it never acts on a still lift. A mouse is unaffected.
   * @default 'pointer'
   */
  touchModel?: MenuPressTouchModel;
}

/**
 * What core's own menus get from {@link useDropdownMenuPress}: the public
 * return. Not exported from the hooks entry point.
 *
 * @internal
 */
export type DropdownMenuPressReturn = UseMenuPressReturn;

/**
 * The press model for a menu: the row under the release acts, the highlight
 * follows a held pointer, a mouse opens on press. createMenuPress on the
 * element behind `menuRef`; see createMenuPress.ts. The press attaches when the
 * calling component commits, so a menu that a child mounts in a later commit
 * attaches at the caller's next commit. While the menu element is unmounted,
 * there is no press, not even on the trigger. For press-to-open on a menu
 * rendered only while open, use the options form.
 *
 * @example
 * ```
 * const menuPress = useMenuPress(listRef, {
 *   triggerRef: buttonRef,
 *   itemSelector: MENU_ITEM_SELECTOR,
 *   onTriggerPress: () => openMenu(),
 *   onDismiss: closeMenu,
 * });
 * <button ref={buttonRef} onClick={e => {
 *   if (menuPress.isTriggerClickFromPress()) return;
 *   toggle();
 * }} />
 * <div ref={listRef} role="menu">…</div>
 * ```
 */
export function useMenuPress(
  menuRef: RefObject<HTMLElement | null>,
  options: UseMenuPressRefOptions,
): UseMenuPressRefReturn;
/**
 * The options form: props to spread on the menu root and the trigger. The ref
 * form above listens on both itself, so nothing is spread.
 */
export function useMenuPress(options: UseMenuPressOptions): UseMenuPressReturn;
export function useMenuPress(
  first: RefObject<HTMLElement | null> | UseMenuPressOptions,
  second?: UseMenuPressRefOptions,
): UseMenuPressRefReturn | UseMenuPressReturn {
  // The touch model is DropdownMenu's alone; an untyped caller's
  // `touchModel` does not reach the model.
  return useMenuPressDriver(first, second, 'pointer');
}

/**
 * The options form with DropdownMenu's touch model
 * ({@link DropdownMenuPressOptions.touchModel}). Not exported from the hooks
 * entry point.
 *
 * @internal
 */
export function useDropdownMenuPress(
  options: DropdownMenuPressOptions,
): DropdownMenuPressReturn {
  return useMenuPressDriver(
    options,
    undefined,
    options.touchModel ?? 'pointer',
  ) as DropdownMenuPressReturn;
}

/** Both forms of the press, with the touch model the entry allows. */
function useMenuPressDriver(
  first: RefObject<HTMLElement | null> | UseMenuPressOptions,
  second: UseMenuPressRefOptions | undefined,
  touchModel: MenuPressTouchModel,
): UseMenuPressRefReturn | UseMenuPressReturn {
  // A call site keeps one form for its life, so both take the same hooks.
  const isRefForm = second !== undefined;
  const menuRef = isRefForm
    ? (first as RefObject<HTMLElement | null>)
    : (first as UseMenuPressOptions).menuRef;
  const options: UseMenuPressRefOptions = isRefForm
    ? second
    : (first as UseMenuPressOptions);
  // The press reads the latest render's options when an event arrives.
  const latestRef = useRef({menuRef, options, touchModel});
  latestRef.current = {menuRef, options, touchModel};

  // The ref form: createMenuPress on the element behind the ref. The factory
  // keeps its creation options. Its callbacks call the latest ones. A new menu,
  // document, trigger, value option or callback set creates a new factory.
  const attachedRef = useRef<{
    key: FactoryKey;
    press: CreateMenuPressReturn;
  } | null>(null);
  useIsomorphicLayoutEffect(() => {
    if (!isRefForm) {
      return;
    }
    const {menuRef: ref, options: latest} = latestRef.current;
    const menu = ref.current;
    const key = factoryKeyOf(menu, latest);
    const attached = attachedRef.current;
    if (attached != null && isSameFactoryKey(attached.key, key)) {
      return;
    }
    attached?.press.destroy();
    attachedRef.current =
      menu == null
        ? null
        : {
            key,
            press: createMenuPress(
              menu,
              factoryOptionsOf(key, () => latestRef.current.options),
            ),
          };
  });
  useIsomorphicLayoutEffect(
    () => () => {
      attachedRef.current?.press.destroy();
      attachedRef.current = null;
    },
    [],
  );

  // The options form: the same core, driven by the props it returns.
  const [core] = useState<MenuPressCore | null>(() =>
    isRefForm
      ? null
      : createMenuPressCore({
          getMenu: () => latestRef.current.menuRef.current,
          getTrigger: () =>
            latestRef.current.options.triggerRef?.current ?? null,
          getOptions: () => latestRef.current.options,
          getTouchModel: () => latestRef.current.touchModel,
        }),
  );
  useEffect(() => core?.connect(), [core]);
  // The options form holds the document the menu is in after every commit; the
  // ref form's factory holds its menu's document itself. The page's tracking
  // starts here at mount either way, before a menu mounted at its first open
  // exists.
  useInteractionModalityTrackingFor(menuRef, !isRefForm);

  return useMemo<UseMenuPressRefReturn | UseMenuPressReturn>(() => {
    if (core == null) {
      return {
        isTriggerClickFromPress: () =>
          attachedRef.current?.press.isTriggerClickFromPress() ?? false,
        cancel: () => attachedRef.current?.press.cancel(),
      };
    }
    return {
      menuProps: {
        onPointerDown: core.handleMenuPointerDown,
        [MENU_PRESS_MARKER]: '',
      },
      triggerProps: {
        onPointerDown: core.handleTriggerPointerDown,
        onContextMenu: core.handleTriggerContextMenu,
      },
      isTriggerClickFromPress: core.isTriggerClickFromPress,
      cancel: core.cancel,
    };
  }, [core]);
}
