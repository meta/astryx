// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuCheckboxItem.ts
 * @input DropdownMenuCheckboxItem
 * @output ContextMenuCheckboxItem and ContextMenuCheckboxItemProps:
 *   DropdownMenuCheckboxItem under the ContextMenu name
 * @position Re-exported by the ContextMenu index. A module of its own, so an
 *   app that imports only this name does not reach ContextMenu itself.
 */

export {
  DropdownMenuCheckboxItem as ContextMenuCheckboxItem,
  type DropdownMenuCheckboxItemProps as ContextMenuCheckboxItemProps,
} from '../DropdownMenu/DropdownMenuCheckboxItem';
