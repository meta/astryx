// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A stored icon index: the icon sets `icon` searches in a folder, as
 * plain JSON, and the ranking of stored sets with `icon`'s own ranking.
 *
 * Reading a folder's icon sets loads each integration's manifest, which runs
 * the package's code. A catalog that lists packages it must not load stores
 * each package's index once, where loading is safe, and ranks the stored
 * indexes per query.
 * @position api/icon/search; search.mjs holds the ranking both share.
 */

import {cliVersion} from '../../../foundation/release/run-context.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {AstryxError} from '../../error.mjs';
import {loadIconSets, ownReplacedDefinitions} from '../_adapter.mjs';
import {
  REFERENCE_RE,
  checkIconLimit,
  checkIconQueryType,
  requireIconTerm,
} from '../_options.mjs';
import {DEFAULT_ICON_LIMIT} from '../icon.mjs';
import {projectLooks, rankIconSets} from './search.mjs';

/**
 * The part of a set the ranking reads, as plain JSON, with the look the
 * folder's project draws it in. Paths into the folder the set was read from
 * are left out, so an index reads the same wherever it was made.
 * @param {Awaited<ReturnType<typeof loadIconSets>>['sets'][number]} set
 * @param {string | undefined} look
 * @returns {import('../icon.type.mjs').IconIndexSet}
 */
function portableSet(set, look) {
  return JSON.parse(
    JSON.stringify({
      name: set.name,
      package: set.package,
      data: set.data,
      definitions: (set.definitions ?? []).map(each => ({doc: each.doc})),
      ...(set.definitionAliases?.size
        ? {replacedDefinitions: ownReplacedDefinitions(set)}
        : {}),
      ...(look ? {look} : {}),
    }),
  );
}

/**
 * The icon sets `icon` searches in a folder, as plain JSON: store it, and
 * rank it later with {@link rankIconIndex}.
 *
 * Experimental (spec:AST-017 FR27): may change or be removed in a patch
 * release.
 * @experimental
 * @param {object} [options]
 * @param {string} [options.cwd] - The folder to read, as `icon` reads it.
 * @param {string} [options.package] - Keep only the sets this npm package ships.
 * @returns {Promise<import('../icon.type.mjs').IconIndex>}
 */
export async function exportIconIndex(options = {}) {
  const {cwd = process.cwd(), package: owner} = options;
  if (owner != null && (typeof owner !== 'string' || owner.trim() === '')) {
    throw new AstryxError(
      `Invalid package "${owner}". Pass an npm package name.`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  const {sets, withdrawn, choice} = await loadIconSets(cwd);
  const looks = projectLooks(choice);
  /** @param {{package: string}} each */
  const kept = each => owner == null || each.package === owner;
  return {
    version: cliVersion(),
    sets: sets
      .filter(kept)
      .map(set => portableSet(set, looks[`${set.package}/${set.name}`])),
    withdrawn: withdrawn
      .filter(kept)
      .map(({name, package: pkg, reason}) => ({name, package: pkg, reason})),
  };
}

/**
 * Ranks stored icon indexes with `icon`'s own ranking. An index made in one
 * folder answers a word search as `icon(query)` does there; a `<set>/<id>`
 * query, which `icon()` reads as one icon, is refused. The sets of every index are
 * ranked together as one list, in the order the indexes are given; equal
 * scores keep that order. Every index must come from this CLI's version,
 * since the ranking reads the sets' shape.
 *
 * Experimental (spec:AST-017 FR27): may change or be removed in a patch
 * release.
 * @experimental
 * @param {string} query - Words to search for.
 * @param {import('../icon.type.mjs').IconIndex | import('../icon.type.mjs').IconIndex[]} indexes
 * @param {object} [options]
 * @param {string} [options.set] - Search one set, by name or `<package>/<set>`.
 * @param {number} [options.limit] - Max matches (default 10).
 * @returns {Promise<import('../icon.type.mjs').IconSearchResponse>}
 */
export async function rankIconIndex(query, indexes, options = {}) {
  const {set} = options;
  const limit = options.limit ?? DEFAULT_ICON_LIMIT;
  checkIconQueryType(query);
  const term = (query ?? '').trim();
  requireIconTerm(term);
  checkIconLimit(limit);
  if (REFERENCE_RE.test(term)) {
    throw new AstryxError(
      `"${term}" names one icon; rankIconIndex() ranks words. Read one icon with icon().`,
      [],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  const list = Array.isArray(indexes) ? indexes : [indexes];
  const version = cliVersion();
  /** @type {import('../icon.type.mjs').IconIndexSet[]} */
  const sets = [];
  /** @type {Array<{name: string, package: string, reason: string}>} */
  const withdrawn = [];
  for (const index of list) {
    if (index == null || !Array.isArray(index.sets)) {
      throw new AstryxError(
        'An icon index is {version, sets, withdrawn}, as exportIconIndex() returns it.',
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    if (index.version !== version) {
      throw new AstryxError(
        `This icon index was made by CLI ${index.version}; this is CLI ${version}. Make it again with this version's exportIconIndex().`,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    sets.push(...index.sets);
    withdrawn.push(...(index.withdrawn ?? []));
  }
  // A stored set holds exactly the fields the ranking reads.
  const ranked = /** @type {Parameters<typeof rankIconSets>[0]} */ (
    /** @type {unknown} */ (sets)
  );
  /** @type {Record<string, string>} */
  const looks = {};
  for (const each of sets) {
    if (each.look) looks[`${each.package}/${each.name}`] = each.look;
  }
  return rankIconSets(ranked, withdrawn, term, {set, limit, looks});
}
