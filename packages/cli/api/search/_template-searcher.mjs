// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The template searcher: the main searcher's signals with its own
 * weights, in _template-searcher.weights.json.
 * @input {query, options} and the gathered catalog with its static data
 * @output the search response, the lexical response's shape and size
 * @position api/search; a topic child of the root dispatcher in tree.mjs
 */

import {routeKit} from '../../foundation/route/route.mjs';
import {asWeights, rankWith} from './_main-searcher.mjs';

/** @type {import('./tree.mjs').SearchKit} */
const {defineSearcher} = routeKit;

export const template = defineSearcher({
  id: 'template',
  summary:
    'Ranks entries for queries that ask for a template, with weights of its own.',
  run: (request, catalog, weights) =>
    rankWith(request, catalog, asWeights(weights) ?? catalog.data.template),
});
