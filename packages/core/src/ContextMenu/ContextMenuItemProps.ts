// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuItemProps.ts
 * @input DropdownMenuItemProps
 * @output ContextMenu's item prop type
 * @position Public type alias for the ContextMenu item component
 *
 * ContextMenu reuses the DropdownMenu row implementation, but its public API
 * is intentionally kept separate. The disabled-message proposal belongs to
 * DropdownMenu and is not part of ContextMenu's contract in this change.
 */

import type {DropdownMenuItemProps} from '../DropdownMenu/DropdownMenuItem';

export type ContextMenuItemProps = Omit<
  DropdownMenuItemProps,
  'disabledMessage'
>;
