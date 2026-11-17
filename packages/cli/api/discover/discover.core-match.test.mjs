// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A free-text discover query that finds nothing names Core's match: the
 * first Core component or hook `astryx search` gives for the query, as the
 * lookups' shared hint names it. Search and the project are stand-ins, so the
 * test pins what discover does with search's answer.
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';

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
          components: ['AlphaWidget', 'Beta'],
          dir: '/virtual/widgets',
          astryx: {},
          docsDir: '/virtual/widgets/docs',
        },
      ],
    }),
  };
});

/** @type {any[]} */
let results = [];
vi.mock('../search/search.mjs', async orig => {
  const actual = /** @type {any} */ (await orig());
  return {
    ...actual,
    search: async (/** @type {string} */ query) => ({
      type: 'search',
      data: {query, matchCount: results.length, results},
    }),
  };
});

const {discover} = await import('./discover.mjs');

beforeEach(() => {
  results = [];
});

describe('discover miss names Core match', () => {
  it("names search's first Core component, past other packages' entries", async () => {
    results = [
      {domain: 'doc', name: 'overlays', package: '@astryxdesign/cli'},
      {domain: 'component', name: 'AcmeModal', package: '@acme/widgets'},
      {
        domain: 'component',
        name: 'Dialog',
        package: '@astryxdesign/core',
        score: 90,
      },
      {
        domain: 'component',
        name: 'Drawer',
        package: '@astryxdesign/core',
        score: 90,
      },
    ];
    const err = await discover('zzmodalzz').catch(e => e);
    expect(err.code).toBe('ERR_NOT_FOUND');
    expect(err.message).toBe('"zzmodalzz" not found in any package');
    expect(err.suggestions).toEqual([
      {name: 'astryx component Dialog', reason: 'a component'},
    ]);
  });

  it('names a Core hook when it comes first', async () => {
    results = [
      {
        domain: 'hook',
        name: 'useHotkeys',
        package: '@astryxdesign/core',
        score: 95,
      },
      {domain: 'component', name: 'Kbd', package: '@astryxdesign/core'},
    ];
    const err = await discover('zzshortcutzz').catch(e => e);
    expect(err.suggestions).toEqual([
      {name: 'astryx hook useHotkeys', reason: 'a hook'},
    ]);
  });

  it('names nothing when search found its first Core entry only through prose or some of the words', async () => {
    results = [
      {
        domain: 'component',
        name: 'Icon',
        package: '@astryxdesign/core',
        score: 50,
      },
    ];
    expect(
      (await discover('zzgraphzz').catch(e => e)).suggestions,
    ).toBeUndefined();
    results = [
      {
        domain: 'hook',
        name: 'useScrollOverflow',
        package: '@astryxdesign/core',
        score: 94,
      },
    ];
    expect(
      (await discover('zzedge graphzz').catch(e => e)).suggestions,
    ).toBeUndefined();
    results = [
      {
        domain: 'component',
        name: 'FileInput',
        package: '@astryxdesign/core',
        score: 160,
      },
    ];
    expect((await discover('zzdrag dropzz').catch(e => e)).suggestions).toEqual(
      [{name: 'astryx component FileInput', reason: 'a component'}],
    );
  });

  it("adds the hint after discover's own near names, never in place of one", async () => {
    results = [
      {
        domain: 'component',
        name: 'Dialog',
        package: '@astryxdesign/core',
        score: 90,
      },
    ];
    const err = await discover('Betz').catch(e => e);
    expect(err.suggestions).toEqual([
      {name: '@acme/widgets/Beta', reason: 'similar name'},
      {name: 'astryx component Dialog', reason: 'a component'},
    ]);
  });

  it('keeps the miss as it is when search gives no Core component or hook', async () => {
    results = [
      {domain: 'template', name: 'pages/Report', package: '@astryxdesign/core'},
      {domain: 'component', name: 'AcmeModal', package: '@acme/widgets'},
    ];
    const err = await discover('zzreportzz').catch(e => e);
    expect(err.code).toBe('ERR_NOT_FOUND');
    expect(err.suggestions).toBeUndefined();
  });

  it('answers with the matches, not a hint, when discover finds one', async () => {
    results = [
      {domain: 'component', name: 'Dialog', package: '@astryxdesign/core'},
    ];
    const res = await discover('widget');
    expect(res.type).toBe('discover.search');
  });
});
