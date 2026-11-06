// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the pure views over discover sources' catalogs.
 */

import {describe, expect, it} from 'vitest';
import {
  availableEntries,
  catalogState,
  kindLists,
  searchItems,
  withLatest,
} from './_catalog-view.mjs';

/**
 * @param {string} name
 * @param {string} integration
 * @param {object} [extra]
 * @returns {any}
 */
function entry(name, integration, extra = {}) {
  return {
    package: name,
    integration,
    aliases: [],
    latest: '1.0.0',
    versions: [],
    contributions: [{kind: 'component', name: 'A'}],
    source: 'S',
    ...extra,
  };
}

const CATALOG = {
  sources: [],
  packages: [
    entry('@acme/ui', 'acme-ui', {aliases: ['@acme/ui-classic']}),
    entry('@acme/ui-classic', 'acme-ui', {aliases: ['@acme/ui']}),
    entry('@acme/charts', 'charts', {
      latest: '2.0.0',
      contributions: [{kind: 'theme', name: 'ocean'}],
    }),
  ],
};

/** @param {string} name @returns {any} */
const installed = name => ({name, category: name, components: []});

describe('availableEntries', () => {
  it('offers each integration once, under the first name a source lists', () => {
    expect(
      availableEntries(CATALOG, [], new Set()).map(e => [e.name, e.aliases]),
    ).toEqual([
      ['@acme/ui', ['@acme/ui-classic']],
      ['@acme/charts', undefined],
    ]);
  });

  it('never offers an integration the project has under another name', () => {
    expect(
      availableEntries(CATALOG, [installed('@acme/ui-classic')], new Set()).map(
        e => e.name,
      ),
    ).toEqual(['@acme/charts']);
  });

  it('does not offer a package the project declares, even when it did not load', () => {
    expect(
      availableEntries(CATALOG, [], new Set(['@acme/charts'])).map(e => e.name),
    ).toEqual(['@acme/ui']);
  });

  it('describes an entry the way an installed one is described', () => {
    expect(availableEntries(CATALOG, [], new Set())[1]).toEqual({
      name: '@acme/charts',
      package: '@acme/charts',
      components: [],
      version: '2.0.0',
      themes: ['ocean'],
      source: 'S',
    });
  });
});

describe('catalogState', () => {
  it('names the package the project has instead', () => {
    expect(
      catalogState(CATALOG.packages[0], new Set(['@acme/ui-classic']), new Set()),
    ).toEqual({state: 'alias', installedAs: '@acme/ui-classic'});
  });
});

describe('withLatest', () => {
  it('adds the latest release a source knows to an installed package', () => {
    expect(withLatest([installed('@acme/charts')], CATALOG)[0]).toMatchObject({
      latest: '2.0.0',
    });
  });
});

describe('kindLists', () => {
  it('groups items by kind, always with components', () => {
    expect(
      kindLists([
        {kind: 'theme', name: 'ocean'},
        {kind: 'component', name: 'A'},
      ]),
    ).toEqual({components: ['A'], themes: ['ocean']});
  });
});

describe('searchItems', () => {
  it('covers installed packages and their other items, then what could be added', () => {
    const items = searchItems(
      [{...installed('@acme/widgets'), templates: ['pages/Home']}],
      CATALOG,
      new Set(),
    );
    expect(items.map(i => [i.package, i.kind, i.name, i.installed])).toEqual([
      ['@acme/widgets', 'package', '@acme/widgets', true],
      ['@acme/widgets', 'template', 'pages/Home', true],
      ['@acme/ui', 'package', '@acme/ui', false],
      ['@acme/ui', 'component', 'A', false],
      ['@acme/charts', 'package', '@acme/charts', false],
      ['@acme/charts', 'theme', 'ocean', false],
    ]);
  });
});
