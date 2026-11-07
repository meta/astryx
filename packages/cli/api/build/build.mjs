// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file build API — dispatcher + barrel for the "assemble a page" assistant.
 *
 * `build()` with no query signals the workflow playbook (`build.help`). With a
 * query it runs build's tree (tree.mjs), whose searchers answer with a
 * composition KIT (`build.kit`). Each shape is projected by its own leaf; this file only
 * routes to the leaves and re-exports them, keeping the SAME `build` export so
 * api/index.mjs and the CLI consumer stay unchanged.
 *
 *   no query  → build.help  (api/build/help/help.mjs)
 *   a query   → build.kit   (api/build/tree.mjs: kit/signals.mjs, the block
 *               picker in blocks/blocks.mjs, then kit/answer.mjs)
 */

import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {buildHelp} from './help/help.mjs';
import {buildKit} from './kit/kit.mjs';
import {
  loadBlockPicker,
  loadTreeWeights,
  withListingCache,
} from './_adapter.mjs';
import {runTree} from '../../foundation/route/route.mjs';
import {BUILD_TREE} from './tree.mjs';

// Barrel: surface the leaves alongside the dispatcher for the fractal shape.
export {buildHelp, buildKit};

/**
 * The page-building assistant. No query → the playbook signal; a query → the
 * grouped composition kit.
 *
 * @param {string} [query] what you're building (e.g. "analytics dashboard")
 * @param {{cwd?: string, type?: import('../search/search.type.mjs').SearchDomain, limit?: number}} [options]
 * @returns {Promise<import('./build.type.mjs').BuildHelpResponse | import('./build.type.mjs').BuildKitResponse>}
 */
export async function build(query, options = {}) {
  if (!query || !String(query).trim()) {
    return buildHelp();
  }
  if (
    options.limit != null &&
    (!Number.isInteger(options.limit) || options.limit <= 0)
  ) {
    throw new AstryxError(
      `Invalid limit "${options.limit}". Must be a positive integer.`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  // The kit resolves every candidate's source and docs by walking the same
  // tree; read each directory once for this call.
  return withListingCache(
    async () =>
      /** @type {import('./build.type.mjs').BuildKitResponse} */ (
        await runTree(
          BUILD_TREE,
          {query, options},
          {weights: loadTreeWeights(), blocks: loadBlockPicker()},
        )
      ),
  );
}
