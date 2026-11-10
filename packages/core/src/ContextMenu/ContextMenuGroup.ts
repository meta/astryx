// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuGroup.ts
 * @input DropdownMenuGroup
 * @output ContextMenuGroup and ContextMenuGroupProps:
 *   DropdownMenuGroup under the ContextMenu name
 * @position Re-exported by the ContextMenu index. A module of its own, so an
 *   app that imports only this name does not reach ContextMenu itself.
 */

export {
  DropdownMenuGroup as ContextMenuGroup,
  type DropdownMenuGroupProps as ContextMenuGroupProps,
} from '../DropdownMenu/DropdownMenuGroup';
