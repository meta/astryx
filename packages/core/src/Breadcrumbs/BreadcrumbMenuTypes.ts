// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BreadcrumbMenuTypes.ts
 * @input DropdownMenu data shapes
 * @output Breadcrumb menu data shapes
 * @position Public types for the breadcrumb menu data API
 *
 * Breadcrumb menus reuse the DropdownMenu renderer and its data contract,
 * including disabled reasons.
 */

import type {
  DropdownMenuItemData,
  DropdownMenuOption,
  DropdownMenuSection,
} from '../DropdownMenu/DropdownMenu';

export type BreadcrumbMenuItemData = DropdownMenuItemData;
export type BreadcrumbMenuSection = DropdownMenuSection;
export type BreadcrumbMenuOption = DropdownMenuOption;
