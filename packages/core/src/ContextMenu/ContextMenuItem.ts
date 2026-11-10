// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuItem.ts
 * @input DropdownMenuItem
 * @output ContextMenuItem and ContextMenuItemProps:
 *   DropdownMenuItem under the ContextMenu name
 * @position Re-exported by the ContextMenu index. A module of its own, so an
 *   app that imports only this name does not reach ContextMenu itself.
 */

export {
  DropdownMenuItem as ContextMenuItem,
  type DropdownMenuItemProps as ContextMenuItemProps,
} from '../DropdownMenu/DropdownMenuItem';
