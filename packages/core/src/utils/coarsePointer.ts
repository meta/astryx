// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file coarsePointer.ts
 * @input A window
 * @output Exports isCoarsePointer, matchesMediaQuery, watchCoarsePointer and
 *   watchMediaQuery: whether the primary pointer is coarse (TOUCH_QUERY) or
 *   any media query matches, and when either changes
 * @position The coarse-pointer gate of packages/core/src/gestures and of
 *   the press controller (pressFeedback.ts): touch-only work registers only
 *   while it holds. useMediaQuery and the presentation resolvers read and
 *   watch through matchesMediaQuery and watchMediaQuery
 *
 * Under a coarse primary pointer, a phone's touch work stays registered: the
 * gesture host's page listeners, the page hold and the finger scroll. Under a
 * fine one, recognizers still attach, and the host listens on the page only
 * during a press (AST-094). The answer can change while the page is open (a
 * tablet docking a mouse), so a holder watches it.
 *
 * SYNC: When modified, update coarsePointer.test.ts.
 */

import {TOUCH_QUERY} from './touchQueries';

/** Whether the primary pointer of `view` is coarse now. */
export function isCoarsePointer(view: Window | null | undefined): boolean {
  return matchesMediaQuery(view, TOUCH_QUERY);
}

/**
 * Whether `query` matches in `view` now. False where `view` has no
 * `matchMedia`, as in a test DOM.
 */
export function matchesMediaQuery(
  view: Window | null | undefined,
  query: string,
): boolean {
  return (
    typeof view?.matchMedia === 'function' && view.matchMedia(query).matches
  );
}

/**
 * Call `listener` with the new answer each time `query` starts or stops
 * matching in `view`, until the returned function is called.
 */
export function watchMediaQuery(
  view: Window | null | undefined,
  query: string,
  listener: (matches: boolean) => void,
): () => void {
  if (typeof view?.matchMedia !== 'function') {
    return () => {};
  }
  const list = view.matchMedia(query);
  const onChange = (): void => listener(list.matches);
  if (typeof list.addEventListener === 'function') {
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }
  // Safari before 14 only has the older pair.
  list.addListener(onChange);
  return () => list.removeListener(onChange);
}

/**
 * Call `listener` with the new answer each time the primary pointer of
 * `view` turns coarse or fine, until the returned function is called.
 */
export function watchCoarsePointer(
  view: Window | null | undefined,
  listener: (isCoarse: boolean) => void,
): () => void {
  return watchMediaQuery(view, TOUCH_QUERY, listener);
}
