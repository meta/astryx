// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAdaptivePresentation.ts
 * @input Uses React's external-store subscription over window.matchMedia
 *   and the touch presentation's compact-touch query
 * @output Resolves popover/bottom-sheet presentation policy
 * @position Internal overlay policy shared across component families
 */

import {useCallback, useSyncExternalStore} from 'react';
import {
  COMPACT_TOUCH_QUERY,
  useCompactDefinition,
} from '../utils/touchPresentation';

export type AdaptivePresentation = 'popover' | 'bottom-sheet' | 'adaptive';
export type ResolvedAdaptivePresentation = Exclude<
  AdaptivePresentation,
  'adaptive'
>;

// A sheet needs both a compact viewport and a coarse primary pointer: tablets
// and large touch displays stay anchored, phones in either orientation get
// the sheet. Compact is the active theme's definition (spec:AST-012 FR9);
// this constant is its value at the default width points.
export const COMPACT_TOUCH_PRESENTATION_QUERY = COMPACT_TOUCH_QUERY;

const noSubscription = () => () => {};
const notCompact = () => false;

/**
 * Resolve `adaptive` against the active theme's compact-touch query
 * (`useCompactDefinition()`, so a theme that moves `md` is honored —
 * spec:AST-012 FR9). Only an `adaptive` presentation subscribes to
 * `matchMedia`; a fixed presentation never reads the query, so it holds no
 * listener for it (`architecture:react-component-runtime` INV5). SSR-safe:
 * the server snapshot is "not compact", as `useMediaQuery`'s default is.
 */
export function useAdaptivePresentation(
  presentation: AdaptivePresentation,
): ResolvedAdaptivePresentation {
  const isAdaptive = presentation === 'adaptive';
  const query = useCompactDefinition().coarsePointerQuery;
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!isAdaptive) {
        return noSubscription();
      }
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onStoreChange);
      return () => mql.removeEventListener('change', onStoreChange);
    },
    [isAdaptive, query],
  );
  const getSnapshot = useCallback(
    () => (isAdaptive ? window.matchMedia(query).matches : false),
    [isAdaptive, query],
  );
  const isCompactTouch = useSyncExternalStore(
    subscribe,
    getSnapshot,
    notCompact,
  );
  return isAdaptive
    ? isCompactTouch
      ? 'bottom-sheet'
      : 'popover'
    : presentation;
}
