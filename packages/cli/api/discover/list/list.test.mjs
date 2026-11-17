// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated unit tests for the discover.list leaf. The leaf is a pure
 * projection of already-resolved packages, so these need no filesystem.
 */

import {describe, it, expect} from 'vitest';
import {list} from './list.mjs';

/** Build a minimal ScannedPackage for projection tests. */
function pkg(name, components, extra = {}) {
  return {
    name,
    category: name,
    components,
    dir: '/virtual/' + name,
    astryx: {},
    docsDir: '/virtual/' + name + '/docs',
    ...extra,
  };
}

describe('discover.list leaf', () => {
  it('projects packages into list entries (no meta when non-empty)', () => {
    const res = list(
      [pkg('@acme/widgets', ['Alpha', 'Beta'], {version: '1.2.3'})],
      {configured: true},
    );
    expect(res.type).toBe('discover.list');
    expect(res.meta).toBeUndefined();
    expect(res.data).toEqual([
      {
        name: '@acme/widgets',
        package: '@acme/widgets',
        category: '@acme/widgets',
        components: ['Alpha', 'Beta'],
        version: '1.2.3',
      },
    ]);
  });

  it('returns the configured:true empty envelope when nothing was discovered', () => {
    const res = list([], {configured: true});
    expect(res).toEqual({
      type: 'discover.list',
      data: [],
      meta: {configured: true},
    });
  });

  it('returns the configured:false empty envelope when nothing is configured', () => {
    const res = list([], {configured: false});
    expect(res).toEqual({
      type: 'discover.list',
      data: [],
      meta: {configured: false},
    });
  });
});

describe('discover.list leaf with discover sources', () => {
  const installed = [
    pkg('@acme/widgets', ['Alpha'], {
      version: '1.2.3',
      latest: '1.3.0',
      templates: ['pages/Home'],
    }),
  ];
  const available = [
    {name: '@acme/charts', version: '2.0.0', components: ['Chart'], source: 'Acme'},
    {name: '@acme/themes', version: '1.0.0', components: [], themes: ['ocean'], source: 'Acme'},
  ];
  const sources = [{name: 'Acme', from: 'astryx.config', status: 'fresh'}];

  it('lists what is installed in data and what could be added in meta', () => {
    const res = list(installed, {configured: true, available, sources});
    expect(res.data).toEqual([
      {
        name: '@acme/widgets',
        package: '@acme/widgets',
        category: '@acme/widgets',
        components: ['Alpha'],
        version: '1.2.3',
        templates: ['pages/Home'],
        latest: '1.3.0',
      },
    ]);
    expect(res.meta).toEqual({available, sources});
  });

  it('keeps one side with only', () => {
    expect(
      list(installed, {configured: true, available, sources, only: 'installed'})
        .meta?.available,
    ).toEqual([]);
    const res = list(installed, {configured: true, available, sources, only: 'available'});
    expect(res.data).toEqual([]);
    expect(res.meta).toEqual({configured: true, available, sources});
  });

  it('keeps only packages that add a kind with type', () => {
    const res = list(installed, {configured: true, available, sources, type: 'theme'});
    expect(res.data).toEqual([]);
    expect(res.meta?.available?.map(e => e.name)).toEqual(['@acme/themes']);
  });
});
