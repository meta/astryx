// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BreadcrumbMenuItemProps.ts
 * @input DropdownMenuItemProps
 * @output Breadcrumb menu item prop type
 * @position Public type alias for the BreadcrumbMenu item component
 *
 * Breadcrumb menus reuse the DropdownMenu row implementation, so this stays
 * an exact alias and keeps disabled reasons available in composed menus.
 */

import type {DropdownMenuItemProps} from '../DropdownMenu/DropdownMenuItem';

export type BreadcrumbMenuItemProps = DropdownMenuItemProps;
