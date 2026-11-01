// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for the discover.search leaf, over a small temp docs
 * directory shaped like a scanned package.
 */

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {search} from './search.mjs';
import {AstryxError} from '../../error.mjs';

let docsDir;
let packages;

beforeAll(() => {
  docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-search-'));
  fs.writeFileSync(
    path.join(docsDir, 'Alpha.doc.mjs'),
    `export const docs = {name: 'Alpha', usage: {description: 'Alpha component'}, props: []};\n`,
  );
  fs.writeFileSync(
    path.join(docsDir, 'AlphaCard.doc.mjs'),
    `export const docs = {name: 'AlphaCard', usage: {description: 'Alpha card'}, props: []};\n`,
  );
  fs.writeFileSync(
    path.join(docsDir, 'Beta.doc.mjs'),
    `export const docs = {name: 'Beta', usage: {description: 'Beta component'}, props: []};\n`,
  );
  packages = [
    {
      name: '@acme/widgets',
      category: '@acme/widgets',
      version: '1.0.0',
      dir: docsDir,
      astryx: {},
      docsDir,
      components: ['Alpha', 'AlphaCard', 'Beta'],
    },
  ];
});

afterAll(() => {
  fs.rmSync(docsDir, {recursive: true, force: true});
});

describe('discover.search leaf', () => {
  it('lists an exact component name first, with every other match', async () => {
    const res = await search(packages, 'Alpha', {});
    expect(res.type).toBe('discover.search');
    expect(res.data.matches.map(m => m.component)).toEqual([
      'Alpha',
      'AlphaCard',
    ]);
  });

  it('lists a single match too, so the response type never depends on the data', async () => {
    const res = await search(packages, 'card', {});
    expect(res).toEqual({
      type: 'discover.search',
      data: {
        query: 'card',
        matches: [
          {
            package: '@acme/widgets',
            component: 'AlphaCard',
            kind: 'component',
            installed: true,
          },
        ],
      },
    });
  });

  it('multiple substring matches return a search response', async () => {
    const res = await search(packages, 'alph', {});
    expect(res).toEqual({
      type: 'discover.search',
      data: {
        query: 'alph',
        matches: [
          {
            package: '@acme/widgets',
            component: 'Alpha',
            kind: 'component',
            installed: true,
          },
          {
            package: '@acme/widgets',
            component: 'AlphaCard',
            kind: 'component',
            installed: true,
          },
        ],
      },
    });
  });

  it('throws ERR_NOT_FOUND with fuzzy suggestions for a close miss', async () => {
    let err;
    try {
      await search(packages, 'Alfa', {});
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AstryxError);
    expect(err.code).toBe('ERR_NOT_FOUND');
    expect(err.message).toBe('"Alfa" not found');
    expect(err.suggestions?.[0]).toEqual({
      name: '@acme/widgets/Alpha',
      reason: 'similar name',
    });
  });

  it('throws ERR_NOT_FOUND without suggestions for a far miss', async () => {
    let err;
    try {
      await search(packages, 'zzzzzzz', {});
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AstryxError);
    expect(err.code).toBe('ERR_NOT_FOUND');
    expect(err.message).toBe('"zzzzzzz" not found in any package');
    expect(err.suggestions).toBeUndefined();
  });
});

describe('discover.search leaf — empty query (parity with api/search)', () => {
  it('throws ERR_INVALID_ARGUMENT for an empty query (does not match everything)', async () => {
    await expect(search(packages, '', {})).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
    });
  });

  it('throws ERR_INVALID_ARGUMENT for a whitespace-only query', async () => {
    await expect(search(packages, '   ', {})).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
    });
  });
});

describe('discover.search leaf — typo tolerance (parity with api/search)', () => {
  it('a one-edit miss on a 5+ letter name returns results, not ERR_NOT_FOUND', async () => {
    // 'Alphe' is one substitution from 'Alpha' (distance 1, both >= 5 chars)
    const res = await search(packages, 'Alphe', {});
    expect(res.type).toBe('discover.search');
    expect(res.data.matches.map(m => m.component)).toContain('Alpha');
  });

  it("ranks a near-miss name above a match in another item's text", async () => {
    const items = [
      {
        package: '@acme/charts',
        kind: 'component',
        name: 'Scheduler',
        description: 'Lighter than a Calendr widget',
        installed: false,
      },
      {
        package: '@acme/charts',
        kind: 'component',
        name: 'Calendar',
        installed: false,
      },
    ];
    // 'Calendr' is one edit from the name 'Calendar' and appears word for
    // word only in Scheduler's description.
    const res = await search(packages, 'Calendr', {items});
    const names = res.data.matches.map(m => m.component);
    expect(names.indexOf('Calendar')).toBeGreaterThanOrEqual(0);
    expect(names.indexOf('Calendar')).toBeLessThan(names.indexOf('Scheduler'));
  });

  it('orders near misses by how many edits away they are', async () => {
    const items = [
      {package: '@acme/charts', kind: 'component', name: 'Paginaters', installed: false},
      {package: '@acme/charts', kind: 'component', name: 'Paginator', installed: false},
    ];
    const res = await search(packages, 'Paginatr', {items});
    const names = res.data.matches.map(m => m.component);
    expect(names.indexOf('Paginator')).toBeLessThan(names.indexOf('Paginaters'));
  });

  it('a one-edit miss on a longer name returns results', async () => {
    // 'AlpheCard' vs 'AlphaCard' is distance 1, well above 5 chars
    const res = await search(packages, 'AlpheCard', {});
    expect(res.type).toBe('discover.search');
    expect(res.data.matches.map(m => m.component)).toContain('AlphaCard');
  });

  it('a short word with distance 1 still throws (below min-length guard)', async () => {
    // 'Betz' vs 'Beta' is distance 1, but both are only 4 chars (< 5)
    await expect(search(packages, 'Betz', {})).rejects.toMatchObject({
      code: 'ERR_NOT_FOUND',
    });
  });

  it('includes catalog items in fuzzy matches too', async () => {
    const items = [
      {package: '@acme/charts', kind: 'component', name: 'Alphabets', installed: false},
    ];
    // 'Alphabel' vs 'Alphabets' is distance 2, both >= 8 chars
    const res = await search(packages, 'Alphabel', {items});
    expect(res.type).toBe('discover.search');
    expect(res.data.matches.map(m => m.component)).toContain('Alphabets');
  });
});

describe('discover.search leaf across every kind and source', () => {
  /** @type {any[]} */
  const items = [
    {
      package: '@acme/widgets',
      kind: 'template',
      name: 'pages/AlphaHome',
      installed: true,
    },
    {
      package: '@acme/charts',
      kind: 'package',
      name: '@acme/charts',
      installed: false,
      description: 'Charts for alpha dashboards',
    },
    {
      package: '@acme/charts',
      kind: 'component',
      name: 'AlphaChart',
      installed: false,
    },
    {
      package: '@acme/charts',
      kind: 'doc',
      name: 'guide',
      installed: false,
      summary: 'How to chart',
    },
  ];

  it('ranks every match by how closely its name matches, installed first among equals', async () => {
    const res = await search(packages, 'alph', {items});
    expect(res.type).toBe('discover.search');
    expect(
      res.data.matches.map(m => [m.kind, m.component, m.installed]),
    ).toEqual([
      ['component', 'Alpha', true],
      ['component', 'AlphaCard', true],
      ['component', 'AlphaChart', false],
      ['template', 'pages/AlphaHome', true],
      ['package', '@acme/charts', false],
    ]);
  });

  it('lists an exact installed component name with the matches from every source', async () => {
    const res = await search(packages, 'Alpha', {items});
    expect(res.type).toBe('discover.search');
    expect(res.data.matches[0]).toEqual({
      package: '@acme/widgets',
      component: 'Alpha',
      kind: 'component',
      installed: true,
    });
    expect(res.data.matches.map(m => m.component)).toContain('AlphaChart');
  });

  it('lists a single partial component match when other items match too', async () => {
    const res = await search(packages, 'card', {
      items: [
        ...items,
        {
          package: '@acme/charts',
          kind: 'template',
          name: 'pages/CardGrid',
          installed: false,
        },
      ],
    });
    expect(res.type).toBe('discover.search');
    expect(res.data.matches.map(m => m.component)).toEqual([
      'AlphaCard',
      'pages/CardGrid',
    ]);
  });

  it('lists one installed component when nothing else matches', async () => {
    const res = await search(packages, 'card', {items});
    expect(res.type).toBe('discover.search');
    expect(res.data.matches.map(m => m.component)).toEqual(['AlphaCard']);
  });

  it('keeps one kind with type, and one side with only', async () => {
    const templates = await search(packages, 'alph', {items, type: 'template'});
    expect(templates.data.matches.map(m => m.component)).toEqual([
      'pages/AlphaHome',
    ]);
    const available = await search(packages, 'alph', {
      items,
      only: 'available',
    });
    expect(available.data.matches.map(m => m.component)).toEqual([
      'AlphaChart',
      '@acme/charts',
    ]);
  });

  it('caps the list at limit and reports the total', async () => {
    const res = await search(packages, 'alph', {items, limit: 2});
    expect(res.data.matches).toHaveLength(2);
    expect(res.data.total).toBe(5);
  });

  it('matches titles, summaries, keywords, and descriptions too', async () => {
    const res = await search(packages, 'how to chart', {items});
    expect(res.data.matches.map(m => m.component)).toEqual(['guide']);
  });
});
