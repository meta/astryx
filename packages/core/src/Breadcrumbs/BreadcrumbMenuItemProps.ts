// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BreadcrumbMenuItemProps.ts
 * @input DropdownMenuItemProps
 * @output Breadcrumb menu item prop type
 * @position Public type alias for the BreadcrumbMenu item component
 *
 * Breadcrumb menus reuse the DropdownMenu row implementation, but this
 * change keeps the new disabled-message API scoped to DropdownMenu.
 */

import type {DropdownMenuItemProps} from '../DropdownMenu/DropdownMenuItem';

export type BreadcrumbMenuItemProps = Omit<
  DropdownMenuItemProps,
  'disabledMessage'
>;
