// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Decide whether the default static HTML matches the incoming query.
 * @input Route and URL search string.
 * @output Whether React can safely hydrate instead of client-rendering.
 * @position Prevents mismatches for iframe themes and for pages whose first
 *   render reads URL controls (Shell Lab, Perf Scenes, Chat Layout,
 *   AlertDialog Cases, List Reorder Cases).
 */

/** Pages whose first render reads the query string. */
const QUERY_RENDERED_PAGES = new Set([
  '/pages/shell-lab/',
  '/pages/perf-scenes/',
  '/pages/chat-layout/',
  '/pages/alert-dialog-cases/',
  '/pages/list-reorder-cases/',
]);

export function canHydrate(route: string | undefined, search: string): boolean {
  const params = new URLSearchParams(search);
  return (
    params.get('embed') !== '1' &&
    !(route != null && QUERY_RENDERED_PAGES.has(route) && search.length > 0)
  );
}
