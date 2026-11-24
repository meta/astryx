// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file moduleLoader.ts
 * @input A function that imports a module on demand
 * @output Exports `createModuleLoader`: one shared load of that module, and
 *   the module once it has loaded; and `afterFirstPaint`, the wait every
 *   after-paint load shares
 * @position Internal utility. A component that loads a module before it is
 *   needed renders the loaded module directly, with no suspended render, so
 *   React does not hold back what it shows.
 */

import {sharedWeakMap} from './sharedRealm';

// One wait per window, shared by every copy of Core.
const firstPaints = sharedWeakMap<Window, Promise<void>>(
  'utils/module-loader/first-paints',
  1,
);

/**
 * Resolves once `view` has painted after the first call: a frame callback
 * runs before the frame paints, and the task it queues runs after that paint.
 * Every caller in a window shares the one wait, so a load that starts after
 * another after-paint load does not wait for a second paint.
 */
export async function afterFirstPaint(view: Window): Promise<void> {
  let paint = firstPaints.get(view);
  if (paint == null) {
    paint = new Promise<void>(resolve => {
      view.requestAnimationFrame(() => {
        view.setTimeout(resolve, 0);
      });
    });
    firstPaints.set(view, paint);
  }
  return paint;
}

/** One module, loaded once on demand. Internal. */
export interface ModuleLoader<T> {
  /**
   * Loads the module, or returns the load already running or done. A failed
   * load is not kept: the next call asks the module loader again (a loader
   * that retries then loads it; a browser does not fetch a native module again
   * once its import failed).
   */
  load(): Promise<T>;
  /** The module once it has loaded, else null. */
  loaded(): T | null;
}

export function createModuleLoader<T>(
  importModule: () => Promise<T>,
): ModuleLoader<T> {
  let module: T | null = null;
  let pending: Promise<T> | null = null;
  return {
    async load() {
      pending ??= importModule().then(
        loadedModule => {
          module = loadedModule;
          return loadedModule;
        },
        (error: unknown) => {
          pending = null;
          throw error;
        },
      );
      return pending;
    },
    loaded: () => module,
  };
}
