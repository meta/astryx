// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file GET /api/search?q=<query>: `astryx search <query>`, run by the site.
 * @input The query, as `astryx search` takes it.
 * @output The CLI's search response, each result with the site destination and
 *   its destination page's title and registry category when available.
 * @position Called by the search panel (lib/cliSearchSource.ts).
 *
 * The site's search is the CLI's: this calls `search()` from
 * `@astryxdesign/cli/api`, the function behind `astryx search --json`, in this
 * site's project, so the panel gives the CLI's results in the CLI's order and
 * every change to the CLI's search reaches the site. Nothing here ranks.
 */

import {search} from '@astryxdesign/cli/api';
import {
  searchResultCategory,
  searchResultHref,
  searchResultTitle,
} from '../../../lib/searchLinks.mjs';
import type {SearchLinkTables} from '../../../lib/searchLinks.mjs';
import links from '../../../generated/searchLinks.json';
import admitted from '../../../generated/integrationPackages.json';
import docsiteConfig from '../../../../astryx.config.mjs';

/** Packages this build documents: Core, the CLI's docs and themes, and the
 *  integrations it admits (canary: all configured; latest: stable ones). */
const DOCUMENTED = new Set([
  '@astryxdesign/core',
  '@astryxdesign/cli',
  ...admitted.packages,
]);

/** Whether this build leaves out an integration the site's project has. */
const FILTERED = docsiteConfig.integrations.some(
  (name: string) => !DOCUMENTED.has(name),
);

/** How many results the panel shows: `astryx search`'s default. */
const LIMIT = 20;

/** Longest query the API accepts. */
const MAX_QUERY = 200;

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query === '' || query.length > MAX_QUERY) {
    return Response.json(
      {error: `q must be 1 to ${MAX_QUERY} characters`},
      {status: 400},
    );
  }
  // When this build leaves out an integration, ask for every match, drop
  // that integration's, then count and cut to the panel's 20; otherwise this
  // is exactly `astryx search <query>`.
  const response = await search(query, {
    cwd: process.cwd(),
    ...(FILTERED ? {limit: Number.MAX_SAFE_INTEGER} : {}),
  });
  const kept = FILTERED
    ? response.data.results.filter(
        result => result.package == null || DOCUMENTED.has(result.package),
      )
    : response.data.results;
  const matchCount = FILTERED ? kept.length : response.data.matchCount;
  const results = kept.slice(0, LIMIT).map(result => {
    const href = searchResultHref(result, links as SearchLinkTables);
    const siteTitle = searchResultTitle(
      result,
      href,
      links as SearchLinkTables,
    );
    const siteCategory = searchResultCategory(
      result,
      href,
      links as SearchLinkTables,
    );
    return {
      ...result,
      href,
      ...(siteTitle ? {siteTitle} : {}),
      ...(siteCategory ? {siteCategory} : {}),
    };
  });
  return Response.json(
    {...response, data: {...response.data, matchCount, results}},
    {
      // A query's answer changes only when the site is rebuilt.
      headers: {'Cache-Control': 'public, max-age=300, s-maxage=86400'},
    },
  );
}
