// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuRadioGroup.ts
 * @input DropdownMenuRadioGroup
 * @output ContextMenuRadioGroup and ContextMenuRadioGroupProps:
 *   DropdownMenuRadioGroup under the ContextMenu name
 * @position Re-exported by the ContextMenu index. A module of its own, so an
 *   app that imports only this name does not reach ContextMenu itself.
 */

export {
  DropdownMenuRadioGroup as ContextMenuRadioGroup,
  type DropdownMenuRadioGroupProps as ContextMenuRadioGroupProps,
} from '../DropdownMenu/DropdownMenuRadioGroup';
