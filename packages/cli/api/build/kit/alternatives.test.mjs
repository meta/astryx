// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A whole page's alternatives come from the same ranking as its start:
 * the word weights' blend orders the ranker's candidates, so the three
 * templates build names are the blend's best three. Parts keep the ranker's
 * order, and the start and the number of alternatives are unchanged.
 */

import {describe, expect, it} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from '../build.mjs';
import {loadTemplates, loadWeights} from '../_adapter.mjs';
import {pickAlternatives, pickStart, rankPages} from './rank.mjs';
import {blendOrder} from './weights.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
);

describe('build alternatives', () => {
  it('follow the blend order for a whole page', async () => {
    const idea = 'analytics dashboard with retention cohorts';
    const {data} = await build(idea, {cwd: REPO});
    const catalog = (await loadTemplates(REPO)).pages;
    const ranked = rankPages(idea, catalog);
    const order = blendOrder(
      idea,
      ranked,
      pickStart(ranked, 'page'),
      catalog,
      loadWeights(),
    );
    expect(order).not.toBeNull();
    const start = /** @type {NonNullable<typeof data.start>} */ (data.start);
    const eligible = new Set(
      pickAlternatives(ranked, start.name, ranked.length).map(r => r.name),
    );
    const expected = /** @type {string[]} */ (order)
      .filter(name => eligible.has(name))
      .slice(0, 2);
    expect(start.alternatives.map(a => a.name)).toEqual(expected);
  });

  it('keep the ranker order for a part of a page', async () => {
    const idea = 'a date range picker';
    const {data} = await build(idea, {cwd: REPO});
    const catalog = (await loadTemplates(REPO)).pages;
    const ranked = rankPages(idea, catalog);
    const start = /** @type {NonNullable<typeof data.start>} */ (data.start);
    expect(start.alternatives.map(a => a.name)).toEqual(
      pickAlternatives(ranked, start.name).map(r => r.name),
    );
  });

  it('keep a template the weights do not list in its ranker slot', async () => {
    const {pickStartAlternatives} = await import('./start.mjs');
    const catalog = (await loadTemplates(REPO)).pages;
    const listed = new Set(loadWeights()?.candidates ?? []);
    const idea = 'compare plans side by side in a table';
    const ranked = rankPages(idea, catalog);
    const start = /** @type {any} */ (
      (await build(idea, {cwd: REPO})).data.start
    );
    const byRanker = pickAlternatives(ranked, start.name);
    const chosen = pickStartAlternatives(
      ranked,
      'page',
      start.name,
      catalog,
      idea,
    ).map(r => r.name);
    for (const r of byRanker)
      if (!listed.has(r.name)) expect(chosen).toContain(r.name);
  });
});
