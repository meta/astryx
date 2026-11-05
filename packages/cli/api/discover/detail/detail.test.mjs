// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated unit tests for the discover.detail leaf. The leaf is a pure
 * projection over already-resolved packages, so these need no filesystem.
 */

import {describe, it, expect} from 'vitest';
import {detail} from './detail.mjs';
import {AstryxError} from '../../error.mjs';

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

const PACKAGES = [
  pkg('@acme/widgets', ['Alpha', 'Beta'], {version: '1.2.3'}),
  pkg('@acme/gadgets', ['Gamma']),
];

describe('discover.detail leaf', () => {
  it('projects the matched package into a detail entry', () => {
    const res = detail(PACKAGES, '@acme/widgets');
    expect(res.type).toBe('discover.detail');
    expect(res.package).toBe('@acme/widgets');
    expect(res.data).toEqual({
      name: '@acme/widgets',
      package: '@acme/widgets',
      category: '@acme/widgets',
      components: ['Alpha', 'Beta'],
      version: '1.2.3',
      installed: true,
    });
  });

  it('throws ERR_UNKNOWN_PACKAGE with the available packages as suggestions', () => {
    let err;
    try {
      detail(PACKAGES, '@acme/nope');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AstryxError);
    expect(err.code).toBe('ERR_UNKNOWN_PACKAGE');
    expect(err.message).toBe('Package "@acme/nope" not found');
    expect(err.suggestions).toEqual([
      {name: '@acme/widgets', reason: 'available package'},
      {name: '@acme/gadgets', reason: 'available package'},
    ]);
  });
});

describe('discover.detail leaf with a discover source', () => {
  /** @type {any} */
  const catalog = {
    package: '@acme/charts',
    integration: 'acme-charts',
    aliases: ['@acme/charts-legacy'],
    latest: '2.0.0',
    source: 'Acme',
    versions: [
      {version: '2.1.0-beta.1', publishedAt: '2026-09-30T00:00:00.000Z', prerelease: true, status: 'ok'},
      {version: '2.0.0', publishedAt: '2026-09-20T00:00:00.000Z', prerelease: false, status: 'ok'},
      {version: '1.0.0', publishedAt: null, prerelease: false, status: 'manifest_load_error'},
    ],
    contributions: [
      {kind: 'component', name: 'Chart'},
      {kind: 'template', name: 'pages/Report'},
    ],
  };
  /** @param {string} name @param {string} [version] */
  const add = (name, version) => `pnpm add ${version ? `${name}@${version}` : name}`;

  it('describes a package the project does not have, with the command that adds it', () => {
    expect(detail(PACKAGES, '@acme/charts', {catalog, add}).data).toEqual({
      name: '@acme/charts',
      package: '@acme/charts',
      category: '@acme/charts',
      components: ['Chart'],
      version: '2.0.0',
      templates: ['pages/Report'],
      installed: false,
      latest: '2.0.0',
      aliases: ['@acme/charts-legacy'],
      source: 'Acme',
      install: 'pnpm add @acme/charts',
      versions: catalog.versions,
    });
  });

  it('describes any version, prereleases included', () => {
    const {data} = detail(PACKAGES, '@acme/charts', {catalog, add, version: '2.1.0-beta.1'});
    expect(data.version).toBe('2.1.0-beta.1');
    expect(data.install).toBe('pnpm add @acme/charts@2.1.0-beta.1');
  });

  it('refuses a version that was never published, and suggests releases', () => {
    let err;
    try {
      detail(PACKAGES, '@acme/charts', {catalog, add, version: '3.0.0'});
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AstryxError);
    expect(err.code).toBe('ERR_NOT_FOUND');
    expect(err.suggestions.map(s => s.name)).toEqual([
      '@acme/charts@2.0.0',
      '@acme/charts@1.0.0',
    ]);
  });

  it('names the package the project has instead of offering an alias', () => {
    const {data} = detail(PACKAGES, '@acme/charts', {
      catalog,
      add,
      installedAs: '@acme/charts-legacy',
    });
    expect(data.installedAs).toBe('@acme/charts-legacy');
    expect(data).not.toHaveProperty('install');
  });

  it("keeps describing the installed copy from the project, with the source's versions", () => {
    const {data} = detail(PACKAGES, '@acme/widgets', {
      catalog: {...catalog, package: '@acme/widgets', latest: '1.3.0'},
      add,
    });
    expect(data).toMatchObject({
      name: '@acme/widgets',
      components: ['Alpha', 'Beta'],
      version: '1.2.3',
      installed: true,
      latest: '1.3.0',
    });
    expect(data).not.toHaveProperty('install');
  });
});
