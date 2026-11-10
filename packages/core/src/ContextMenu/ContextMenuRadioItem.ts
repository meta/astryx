// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuRadioItem.ts
 * @input DropdownMenuRadioItem
 * @output ContextMenuRadioItem and ContextMenuRadioItemProps:
 *   DropdownMenuRadioItem under the ContextMenu name
 * @position Re-exported by the ContextMenu index. A module of its own, so an
 *   app that imports only this name does not reach ContextMenu itself.
 */

export {
  DropdownMenuRadioItem as ContextMenuRadioItem,
  type DropdownMenuRadioItemProps as ContextMenuRadioItemProps,
} from '../DropdownMenu/DropdownMenuRadioItem';
