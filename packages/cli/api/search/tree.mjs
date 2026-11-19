// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How search answers: a root classifier reads the query's words and
 * guesses the domain it wants (tree.weights.json), and hands it to that
 * domain's topic searcher when it is sure enough; otherwise the main searcher
 * keeps it. Adding a topic searcher is one file and one line here.
 * @input {query, options} and the gathered catalog with its static data
 * @output the search response
 * @position api/search; search.mjs runs it with the shared route helper
 */

import {routeKit} from '../../foundation/route/route.mjs';
import {routerTokens} from './_query-words.mjs';
import {doc} from './_doc-searcher.mjs';
import {main} from './_main-searcher.mjs';
import {template} from './_template-searcher.mjs';

/**
 * @typedef {{query: string, options: {cwd?: string, type?: import('./search.type.mjs').SearchDomain, limit?: number}}} SearchRequest
 * @typedef {import('./_adapter.mjs').SearchCatalog} SearchCatalog
 * @typedef {import('./search.type.mjs').SearchResponse} SearchAnswer
 * @typedef {import('../../foundation/route/route.mjs').RouteKit<SearchRequest, SearchCatalog, SearchAnswer>} SearchKit
 */

/** @type {SearchKit} */
const {defineClassifier, defineTree} = routeKit;

const root = defineClassifier({
  id: 'root',
  summary:
    'Guesses the domain a query wants from its words and hands it to that topic searcher, else to the main searcher.',
  searchers: {doc: doc.id, template: template.id},
  fallback: main.id,
  floor: 0.4,
  features: request => routerTokens(request.query),
  weights: catalog => catalog.data.router,
});

export const SEARCH_TREE = defineTree('root', [root, main, doc, template]);
