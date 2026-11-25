// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file lazyMenuBottomSheet.ts
 * @input Uses createModuleLoader, useSurfaceModule, warnOnce, MenuBottomSheet,
 *   and MenuBottomSheetActionList
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
 * fetch a native module again once its import failed). A sheet whose module
 * fails to load closes, so the trigger works again; rows that fail to load
 * leave the sheet without rows until its next open.
 *
 * No wrapper renders on the server or in the render that hydrates server
 * HTML (spec:AST-013 FR9): a module that has not loaded yet would leave server
 * markup incomplete and abort hydration. The closed sheet has no visible
 * markup, so it first renders right after hydration.
 */

import {createElement, type ComponentProps, type ReactElement} from 'react';
import {warnOnce} from '../utils/devWarning';
import {createModuleLoader} from '../utils/moduleLoader';
import {useSurfaceModule} from '../utils/useSurfaceModule';
import type * as SheetModule from './MenuBottomSheet';
import type {MenuBottomSheet as EagerMenuBottomSheet} from './MenuBottomSheet';
import type {MenuBottomSheetActionList as EagerMenuBottomSheetActionList} from './MenuBottomSheetActionList';
import type * as ActionListModule from './MenuBottomSheetActionList';

const warnLoadFailure = () =>
  warnOnce(
    'menu:sheet-load-failed',
    'DropdownMenu',
    'The menu sheet could not load. The next open tries again.',
  );

// The action list renders inside the sheet, which renders nothing while
// closed, so its first render is the first open. Once preloaded, it renders
// directly: a suspended render on open would hold the rows back (React delays
// revealing them for up to 300ms).
const actionList = createModuleLoader<typeof ActionListModule>(
  async () => import('./MenuBottomSheetActionList'),
  {onLoadFailure: warnLoadFailure},
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
 * not kept, so the first open asks the module loader again.
 */
export async function preloadMenuBottomSheetActionList(): Promise<ActionListPreload> {
  try {
    await loadActionList();
    return {isLoaded: true};
  } catch (error) {
    return {isLoaded: false, error};
  }
}

const importSheet = async () => import('./MenuBottomSheet');

// A sheet that shows the action list waits for the rows' module too. A press
// right after mount then shows the sheet and its actions together. A failed
// row load does not hold the sheet.
const sheetWithActionList = createModuleLoader<typeof SheetModule>(
  async () => {
    const [module] = await Promise.all([
      importSheet(),
      loadActionList().catch(() => undefined),
    ]);
    return module;
  },
  {onLoadFailure: warnLoadFailure},
);

// A sheet with caller content (ContextMenu `menuContent`) shows no action
// list, so it never loads or waits for the rows.
const sheetWithoutActionList = createModuleLoader<typeof SheetModule>(
  importSheet,
  {onLoadFailure: warnLoadFailure},
);

function useMenuSheet(
  loader: typeof sheetWithActionList,
  props: ComponentProps<typeof EagerMenuBottomSheet>,
): ReactElement | null {
  const {isOpen, onOpenChange} = props;
  const module = useSurfaceModule(loader, {
    isOpen,
    onLoadFailure: () => {
      if (isOpen) {
        onOpenChange(false);
      }
    },
  });
  return module == null ? null : createElement(module.MenuBottomSheet, props);
}

export function MenuBottomSheet(
  props: ComponentProps<typeof EagerMenuBottomSheet>,
): ReactElement | null {
  return useMenuSheet(sheetWithActionList, props);
}

/** The touch sheet for caller content: it does not load the action list. */
export function MenuBottomSheetWithoutActionList(
  props: ComponentProps<typeof EagerMenuBottomSheet>,
): ReactElement | null {
  return useMenuSheet(sheetWithoutActionList, props);
}

export function MenuBottomSheetActionList(
  props: ComponentProps<typeof EagerMenuBottomSheetActionList>,
): ReactElement | null {
  const module = useSurfaceModule(actionList);
  return module == null
    ? null
    : createElement(module.MenuBottomSheetActionList, props);
}
