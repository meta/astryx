// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file moduleLoader.ts
 * @input A function that imports a module on demand
 * @output Exports `createModuleLoader`: one shared load of that module, the
 *   module once it has loaded, a subscription to its load, and a load that
 *   reports a failure instead of throwing; and `afterNextPaint`, the wait an
 *   after-paint load starts with
 * @position Internal utility. A component that loads a module before it is
 *   needed renders the loaded module directly, with no suspended render, so
 *   React does not hold back what it shows.
 */

/**
 * Resolves after `view` next paints: a frame callback runs before the frame
 * paints, and the task it queues runs after that paint. The timers belong to
 * `view`, so the wait ends with its document.
 */
export async function afterNextPaint(view: Window): Promise<void> {
  return new Promise<void>(resolve => {
    view.requestAnimationFrame(() => {
      view.setTimeout(resolve, 0);
    });
  });
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
  /**
   * Calls `listener` each time a load completes, until the returned function
   * removes it. A host that renders the loaded module subscribes with this.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Loads the module and resolves whether it loaded. A failure calls the
   * loader's `onLoadFailure` and resolves false; it is not kept, as `load`
   * says.
   */
  tryLoad(): Promise<boolean>;
}

interface ModuleLoaderOptions {
  /** Called when a `tryLoad` fails, for example to warn once. */
  onLoadFailure?: () => void;
}

export function createModuleLoader<T>(
  importModule: () => Promise<T>,
  {onLoadFailure}: ModuleLoaderOptions = {},
): ModuleLoader<T> {
  let module: T | null = null;
  let pending: Promise<T> | null = null;
  const listeners = new Set<() => void>();
  const load = async (): Promise<T> => {
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
  };
  return {
    load,
    loaded: () => module,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async tryLoad() {
      try {
        await load();
      } catch {
        onLoadFailure?.();
        return false;
      }
      for (const listener of listeners) {
        listener();
      }
      return true;
    },
  };
}
