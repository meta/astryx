// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file coarsePointer.ts
 * @input A window
 * @output Exports isCoarsePointer, watchCoarsePointer and watchMediaQuery:
 *   whether the primary pointer is coarse (TOUCH_QUERY), and when it or any
 *   media query changes
 * @position The coarse-pointer gate of packages/core/src/gestures and of
 *   the press controller (pressFeedback.ts): touch-only work registers only
 *   while it holds. useMediaQuery watches through watchMediaQuery
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
  return (
    typeof view?.matchMedia === 'function' &&
    view.matchMedia(TOUCH_QUERY).matches
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
