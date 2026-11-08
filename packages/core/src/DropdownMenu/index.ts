// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @output Exports DropdownMenu, DropdownMenuItem and related types
 * @position Public API entry point
 *
 * SYNC: The item components below are re-exported (aliased) by the other menu
 * surfaces that reuse the DropdownMenu item pipeline. When you add or remove an
 * item component here, mirror it in:
 * - /packages/core/src/ContextMenu/index.ts        (ContextMenu* aliases)
 * - /packages/core/src/Breadcrumbs/index.ts        (BreadcrumbMenu* aliases)
 * Those surfaces render menu items through the same renderDropdownItems +
 * DropdownMenuContext + useListFocus path, so a new item type (e.g. a submenu)
 * only shows up in their public API once it's aliased there too.
 */

export {
  DropdownMenu,
  type DropdownMenuProps,
  type DropdownMenuPresentation,
  type DropdownMenuButtonProps,
  type DropdownMenuTriggerProps,
  type DropdownMenuItemData,
  type DropdownMenuDividerData,
  type DropdownMenuSection,
  type DropdownMenuOption,
} from './DropdownMenu';
export type {AdaptivePresentation as MenuPresentation} from '../hooks/useAdaptivePresentation';

export {DropdownMenuItem, type DropdownMenuItemProps} from './DropdownMenuItem';

// Divider — the compound peer of the data API's `{type: 'divider'}`. Both
// modes render this component, so they cannot drift.
export {
  DropdownMenuDivider,
  type DropdownMenuDividerProps,
} from './DropdownMenuDivider';

// Group — the compound peer of the data API's `{type: 'section', title}`.
export {
  DropdownMenuGroup,
  type DropdownMenuGroupProps,
} from './DropdownMenuGroup';

// Selectable items — checkbox (independent) and radio (single-select group).
export {
  DropdownMenuCheckboxItem,
  type DropdownMenuCheckboxItemProps,
} from './DropdownMenuCheckboxItem';
export {
  DropdownMenuRadioGroup,
  type DropdownMenuRadioGroupProps,
} from './DropdownMenuRadioGroup';
export {
  DropdownMenuRadioItem,
  type DropdownMenuRadioItemProps,
} from './DropdownMenuRadioItem';

// Submenu — a single menu row that reveals a nested flyout of its own
// children/items, or drills in on a phone. Data mode via
// DropdownMenuItemData.items.
export {
  DropdownMenuSubMenu,
  type DropdownMenuSubMenuProps,
  type DropdownMenuSubMenuPresentation,
} from './DropdownMenuSubMenu';

// Menu-coordination context — public so consumers can build custom menu items
// that read the menu size / close the menu.
export {
  DropdownMenuContext,
  useDropdownMenuContext,
  type DropdownMenuContextValue,
  type DropdownMenuSize,
} from './DropdownMenuContext';
