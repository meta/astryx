// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file busyIndicatorLane.tsx
 * @input A wrapper's loading setter, provided around BaseTypeahead
 * @output Context the base uses to hand its busy state to that wrapper
 * @position Package-internal; not exported from the package entry point
 */

import {createContext, use, useSyncExternalStore} from 'react';

/**
 * How the base hands its busy state to a wrapper that owns the inline-end lane.
 *
 * Typeahead and Tokenizer both render a clear button and end content in one
 * corner, and both want the busy indicator in that same lane rather than a
 * second one competing for the corner. The base is the only thing that knows
 * when a search starts or settles, so that state has to travel from the base
 * out to its wrapper.
 *
 * A CONTEXT rather than a prop, because a prop cannot be package-internal here:
 * `BaseTypeaheadProps` is re-exported from the package entry point, so every
 * name on it ships as public API however it is commented — an `@internal` tag
 * is a note to a reader, not a boundary. A builder reading the exported
 * declaration would find `__onLoadingChange` and could reasonably wire it,
 * pinning a handoff between two wrappers and their base as permanent API.
 *
 * This module is not exported from `index.ts`, so the seam is closed by module
 * boundary instead of by naming convention.
 */
export interface BusyIndicatorLane {
  /** Called by the base when a search starts or settles. */
  onBusyChange: (isBusy: boolean) => void;
  /** Subscribe to transitions; returns an unsubscribe. */
  subscribe: (onStoreChange: () => void) => () => void;
  /** The current busy state. */
  getIsBusy: () => boolean;
}

/**
 * A store, deliberately, rather than a setState handed down.
 *
 * The busy state has exactly one owner — the base, which is the only thing
 * that knows a search has started — and a wrapper needs it only to decide
 * whether one Spinner is on screen. Pushing it into the wrapper's own state
 * made every one of the wrapper's children re-render on each transition:
 * a Tokenizer holding twenty selected tokens re-rendered all twenty at search
 * start and again at settlement, for a glyph none of them contain.
 *
 * Holding it here instead lets the single leaf that paints the indicator
 * subscribe on its own, so a transition re-renders that leaf and nothing else.
 * The wrapper reads the state at no point, so it never re-renders for it.
 */
export function createBusyIndicatorLane(): BusyIndicatorLane {
  let isBusy = false;
  const listeners = new Set<() => void>();
  return {
    onBusyChange(next: boolean) {
      // Edge-triggered: the base already guards its own redundant reports,
      // and this keeps a second caller from waking every subscriber for a
      // state they are already rendering.
      if (isBusy === next) {
        return;
      }
      isBusy = next;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(onStoreChange: () => void) {
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
      };
    },
    getIsBusy: () => isBusy,
  };
}

/**
 * Subscribe to a lane's busy state.
 *
 * Call this ONLY from the leaf that paints the indicator. Calling it from a
 * wrapper re-introduces the re-render this store exists to remove.
 *
 * The server snapshot is the same getter: the store starts idle, and a search
 * cannot have begun during SSR.
 */
export function useIsBusy(lane: BusyIndicatorLane): boolean {
  return useSyncExternalStore(lane.subscribe, lane.getIsBusy, lane.getIsBusy);
}

const BusyIndicatorLaneContext = createContext<BusyIndicatorLane | null>(null);
BusyIndicatorLaneContext.displayName = 'BusyIndicatorLaneContext';

export const BusyIndicatorLaneProvider = BusyIndicatorLaneContext.Provider;

/**
 * The wrapper's lane, or null when the base is used directly.
 *
 * Null is the released behaviour: the base renders its own visible, named
 * status. Non-null means a wrapper paints it instead, so the base renders
 * nothing and the two cannot both appear.
 */
export function useBusyIndicatorLane(): BusyIndicatorLane | null {
  return use(BusyIndicatorLaneContext);
}
