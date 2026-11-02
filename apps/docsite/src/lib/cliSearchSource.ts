// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The search panel's source: each query goes to the site's search API
 * (app/api/search/route.ts), which runs `astryx search`, and its results come
 * back in the CLI's order. A query still unanswered after HEDGE_MS, or when
 * the page's warm-up answers first, is sent once more, so it can reach a warm
 * server instead of waiting out a cold one.
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
 * How long a query may go unanswered before it is sent once more. A warm
 * server answers well within it; a request still waiting has most likely
 * started a cold server, and the host sends the second request to another,
 * often warm, one.
 */
export const HEDGE_MS = 1500;

/**
 * A SearchSource that answers with `astryx search`, through the site's API.
 * @param fetchSearch - Fetches one query's response; the site passes `fetch`.
 * @param runningWarmup - The page's running warm-up (lib/searchWarmup.ts), or
 *   null.
 * @param hedgeMs - How long a query may go unanswered before it is sent once
 *   more.
 */
export function createCliSearchSource(
  fetchSearch: (url: string, init: RequestInit) => Promise<Response> = (
    url,
    init,
  ) => fetch(url, init),
  runningWarmup: () => Promise<void> | null = runningSearchWarmup,
  hedgeMs: number = HEDGE_MS,
): SearchSource<CliSearchItem> & {
  item(id: string): CliSearchItem | undefined;
} {
  // The items of the newest answer, by id, for the panel's selection.
  let shown = new Map<string, CliSearchItem>();
  let inFlight: AbortController | null = null;

  /**
   * Fetch one query at once, so an answer the edge cache holds is never held
   * back. If it is still unanswered after HEDGE_MS, or when the page's warm-up
   * answers, send it once more and take whichever answer comes first: the
   * first request may be waiting on a cold server while another is warm.
   */
  async function sendQuery(url: string, signal: AbortSignal) {
    // Each attempt has its own controller, which the query's signal aborts
    // (also while the winner's body is read, as a single request's would be).
    const attempts: AbortController[] = [];
    const attempt = (): Promise<{response: Response; index: number}> => {
      const attemptController = new AbortController();
      const index = attempts.push(attemptController) - 1;
      const followQuery = () => attemptController.abort(signal.reason);
      signal.addEventListener('abort', followQuery, {once: true});
      return fetchSearch(url, {signal: attemptController.signal}).then(
        response => ({response, index}),
      );
    };
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
    const hedge = new Promise<'again'>(resolve => {
      hedgeTimer = setTimeout(() => resolve('again'), hedgeMs);
      runningWarmup()?.then(() => resolve('again'));
    });
    let winner = -1;
    try {
      const first = attempt();
      const outcome = await Promise.race([first, hedge]);
      const won =
        outcome === 'again' ? await Promise.any([first, attempt()]) : outcome;
      winner = won.index;
      return won.response;
    } finally {
      clearTimeout(hedgeTimer);
      // Stop the request that lost; never the one whose answer is read.
      attempts.forEach((controller, index) => {
        if (index !== winner) {
          controller.abort();
        }
      });
    }
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
