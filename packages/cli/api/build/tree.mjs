// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How build answers: a root classifier sends each request to the
 * searcher that should answer it. Its weights (tree.weights.json) have one
 * class today, so every request goes to the main searcher: the kit's signals
 * (kit/signals.mjs), the block picker's blocks (blocks/blocks.mjs), and the
 * kit around them (kit/answer.mjs).
 * @input {query, options} and the data build's adapter gathered: the root's
 *   weights and the block picker's
 * @output the build.kit response
 * @position api/build; build.mjs runs it with the shared route helper
 */

import {routeKit} from '../../foundation/route/route.mjs';
import {kitAnswer} from './kit/answer.mjs';
import {kitSignals} from './kit/signals.mjs';
import {pickBlocks} from './blocks/blocks.mjs';

/**
 * @typedef {{query: string, options: NonNullable<Parameters<typeof kitSignals>[1]>}} BuildRequest
 * @typedef {object} BuildContext
 * @property {import('../../foundation/route/route.mjs').ClassifierWeights} weights the root's weights
 * @property {import('./blocks/blocks.mjs').BlockPickerWeights | null} blocks the block picker's weights; null: build names its own blocks
 * @typedef {import('./build.type.mjs').BuildKitResponse} BuildAnswer
 */

/** @type {import('../../foundation/route/route.mjs').RouteKit<BuildRequest, BuildContext, BuildAnswer>} */
const {defineSearcher, defineClassifier, defineTree} = routeKit;

const main = defineSearcher({
  id: 'main',
  summary:
    'Ranks page templates, blocks, and components by the words of the request, starts from the best page template, and lists its blocks in the order the block picker ranks them.',
  run: async (request, ctx) => {
    const signals = await kitSignals(request.query, request.options);
    if (!ctx.blocks) return kitAnswer(signals);
    const picked = pickBlocks(request.query, signals, ctx.blocks);
    return kitAnswer(signals, picked.names, picked.entries);
  },
});

const root = defineClassifier({
  id: 'root',
  summary: 'Classifies the request and hands it to the searcher for its class.',
  searchers: {},
  fallback: 'main',
  floor: 1,
  features: () => ['#bias'],
  weights: ctx => ctx.weights,
});

export const BUILD_TREE = defineTree('root', [root, main]);
