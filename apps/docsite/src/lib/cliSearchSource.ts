// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The search panel's source: each query goes to the site's search API
 * (app/api/search/route.ts), which runs `astryx search`, and its results come
 * back in the CLI's order.
 * @position Consumed by SearchPalette.tsx.
 *
 * Items carry no `group`, since CommandPalette orders grouped items by group
 * and the CLI's order is the answer. Each place on the site is listed once.
 */

import type {SearchSource, SearchableItem} from '@astryxdesign/core/Typeahead';
import type {SiteSearchResult} from './cliSearchTypes';

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
 * A SearchSource that answers with `astryx search`, through the site's API.
 * @param fetchSearch - Fetches one query's response; the site passes `fetch`.
 */
export function createCliSearchSource(
  fetchSearch: (url: string, init: RequestInit) => Promise<Response> = (
    url,
    init,
  ) => fetch(url, init),
): SearchSource<CliSearchItem> & {
  item(id: string): CliSearchItem | undefined;
} {
  // The items of the newest answer, by id, for the panel's selection.
  let shown = new Map<string, CliSearchItem>();
  let inFlight: AbortController | null = null;

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
        const response = await fetchSearch(
          `/api/search?q=${encodeURIComponent(query)}`,
          {signal: controller.signal},
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
            if (opened.has(result.href)) return false;
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
