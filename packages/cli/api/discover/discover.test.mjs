// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Dispatcher-level tests for discover() — the query-shape routing that
 * sits above the list/detail/doc/search leaves. The leaves have their own
 * tests; this pins the router itself, which parses the query into:
 *
 *   (no query)              -> discover.list
 *   @scope/name             -> discover.detail
 *   @scope/name/Component   -> discover.detail.doc
 *   free text               -> discover.search
 *
 * `discoverPackages` is mocked so routing is exercised deterministically
 * without a real configured project (the empty-project path returns list()
 * before any parsing, so routing needs a non-empty package set).
 */

import {describe, it, expect, vi} from 'vitest';

vi.mock('./_adapter.mjs', async orig => {
  const actual = /** @type {any} */ (await orig());
  return {
    ...actual,
    discoverPackages: async () => ({
      configured: true,
      packages: [
        {
          name: '@acme/widgets',
          category: '@acme/widgets',
          version: '1.0.0',
          components: ['Alpha', 'Beta'],
          dir: '/virtual/widgets',
          astryx: {},
          docsDir: '/virtual/widgets/docs',
        },
      ],
    }),
  };
});

const {discover} = await import('./discover.mjs');
const {AstryxError} = await import('../error.mjs');

describe('discover() dispatcher routing', () => {
  it('no query -> discover.list', async () => {
    const r = await discover();
    expect(r.type).toBe('discover.list');
  });

  it('empty query -> discover.list', async () => {
    expect((await discover('')).type).toBe('discover.list');
  });

  it('@scope/name -> discover.detail (unknown package -> ERR_UNKNOWN_PACKAGE)', async () => {
    expect((await discover('@acme/widgets')).type).toBe('discover.detail');
    await expect(discover('@acme/nope')).rejects.toMatchObject({
      code: 'ERR_UNKNOWN_PACKAGE',
    });
  });

  it('@scope/name/Component -> doc route (unknown component -> coded error)', async () => {
    const err = await discover('@acme/widgets/Nope').catch(e => e);
    expect(err).toBeInstanceOf(AstryxError);
    expect(err.code).toMatch(/^ERR_/);
    expect(err.code).not.toBe('ERR_UNKNOWN');
  });

  it('free-text query with multiple matches -> discover.search envelope', async () => {
    // 'a' is a substring of both Alpha and Beta (no exact match), so the search
    // leaf returns the multi-match discover.search envelope. Proves free-text
    // routing reaches the search leaf and projects its envelope. Search also
    // matches package names, so the package itself is listed after them.
    const r = await discover('a');
    expect(r.type).toBe('discover.search');
    expect(
      r.data.matches.filter(m => m.kind === 'component').map(m => m.component),
    ).toEqual(['Alpha', 'Beta']);
    expect(r.data.matches).toContainEqual({
      package: '@acme/widgets',
      component: '@acme/widgets',
      kind: 'package',
      installed: true,
    });
  });

  it('free-text query with no match still routes to the search leaf (coded not-found)', async () => {
    const err = await discover('zzzznope').catch(e => e);
    expect(err).toBeInstanceOf(AstryxError);
    expect(err.code).toMatch(/^ERR_/);
    expect(err.code).not.toBe('ERR_UNKNOWN');
  });

  it('non-string query -> ERR_INVALID_ARGUMENT (not a raw TypeError)', async () => {
    for (const bad of [123, {}, ['x'], true]) {
      const err = await discover(/** @type {any} */ (bad)).catch(e => e);
      expect(err).toBeInstanceOf(AstryxError);
      expect(err.code).toBe('ERR_INVALID_ARGUMENT');
    }
  });
});
