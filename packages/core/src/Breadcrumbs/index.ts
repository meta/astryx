// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Breadcrumbs component barrel export
 */

/**
 * Extensible variant map for Breadcrumbs.
 *
 * Theme packages can add custom variants via TypeScript module augmentation:
 * @example
 * ```
 * declare module '@astryxdesign/core/Breadcrumbs' {
 *   interface BreadcrumbsVariantMap {
 *     'compact': true;
 *   }
 * }
 * ```
 */
export interface BreadcrumbsVariantMap {
  default: true;
  supporting: true;
}

export {Breadcrumbs} from './Breadcrumbs';
export type {BreadcrumbsProps, BreadcrumbsVariant} from './Breadcrumbs';
export {BreadcrumbItem} from './BreadcrumbItem';
export type {BreadcrumbItemProps} from './BreadcrumbItem';

// The breadcrumb `menu` prop reuses the DropdownMenu item API, so the item
// components are re-exported under `Breadcrumb*` aliases for family coherence
// and discoverability (mirroring ContextMenu). A consumer's existing
// DropdownMenu item definitions are portable into a breadcrumb menu verbatim.
export {
  DropdownMenuItem as BreadcrumbMenuItem,
  type DropdownMenuItemProps as BreadcrumbMenuItemProps,
} from '../DropdownMenu/DropdownMenuItem';
export {
  DropdownMenuDivider as BreadcrumbMenuDivider,
  type DropdownMenuDividerProps as BreadcrumbMenuDividerProps,
} from '../DropdownMenu/DropdownMenuDivider';
export {
  DropdownMenuGroup as BreadcrumbMenuGroup,
  type DropdownMenuGroupProps as BreadcrumbMenuGroupProps,
} from '../DropdownMenu/DropdownMenuGroup';
export {
  DropdownMenuCheckboxItem as BreadcrumbMenuCheckboxItem,
  type DropdownMenuCheckboxItemProps as BreadcrumbMenuCheckboxItemProps,
} from '../DropdownMenu/DropdownMenuCheckboxItem';
export {
  DropdownMenuRadioGroup as BreadcrumbMenuRadioGroup,
  type DropdownMenuRadioGroupProps as BreadcrumbMenuRadioGroupProps,
} from '../DropdownMenu/DropdownMenuRadioGroup';
export {
  DropdownMenuRadioItem as BreadcrumbMenuRadioItem,
  type DropdownMenuRadioItemProps as BreadcrumbMenuRadioItemProps,
} from '../DropdownMenu/DropdownMenuRadioItem';
export {
  DropdownMenuSubMenu as BreadcrumbMenuSubMenu,
  type DropdownMenuSubMenuProps as BreadcrumbMenuSubMenuProps,
} from '../DropdownMenu/DropdownMenuSubMenu';
export type {
  DropdownMenuOption as BreadcrumbMenuOption,
  DropdownMenuItemData as BreadcrumbMenuItemData,
  DropdownMenuDividerData as BreadcrumbMenuDividerData,
  DropdownMenuSection as BreadcrumbMenuSection,
} from '../DropdownMenu/DropdownMenu';
