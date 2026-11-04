// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Programmatic API for the unified `search` command.
 *
 * Returns the same typed envelope { type, data } that `astryx --json search`
 * outputs. The CLI command handler is a thin wrapper around this function.
 *
 * `search(query)` is the single "I'm looking for X" entry point across all
 * content domains: components, hooks, docs topics, templates (page and
 * block), and themes. The adapter gathers every candidate (_adapter.mjs),
 * and search's tree (tree.mjs) picks the searcher that answers.
 * `searchCore(query)` is the lexical ranker alone (_lexical.mjs); `build`
 * reads it, so build's output does not move when search's tree does.
 */

import {
  docPackageManager,
  runWithDocPackageManager,
} from '../../foundation/env/package-manager.mjs';
import {withListingCache} from '../../foundation/fs/listing-cache.mjs';
import {
  gatherCandidates,
  gatherCandidatesReused,
  loadSearchData,
} from './_adapter.mjs';
import {rankLexical} from './_lexical.mjs';
import {checkSearchArgs} from './_result.mjs';
import {runTree} from '../../foundation/route/route.mjs';
import {SEARCH_TREE} from './tree.mjs';
import {linkSearchResponse} from '../component/_adapter.mjs';

// The domains a search covers (the command handler lists them), and what
// build reads from search: its word vocabulary, the components a search
// read, and the keywords of Core's components.
export {SEARCH_DOMAINS, STOPWORDS, tokenizeQuery} from './_query.mjs';
export {headingWithPhrase, titleInQuery} from './_titles.mjs';
export {scoreCandidate} from './_candidate-score.mjs';
export {scoreQuery} from './_score.mjs';
export {domainPriority} from './_priority.mjs';
export {compoundHit} from './_compound.mjs';
export {SYNONYMS} from './_synonyms.mjs';
export {sameWord, spellIdentifiers, stem} from './_words.mjs';
export {searchedComponents} from './_result.mjs';
export {componentKeywords} from './_adapter.mjs';

/**
 * Unified ranked search across components, hooks, docs, templates, and themes.
 *
 * @param {string} query - Free-text search term.
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {'component'|'hook'|'doc'|'template'|'theme'} [options.type] - Restrict to one domain.
 * @param {number} [options.limit] - Max results (default 20).
 * @returns {Promise<import('./search.type.mjs').SearchResponse>}
 */
export async function search(query, options = {}) {
  checkSearchArgs(query, options);
  return runWithDocPackageManager(
    docPackageManager(options.cwd ?? process.cwd()),
    () => searchRead(query, options),
  );
}

/**
 * The search itself, inside its project's package-manager scope.
 * @param {string} query
 * @param {any} options
 */
async function searchRead(query, options) {
  return withListingCache(
    async () =>
      /** @type {import('./search.type.mjs').SearchResponse} */ (
        await linkSearchResponse(
          /** @type {import('./search.type.mjs').SearchResponse} */ (
            await runTree(
              SEARCH_TREE,
              {query, options},
              {...(await gatherCandidatesReused(options)), data: loadSearchData()},
            )
          ),
          options.cwd ?? process.cwd(),
        )
      ),
  );
}

/**
 * The lexical ranker alone: keyword and fuzzy scoring of every candidate.
 * `build` ranks from it.
 *
 * @param {string} query
 * @param {{cwd?: string, type?: 'component'|'hook'|'doc'|'template'|'theme', limit?: number}} [options]
 * @returns {Promise<import('./search.type.mjs').SearchResponse>}
 */
export async function searchCore(query, options = {}) {
  checkSearchArgs(query, options);
  return runWithDocPackageManager(
    docPackageManager(options.cwd ?? process.cwd()),
    () => searchCoreRead(query, options),
  );
}

/**
 * The lexical search itself, inside its project's package-manager scope.
 * @param {string} query
 * @param {any} options
 */
async function searchCoreRead(query, options) {
  return withListingCache(async () =>
    linkSearchResponse(
      rankLexical(query, options, await gatherCandidates(options)),
      options.cwd ?? process.cwd(),
    ),
  );
}
