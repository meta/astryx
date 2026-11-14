// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file emulateTouch.ts
 * @input vitest's global stubs; the touch presentation resolver's query
 * @output emulateTouch — jsdom answers as a device driven by a finger: the
 *   primary pointer is coarse, and TOUCH_QUERY matches. So the animator treats
 *   every change as a touch presentation's, which cross-fades under Reduce
 *   Motion. Undo with `vi.unstubAllGlobals()`.
 * @position Test helper for the swipe-action unit tests (Item, List)
 */

import {vi} from 'vitest';
import {TOUCH_QUERY} from '../../utils/touchPresentation';

/** Answer as a touch device (a coarse primary pointer), until the globals are unstubbed. */
export function emulateTouch(): void {
  const matchMedia = window.matchMedia.bind(window);
  vi.stubGlobal('matchMedia', (query: string) => {
    const list = matchMedia(query);
    return query === TOUCH_QUERY ? {...list, matches: true} : list;
  });
}
