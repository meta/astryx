// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BreadcrumbMenuTypes.ts
 * @input DropdownMenu data shapes
 * @output Breadcrumb menu data shapes
 * @position Public types for the breadcrumb menu data API
 *
 * Breadcrumb menus reuse the DropdownMenu renderer, but the disabled-message
 * API is intentionally scoped to DropdownMenu in this change.
 */

import type {
  DropdownMenuDividerData,
  DropdownMenuItemData,
  DropdownMenuSection,
} from '../DropdownMenu/DropdownMenu';

export type BreadcrumbMenuItemData = Omit<
  DropdownMenuItemData,
  'disabledMessage' | 'items'
> & {
  items?: BreadcrumbMenuOption[];
};

export type BreadcrumbMenuSection = Omit<DropdownMenuSection, 'items'> & {
  items: BreadcrumbMenuItemData[];
};

export type BreadcrumbMenuOption =
  BreadcrumbMenuItemData | DropdownMenuDividerData | BreadcrumbMenuSection;
