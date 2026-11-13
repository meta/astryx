// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A stored search index: the candidates `search` gathers in a folder, as
 * plain JSON, and the ranking of stored candidates with search's own tree.
 *
 * Gathering reads every package's docs and loads its manifest, which runs the
 * package's code. A catalog that lists packages it must not load (a web page
 * that lists every published integration) stores each package's index once,
 * where loading is safe, and ranks the stored indexes per query.
 * @position api/search; search.mjs is the folder-reading search.
 */

import {
  docPackageManager,
  runWithDocPackageManager,
} from '../../foundation/env/package-manager.mjs';
import {withListingCache} from '../../foundation/fs/listing-cache.mjs';
import {cliVersion} from '../../foundation/release/run-context.mjs';
import {runTree} from '../../foundation/route/route.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {linkSearchResponse} from '../component/_adapter.mjs';
import {AstryxError} from '../error.mjs';
import {
  gatherCandidates,
  loadSearchData,
  resolveSearchCore,
} from './_adapter.mjs';
import {checkSearchArgs} from './_result.mjs';
import {SEARCH_TREE} from './tree.mjs';
import {searchView} from './_named-keywords.mjs';

/**
 * Fields a gathered candidate holds that point into the folder it was read
 * from. They decide ownership while gathering and never rank, so an index
 * leaves them out and reads the same wherever it was made.
 */
const LOCAL_FIELDS = ['_docPath'];

/**
 * A component candidate's description as `search` prints it: its inline
 * `{@link}`, `{@pm}` and `{@command}` tokens resolved in the folder the index
 * is made in. The raw description stays the one that is scored.
 */
const DISPLAY_FIELD = '_displayDescription';

/** Stands for the Core the indexes were made with, which ranking never reads. */
const STORED_CORE = 'stored-index';

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
 * Experimental (spec:AST-017 FR27): may change or be removed in a patch
 * release.
 * @experimental
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
  return runWithDocPackageManager(docPackageManager(cwd), () =>
    withListingCache(async () => {
      const gathered = await gatherCandidates({cwd});
      const kept =
        owner == null
          ? gathered.all
          : gathered.all.filter(candidate => candidate._package === owner);
      const candidates = kept.map(candidate =>
        portable(/** @type {Record<string, unknown>} */ (candidate)),
      );
      await addDisplayDescriptions(candidates, cwd);
      return {
        version: cliVersion(),
        candidates,
        ...(gathered.coreSkipped == null
          ? {}
          : {
              coreSkipped: gathered.coreSkipped,
              ...(gathered.coreSkippedCode == null
                ? {}
                : {coreSkippedCode: gathered.coreSkippedCode}),
            }),
      };
    }),
  );
}

/**
 * Resolves each component description's inline tokens as `search` does for
 * the results it prints, and keeps the printed text beside the scored one.
 * @param {Record<string, unknown>[]} candidates
 * @param {string} cwd
 */
async function addDisplayDescriptions(candidates, cwd) {
  const linkable = candidates.filter(
    candidate =>
      candidate.domain === 'component' &&
      typeof candidate.description === 'string' &&
      candidate.description.includes('{@'),
  );
  if (linkable.length === 0) return;
  const response = await linkSearchResponse(
    /** @type {any} */ ({
      type: 'search',
      data: {
        results: linkable.map(candidate => ({
          domain: 'component',
          package: candidate._package,
          description: candidate.description,
        })),
      },
    }),
    cwd,
  );
  response.data.results.forEach(
    (/** @type {any} */ result, /** @type {number} */ i) => {
      if (result.description !== linkable[i].description)
        linkable[i][DISPLAY_FIELD] = result.description;
    },
  );
}

/**
 * Ranks stored indexes with search's tree. An index made in one folder answers
 * as `search(query)` does there (a theme result's command is the in-project
 * `theme add`). Indexes made in separate folders, such as one per package
 * (made with `package`) and one for Core, are ranked together as one list; a
 * doc that one package replaces or extends in another is not merged across
 * them. Every index must come from this CLI's version, since the tree reads
 * the candidates' shape. When every index was made where Core could not be
 * had, the answer carries `meta.partial`, as `search` does.
 *
 * Experimental (spec:AST-017 FR27): may change or be removed in a patch
 * release.
 * @experimental
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
  // Keywords read as search() reads them (_named-keywords.mjs). The names
  // come from every stored entry, before the `type` cut.
  const view = searchView({
    all,
    components: all.filter(candidate => candidate.domain === 'component'),
  }).all;
  const wanted =
    type == null ? view : view.filter(candidate => candidate.domain === type);
  const {searchedComponents, coreSkipped} = coreFlags(list, type);
  const response = /** @type {import('./search.type.mjs').SearchResponse} */ (
    await runTree(
      SEARCH_TREE,
      {query, options: {type, limit: options.limit}},
      {
        all: wanted,
        components: wanted.filter(
          candidate => candidate.domain === 'component',
        ),
        searchedComponents,
        outside: false,
        coreSkipped,
        coreSkippedCode: null,
        data: loadSearchData(),
      },
    )
  );
  return withDisplayDescriptions(response, wanted);
}

/**
 * The catalog flags `search` derives from Core for a request of `type`, by
 * search's own rule (`resolveSearchCore`). Core is missing only when no index
 * had it. An open search then names what it skipped. A docs or themes search
 * never reads Core. A Core domain asked for by name throws the error that
 * `search` throws.
 * @param {import('./search.type.mjs').SearchIndex[]} list
 * @param {import('./search.type.mjs').SearchDomain | undefined} type
 * @returns {{searchedComponents: boolean, coreSkipped: string | null}}
 */
function coreFlags(list, type) {
  const missing =
    list.length > 0 &&
    list.every(index => typeof index.coreSkipped === 'string');
  const lookup = () => {
    if (!missing) return STORED_CORE;
    throw Object.assign(
      new Error(/** @type {string} */ (list[0].coreSkipped)),
      {
        code: list[0].coreSkippedCode ?? ERROR_CODES.ERR_CORE_NOT_FOUND,
      },
    );
  };
  const {coreSkipped, wants} = resolveSearchCore(type, lookup, STORED_CORE);
  return {searchedComponents: wants('component'), coreSkipped};
}

/**
 * The response with each component result's description as `search` prints
 * it, from the text the index stored when it was made.
 * @param {import('./search.type.mjs').SearchResponse} response
 * @param {any[]} candidates
 * @returns {import('./search.type.mjs').SearchResponse}
 */
function withDisplayDescriptions(response, candidates) {
  /** @type {Map<string, string>} */
  const display = new Map();
  for (const candidate of candidates) {
    if (
      candidate.domain === 'component' &&
      typeof candidate[DISPLAY_FIELD] === 'string'
    )
      display.set(
        `${candidate._package}\u0000${candidate._resultName ?? candidate.name}`,
        candidate[DISPLAY_FIELD],
      );
  }
  if (display.size === 0) return response;
  return {
    ...response,
    data: {
      ...response.data,
      results: response.data.results.map(result => {
        if (result.domain !== 'component') return result;
        const text = display.get(`${result.package}\u0000${result.name}`);
        return text == null ? result : {...result, description: text};
      }),
    },
  };
}
