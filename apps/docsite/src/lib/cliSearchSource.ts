// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The search panel's source: each query goes to the site's search API
 * (app/api/search/route.ts), which runs `astryx search`, and its results come
 * back in the CLI's order. The page sends one search request at a time (the
 * warm-up counts as one), and only the newest query once the server is free.
 * @position Consumed by SearchPalette.tsx.
 *
 * Items carry no `group`, since CommandPalette orders grouped items by group
 * and the CLI's order is the answer. Each place on the site is listed once.
 */

import type {SearchSource, SearchableItem} from '@astryxdesign/core/Typeahead';
import type {SiteSearchResult} from './cliSearchTypes';
import {runningSearchWarmup} from './searchWarmup';

export interface CliSearchItem extends SearchableItem<SiteSearchResult> {
  id: string;
  label: string;
  auxiliaryData: SiteSearchResult;
}

/**
 * What a selected result opens, as the site's registries name it: the page's
 * type and its identifier (component name, template slug, doc topic).
 */
export function searchTarget(href: string): {item: string; type: string} {
  const [pathname] = href.split('#');
  const [, area = '', slug = ''] = pathname.split('/');
  const type =
    area === 'components'
      ? 'component'
      : area === 'templates'
        ? 'template'
        : area === 'themes'
          ? 'theme'
          : area === 'docs'
            ? 'doc'
            : 'page';
  return {item: slug || area || 'home', type};
}

/** The kind a result is, as the panel labels it. */
export function resultKind(result: SiteSearchResult): string {
  switch (result.domain) {
    case 'component':
      return 'Component';
    case 'hook':
      return 'Hook';
    case 'doc':
      return 'Docs';
    case 'template':
      return result.kind === 'block' ? 'Block' : 'Template';
    case 'theme':
      return 'Theme';
    default:
      return result.domain;
  }
}

/** The panel item for one result, in the order the CLI gave it. */
export function toSearchItem(
  result: SiteSearchResult,
  position: number,
): CliSearchItem {
  const label =
    result.domain === 'doc'
      ? (result.siteTitle ?? result.title ?? result.name)
      : (result.displayName ?? result.name);
  return {
    // Two results can open the same page (sections, blocks), so the id is
    // the position, never the link.
    id: `${position}:${result.domain}:${result.name}${result.section ? `#${result.section}` : ''}`,
    label,
    auxiliaryData: result,
  };
}

/** How long typing must pause before a query is sent. */
const DEBOUNCE_MS = 120;

/**
 * The longest a query waits for the request before it (or the warm-up):
 * longer than a cold start, so a request that never answers holds nothing for
 * good.
 */
export const SERVER_WAIT_MS = 10_000;

/**
 * A SearchSource that answers with `astryx search`, through the site's API.
 * @param fetchSearch - Fetches one query's response; the site passes `fetch`.
 * @param runningWarmup - The page's running warm-up (lib/searchWarmup.ts), or
 *   null.
 */
export function createCliSearchSource(
  fetchSearch: (url: string, init: RequestInit) => Promise<Response> = (
    url,
    init,
  ) => fetch(url, init),
  runningWarmup: () => Promise<void> | null = runningSearchWarmup,
): SearchSource<CliSearchItem> & {
  item(id: string): CliSearchItem | undefined;
} {
  // The items of the newest answer, by id, for the panel's selection.
  let shown = new Map<string, CliSearchItem>();
  let inFlight: AbortController | null = null;

  // The request the server is working on, settled or not.
  let serverBusy: Promise<unknown> = Promise.resolve();

  /**
   * Send one query when the server is free. A search server is blocked while
   * it works on a request (and for seconds while it starts), so the host
   * sends a request that arrives meanwhile to another server, which may start
   * cold. So the page keeps one request at a time: a query waits for the
   * request before it and for a running warm-up, at most SERVER_WAIT_MS. A
   * request already sent is not cancelled when a newer query replaces it: the
   * server finishes it anyway, and the newer query waits for it.
   */
  async function sendQuery(
    url: string,
    signal: AbortSignal,
  ): Promise<Response> {
    const warmup = runningWarmup();
    await whenSettled(
      warmup ? Promise.all([serverBusy, warmup]) : serverBusy,
      signal,
    );
    const request = fetchSearch(url, {});
    serverBusy = request.catch(() => {});
    return (await whenSettled(request, signal, false)) as Response;
  }

  return {
    bootstrap() {
      return [];
    },
    async search(query) {
      if (query.trim() === '') {
        return [];
      }
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, DEBOUNCE_MS);
          controller.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(controller.signal.reason);
          });
        });
        const response = await sendQuery(
          `/api/search?q=${encodeURIComponent(query)}`,
          controller.signal,
        );
        if (!response.ok) {
          throw new Error(`search: HTTP ${response.status}`);
        }
        const body = (await response.json()) as {
          data: {results: SiteSearchResult[]};
        };
        // A newer query replaced this one while its answer was read.
        controller.signal.throwIfAborted();
        // Two results can open the same place on the site (a topic and the
        // page that shows it): the panel lists each place once, at its
        // first result, keeping the CLI's order.
        const opened = new Set<string>();
        const items = body.data.results
          .filter(result => {
            if (opened.has(result.href)) {
              return false;
            }
            opened.add(result.href);
            return true;
          })
          .map(toSearchItem);
        shown = new Map(items.map(item => [item.id, item]));
        return items;
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error(error);
        }
        return [];
      }
    },
    item(id) {
      return shown.get(id);
    },
    cancel() {
      inFlight?.abort();
      inFlight = null;
    },
  };
}

/**
 * `work`'s outcome, or a rejection with `signal`'s reason once it aborts.
 * With `capped`, resolve after SERVER_WAIT_MS at the latest.
 */
function whenSettled<T>(
  work: Promise<T>,
  signal: AbortSignal,
  capped = true,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const timer = capped
      ? setTimeout(() => finish(() => resolve(undefined)), SERVER_WAIT_MS)
      : undefined;
    const onAbort = () => finish(() => reject(signal.reason));
    function finish(settle: () => void) {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      settle();
    }
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, {once: true});
    work.then(
      value => finish(() => resolve(value)),
      error => finish(() => reject(error)),
    );
  });
}
