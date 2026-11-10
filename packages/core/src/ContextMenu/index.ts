// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';

/**
 * @file index.ts
 * @output Exports ContextMenu, ContextMenuItem and related types
 * @position Public API entry point
 */

export {
  ContextMenu,
  type ContextMenuProps,
  type ContextMenuItemData,
  type ContextMenuDividerData,
  type ContextMenuSection,
  type ContextMenuOption,
} from './ContextMenu';
export type {AdaptivePresentation as MenuPresentation} from '../hooks/useAdaptivePresentation';

export * from './ContextMenuItem';
export * from './ContextMenuDivider';
export * from './ContextMenuGroup';

// Selectable items work inside a ContextMenu too — re-exported under the
// ContextMenu name for a coherent API.
export * from './ContextMenuCheckboxItem';
export * from './ContextMenuRadioGroup';
export * from './ContextMenuRadioItem';
// Submenus work inside a ContextMenu too (nested flyout of items).
export * from './ContextMenuSubMenu';
