// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file manifest.test.ts
 * @input Reads packages/vega/package.json and the non-test sources in src/
 * @output Guards how the package declares the Astryx packages it imports
 * @position Colocated manifest contract test for the consumer install path
 *
 * Every `@astryxdesign/*` package the wrapper imports must be a peer, never a
 * direct dependency. Consumers need one shared copy of the theme context and
 * the charts palette, and the ShadCN registry installs a package-backed item
 * by walking peers only, so a direct internal dependency is resolved from npm
 * at its pinned stable version, which canary-only charts never publishes.
 */

import {describe, it, expect} from 'vitest';
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const SRC_DIR = __dirname;
const manifest = JSON.parse(
  readFileSync(join(SRC_DIR, '..', 'package.json'), 'utf8'),
) as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

function importedAstryxPackages(): string[] {
  const names = new Set<string>();
  for (const file of readdirSync(SRC_DIR)) {
    if (!/\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file)) {
      continue;
    }
    const source = readFileSync(join(SRC_DIR, file), 'utf8');
    // Only real top-level import/export statements; JSDoc usage examples
    // (` * import {VegaChart} from '@astryxdesign/vega'`) are not imports.
    for (const [, name] of source.matchAll(
      /^(?:import|export)\b[^;]*?\sfrom '(@astryxdesign\/[^/']+)/gm,
    )) {
      names.add(name);
    }
  }
  return [...names].sort();
}

describe('package manifest', () => {
  it('declares every imported Astryx package as a peer dependency', () => {
    const imported = importedAstryxPackages();
    const peers = manifest.peerDependencies ?? {};

    expect(imported).toContain('@astryxdesign/charts');
    expect(imported.filter(name => peers[name] == null)).toEqual([]);
  });

  it('keeps Astryx packages out of direct dependencies', () => {
    expect(
      Object.keys(manifest.dependencies ?? {}).filter(name =>
        name.startsWith('@astryxdesign/'),
      ),
    ).toEqual([]);
  });
});
