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
 * @param {string[]} declaredNames the names of the components and hooks
 *   search reads
 * @param {number} limit the search's limit
 * @returns {Promise<import('./search.type.mjs').SearchIconSection | null>}
 */
export async function iconSection(query, source, declaredNames, limit) {
  if (!asksForIcon(query, {setNames: source.setNames, declaredNames})) {
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
    results: data.matches.map(match => ({
      domain: 'icon',
      name: `${match.set}/${match.id}`,
      set: match.set,
      id: match.id,
      package: match.package,
      score: match.score,
      reason: match.reason,
      import: match.import,
      command: `astryx experimental icon ${match.set}/${match.id}`,
    })),
  };
}
