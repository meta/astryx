// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuSubMenu.ts
 * @input DropdownMenuSubMenu
 * @output ContextMenuSubMenu and ContextMenuSubMenuProps:
 *   DropdownMenuSubMenu under the ContextMenu name
 * @position Re-exported by the ContextMenu index. A module of its own, so an
 *   app that imports only this name does not reach ContextMenu itself.
 */

export {
  DropdownMenuSubMenu as ContextMenuSubMenu,
  type DropdownMenuSubMenuProps as ContextMenuSubMenuProps,
} from '../DropdownMenu/DropdownMenuSubMenu';
