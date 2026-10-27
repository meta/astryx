// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file coarsePointer.ts
 * @input A window
 * @output Exports COARSE_POINTER_QUERY, isCoarsePointer and
 *   watchCoarsePointer: whether the primary pointer is coarse, and when it
 *   changes
 * @position The coarse-pointer gate of packages/core/src/gestures and of
 *   the press controller (pressFeedback.ts): touch-only work registers only
 *   while it holds
 *
 * Touch work runs only where the primary pointer is coarse; where it is
 * fine, no recognizer attaches and no touch-only listener is registered, so
 * a finger on a touchscreen whose primary pointer is fine gets the browser's
 * defaults (`spec:AST-094` FR19, FR24). The query is TOUCH_QUERY
 * (touchPresentation.ts), spelled here because that module brings
 * React; a test keeps the two equal. The answer can change while the page is
 * open (a tablet docking a mouse), so a holder watches it.
 *
 * SYNC: When modified, update touchPresentation.ts (TOUCH_QUERY) and
 * coarsePointer.test.ts.
 */

/** TOUCH_QUERY: the primary pointer is coarse. */
export const COARSE_POINTER_QUERY = '(pointer: coarse)';

/** Whether the primary pointer of `view` is coarse now. */
export function isCoarsePointer(view: Window | null | undefined): boolean {
  return (
    typeof view?.matchMedia === 'function' &&
    view.matchMedia(COARSE_POINTER_QUERY).matches
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
  const query = view.matchMedia(COARSE_POINTER_QUERY);
  const onChange = (): void => listener(query.matches);
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }
  // Safari before 14 only has the older pair.
  query.addListener(onChange);
  return () => query.removeListener(onChange);
}
