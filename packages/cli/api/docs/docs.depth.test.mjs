// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {docs} from './docs.mjs';

const SLOW = 60_000;

/**
 * @param {any} node
 * @param {string} route
 * @returns {any}
 */
function findRoute(node, route) {
  if (node.route === route) return node;
  for (const slot of node.slots ?? []) {
    for (const child of slot.children) {
      const found = findRoute(child, route);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * @param {any} node
 * @returns {any[]}
 */
function children(node) {
  return (node.slots ?? []).flatMap((/** @type {any} */ slot) => slot.children);
}

describe('docs() depth', () => {
  it(
    'reads one level down, as it always has, without a depth',
    async () => {
      const plain = await docs('cli/api');
      expect(plain.type).toBe('docs.node');
      if (plain.type !== 'docs.node') return;
      expect(plain.data).not.toHaveProperty('childCount');
      for (const child of children(plain.data)) {
        expect(Object.keys(child).sort()).toEqual([
          'kind',
          'name',
          'package',
          'route',
          'summary',
          'title',
        ]);
      }
    },
    SLOW,
  );

  it(
    'goes as many levels down as asked, each doc below as its identity',
    async () => {
      const result = await docs('cli/api', undefined, {depth: 2});
      if (result.type !== 'docs.node') throw new Error(result.type);
      const functions = findRoute(result.data, 'cli/api/functions');
      expect(functions).not.toHaveProperty('childCount');
      expect(findRoute(result.data, 'cli/api/functions/search')).toEqual({
        route: 'cli/api/functions/search',
        name: 'search',
        package: '@astryxdesign/cli',
        kind: 'function',
        title: 'search()',
        summary: expect.any(String),
      });
    },
    SLOW,
  );

  it(
    'says how many docs sit below where the read stops',
    async () => {
      const one = await docs('cli/api', undefined, {depth: 1});
      if (one.type !== 'docs.node') throw new Error(one.type);
      const functions = findRoute(one.data, 'cli/api/functions');
      expect(functions).not.toHaveProperty('slots');
      expect(functions.childCount).toBeGreaterThan(1);

      const zero = await docs('cli/api', undefined, {depth: 0});
      if (zero.type !== 'docs.node') throw new Error(zero.type);
      expect(zero.data.slots).toEqual([]);
      expect(zero.data.childCount).toBe(children(one.data).length);
    },
    SLOW,
  );

  it(
    "reads every level with 'all', and each doc's text at full detail",
    async () => {
      const result = await docs('cli/api', undefined, {
        depth: 'all',
        detail: 'full',
      });
      if (result.type !== 'docs.node') throw new Error(result.type);
      expect(JSON.stringify(result.data)).not.toContain('"childCount"');
      const search = findRoute(result.data, 'cli/api/functions/search');
      expect(JSON.stringify(search.content)).toContain(
        '`astryx search` runs it. Read it with `astryx docs cli/commands/search`.',
      );
    },
    SLOW,
  );

  it(
    'reads a doc with nothing below it the same at any depth',
    async () => {
      expect(
        await docs('cli/api/functions/search', undefined, {depth: 3}),
      ).toEqual(await docs('cli/api/functions/search'));
    },
    SLOW,
  );

  it(
    'refuses a depth that is not a number of levels, and an unknown detail',
    async () => {
      for (const depth of [-1, 1.5, 'deep', '2']) {
        await expect(
          docs('cli/api', undefined, {depth: /** @type {any} */ (depth)}),
        ).rejects.toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
      }
      await expect(
        docs('cli/api', undefined, {
          depth: 1,
          detail: /** @type {any} */ ('huge'),
        }),
      ).rejects.toMatchObject({code: 'ERR_INVALID_DETAIL'});
    },
    SLOW,
  );
});
