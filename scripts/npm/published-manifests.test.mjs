// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Published packages name their @astryxdesign packages at this
 * release's version (scripts/npm/published-manifests.mjs).
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';

import {
  alignmentProblems,
  canaryOnlyNames,
  isPublished,
  PENDING_ALIGNMENT,
  publishedPackages,
  releaseVersions,
} from './published-manifests.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const versions = new Map([
  ['@astryxdesign/core', '0.7.9'],
  ['@astryxdesign/theme-neutral', '0.7.9'],
]);
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

describe('alignmentProblems', () => {
  it("accepts this release's exact version", () => {
    for (const spec of ['0.7.9']) {
      expect(
        alignmentProblems(
          {
            name: '@astryxdesign/cli',
            peerDependencies: {'@astryxdesign/core': spec},
          },
          versions,
        ),
      ).toEqual([]);
    }
  });

  it('refuses "*", another release and any other range', () => {
    for (const spec of [
      '*',
      '0.7.0',
      '>=0.7.0',
      '^0.7.0',
      '^0.7.9',
      'workspace:*',
    ]) {
      expect(
        alignmentProblems(
          {
            name: '@astryxdesign/theme-neutral',
            peerDependencies: {'@astryxdesign/core': spec},
          },
          versions,
        ),
      ).toEqual([
        `@astryxdesign/theme-neutral: peerDependencies @astryxdesign/core is "${spec}"; name this release's version, "0.7.9"`,
      ]);
    }
  });

  it('checks dependencies and optional dependencies too, but not devDependencies', () => {
    const problems = alignmentProblems(
      {
        name: '@astryxdesign/x',
        dependencies: {'@astryxdesign/core': '*'},
        optionalDependencies: {'@astryxdesign/theme-neutral': '*'},
        devDependencies: {'@astryxdesign/core': '*'},
      },
      versions,
    );
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('dependencies @astryxdesign/core');
    expect(problems[1]).toContain(
      'optionalDependencies @astryxdesign/theme-neutral',
    );
  });

  it('refuses an @astryxdesign package that is not in this release, and ignores other scopes', () => {
    expect(
      alignmentProblems(
        {
          name: '@astryxdesign/cli',
          peerDependencies: {'@astryxdesign/gone': '1.0.0', react: '*'},
        },
        versions,
      ),
    ).toEqual([
      '@astryxdesign/cli: peerDependencies names @astryxdesign/gone, which npm does not receive in this release',
    ]);
  });
});

describe('the pending exception', () => {
  it('lets only the CLI\'s optional Core peer stay "*"', () => {
    expect(PENDING_ALIGNMENT).toHaveLength(1);
    expect(
      alignmentProblems(
        {
          name: '@astryxdesign/cli',
          peerDependencies: {'@astryxdesign/core': '*'},
        },
        versions,
      ),
    ).toEqual([]);
  });

  it('does not cover another spec, field, dependency or package', () => {
    const cases = [
      {
        name: '@astryxdesign/cli',
        peerDependencies: {'@astryxdesign/core': '>=0.6.0'},
      },
      {name: '@astryxdesign/cli', dependencies: {'@astryxdesign/core': '*'}},
      {
        name: '@astryxdesign/cli',
        peerDependencies: {'@astryxdesign/theme-neutral': '*'},
      },
      {
        name: '@astryxdesign/theme-neutral',
        peerDependencies: {'@astryxdesign/core': '*'},
      },
    ];
    for (const manifest of cases) {
      expect(alignmentProblems(manifest, versions)).toHaveLength(1);
    }
  });
});

describe('canary-only packages', () => {
  const release = new Map([...versions, ['@astryxdesign/lab', '0.1.9']]);
  const canaryOnly = new Set(['@astryxdesign/lab']);

  it('refuses a stable package that names one', () => {
    expect(
      alignmentProblems(
        {
          name: '@astryxdesign/cli',
          peerDependencies: {'@astryxdesign/lab': '0.1.9'},
        },
        release,
        canaryOnly,
      ),
    ).toEqual([
      '@astryxdesign/cli: peerDependencies names @astryxdesign/lab, which only the canary channel publishes',
    ]);
  });

  it('lets a canary-only package name another at its version', () => {
    expect(
      alignmentProblems(
        {
          name: '@astryxdesign/charts',
          private: true,
          astryx: {canaryOnly: true},
          peerDependencies: {'@astryxdesign/lab': '0.1.9'},
        },
        release,
        canaryOnly,
      ),
    ).toEqual([]);
  });

  it("lists this repository's canary-only packages", () => {
    const names = canaryOnlyNames(ROOT);
    expect(names.has('@astryxdesign/lab')).toBe(true);
    expect(names.has('@astryxdesign/core')).toBe(false);
  });
});

describe('releaseVersions', () => {
  it('counts only packages npm receives, so naming a private one fails', () => {
    const versions = releaseVersions(ROOT);
    expect(versions.get('@astryxdesign/core')).toBeDefined();
    expect(versions.has('@astryxdesign/theme-probe')).toBe(false);
    expect(
      alignmentProblems(
        {
          name: '@astryxdesign/x',
          peerDependencies: {'@astryxdesign/theme-probe': '0.5.0'},
        },
        versions,
      ),
    ).toEqual([
      '@astryxdesign/x: peerDependencies names @astryxdesign/theme-probe, which npm does not receive in this release',
    ]);
  });
});

describe('publishedPackages', () => {
  it("lists the canary loops' packages: public ones and private canary-only ones", () => {
    const byName = new Map(
      publishedPackages(ROOT).map(pkg => [pkg.manifest.name, pkg.dir]),
    );
    expect(byName.get('@astryxdesign/core')).toBe('packages/core');
    expect(byName.get('@astryxdesign/theme-neutral')).toBe(
      'packages/themes/neutral',
    );
    expect(byName.has('@astryxdesign/vega')).toBe(true);
    expect(byName.has('@astryxdesign/theme-probe')).toBe(false);
  });
});

describe('isPublished', () => {
  it('counts public packages and private canary-only ones', () => {
    expect(isPublished({name: '@astryxdesign/core'})).toBe(true);
    expect(
      isPublished({
        name: '@astryxdesign/lab',
        private: true,
        astryx: {canaryOnly: true},
      }),
    ).toBe(true);
    expect(
      isPublished({name: '@astryxdesign/theme-probe', private: true}),
    ).toBe(false);
    expect(isPublished({name: 'astryx-docsite'})).toBe(false);
  });
});

describe('this repository', () => {
  it('publishes every package with aligned @astryxdesign versions', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/npm/published-manifests.mjs'],
      {cwd: ROOT, encoding: 'utf8'},
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('gives the CLI one optional peer, Core, kept at "*" until the next minor', () => {
    const cli = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'packages/cli/package.json'), 'utf8'),
    );
    expect(cli.peerDependencies).toEqual({'@astryxdesign/core': '*'});
    expect(cli.peerDependenciesMeta).toEqual({
      '@astryxdesign/core': {optional: true},
    });
  });

  it('fails the check, naming the package, when a manifest drifts', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-manifests-'));
    roots.push(root);
    const write = (dir, manifest) => {
      fs.mkdirSync(path.join(root, dir), {recursive: true});
      fs.writeFileSync(
        path.join(root, dir, 'package.json'),
        JSON.stringify(manifest),
      );
    };
    write('packages/core', {name: '@astryxdesign/core', version: '0.7.9'});
    write('packages/cli', {
      name: '@astryxdesign/cli',
      version: '0.7.9',
      peerDependencies: {'@astryxdesign/theme-neutral': '*'},
    });
    write('packages/themes/neutral', {
      name: '@astryxdesign/theme-neutral',
      version: '0.7.9',
    });
    write('packages/themes/probe', {
      name: '@astryxdesign/theme-probe',
      version: '0.5.0',
      private: true,
    });
    expect(releaseVersions(root).has('@astryxdesign/theme-probe')).toBe(false);
    expect(releaseVersions(root).get('@astryxdesign/theme-neutral')).toBe(
      '0.7.9',
    );
    const result = spawnSync(
      process.execPath,
      [path.join(ROOT, 'scripts/npm/published-manifests.mjs')],
      {cwd: root, encoding: 'utf8'},
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      '@astryxdesign/cli: peerDependencies @astryxdesign/theme-neutral is "*"',
    );
  });
});
