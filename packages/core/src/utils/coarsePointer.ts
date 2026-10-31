// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file coarsePointer.ts
 * @input A window
 * @output Exports isCoarsePointer and watchCoarsePointer: whether the
 *   primary pointer is coarse (TOUCH_QUERY), and when it changes
 * @position The coarse-pointer gate of packages/core/src/gestures and of
 *   the press controller (pressFeedback.ts): touch-only work registers only
 *   while it holds
 *
 * Where the primary pointer is coarse, a phone's touch work stays
 * registered: the gesture host's page listeners, the page hold and the
 * finger scroll. Where it is fine, recognizers still attach for every
 * pointer, and the host listens on the page only during a press
 * (`spec:AST-094` FR19, FR24, FR43). The query is TOUCH_QUERY, from
 * touchQueries.ts, which loads without React. The answer can change while
 * the page is open (a tablet docking a mouse), so a holder watches it.
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
 * Call `listener` with the new answer each time the primary pointer of
 * `view` turns coarse or fine, until the returned function is called.
 */
export function watchCoarsePointer(
  view: Window | null | undefined,
  listener: (isCoarse: boolean) => void,
): () => void {
  if (typeof view?.matchMedia !== 'function') {
    return () => {};
  }
  const query = view.matchMedia(TOUCH_QUERY);
  const onChange = (): void => listener(query.matches);
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }
  // Safari before 14 only has the older pair.
  query.addListener(onChange);
  return () => query.removeListener(onChange);
}
