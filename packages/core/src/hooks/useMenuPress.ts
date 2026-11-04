// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useMenuPress.ts
 * @input The menu and trigger refs, and the press options
 * @output Exports useMenuPress, and useCoreMenuPress, the internal ref form
 *   over createMenuPress that Core's menus use, with DropdownMenu's touch
 *   model. Re-exports the marker attributes, the press constants and the
 *   activation mark.
 * @position Core hook; a thin wrapper over createMenuPress's core. Core's
 *   menus use the internal ref form.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 * - /packages/core/src/hooks/useMenuPress.doc.mjs
 * - /packages/core/src/hooks/useMenuPress.test.tsx
 * - /packages/core/src/hooks/useMenuPress.factory.test.tsx
 * - /packages/core/src/hooks/createMenuPress.ts
 */

import {useEffect, useMemo, useRef, useState, type RefObject} from 'react';
import {useAttachment} from './useAttachment';
import {useIsomorphicLayoutEffect} from './useIsomorphicLayoutEffect';
import {
  createForwardedMenuPress,
  createMenuPress,
  createMenuPressCore,
  MENU_PRESS_MARKER,
  type CoreMenuPressOptions,
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

/**
 * Core's menus' ref form: createMenuPress's options, with the trigger as a
 * ref, plus DropdownMenu's touch model.
 *
 * @internal
 */
export interface CoreMenuPressRefOptions extends Omit<
  CreateMenuPressOptions,
  'trigger'
> {
  /**
   * The control that opens the menu, when the press may start there. It gets
   * the press only while the menu element is mounted.
   */
  triggerRef?: RefObject<HTMLElement | null>;
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
 * What Core's menus' ref form returns: the press's reads and forwards. The
 * hook owns its life.
 *
 * @internal
 */
export type CoreMenuPressRefReturn = Pick<
  CreateMenuPressReturn,
  | 'isTriggerClickFromPress'
  | 'cancel'
  | 'handleMenuPointerDown'
  | 'handleTriggerPointerDown'
  | 'handleTriggerContextMenu'
>;

/**
 * The options form's options: the menu and the trigger as refs.
 */
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

/**
 * What the options form returns: props to spread on the menu and the trigger.
 */
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

/**
 * The factory's options, from the hook's: the trigger read from its ref. Every
 * key is named, so an option the caller drops reaches update() as undefined
 * and the factory falls back to its own behavior.
 */
function factoryOptionsOf(
  options: CoreMenuPressRefOptions,
): CreateMenuPressOptions {
  return {
    trigger: options.triggerRef?.current ?? null,
    itemSelector: options.itemSelector,
    onTriggerPress: options.onTriggerPress,
    onHighlight: options.onHighlight,
    onActivate: options.onActivate,
    onDismiss: options.onDismiss,
    getScroller: options.getScroller,
    hitTest: options.hitTest,
    longPressDelayMs: options.longPressDelayMs,
    isEnabled: options.isEnabled,
    startBehavior: options.startBehavior,
  };
}

/** The factory's options with the touch model the entry allows. */
function coreOptionsOf(latest: {
  options: CoreMenuPressRefOptions;
  touchModel: MenuPressTouchModel;
}): CoreMenuPressOptions {
  return {...factoryOptionsOf(latest.options), touchModel: latest.touchModel};
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
 * - A finger held on the trigger opens the menu after the long-press delay.
 *   The settle rule in menuPressGesture.ts decides if that release can act.
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
export function useMenuPress(options: UseMenuPressOptions): UseMenuPressReturn {
  // The touch model is DropdownMenu's alone; an untyped caller's
  // `touchModel` does not reach the model.
  return useMenuPressWith(
    options,
    undefined,
    createMenuPress,
    'pointer',
  ) as UseMenuPressReturn;
}

/**
 * @internal The ref form for Core's menus. Each forwards a mouse's or pen's
 * press-down from its React handlers, so the press acts in the options
 * form's order. DropdownMenu passes its touch model.
 */
export function useCoreMenuPress(
  menuRef: RefObject<HTMLElement | null>,
  options: CoreMenuPressRefOptions,
): CoreMenuPressRefReturn {
  return useMenuPressWith(
    menuRef,
    options,
    createForwardedMenuPress,
    options.touchModel ?? 'pointer',
  ) as CoreMenuPressRefReturn;
}

/** A ref that never holds a menu, for the options form's attachment. */
const NO_MENU: RefObject<HTMLElement | null> = {current: null};

function useMenuPressWith(
  first: RefObject<HTMLElement | null> | UseMenuPressOptions,
  second: CoreMenuPressRefOptions | undefined,
  create: (
    menu: HTMLElement,
    options: CoreMenuPressOptions,
  ) => CreateMenuPressReturn,
  touchModel: MenuPressTouchModel,
): CoreMenuPressRefReturn | UseMenuPressReturn {
  // A call site keeps one form for its life, so both take the same hooks.
  const isRefForm = second !== undefined;
  const menuRef = isRefForm
    ? (first as RefObject<HTMLElement | null>)
    : (first as UseMenuPressOptions).menuRef;
  const options: CoreMenuPressRefOptions = isRefForm
    ? second
    : (first as UseMenuPressOptions);
  // The options form reads the latest render's options when an event arrives.
  // The ref form reads them at commit, below.
  const latestRef = useRef({menuRef, options, touchModel});
  latestRef.current = {menuRef, options, touchModel};

  // The ref form: createMenuPress on the element behind the ref. A new menu or
  // document creates a new factory. Every other change reaches it through
  // update() at commit, so a render that React discards never reaches it.
  const attachedRef = useRef<CreateMenuPressReturn | null>(null);
  useAttachment(
    isRefForm ? menuRef : NO_MENU,
    menu => {
      const press = create(menu, coreOptionsOf(latestRef.current));
      attachedRef.current = press;
      return () => {
        press.destroy();
        attachedRef.current = null;
      };
    },
    null,
    {followsDocument: true},
  );
  // Syncs the attached factory's options with this commit's.
  useIsomorphicLayoutEffect(() => {
    attachedRef.current?.update(coreOptionsOf(latestRef.current));
  });

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
  // Installs the document's gesture counter at mount. At unmount, it ends a
  // press in flight and removes that press's document listeners.
  useEffect(() => core?.connect(), [core]);
  // The options form holds the document the menu is in after every commit; the
  // ref form's factory holds its menu's document itself. The page's tracking
  // starts here at mount either way, before a menu mounted at its first open
  // exists.
  useInteractionModalityTrackingFor(menuRef, !isRefForm);

  return useMemo<CoreMenuPressRefReturn | UseMenuPressReturn>(() => {
    if (core == null) {
      return {
        isTriggerClickFromPress: () =>
          attachedRef.current?.isTriggerClickFromPress() ?? false,
        cancel: () => attachedRef.current?.cancel(),
        handleMenuPointerDown: event =>
          attachedRef.current?.handleMenuPointerDown(event),
        handleTriggerPointerDown: event =>
          attachedRef.current?.handleTriggerPointerDown(event),
        handleTriggerContextMenu: event =>
          attachedRef.current?.handleTriggerContextMenu(event),
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
