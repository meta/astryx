// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the discover source and catalog checks.
 */

import {describe, it, expect} from 'vitest';
import {
  DISCOVER_KINDS,
  parseDiscoverCatalog,
  parseDiscoverSource,
} from './parse.mjs';

function catalog(overrides = {}) {
  return {
    schemaVersion: 1,
    source: {
      name: 'Acme catalog',
      generatedAt: '2026-09-30T14:00:00.000Z',
      complete: true,
    },
    packages: [
      {
        package: '@acme/ui',
        integration: 'acme-ui',
        aliases: [],
        latest: '2.0.0',
        versions: [
          {
            version: '2.0.0',
            publishedAt: '2026-09-29T00:00:00.000Z',
            prerelease: false,
            status: 'ok',
          },
        ],
        contributions: [{kind: 'component', name: 'Button'}],
      },
    ],
    ...overrides,
  };
}

describe('parseDiscoverCatalog', () => {
  it('accepts a catalog', () => {
    expect(parseDiscoverCatalog(catalog())).toEqual(catalog());
  });

  it('drops fields it does not know, so a newer source still works', () => {
    const parsed = parseDiscoverCatalog({...catalog(), cursor: 'next'});
    expect(parsed).not.toHaveProperty('cursor');
  });

  it('keeps an icon-set entry with its icon count and definitions when the project opts in', () => {
    const value = catalog();
    const set = {
      kind: 'icon-set',
      name: 'outline',
      title: 'Outline',
      iconCount: 120,
      definitions: ['close', 'search'],
    };
    value.packages[0].contributions.push(/** @type {any} */ (set));
    expect(
      parseDiscoverCatalog(value, 'source', {iconSets: true}).packages[0]
        .contributions[1],
    ).toEqual(set);
    expect(DISCOVER_KINDS).toContain('icon-set');
    const bad = catalog();
    bad.packages[0].contributions.push(
      /** @type {any} */ ({kind: 'icon-set', name: 'x', iconCount: -1}),
    );
    expect(() => parseDiscoverCatalog(bad, 'source', {iconSets: true})).toThrow(
      /iconCount/,
    );
  });

  it('without the opt-in, ignores icon-set entries and fields as unknown, even malformed ones', () => {
    const value = catalog();
    value.packages[0].contributions.push(
      /** @type {any} */ ({kind: 'icon-set', name: 'x', iconCount: -1}),
    );
    /** @type {any} */ (value.packages[0].contributions[0]).definitions = [7];
    expect(parseDiscoverCatalog(value)).toEqual(catalog());
  });

  it('drops items of a kind it does not know', () => {
    const value = catalog();
    value.packages[0].contributions.push({kind: 'widget', name: 'Spinner'});
    expect(parseDiscoverCatalog(value).packages[0].contributions).toEqual([
      {kind: 'component', name: 'Button'},
    ]);
  });

  it('puts versions newest first whatever order the source used', () => {
    const value = catalog();
    value.packages[0].versions = [
      {
        version: '1.0.0',
        publishedAt: '2026-01-05T00:00:00.000Z',
        prerelease: false,
        status: 'ok',
      },
      {version: '1.5.0', publishedAt: null, prerelease: false, status: 'ok'},
      {
        version: '2.0.0',
        publishedAt: '2026-09-29T00:00:00.000Z',
        prerelease: false,
        status: 'ok',
      },
      {
        version: '2.0.0-rc.1',
        publishedAt: '2026-09-01T00:00:00.000Z',
        prerelease: true,
        status: 'ok',
      },
    ];
    expect(
      parseDiscoverCatalog(value).packages[0].versions.map(v => v.version),
    ).toEqual(['2.0.0', '2.0.0-rc.1', '1.0.0', '1.5.0']);
  });

  it('refuses a schemaVersion it does not read', () => {
    expect(() => parseDiscoverCatalog(catalog({schemaVersion: 2}))).toThrow(
      'this CLI reads schemaVersion 1',
    );
  });

  it('names the first problem and where it is', () => {
    expect(() =>
      parseDiscoverCatalog(catalog({packages: [{package: ''}]}), 'the source'),
    ).toThrow(/^the source returned an invalid catalog at packages\.0\./);
  });

  it('lists the kinds in display order', () => {
    expect(DISCOVER_KINDS).toEqual([
      'component',
      'template',
      'doc',
      'theme',
      'codemod',
      'agent-doc',
      'icon-set',
    ]);
  });
});

describe('parseDiscoverSource', () => {
  it('accepts a function', () => {
    const source = async () => catalog();
    expect(parseDiscoverSource(source, 'discover')).toBe(source);
  });

  it('refuses anything else, such as a URL', () => {
    expect(() =>
      parseDiscoverSource('https://example.com/catalog.json', 'discover'),
    ).toThrow('discover must be a function');
  });
});
