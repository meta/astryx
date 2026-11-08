// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';

/**
 * @file index.ts
 * @output Exports ContextMenu, ContextMenuItem and related types
 * @position Public API entry point
 */

export {
  ContextMenu,
  type ContextMenuProps,
  type ContextMenuItemData,
  type ContextMenuDividerData,
  type ContextMenuSection,
  type ContextMenuOption,
} from './ContextMenu';
export type {AdaptivePresentation as MenuPresentation} from '../hooks/useAdaptivePresentation';

export {
  DropdownMenuItem as ContextMenuItem,
  type DropdownMenuItemProps as ContextMenuItemProps,
} from '../DropdownMenu/DropdownMenuItem';
export {
  DropdownMenuDivider as ContextMenuDivider,
  type DropdownMenuDividerProps as ContextMenuDividerProps,
} from '../DropdownMenu/DropdownMenuDivider';
export {
  DropdownMenuGroup as ContextMenuGroup,
  type DropdownMenuGroupProps as ContextMenuGroupProps,
} from '../DropdownMenu/DropdownMenuGroup';

// Selectable items work inside a ContextMenu too — re-exported under the
// ContextMenu name for a coherent API.
export {
  DropdownMenuCheckboxItem as ContextMenuCheckboxItem,
  type DropdownMenuCheckboxItemProps as ContextMenuCheckboxItemProps,
} from '../DropdownMenu/DropdownMenuCheckboxItem';
export {
  DropdownMenuRadioGroup as ContextMenuRadioGroup,
  type DropdownMenuRadioGroupProps as ContextMenuRadioGroupProps,
} from '../DropdownMenu/DropdownMenuRadioGroup';
export {
  DropdownMenuRadioItem as ContextMenuRadioItem,
  type DropdownMenuRadioItemProps as ContextMenuRadioItemProps,
} from '../DropdownMenu/DropdownMenuRadioItem';
// Submenus work inside a ContextMenu too (nested flyout of items).
export {
  DropdownMenuSubMenu as ContextMenuSubMenu,
  type DropdownMenuSubMenuProps as ContextMenuSubMenuProps,
} from '../DropdownMenu/DropdownMenuSubMenu';
