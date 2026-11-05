// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file NavMenuContext.tsx
 * @input Layer-scoped React context/use
 * @output Exports NavHeadingCloseContext, NavHeadingMenuContext, and hooks
 * @position Context providers; consumed by NavHeadingMenu and NavHeadingMenuItem
 *
 * SYNC: When modified, update:
 * - /packages/core/src/NavMenu/index.ts
 */

import {createContext, use} from 'react';
import {createLayerScopedContext} from '../Layer/layerScopedContext';

export type NavHeadingMenuSize = 'sm' | 'md' | 'lg';

/**
 * Close callback provided by the nav heading popover.
 * NavHeadingMenu reads this to dismiss the popover on item selection
 * and on Escape.
 */
export interface NavHeadingCloseContextValue {
  closeMenu: () => void;
}

export const NavHeadingCloseContext =
  createContext<NavHeadingCloseContextValue | null>(null);
NavHeadingCloseContext.displayName = 'NavHeadingCloseContext';

export function useNavHeadingCloseContext(): NavHeadingCloseContextValue | null {
  return use(NavHeadingCloseContext);
}

/**
 * Internal (not exported from the NavMenu entry): the dismissal a nav heading
 * popover gives its menu when its items do not close it on selection (an
 * expanded SideNavHeading, FR7). NavHeadingMenu calls it for a mouse released
 * outside, never on an item's selection.
 */
export const NavHeadingDismissContext = createContext<{
  dismiss: () => void;
} | null>(null);
NavHeadingDismissContext.displayName = 'NavHeadingDismissContext';

/**
 * Size and close context provided by NavHeadingMenu to its children.
 * Items read this for consistent padding and dismiss-on-click.
 */
export interface NavHeadingMenuContextValue {
  size: NavHeadingMenuSize;
  closeMenu: () => void;
}

export const NavHeadingMenuContext =
  createLayerScopedContext<NavHeadingMenuContextValue | null>(null);
NavHeadingMenuContext.displayName = 'NavHeadingMenuContext';

export function useNavHeadingMenuContext(): NavHeadingMenuContextValue | null {
  return use(NavHeadingMenuContext);
}
