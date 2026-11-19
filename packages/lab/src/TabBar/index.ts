// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Imports from TabBar.tsx
 * @output Re-exports TabBar, TabBarItem and their types
 * @position Barrel export; consumed by packages/lab/src/index.ts
 */

export {TabBar, TabBarItem} from './TabBar';
export type {TabBarItemProps, TabBarProps} from './TabBar';
