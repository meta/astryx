// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file types.ts
 * @input None
 * @output Exports shared types for Typeahead and Tokenizer components
 * @position Shared type definitions; consumed by BaseTypeahead, Typeahead, Tokenizer
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Typeahead/index.ts
 */

import type {ReactNode} from 'react';

/**
 * Minimal item interface for search results.
 * Extend with `auxiliaryData` for custom data per item.
 *
 * @example
 * ```tsx
 * interface UserItem extends SearchableItem<{ avatar: string; role: string }> {}
 *
 * const user: UserItem = {
 *   id: '1',
 *   label: 'Jane Doe',
 *   auxiliaryData: { avatar: '/jane.jpg', role: 'Engineer' },
 * };
 * ```
 */
export interface SearchableItem<TAuxData = unknown> {
  /**
   * Unique identifier for the item.
   */
  id: string;

  /**
   * Display label for the item.
   */
  label: string;

  /**
   * The item's secondary control as one node the caller renders and names;
   * the same key with the same type as `SelectorOptionData.action`
   * (`spec:AST-058`). The typeahead panel does not render it yet and warns in
   * development when an item carries one. Absent and `null` mean the same:
   * none.
   */
  action?: ReactNode;

  /**
   * Pre-rendered element for SSR compatibility.
   * When provided, takes priority over `renderItem` and default label rendering.
   */
  element?: ReactNode;

  /**
   * Arbitrary extra data associated with the item.
   * Use generics to type this for your specific use case.
   */
  auxiliaryData?: TAuxData;
}

/**
 * Per-call context a typeahead passes as the second argument of
 * `SearchSource.search` (`spec:AST-092`).
 */
export interface SearchContext<T extends SearchableItem = SearchableItem> {
  /**
   * Show a list for this query before `search()` settles, such as matches the
   * page already holds while the server is still answering.
   *
   * Every list is the source's complete answer at that moment. The first list
   * shown for a query may replace the rows; every later list for the same
   * query, including the value `search()` returns, keeps the rows already
   * shown first and in order and adds new rows only after them. An empty list
   * leaves the shown rows in place. Calls for a query that is no longer
   * current, or after `search()` settles, are ignored.
   */
  update(items: T[]): void;
}

/**
 * Search source interface for providing items to typeahead components.
 * Supports both synchronous and asynchronous search.
 *
 * @example
 * ```tsx
 * // Sync search source
 * const fruitSource: SearchSource = {
 *   search: (query) => fruits.filter(f => f.label.includes(query)),
 *   bootstrap: () => fruits.slice(0, 5),
 * };
 *
 * // Async search source with cancel support
 * const userSource: SearchSource<UserItem> = {
 *   _controller: null as AbortController | null,
 *   cancel() { this._controller?.abort(); },
 *   async search(query) {
 *     this.cancel();
 *     this._controller = new AbortController();
 *     const res = await fetch(`/api/users?q=${query}`, {
 *       signal: this._controller.signal,
 *     });
 *     return res.json();
 *   },
 *   async bootstrap() {
 *     const res = await fetch('/api/users/recent');
 *     return res.json();
 *   },
 * };
 * ```
 */
export interface SearchSource<T extends SearchableItem = SearchableItem> {
  /**
   * Called on query change. Returns matching items: the final, complete list
   * for the query. Can be synchronous or asynchronous.
   *
   * A typeahead that can show partial lists passes `context`; call
   * `context.update(items)` to show a list before returning, for example local
   * matches first and the server's answer appended after them. Callers that
   * cannot show partial lists omit `context` and show only the return value.
   *
   * For expensive operations (API calls, large datasets), consider caching
   * results internally to avoid redundant work on repeated queries.
   */
  search(query: string, context?: SearchContext<T>): Promise<T[]> | T[];

  /**
   * Called on init/focus. Returns initial/default items.
   * Can be synchronous or asynchronous.
   */
  bootstrap(): Promise<T[]> | T[];

  /**
   * Cancel any in-flight search. Called when a new search supersedes
   * a previous one, or when the dropdown closes.
   *
   * Useful for aborting network requests (e.g., via `AbortController`).
   * Optional — if not implemented, previous searches simply resolve and
   * their results are discarded.
   */
  cancel?(): void;
}
