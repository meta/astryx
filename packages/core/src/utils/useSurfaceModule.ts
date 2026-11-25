// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSurfaceModule.ts
 * @input A module loader for a surface that loads on demand
 * @output Exports `useSurfaceModule`: the loaded module, or null while it
 *   loads, after its load failed, on the server, and while hydrating
 * @position Internal utility for surfaces that load on demand. A failed load
 *   leaves the page working: the surface renders nothing. The owner's open
 *   handler asks the loader again and drops an open whose load failed.
 */

import {useEffect, useRef, useSyncExternalStore} from 'react';
import {useIsHydrating} from '../hooks/useIsHydrating';
import type {ModuleLoader} from './moduleLoader';

const readNoModule = (): null => null;

/**
 * The module of a surface that loads on demand. The surface asks for its
 * module once, when it first renders without it; later asks belong to its
 * owner's open handler. It never suspends, so a failed load reaches no error
 * boundary.
 *
 * @param loader - The shared loader of the surface's module
 * @returns The module once loaded, else null
 */
export function useSurfaceModule<T>(loader: ModuleLoader<T>): T | null {
  const module = useSyncExternalStore(
    loader.subscribe,
    loader.loaded,
    readNoModule,
  );
  const isHydrating = useIsHydrating();
  const hasAskedRef = useRef(false);
  // Syncs the surface with its module loader: the first render without the
  // module loads it in the background, never during render.
  useEffect(() => {
    if (isHydrating || module != null || hasAskedRef.current) {
      return;
    }
    hasAskedRef.current = true;
    void loader.tryLoad();
  }, [isHydrating, loader, module]);
  return isHydrating ? null : module;
}
