// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Imports from TabBar.tsx and TabBarMoreList.tsx
 * @output Re-exports TabBar, TabBarItem, TabBarSearchTab, TabBarMoreList
 *   and their types
 * @position Barrel export; consumed by packages/lab/src/index.ts
 */

export {TabBar, TabBarItem, TabBarSearchTab} from './TabBar';
export {TabBarMoreList} from './TabBarMoreList';
export type {TabBarMoreListProps} from './TabBarMoreList';
export type {
  TabBarAccessoryPlacement,
  TabBarItemProps,
  TabBarProps,
  TabBarSearchTabProps,
} from './TabBar';
