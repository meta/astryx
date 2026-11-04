// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The main searcher: ranks every entry by a weighted sum of plain
 * signals (see _features.mjs): the lexical ranker's score and rank, BM25 over
 * each entry's name, docs text and source-built card, query-word coverage,
 * whether the query holds the entry's name, and the router's guess of the
 * domain the query wants. Its weights are static numbers in
 * _main-searcher.weights.json.
 * @input {query, options} and the gathered catalog with its static data
 * @output the search response, the lexical response's shape and size
 * @position api/search; a child of the root dispatcher in tree.mjs
 */

import {routeKit} from '../../foundation/route/route.mjs';
import {rank, signals} from './_features.mjs';
import {entryTable} from './_entries.mjs';
import {orderMatches} from './_order.mjs';
import {routeProbs} from './_query-words.mjs';
import {namesWhole, rankLexical} from './_lexical.mjs';

/** @typedef {{w: number[], mu: number[], sd: number[]}} SearcherWeights */

/**
 * A tuning override for a searcher, or null for its shipped weights.
 * @param {unknown} weights
 * @returns {SearcherWeights | null}
 */
export const asWeights = weights =>
  /** @type {SearcherWeights | null} */ (weights);

/**
 * A name read loosely: lowercase, with dashes, underscores and slashes read as
 * spaces.
 * @param {string} text
 * @returns {string}
 */
const looseName = text =>
  text
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * True when the query, read loosely, is the candidate's name, another name of
 * it, its title, or the last part of its route (`use-a-theme` typed as
 * `use a theme`). Such a query names that entry too, though the lexical
 * ranker's own gate (namesWhole) needs the name exactly.
 * @param {import('./_lexical.mjs').Candidate} candidate
 * @param {string} loose the query, read loosely
 * @returns {boolean}
 */
function namesLoosely(candidate, loose) {
  if (!loose) return false;
  const names = [
    candidate.name,
    ...(candidate.aliases ?? []),
    candidate._title,
    candidate._topic,
    candidate._resultName,
    candidate._commandName,
  ];
  return names.some(name => {
    if (!name) return false;
    const whole = looseName(String(name));
    const last = looseName(String(name).split('/').pop() ?? '');
    return whole === loose || last === loose;
  });
}

/**
 * Ranks with one searcher's weights. Shared by the main searcher and every
 * topic searcher, which differ only in their weights.
 * @param {import('./tree.mjs').SearchRequest} request
 * @param {import('./tree.mjs').SearchCatalog} catalog
 * @param {SearcherWeights} weights
 * @returns {import('./search.type.mjs').SearchResponse}
 */
export function rankWith(request, catalog, weights) {
  const {query, options} = request;
  // A query that is an entry's whole name gets the lexical answer as is: that
  // entry first, with no near siblings added beside it.
  const term = String(query).trim().toLowerCase();
  const loose = looseName(term);
  if (catalog.all.some(c => namesWhole(c, term) || namesLoosely(c, loose))) {
    return rankLexical(query, options, catalog);
  }
  const table = entryTable(catalog.all, catalog.data.cards);
  const lexical = rankLexical(
    query,
    {...options, limit: Number.MAX_SAFE_INTEGER},
    catalog,
  );
  const route = routeProbs(catalog.data.router, query);
  const rows = signals(table, query, lexical.data.results, route);
  return orderMatches(
    table,
    rank(table, rows, weights),
    lexical,
    query,
    options.limit ?? 20,
  );
}

/** @type {import('./tree.mjs').SearchKit} */
const {defineSearcher} = routeKit;

export const main = defineSearcher({
  id: 'main',
  summary:
    'Ranks every component, hook, doc, template, and theme by a weighted sum of plain word-match signals.',
  run: (request, catalog, weights) =>
    rankWith(request, catalog, asWeights(weights) ?? catalog.data.main),
});
