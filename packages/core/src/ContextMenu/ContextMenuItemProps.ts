// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuItemProps.ts
 * @input DropdownMenuItemProps
 * @output ContextMenu's item prop type
 * @position Public type alias for the ContextMenu item component
 *
 * ContextMenu reuses the DropdownMenu row implementation, so its item props
 * stay an exact alias. That keeps disabled reasons available in both the
 * compound and data-driven ContextMenu paths.
 */

import type {DropdownMenuItemProps} from '../DropdownMenu/DropdownMenuItem';

export type ContextMenuItemProps = DropdownMenuItemProps;
