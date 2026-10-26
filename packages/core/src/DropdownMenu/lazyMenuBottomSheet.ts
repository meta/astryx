// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file lazyMenuBottomSheet.ts
 * @input Uses React lazy and Suspense, useIsHydrating, MenuBottomSheet, and
 *   MenuBottomSheetActionList
 * @output Exports MenuBottomSheet and MenuBottomSheetActionList wrappers that
 *   load the touch sheet on first render
 * @position Internal to DropdownMenu
 *
 * The touch sheet (BottomSheet, its gestures, and the touch action list) only
 * renders for the bottom-sheet presentation. Loading it on demand keeps it out
 * of pages whose dropdowns only open as anchored popovers. Each wrapper keeps
 * the wrapped component's props and renders nothing until its module loads.
 *
 * Neither wrapper renders on the server or in the render that hydrates server
 * HTML (spec:AST-013 FR9): a lazy component that has not loaded yet would
 * leave server markup incomplete and abort hydration. The closed sheet has no
 * visible markup, so it first renders right after hydration.
 */

import {
  createElement,
  lazy,
  Suspense,
  useState,
  type ComponentProps,
  type ReactElement,
} from 'react';
import {useIsHydrating} from '../hooks/useIsHydrating';
import type {MenuBottomSheet as EagerMenuBottomSheet} from './MenuBottomSheet';
import type {MenuBottomSheetActionList as EagerMenuBottomSheetActionList} from './MenuBottomSheetActionList';
import type * as ActionListModule from './MenuBottomSheetActionList';

const LazyMenuBottomSheet = lazy(async () =>
  import('./MenuBottomSheet').then(module => ({
    default: module.MenuBottomSheet,
  })),
);

// The action list renders inside the sheet, which renders nothing while
// closed, so its first render is the first open. Once preloaded, it renders
// directly instead of through lazy(): a suspended render on open would hold
// the rows back (React delays revealing them for up to 300ms).
let actionListModule: typeof ActionListModule | null = null;
let actionListLoad: Promise<typeof ActionListModule> | null = null;
async function loadActionList(): Promise<typeof ActionListModule> {
  actionListLoad ??= import('./MenuBottomSheetActionList').then(module => {
    actionListModule = module;
    return module;
  });
  return actionListLoad;
}

/** Starts loading the action list; a sheet menu calls it at rest. */
export function preloadMenuBottomSheetActionList(): void {
  void loadActionList();
}

const LazyMenuBottomSheetActionList = lazy(async () =>
  loadActionList().then(module => ({
    default: module.MenuBottomSheetActionList,
  })),
);

export function MenuBottomSheet(
  props: ComponentProps<typeof EagerMenuBottomSheet>,
): ReactElement | null {
  if (useIsHydrating()) {
    return null;
  }
  return createElement(
    Suspense,
    {fallback: null},
    createElement(LazyMenuBottomSheet, props),
  );
}

export function MenuBottomSheetActionList(
  props: ComponentProps<typeof EagerMenuBottomSheetActionList>,
): ReactElement | null {
  // Chosen once per mount, so a module that arrives later never swaps the
  // rendered list (which would remount it and drop focus).
  const [LoadedActionList] = useState(
    () => actionListModule?.MenuBottomSheetActionList ?? null,
  );
  if (useIsHydrating()) {
    return null;
  }
  return createElement(
    Suspense,
    {fallback: null},
    createElement(LoadedActionList ?? LazyMenuBottomSheetActionList, props),
  );
}
