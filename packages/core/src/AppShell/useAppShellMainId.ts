// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAppShellMainId.ts
 * @input The mounted AppShell instances on the page
 * @output The id each AppShell main region uses: the fixed
 *   `astryx-app-shell-main` for the first mounted shell, a generated id for
 *   every other shell
 * @position Private to AppShell; keeps main-region ids unique on a page
 */

import {useId, useState, useSyncExternalStore} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';

/** The id of the first mounted shell's main region. Consumers link to it. */
export const MAIN_CONTENT_ID = 'astryx-app-shell-main';

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
 * The main-region id for one AppShell. The first mounted shell keeps the
 * fixed id, so skip links and selectors that name it keep working. A shell
 * that mounts while another holds it takes a generated id, so the page has
 * no duplicate ids. Before mount, and on the server, a shell uses the fixed
 * id; a second shell changes to its own id in the same commit it mounts.
 */
export function useAppShellMainId(): string {
  const generatedId = useId();
  const [claim] = useState(() => ({}));
  const isFirst = useSyncExternalStore(
    subscribe,
    () => claims.length === 0 || claims[0] === claim,
    () => true,
  );

  useIsomorphicLayoutEffect(() => {
    claims.push(claim);
    notify();
    return () => {
      claims.splice(claims.indexOf(claim), 1);
      notify();
    };
  }, [claim]);

  return isFirst ? MAIN_CONTENT_ID : `astryx-app-shell-main-${generatedId}`;
}
