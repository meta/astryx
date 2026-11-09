// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file thaw-scene.ts
 * @input A page with the page freeze (./freeze.ts) and the timer gate
 * @output `defineThawScene`, a page function that installs
 *   `window.__harnessThawScene()`: it thaws a frozen scene in the task that
 *   calls it
 * @position Shared by ./freeze.ts (`thawPage`) and ./busy.ts
 *   (`blockMainThread`'s `thaw`), so both thaw a scene the same way. Not
 *   exported from the package: a page function, evaluated in the page.
 */

/**
 * Installs `window.__harnessThawScene()` in the page. It thaws the page
 * freeze, then the timer gate. A page function: it closes over nothing.
 */
export function defineThawScene(): void {
  const w = window as unknown as {
    __harnessThawScene?: () => void;
    __harnessFreeze?: {thaw(): void};
    __harnessTimerGate?: {thaw(): void};
  };
  w.__harnessThawScene = () => {
    w.__harnessFreeze?.thaw();
    w.__harnessTimerGate?.thaw();
  };
}
