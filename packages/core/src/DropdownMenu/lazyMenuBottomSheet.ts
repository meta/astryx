// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file lazyMenuBottomSheet.ts
 * @input Uses React lazy and Suspense, useIsHydrating, MenuBottomSheet, and
 *   MenuBottomSheetActionList
 * @output Exports MenuBottomSheet (for a menu that shows the action list),
 *   MenuBottomSheetWithoutActionList (for caller content) and
 *   MenuBottomSheetActionList wrappers that load the touch sheet on first render
 * @position Internal to DropdownMenu and ContextMenu
 *
 * The touch sheet (BottomSheet, its gestures, and the touch action list) only
 * renders for the bottom-sheet presentation. Loading it on demand keeps it out
 * of pages whose menus only open as anchored popovers. Each wrapper keeps
 * the wrapped component's props and renders nothing until its module loads.
 *
 * The action list preloads at rest, and the preload's result says whether it
 * loaded. A failed load is not kept, so the next preload or open asks the
 * module loader again (a loader that retries then loads it; a browser does not
 * fetch a native module again once its import failed).
 *
 * No wrapper renders on the server or in the render that hydrates server
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
import {createModuleLoader} from '../utils/moduleLoader';
import type {MenuBottomSheet as EagerMenuBottomSheet} from './MenuBottomSheet';
import type {MenuBottomSheetActionList as EagerMenuBottomSheetActionList} from './MenuBottomSheetActionList';
import type * as ActionListModule from './MenuBottomSheetActionList';

// The action list renders inside the sheet, which renders nothing while
// closed, so its first render is the first open. Once preloaded, it renders
// directly instead of through lazy(): a suspended render on open would hold
// the rows back (React delays revealing them for up to 300ms).
const actionList = createModuleLoader<typeof ActionListModule>(
  async () => import('./MenuBottomSheetActionList'),
);
const loadActionList = actionList.load;

/** What a preload of the action list came to: loaded, or failed with the loader's error. */
export type ActionListPreload =
  | {readonly isLoaded: true}
  | {readonly isLoaded: false; readonly error: unknown};

/**
 * Starts loading the action list; a sheet menu calls it at rest. Its result
 * says whether the list loaded: a failure (a dropped connection) is that
 * result, with the loader's error, and never a rejection. The failed load is
 * not kept, so the first open asks the module loader again, and a load that
 * fails there reaches the menu through lazy().
 */
export async function preloadMenuBottomSheetActionList(): Promise<ActionListPreload> {
  try {
    await loadActionList();
    return {isLoaded: true};
  } catch (error) {
    return {isLoaded: false, error};
  }
}

const loadSheet = async () => import('./MenuBottomSheet');

// A sheet that shows the action list waits for the rows' module too. A press
// right after mount then shows the sheet and its actions together. A failed
// row load does not hold the sheet; the rows then fail through lazy().
const LazyMenuBottomSheet = lazy(async () => {
  const [module] = await Promise.all([
    loadSheet(),
    loadActionList().catch(() => undefined),
  ]);
  return {default: module.MenuBottomSheet};
});

// A sheet with caller content (ContextMenu `menuContent`) shows no action
// list, so it never loads or waits for the rows.
const LazyMenuBottomSheetWithoutActionList = lazy(async () =>
  loadSheet().then(module => ({default: module.MenuBottomSheet})),
);

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

/** The touch sheet for caller content: it does not load the action list. */
export function MenuBottomSheetWithoutActionList(
  props: ComponentProps<typeof EagerMenuBottomSheet>,
): ReactElement | null {
  if (useIsHydrating()) {
    return null;
  }
  return createElement(
    Suspense,
    {fallback: null},
    createElement(LazyMenuBottomSheetWithoutActionList, props),
  );
}

export function MenuBottomSheetActionList(
  props: ComponentProps<typeof EagerMenuBottomSheetActionList>,
): ReactElement | null {
  // Chosen once per mount, so a module that arrives later never swaps the
  // rendered list (which would remount it and drop focus).
  const [LoadedActionList] = useState(
    () => actionList.loaded()?.MenuBottomSheetActionList ?? null,
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
