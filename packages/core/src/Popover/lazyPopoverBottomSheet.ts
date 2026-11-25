// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file lazyPopoverBottomSheet.ts
 * @input Uses createModuleLoader, useSurfaceModule, warnOnce and BottomSheet
 * @output Exports `PopoverBottomSheet`, a BottomSheet that loads on its first
 *   render, and `preloadPopoverBottomSheet`, which loads it without rendering
 * @position Internal to Popover: the surface of its bottom-sheet presentation
 *
 * A Popover only renders a BottomSheet when its presentation asks for one, so
 * the sheet (and its gestures) loads on demand and stays out of pages whose
 * popovers stay anchored, as DropdownMenu's sheet does
 * (DropdownMenu/lazyMenuBottomSheet.ts). It renders nothing until the module
 * loads, and nothing on the server or in the render that hydrates server HTML
 * (spec:AST-013 FR9); the closed sheet has no visible markup. The Popover's
 * open asks for the module with `loadPopoverBottomSheet` and closes the sheet
 * when the load fails, so the trigger works again.
 */

import {createElement, type ComponentProps, type ReactElement} from 'react';
import type {BottomSheet as EagerBottomSheet} from '../BottomSheet/BottomSheet';
import {warnOnce} from '../utils/devWarning';
import {createModuleLoader} from '../utils/moduleLoader';
import {useSurfaceModule} from '../utils/useSurfaceModule';

const sheetModule = createModuleLoader(
  async () => import('../BottomSheet/BottomSheet'),
  {
    onLoadFailure: () =>
      warnOnce(
        'popover:sheet-load-failed',
        'Popover',
        'The bottom sheet could not load. The next open tries again.',
      ),
  },
);

/**
 * Loads the sheet's module with nothing rendered, so a Popover whose sheet
 * can be the surface opens it at once.
 */
export function preloadPopoverBottomSheet(): void {
  void sheetModule.tryLoad();
}

/**
 * Asks for the sheet's module and resolves whether it loaded. The Popover's
 * open calls it and closes the sheet when it resolves false.
 */
export async function loadPopoverBottomSheet(): Promise<boolean> {
  return sheetModule.tryLoad();
}

export function PopoverBottomSheet(
  props: ComponentProps<typeof EagerBottomSheet>,
): ReactElement | null {
  const module = useSurfaceModule(sheetModule);
  return module == null ? null : createElement(module.BottomSheet, props);
}
