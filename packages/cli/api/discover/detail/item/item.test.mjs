// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the discover.item leaf, a pure projection over installed
 * packages and a source's catalog entry.
 */

import {describe, expect, it} from 'vitest';
import {item} from './item.mjs';
import {iconSetCoverageOf} from '../../_icon-set-coverage.mjs';

/** @type {any[]} */
const PACKAGES = [
  {
    name: '@acme/widgets',
    category: '@acme/widgets',
    version: '1.2.3',
    components: ['Alpha'],
    templates: ['pages/Home'],
    docs: ['guide'],
  },
];

/** @type {any} */
const CATALOG = {
  package: '@acme/charts',
  integration: 'acme-charts',
  aliases: [],
  latest: '2.0.0',
  source: 'Acme',
  versions: [],
  contributions: [
    {kind: 'template', name: 'pages/Report', title: 'Report page'},
  ],
};

/** @param {string} name @param {string} [version] */
const add = (name, version) =>
  `pnpm add ${version ? `${name}@${version}` : name}`;

describe('discover.item leaf', () => {
  it("finds an installed package's own template, doc, theme, or codemod", () => {
    expect(item(PACKAGES, '@acme/widgets', 'pages/Home')).toEqual({
      type: 'discover.item',
      package: '@acme/widgets',
      data: {
        package: '@acme/widgets',
        version: '1.2.3',
        kind: 'template',
        name: 'pages/Home',
        installed: true,
      },
    });
  });

  it('finds an item a source lists, with the command that adds its package', () => {
    expect(
      item(PACKAGES, '@acme/charts', 'pages/report', {catalog: CATALOG, add}),
    ).toEqual({
      type: 'discover.item',
      package: '@acme/charts',
      data: {
        package: '@acme/charts',
        version: '2.0.0',
        kind: 'template',
        name: 'pages/Report',
        title: 'Report page',
        installed: false,
        install: 'pnpm add @acme/charts',
        source: 'Acme',
      },
    });
  });

  it('returns null when neither the project nor a source has it', () => {
    expect(item(PACKAGES, '@acme/widgets', 'Nope')).toBeNull();
    expect(
      item(PACKAGES, '@acme/charts', 'Nope', {catalog: CATALOG}),
    ).toBeNull();
  });
});

describe('discover.item leaf, an icon set a source lists', () => {
  /** @type {any} */
  const PACK = {
    package: '@acme/glyph-pack',
    integration: 'acme-glyph-pack',
    aliases: [],
    latest: '1.2.0',
    source: 'Acme',
    versions: [],
    contributions: [
      {
        kind: 'icon-set',
        name: 'glyphs',
        title: 'Acme Glyphs',
        summary: 'Outline icons.',
        license: 'MIT',
        iconCount: 412,
        definitions: ['close', 'search', 'not-a-cli-meaning'],
      },
    ],
  };
  const names = new Set(['close', 'search', 'menu', 'home']);
  /** @param {string[]} definitions */
  const coverageOf = definitions => ({
    mapped: definitions.filter(name => names.has(name)).length,
    total: names.size,
  });

  it('shows its descriptor text and, beside the JSON, how many of the CLI meanings it maps, never its definitions without the opt-in', () => {
    const res = item(PACKAGES, '@acme/glyph-pack', 'glyphs', {
      catalog: PACK,
      add,
      coverageOf,
    });
    expect(res?.data).toEqual({
      package: '@acme/glyph-pack',
      version: '1.2.0',
      kind: 'icon-set',
      name: 'glyphs',
      title: 'Acme Glyphs',
      summary: 'Outline icons.',
      license: 'MIT',
      iconCount: 412,
      experimental: true,
      installed: false,
      install: 'pnpm add @acme/glyph-pack',
      source: 'Acme',
    });
    expect(iconSetCoverageOf(/** @type {object} */ (res))).toEqual({
      mapped: 2,
      total: 4,
    });
  });

  it('lists its definitions too in a project that opts in', () => {
    expect(
      item(PACKAGES, '@acme/glyph-pack', 'glyphs', {
        catalog: PACK,
        add,
        coverageOf,
        iconSets: true,
      })?.data.definitions,
    ).toEqual(['close', 'search', 'not-a-cli-meaning']);
  });

  it('leaves the coverage out when the source lists no definitions', () => {
    const {definitions: _definitions, ...set} = PACK.contributions[0];
    const res = item(PACKAGES, '@acme/glyph-pack', 'glyphs', {
      catalog: {...PACK, contributions: [set]},
      add,
      coverageOf,
    });
    expect(iconSetCoverageOf(/** @type {object} */ (res))).toBeNull();
    expect(res?.data).not.toHaveProperty('definitions');
  });
});

describe('discover.item leaf, an icon set of an installed package', () => {
  it('answers from the catalog only in a project that opts in', () => {
    /** @type {any} */
    const catalog = {
      package: '@acme/widgets',
      integration: '@acme/widgets',
      aliases: [],
      latest: '1.2.3',
      source: 'Acme',
      versions: [],
      contributions: [{kind: 'icon-set', name: 'glyphs', iconCount: 3}],
    };
    expect(item(PACKAGES, '@acme/widgets', 'glyphs', {catalog})).toBeNull();
    expect(
      item(PACKAGES, '@acme/widgets', 'glyphs', {catalog, iconSets: true})?.data
        .installed,
    ).toBe(true);
  });
});
