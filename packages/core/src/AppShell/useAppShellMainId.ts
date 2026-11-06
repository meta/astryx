// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAppShellMainId.ts
 * @input The mounted AppShell instances on the page
 * @output The id each AppShell main region uses: the fixed
 *   `astryx-app-shell-main` for the first mounted outermost shell, a
 *   generated id for every other shell; AppShellNestingContext
 * @position Private to AppShell; keeps main-region ids unique on a page
 */

import {use, useId, useState, useSyncExternalStore} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {createSharedContext} from '../utils/sharedContext';

/** The id of the first mounted shell's main region. Consumers link to it. */
export const MAIN_CONTENT_ID = 'astryx-app-shell-main';

/**
 * True inside an AppShell. A shell nested in another shell's content never
 * takes the fixed id: the page's own shell keeps it.
 */
export const AppShellNestingContext = createSharedContext(
  'AppShellNestingContext',
  1,
  false,
);
AppShellNestingContext.displayName = 'AppShellNestingContext';

const claims: object[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * The main-region id for one AppShell. The first mounted outermost shell
 * keeps the fixed id, so skip links and selectors that name it keep working.
 * A nested shell, or one that mounts while another holds the fixed id, takes
 * a generated id, so the page has no duplicate ids. On the server and in its
 * first commit, an outermost shell uses the fixed id. Any other outermost
 * shell then changes to its own id.
 */
export function useAppShellMainId(): string {
  const generatedId = useId();
  const isNested = use(AppShellNestingContext);
  const [claim] = useState(() => ({}));
  const isFirst = useSyncExternalStore(
    subscribe,
    () => claims.length === 0 || claims[0] === claim,
    () => true,
  );

  // Syncs this shell's claim in the page-wide claim list with its mount.
  useIsomorphicLayoutEffect(() => {
    if (isNested) {
      return;
    }
    claims.push(claim);
    notify();
    return () => {
      claims.splice(claims.indexOf(claim), 1);
      notify();
    };
  }, [claim, isNested]);

  return isFirst && !isNested
    ? MAIN_CONTENT_ID
    : `astryx-app-shell-main-${generatedId}`;
}
