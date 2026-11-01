// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the search tree's root dispatcher (tree.mjs): the router
 * sends a query to the topic searcher of the domain it wants, and every other
 * query to the main searcher. Run against the real @astryxdesign/core.
 */

import {describe, it, expect} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runTree} from '../../foundation/route/route.mjs';
import {gatherCandidates, loadSearchData} from './_adapter.mjs';
import {routeProbs, ROUTES} from './_query-words.mjs';
import {SEARCH_TREE} from './tree.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

/** @param {string} query */
async function route(query) {
  const catalog = {
    ...(await gatherCandidates({cwd: REPO})),
    data: loadSearchData(),
  };
  /** @type {string[]} */
  const steps = [];
  const answer = await runTree(
    SEARCH_TREE,
    {query, options: {cwd: REPO}},
    catalog,
    {
      tuning: {onTrace: e => steps.push(e.id)},
    },
  );
  return {steps, answer: /** @type {any} */ (answer)};
}

describe('search tree', () => {
  it('sends a doc question to the doc searcher', async () => {
    const {steps, answer} = await route('how do I install a theme');
    expect(steps).toEqual(['root', 'doc']);
    expect(answer.data.results[0].domain).toBe('doc');
  });

  it('sends a page request to the template searcher', async () => {
    const {steps, answer} = await route('page of settings with a side menu');
    expect(steps).toEqual(['root', 'template']);
    expect(
      answer.data.results.slice(0, 3).map((/** @type {any} */ r) => r.name),
    ).toContain('settings');
  });

  it('sends a component query to the main searcher', async () => {
    const {steps} = await route('date chooser');
    expect(steps).toEqual(['root', 'main']);
  });

  it('gives one probability per class that sums to one', () => {
    const p = routeProbs(loadSearchData().router, 'toast notice');
    expect(p).toHaveLength(ROUTES.length);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });
});
