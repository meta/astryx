// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Search's icon section: the installed icons that answer a query that
 * asks for an icon, ranked by the icon finder itself. The section sits beside
 * the ranked results and never changes them.
 *
 * @input a query, the installed icon sets, and the search's limit
 * @output the `data.icons` section, or null
 * @position api/search — read by the adapter only (_adapter.mjs
 *   searchIconSection); searchCore, build and the search index never read it
 */

import {asksForIcon} from '../../foundation/discovery/icon-ranking.mjs';
import {iconSetName} from '../../foundation/discovery/icon-set-discovery.mjs';
import {projectLooks, rankIconSets} from '../icon/search/search.mjs';

/** The most icons the section lists. */
export const ICON_SECTION_LIMIT = 3;

/**
 * @typedef {object} InstalledIcons
 * @property {import('../../foundation/discovery/icon-set-discovery.mjs').DiscoveredIconSet[]} sets
 *   in tie order
 * @property {Array<{name: string, package: string, reason: string}>} withdrawn
 * @property {import('../../foundation/discovery/icon-set-discovery.mjs').IconSetChoice} choice
 *   the project's set choice, with the look it picks
 */

/**
 * The icon section for a query, or null when the query does not ask for an
 * icon or no installed icon answers it. The sets are read only for a query
 * that asks. Its icons are the icon finder's own answer, drawn in the
 * project's look (`experimental.iconVariant`), as `astryx experimental icon
 * <words>` gives them.
 * @param {string} query
 * @param {{setNames: string[], read: () => Promise<InstalledIcons>}} source
 *   the installed sets' names, and a read of the sets
 * @param {{declaredNames: string[], resultDomains: string[], limit: number}} search
 *   the names of the components and hooks search reads, the domains of its
 *   results, and its limit
 * @returns {Promise<import('./search.type.mjs').SearchIconSection | null>}
 */
export async function iconSection(
  query,
  source,
  {declaredNames, resultDomains, limit},
) {
  const answersEntry = resultDomains.some(
    domain => domain === 'component' || domain === 'template',
  );
  if (
    !asksForIcon(query, {
      setNames: source.setNames,
      declaredNames,
      answersEntry,
    })
  ) {
    return null;
  }
  const {sets, withdrawn, choice} = await source.read();
  if (sets.length === 0) return null;
  const {data} = rankIconSets(sets, withdrawn, query, {
    limit: Math.min(ICON_SECTION_LIMIT, limit),
    looks: projectLooks(choice),
  });
  if (data.matchCount === 0) return null;
  return {
    matchCount: data.matchCount,
    results: data.matches.map(match => {
      const reference = `${iconSetName({package: match.package, name: match.set}, sets)}/${match.id}`;
      return {
        domain: 'icon',
        name: reference,
        set: match.set,
        id: match.id,
        package: match.package,
        score: match.score,
        reason: match.reason,
        import: match.import,
        command: `astryx experimental icon ${reference}`,
      };
    }),
  };
}
