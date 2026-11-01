// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSettledOpen.ts
 * @input Uses React useState and useIsHydrating
 * @output Exports useSettledOpen (internal; not re-exported from hooks/index.ts)
 * @position Internal utility; read by Dialog, Drawer, BottomSheet and
 *   BottomSheetSwitcher so an overlay open on the server opens settled after
 *   hydration (spec:AST-013 FR13)
 *
 * An overlay open on the server renders closed until hydration, since nothing
 * can make it modal before then. It was still present on page load, so the
 * open right after hydration plays no entry motion. This hook remembers what
 * was open on the server (an open flag, or a switcher's active step) until
 * that first stops being in effect after hydration; later opens animate.
 */

import {useState} from 'react';
import {useIsHydrating} from './useIsHydrating';

/**
 * Returns `requested` as it was on the server and in the hydrating render,
 * until `current` first differs from it after hydration; `none` otherwise.
 * Compare the result with `current` to know whether the open in effect is the
 * settled one.
 *
 * @param requested What the caller asks to have open (the `isOpen` prop, or
 *   the switcher's `activeSheet` prop).
 * @param current What is open in this render, once hydrated.
 * @param none The value meaning nothing is open (`false` or `null`).
 */
export function useSettledOpen<T>(requested: T, current: T, none: T): T {
  const isHydrating = useIsHydrating();
  const [settled, setSettled] = useState<T>(() =>
    isHydrating ? requested : none,
  );
  if (settled !== none && !isHydrating && current !== settled) {
    setSettled(none);
  }
  return settled;
}
