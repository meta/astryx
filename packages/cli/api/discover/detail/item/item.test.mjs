// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the discover.item leaf, a pure projection over installed
 * packages and a source's catalog entry.
 */

import {describe, expect, it} from 'vitest';
import {item} from './item.mjs';

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
  contributions: [{kind: 'template', name: 'pages/Report', title: 'Report page'}],
};

/** @param {string} name @param {string} [version] */
const add = (name, version) => `pnpm add ${version ? `${name}@${version}` : name}`;

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
    expect(item(PACKAGES, '@acme/charts', 'Nope', {catalog: CATALOG})).toBeNull();
  });
});
