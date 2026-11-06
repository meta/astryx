// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Imports from NavigationStack.tsx
 * @output Re-exports NavigationStack, NavigationScreen, useNavigationStack
 *   and their types
 * @position Barrel export; consumed by packages/lab/src/index.ts
 */

export {
  NavigationScreen,
  NavigationStack,
  useNavigationStack,
} from './NavigationStack';
export type {
  NavigationScreenProps,
  NavigationStackApi,
  NavigationStackProps,
} from './NavigationStack';
