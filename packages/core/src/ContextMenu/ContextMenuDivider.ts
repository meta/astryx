// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuDivider.ts
 * @input DropdownMenuDivider
 * @output ContextMenuDivider and ContextMenuDividerProps:
 *   DropdownMenuDivider under the ContextMenu name
 * @position Re-exported by the ContextMenu index. A module of its own, so an
 *   app that imports only this name does not reach ContextMenu itself.
 */

export {
  DropdownMenuDivider as ContextMenuDivider,
  type DropdownMenuDividerProps as ContextMenuDividerProps,
} from '../DropdownMenu/DropdownMenuDivider';
