// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DropdownMenuContext.tsx
 * @input Layer-scoped React context
 * @output Exports context and hook for compound-component menu coordination
 * @position Internal; used by DropdownMenu, DropdownMenuItem and the
 *   drill-in stack (useMenuDrillIn, DropdownMenuSubMenu)
 *
 * Provides menu state (close callback, size) to compound children.
 * Keyboard navigation is handled by useListFocus on the menu container —
 * items don't need to register themselves.
 */

import {createContext, use} from 'react';
import {createLayerScopedContext} from '../Layer/layerScopedContext';

/** Menu size, derived from the trigger button size. */
export type DropdownMenuSize = 'sm' | 'md' | 'lg';

/**
 * The drill-in view stack a menu root keeps for its sub-menus.
 * On a phone a sub-menu row pushes its view and the root shows that view in
 * place of its own rows; Back, Escape and ArrowLeft pop it. Sibling rows and
 * dividers need no knowledge of it: they are simply hidden while a view shows.
 *
 * Internal. The public surface for this behavior is `presentation` alone;
 * this is a view-stack controller, and exporting it would make internal
 * machinery permanent API that nothing requires a caller to touch. A product
 * that later needs to drive the stack earns a deliberate component or hook
 * then, with its own contract.
 * @internal
 */
export interface DropdownMenuDrillIn {
  /**
   * Whether the menu opened on a compact touch display — decided once, when
   * the menu opened, on the same query the root presentation uses for its
   * bottom sheet. An `adaptive` sub-menu drills in exactly then, so one
   * component carries one meaning of "adaptive".
   */
  isCompactTouch: boolean;
  /** The pushed view ids, outermost first; the last one is the view shown. */
  viewStack: ReadonlyArray<string>;
  /** The element a shown view renders its rows into (a portal target). */
  host: HTMLElement | null;
  /**
   * Show a sub-menu's view in place of the current rows. A view with a header
   * or footer renders into the root's surface host instead of `host`.
   */
  push: (viewId: string) => void;
  /** Return to the rows the shown view replaced. */
  pop: () => void;
}

export interface DropdownMenuContextValue {
  /** Close the menu; keyboard dismissal returns focus to the trigger. */
  closeMenu: () => void;
  /** Menu size derived from button size */
  menuSize: DropdownMenuSize;
  /** The drill-in view stack; absent in a menu that cannot drill in. */
  drillIn?: DropdownMenuDrillIn;
  /**
   * The name of this menu level, when known as text: a drilled-in view's Back
   * row reads "Back to <this>".
   */
  menuLabel?: string;
}

/**
 * The root's surface host. The root owns the element through a ref; this
 * object is new whenever a new element attaches, so a sub-menu re-renders
 * into it.
 */
export interface DropdownMenuSurfaceHost {
  /** The host element, or `null` before it attaches. */
  getElement: () => HTMLElement | null;
}

/** What a sub-menu with a header or footer needs from the root. Internal. */
export interface DropdownMenuSurfaceValue {
  /**
   * An element inside the root's popover but outside every `role="menu"`
   * element, where such a sub-menu renders its surface (its flyout layer, or
   * its drilled-in view, while which the root's menu and regions step aside).
   */
  host: DropdownMenuSurfaceHost;
  /**
   * The root menu's `id`, which a sub-menu's menu in the host names so the
   * press model counts it, and only it, as nested in the root.
   */
  ownerId: string;
  /** The root's resolved `menuMaxHeight`, which a drilled-in view caps at. */
  menuMaxHeight?: string;
}

/**
 * The root's surface; `null` under a root with none (ContextMenu). Internal,
 * off the public menu context, and layer-scoped, so each flyout re-provides it.
 */
export const DropdownMenuSurfaceContext =
  createLayerScopedContext<DropdownMenuSurfaceValue | null>(null);
DropdownMenuSurfaceContext.displayName = 'DropdownMenuSurfaceContext';

/**
 * Whether the root menu of this layer tree is open; internal companion to
 * `DropdownMenuContext`, on its own unexported context so the public
 * `DropdownMenuContextValue` surface stays unchanged. A sub-menu's hover
 * intent must die with the menu: a hover-open scheduled on its trigger
 * before the menu closed from elsewhere would otherwise fire into the
 * hidden menu and reopen the flyout behind it (#6893). `null` means no
 * signal, treated as open, matching providers that have no state to give.
 * @internal
 */
export const DropdownMenuRootOpenContext = createLayerScopedContext<
  boolean | null
>(null);
DropdownMenuRootOpenContext.displayName = 'DropdownMenuRootOpenContext';

/**
 * Whether the root menu backing these compound items is open. True when no
 * provider gave a signal.
 * @internal
 */
export function useDropdownMenuRootOpen(): boolean {
  return use(DropdownMenuRootOpenContext) !== false;
}

export const DropdownMenuContext =
  createLayerScopedContext<DropdownMenuContextValue | null>(null);
DropdownMenuContext.displayName = 'DropdownMenuContext';

/**
 * Hook for compound menu items to access menu state.
 * Returns null outside of a DropdownMenu.
 */
export function useDropdownMenuContext(): DropdownMenuContextValue | null {
  return use(DropdownMenuContext);
}

// =============================================================================
// Radio group coordination
// =============================================================================

export interface DropdownMenuRadioGroupContextValue {
  /** The currently selected value in the group. */
  value: string | undefined;
  /** Select a value. Called by a DropdownMenuRadioItem on activation. */
  onChange: (value: string) => void;
  /** Whether selecting an item should close the menu. @default true */
  hasCloseOnSelect: boolean;
}

export const DropdownMenuRadioGroupContext =
  createContext<DropdownMenuRadioGroupContextValue | null>(null);
DropdownMenuRadioGroupContext.displayName = 'DropdownMenuRadioGroupContext';

/**
 * Read the enclosing radio group's selection state.
 * Returns null when used outside a DropdownMenuRadioGroup.
 */
export function useDropdownMenuRadioGroupContext(): DropdownMenuRadioGroupContextValue | null {
  return use(DropdownMenuRadioGroupContext);
}
