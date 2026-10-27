// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pointerQuery.ts
 * @input jsdom's window.matchMedia
 * @output coarsePrimaryPointer() and pointerQuery(): the primary pointer a
 *   test needs, until restored
 * @position Test helper of packages/core/src/gestures
 *
 * jsdom's matchMedia models a desktop, whose primary pointer is fine, and
 * the gesture host attaches nothing there (`spec:AST-094` FR19). A test of
 * touch behaviour models a phone with coarsePrimaryPointer(); a test of the
 * gate itself drives pointerQuery() and fires its change.
 */

import {COARSE_POINTER_QUERY} from '../../utils/coarsePointer';

/** The primary pointer as a test sets it. */
export interface PointerQuery {
  /** Turn the primary pointer coarse or fine, firing `change`. */
  set(isCoarse: boolean): void;
  /** Put jsdom's matchMedia back. */
  readonly restore: () => void;
}

/**
 * The primary pointer is coarse (`isCoarse`) or fine until `restore` runs;
 * `set` changes it as a tablet docking a mouse would.
 */
export function pointerQuery(isCoarse: boolean): PointerQuery {
  const matchMedia = window.matchMedia;
  const listeners = new Set<() => void>();
  let coarse = isCoarse;
  const query = {
    get matches() {
      return coarse;
    },
    media: COARSE_POINTER_QUERY,
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener);
    },
    addListener: (listener: () => void) => {
      listeners.add(listener);
    },
    removeListener: (listener: () => void) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
  window.matchMedia = (media: string) =>
    media.trim() === COARSE_POINTER_QUERY ? query : matchMedia(media);
  return {
    set(next) {
      if (next === coarse) {
        return;
      }
      coarse = next;
      for (const listener of [...listeners]) {
        listener();
      }
    },
    restore: () => {
      window.matchMedia = matchMedia;
    },
  };
}

/** The primary pointer is coarse (a phone, a tablet) until the restore runs. */
export function coarsePrimaryPointer(): () => void {
  return pointerQuery(true).restore;
}
