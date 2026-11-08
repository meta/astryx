// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  classify,
  defineDispatcher,
  defineSearcher,
  defineTree,
  runTree,
} from './route.mjs';

/** @typedef {{query: string}} Req */
/** @typedef {{names: string[]}} Ctx */

const ctx = {names: ['Button', 'ButtonGroup', 'Card']};

const main = defineSearcher({
  id: 'main',
  summary: 'Names that contain the query.',
  /** @param {Req} request @param {Ctx} c */
  run: (request, c) => {
    const results = c.names.filter(n =>
      n.toLowerCase().includes(request.query),
    );
    return results.length ? results : null;
  },
});

const exact = defineSearcher({
  id: 'exact',
  summary: 'The one name the query spells.',
  /** @param {Req} request @param {Ctx} c @param {unknown} weights */
  run: (request, c, weights) => {
    const hit = c.names.find(n => n === request.query);
    const prefix =
      /** @type {{prefix?: string} | null} */ (weights)?.prefix ?? '';
    return hit ? [`${prefix}${hit}`] : null;
  },
});

const root = (confidence = 1) =>
  defineDispatcher({
    id: 'root',
    summary: 'Identifiers go to exact lookup.',
    children: ['exact', 'main'],
    floor: 0.5,
    fallback: 'main',
    /** @param {Req} request */
    route: request =>
      /^[A-Z]/.test(request.query)
        ? {ids: ['exact'], confidence}
        : {ids: [], confidence: 0},
  });

const tree = (confidence = 1) =>
  defineTree('root', [root(confidence), exact, main]);

describe('defineTree', () => {
  it('stamps each kind', () => {
    expect(main.kind).toBe('searcher');
    expect(root().kind).toBe('dispatcher');
  });
  it('rejects a duplicate, a missing child, a fallback that is not a searcher, and a cycle', () => {
    expect(() => defineTree('main', [main, main])).toThrow(/duplicate/);
    expect(() => defineTree('root', [root(), main])).toThrow(
      /missing node "exact"/,
    );
    const toRoot = defineDispatcher({...root(), fallback: 'root'});
    expect(() => defineTree('root', [toRoot, exact, main])).toThrow(
      /not a searcher/,
    );
    const a = defineDispatcher({...root(), id: 'a', children: ['b']});
    const b = defineDispatcher({...root(), id: 'b', children: ['a']});
    expect(() => defineTree('a', [a, b, main])).toThrow(/cycle a -> b -> a/);
  });
});

describe('runTree', () => {
  it('takes the first routed answer at or above the floor', async () => {
    expect(await runTree(tree(), {query: 'Button'}, ctx)).toEqual(['Button']);
  });
  it('runs the fallback below the floor', async () => {
    /** @type {any[]} */
    const steps = [];
    const answer = await runTree(tree(0.2), {query: 'Button'}, ctx, {
      tuning: {onTrace: step => steps.push(step)},
    });
    expect(answer).toBeNull();
    expect(steps.map(s => [s.id, s.fallback])).toEqual([
      ['root', false],
      ['main', true],
    ]);
  });
  it('runs the fallback when no routed child answers', async () => {
    expect(await runTree(tree(), {query: 'card'}, ctx)).toEqual(['Card']);
    expect(await runTree(tree(), {query: 'Car'}, ctx)).toBeNull();
  });
  it('passes a node its tuning weights and traces every step', async () => {
    /** @type {any[]} */
    const steps = [];
    const answer = await runTree(tree(), {query: 'Button'}, ctx, {
      tuning: {
        weights: {exact: {prefix: '*'}},
        onTrace: step => steps.push(step),
      },
    });
    expect(answer).toEqual(['*Button']);
    expect(steps).toEqual([
      {
        id: 'root',
        kind: 'dispatcher',
        depth: 0,
        fallback: false,
        route: {ids: ['exact'], confidence: 1},
      },
      {
        id: 'exact',
        kind: 'searcher',
        depth: 1,
        fallback: false,
        answered: true,
      },
    ]);
  });
  it('runs one node alone with start', async () => {
    expect(
      await runTree(tree(), {query: 'button'}, ctx, {start: 'main'}),
    ).toEqual(['Button', 'ButtonGroup']);
  });
  it('rejects a route to a node that is not a child', async () => {
    const stray = defineDispatcher({
      ...root(),
      route: () => ({ids: ['root'], confidence: 1}),
    });
    await expect(
      runTree(defineTree('root', [stray, exact, main]), {query: 'x'}, ctx),
    ).rejects.toThrow(/not one of its children/);
  });
});

describe('classify', () => {
  it('ignores a token that is only an Object.prototype name', () => {
    const weights = {classes: ['a', 'b'], tokens: {button: [2, 0]}};
    const probs = classify(weights, [
      'button',
      'constructor',
      '__proto__',
      'toString',
    ]);
    expect(probs.every(Number.isFinite)).toBe(true);
    expect(probs).toEqual(classify(weights, ['button']));
  });
});
