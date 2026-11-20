// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file lockfile-overrides.test.mjs
 * @input lockfile-overrides.mjs; a fixture lockfile; the repository's pnpm-lock.yaml
 * @output The MCP folder's npm install pins every registry dependency of the
 *   packed CLI and Core to the lockfile's version, a name with several versions
 *   under each parent, so a release published moments earlier cannot change it.
 * @position A Node test; it reads files and runs no install
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import YAML from 'yaml';
import {lockfileOverrides} from './lockfile-overrides.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

const fixture = `lockfileVersion: '9.0'
importers:
  packages/cli:
    dependencies:
      '@babel/traverse':
        specifier: ^7.29.0
        version: 7.29.7
      semver:
        specifier: ^6.3.1
        version: 6.3.1
      '@astryxdesign/core':
        specifier: workspace:*
        version: link:../core
snapshots:
  '@babel/traverse@7.29.7':
    dependencies:
      '@babel/parser': 7.29.8
      old-tool: 1.0.0
  '@babel/parser@7.29.8': {}
  old-tool@1.0.0:
    dependencies:
      semver: 5.7.2
  semver@5.7.2: {}
  semver@6.3.1: {}
`;

describe('lockfileOverrides', () => {
  it('pins a name with one version everywhere, and a name with several under each parent', () => {
    expect(
      lockfileOverrides(fixture, [
        {path: 'packages/cli', name: '@astryxdesign/cli'},
      ]),
    ).toEqual({
      '@babel/parser': '7.29.8',
      '@babel/traverse': '7.29.7',
      'old-tool': {'.': '1.0.0', semver: '5.7.2'},
      '@astryxdesign/cli': {semver: '6.3.1'},
    });
  });

  it("pins every registry package the repository's CLI and Core reach to the lockfile's version", () => {
    const text = fs.readFileSync(path.join(REPO, 'pnpm-lock.yaml'), 'utf8');
    const overrides = lockfileOverrides(text, [
      {path: 'packages/cli', name: '@astryxdesign/cli'},
      {path: 'packages/core', name: '@astryxdesign/core'},
    ]);
    const lock = YAML.parse(text);
    const versionOf = name => {
      const pin = overrides[name];
      return typeof pin === 'string' ? pin : pin?.['.'];
    };
    // The direct dependencies a reader's npm would resolve from the registry.
    for (const importer of ['packages/cli', 'packages/core']) {
      for (const [name, dep] of Object.entries(
        lock.importers[importer].dependencies ?? {},
      )) {
        if (String(dep.version).startsWith('link:')) continue;
        const pinned =
          versionOf(name) ??
          Object.values(overrides).find(
            v => typeof v === 'object' && v[name],
          )?.[name];
        expect(pinned, name).toBe(String(dep.version).replace(/\(.*$/, ''));
      }
    }
    // Babel's parser, which a release minutes old once broke, is pinned.
    expect(versionOf('@babel/parser')).toMatch(/^7\.\d+\.\d+$/);
  });
});
