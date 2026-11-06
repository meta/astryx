// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A stored search index: the candidates `search` gathers in a folder, as
 * plain JSON, and the ranking of stored candidates with search's own tree.
 *
 * Gathering reads every package's docs and loads its manifest, which runs the
 * package's code. A catalog that lists packages it must not load (a web page
 * that lists every published integration) stores each package's index once,
 * where loading is safe, and ranks the stored indexes per query.
 * An index made in one folder and ranked by `rankSearchIndex(query, index)`
 * answers as `search(query)` does in that folder: same results, order, scores.
 * @position api/search; search.mjs is the folder-reading search.
 */

import {cliVersion} from '../../foundation/release/run-context.mjs';
import {runTree} from '../../foundation/route/route.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {AstryxError} from '../error.mjs';
import {gatherCandidates, loadSearchData} from './_adapter.mjs';
import {checkSearchArgs} from './_result.mjs';
import {SEARCH_TREE} from './tree.mjs';

/**
 * Fields a gathered candidate holds that point into the folder it was read
 * from. They decide ownership while gathering and never rank, so an index
 * leaves them out and reads the same wherever it was made.
 */
const LOCAL_FIELDS = ['_docPath'];

/**
 * @param {Record<string, unknown>} candidate
 * @returns {Record<string, unknown>}
 */
function portable(candidate) {
  /** @type {Record<string, unknown>} */
  const out = JSON.parse(JSON.stringify(candidate));
  for (const field of LOCAL_FIELDS) delete out[field];
  return out;
}

/**
 * The candidates `search` ranks in a folder, as plain JSON: store it, and rank
 * it later with {@link rankSearchIndex}.
 *
 * @param {object} [options]
 * @param {string} [options.cwd] - The folder to gather from, as `search` reads it.
 * @param {string} [options.package] - Keep only the candidates this npm package
 *   owns (its components, templates, themes, and doc parts).
 * @returns {Promise<import('./search.type.mjs').SearchIndex>}
 */
export async function exportSearchIndex(options = {}) {
  const {cwd = process.cwd(), package: owner} = options;
  if (owner != null && (typeof owner !== 'string' || owner.trim() === '')) {
    throw new AstryxError(
      `Invalid package "${owner}". Pass an npm package name.`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  const gathered = await gatherCandidates({cwd});
  const kept =
    owner == null
      ? gathered.all
      : gathered.all.filter(candidate => candidate._package === owner);
  return {
    version: cliVersion(),
    candidates: kept.map(candidate =>
      portable(/** @type {Record<string, unknown>} */ (candidate)),
    ),
  };
}

/**
 * Ranks stored indexes with search's tree. An index made in one folder answers
 * as `search(query)` does there (a theme result's command is the in-project
 * `theme add`). Indexes made in separate folders, such as one per package
 * (made with `package`) and one for Core, are ranked together as one list; a
 * doc that one package replaces or extends in another is not merged across
 * them. Every index must come from this CLI's version, since the tree reads
 * the candidates' shape.
 *
 * @param {string} query - Free-text search term.
 * @param {import('./search.type.mjs').SearchIndex | import('./search.type.mjs').SearchIndex[]} indexes
 * @param {object} [options]
 * @param {import('./search.type.mjs').SearchDomain} [options.type] - Restrict to one domain.
 * @param {number} [options.limit] - Max results (default 20).
 * @returns {Promise<import('./search.type.mjs').SearchResponse>}
 */
export async function rankSearchIndex(query, indexes, options = {}) {
  checkSearchArgs(query, options);
  const list = Array.isArray(indexes) ? indexes : [indexes];
  const version = cliVersion();
  /** @type {any[]} */
  const all = [];
  for (const index of list) {
    if (index == null || !Array.isArray(index.candidates)) {
      throw new AstryxError(
        'A search index is {version, candidates}, as exportSearchIndex() returns it.',
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    if (index.version !== version) {
      throw new AstryxError(
        `This search index was made by CLI ${index.version}; this is CLI ${version}. Make it again with this version's exportSearchIndex().`,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    all.push(...index.candidates);
  }
  const {type} = options;
  const wanted =
    type == null ? all : all.filter(candidate => candidate.domain === type);
  return /** @type {import('./search.type.mjs').SearchResponse} */ (
    await runTree(
      SEARCH_TREE,
      {query, options: {type, limit: options.limit}},
      {
        all: wanted,
        components: wanted.filter(candidate => candidate.domain === 'component'),
        searchedComponents: type == null || type === 'component',
        outside: false,
        coreSkipped: null,
        data: loadSearchData(),
      },
    )
  );
}
