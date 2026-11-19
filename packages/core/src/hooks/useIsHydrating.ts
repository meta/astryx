// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useIsHydrating.ts
 * @input Uses React useSyncExternalStore
 * @output Exports useIsHydrating (internal; not re-exported from hooks/index.ts)
 * @position Internal utility; read by useEntryAnimation so markup that
 *   hydrates server HTML matches the server (spec:AST-013 FR9, FR13)
 *
 * React renders with the server snapshot on the server and again in the
 * client render that hydrates server HTML, then re-renders with the client
 * snapshot. Code that must render the server's markup while hydrating reads
 * this instead of a first-paint flag, timer, animation frame, or mount Effect.
 */

import {useSyncExternalStore} from 'react';

// Nothing ever changes, so there is nothing to subscribe to.
const subscribe = () => () => {};
const getSnapshot = () => false;
const getServerSnapshot = () => true;

/**
 * Returns `true` during server render and during the client render that
 * hydrates server HTML; `false` in every other client render.
 */
export function useIsHydrating(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
