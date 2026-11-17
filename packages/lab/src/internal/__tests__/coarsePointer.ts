// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file coarsePointer.ts
 * @input jsdom's window and Core's touch query (its internal touch entry)
 * @output coarsePrimaryPointer(): a phone's primary pointer, until restored
 * @position Test helper of packages/lab/src/internal. jsdom has no
 *   matchMedia, and Core's gesture host listens only under a coarse pointer.
 */

import {TOUCH_QUERY} from '@astryxdesign/core/internal/touch';

/** The primary pointer is coarse until the returned restore runs. */
export function coarsePrimaryPointer(): () => void {
  const hadOwn = Object.prototype.hasOwnProperty.call(window, 'matchMedia');
  const original = window.matchMedia;
  window.matchMedia = (query: string) =>
    ({
      matches: query.trim() === TOUCH_QUERY,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  return () => {
    if (hadOwn) {
      window.matchMedia = original;
    } else {
      delete (window as {matchMedia?: unknown}).matchMedia;
    }
  };
}
