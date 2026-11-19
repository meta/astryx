// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The doc searcher: the main searcher's signals with its own weights,
 * in _doc-searcher.weights.json.
 * @input {query, options} and the gathered catalog with its static data
 * @output the search response, the lexical response's shape and size
 * @position api/search; a topic child of the root dispatcher in tree.mjs
 */

import {routeKit} from '../../foundation/route/route.mjs';
import {asWeights, rankWith} from './_main-searcher.mjs';

/** @type {import('./tree.mjs').SearchKit} */
const {defineSearcher} = routeKit;

export const doc = defineSearcher({
  id: 'doc',
  summary:
    'Ranks entries for queries that ask for a doc, with weights of its own.',
  run: (request, catalog, weights) =>
    rankWith(request, catalog, asWeights(weights) ?? catalog.data.doc),
});
