// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSurfaceModule.ts
 * @input A module loader for a surface that loads on demand, and whether that
 *   surface is open
 * @output Exports `useSurfaceModule`: the loaded module, or null while it
 *   loads, after its load failed, on the server, and while hydrating
 * @position Internal utility for surfaces that load on demand. A failed load
 *   leaves the page working: the surface renders nothing, its owner can drop
 *   the open, and the next open asks the loader again.
 */

import {useEffect, useSyncExternalStore} from 'react';
import {useCommittedRef} from '../hooks/useCommittedRef';
import {useIsHydrating} from '../hooks/useIsHydrating';
import type {ModuleLoader} from './moduleLoader';

const readNoModule = (): null => null;

interface SurfaceModuleOptions {
  /** Whether the surface is open. Each open asks again after a failed load. */
  readonly isOpen?: boolean;
  /** Called when a load this surface asked for fails. */
  readonly onLoadFailure?: () => void;
}

/**
 * The module of a surface that loads on demand. The surface asks for its
 * module when it renders without it, and again on each open after a failed
 * load. It never suspends, so a failed load reaches no error boundary.
 *
 * @param loader - The shared loader of the surface's module
 * @param options - Whether the surface is open, and what a failed load does
 * @returns The module once loaded, else null
 */
export function useSurfaceModule<T>(
  loader: ModuleLoader<T>,
  {isOpen = false, onLoadFailure}: SurfaceModuleOptions = {},
): T | null {
  const module = useSyncExternalStore(
    loader.subscribe,
    loader.loaded,
    readNoModule,
  );
  const isHydrating = useIsHydrating();
  const onLoadFailureRef = useCommittedRef(onLoadFailure);
  // Syncs the surface with its module loader: the module loads in the
  // background, never during render.
  useEffect(() => {
    if (isHydrating || module != null) {
      return;
    }
    let isCurrent = true;
    void loader.tryLoad().then(isLoaded => {
      if (!isLoaded && isCurrent) {
        onLoadFailureRef.current?.();
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [isHydrating, isOpen, loader, module, onLoadFailureRef]);
  return isHydrating ? null : module;
}
