// Copyright (c) Meta Platforms, Inc. and affiliates.

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

// The breadcrumb `menu` prop reuses the DropdownMenu item pipeline, so the
// item components are re-exported under `Breadcrumb*` aliases for family
// coherence and discoverability. The data type is scoped below so the new
// DropdownMenu-only disabled-message prop does not leak into Breadcrumbs.
import type {ComponentType} from 'react';
import {DropdownMenuItem} from '../DropdownMenu/DropdownMenuItem';
import type {BreadcrumbMenuItemProps} from './BreadcrumbMenuItemProps';
export const BreadcrumbMenuItem =
  DropdownMenuItem as ComponentType<BreadcrumbMenuItemProps>;
export type {BreadcrumbMenuItemProps} from './BreadcrumbMenuItemProps';
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
  BreadcrumbMenuOption,
  BreadcrumbMenuItemData,
  BreadcrumbMenuSection,
} from './BreadcrumbMenuTypes';
export type {DropdownMenuDividerData as BreadcrumbMenuDividerData} from '../DropdownMenu/DropdownMenu';
