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
  useNavigationScreen,
  useNavigationScroller,
  useNavigationStack,
} from './NavigationStack';
export {useNavigationLink} from './useNavigationLink';
export type {NavigationLinkProps} from './useNavigationLink';
export type {
  NavigationChangeOptions,
  NavigationScreenProps,
  NavigationScreenState,
  NavigationScroller,
  NavigationStackApi,
  NavigationStackProps,
  NavigationTransition,
} from './NavigationStack';
