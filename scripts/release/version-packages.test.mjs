// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Release-branch versioning keeps the version main declared.
 *
 * @input  temporary workspaces using this repository's Changesets config shape
 *   and changelog generator
 * @output proofs that consuming Changesets writes changelogs under the declared
 *   version and never moves it (spec:AST-017 FR47)
 * @position focused suite for scripts/release/version-packages.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {afterEach, describe, expect, it} from 'vitest';
import {pinReleasePlan, versionAtDeclared} from './version-packages.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const FIXED = [
  '@astryxdesign/core',
  '@astryxdesign/cli',
  '@astryxdesign/theme-neutral',
];
const roots = [];

function write(root, file, contents) {
  fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
  fs.writeFileSync(
    path.join(root, file),
    typeof contents === 'string'
      ? contents
      : `${JSON.stringify(contents, null, 2)}\n`,
  );
}

function workspace(version, changesets) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-version-'));
  roots.push(root);
  write(root, 'package.json', {name: 'fixture-root', private: true});
  write(root, 'pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n");
  write(root, 'packages/core/package.json', {
    name: '@astryxdesign/core',
    version,
  });
  write(root, 'packages/cli/package.json', {
    name: '@astryxdesign/cli',
    version,
  });
  write(root, 'packages/theme-neutral/package.json', {
    name: '@astryxdesign/theme-neutral',
    version,
    peerDependencies: {'@astryxdesign/core': version},
  });
  const config = JSON.parse(
    fs.readFileSync(path.join(REPO, '.changeset/config.json'), 'utf8'),
  );
  write(root, '.changeset/config.json', {
    ...config,
    fixed: [FIXED],
    ignore: [],
  });
  write(
    root,
    '.changeset/changelog.cjs',
    fs.readFileSync(path.join(REPO, '.changeset/changelog.cjs'), 'utf8'),
  );
  write(
    root,
    'scripts/changeset-entry-format.cjs',
    fs.readFileSync(
      path.join(REPO, 'scripts/changeset-entry-format.cjs'),
      'utf8',
    ),
  );
  for (const [name, body] of Object.entries(changesets))
    write(root, `.changeset/${name}.md`, body);
  return root;
}

const read = (root, file) => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = (root, dir) =>
  JSON.parse(read(root, `packages/${dir}/package.json`));

const BREAKING =
  "---\n'@astryxdesign/core': minor\n---\n\n[breaking] Remove the old thing\n@person\n";
const FIX =
  "---\n'@astryxdesign/core': patch\n---\n\n[fix] Fix the thing\n@person\n";

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, {recursive: true, force: true});
});

describe('FR47 — consuming Changesets never moves the declared version', () => {
  it('cuts a pre-bumped 0.7.0 with a [breaking] Changeset as 0.7.0, not 0.8.0', async () => {
    const root = workspace('0.7.0', {'remove-thing': BREAKING, 'fix-it': FIX});

    const {releases} = await versionAtDeclared(root, '0.7.0');

    // Red arm: stock Changesets would add the minor bump on top of 0.7.0.
    expect(releases.find(r => r.name === '@astryxdesign/core').computed).toBe(
      '0.8.0',
    );
    for (const dir of ['core', 'cli', 'theme-neutral'])
      expect(manifest(root, dir).version).toBe('0.7.0');
    expect(manifest(root, 'theme-neutral').peerDependencies).toEqual({
      '@astryxdesign/core': '0.7.0',
    });
    const changelog = read(root, 'packages/core/CHANGELOG.md');
    expect(changelog).toMatch(/^## 0\.7\.0$/m);
    expect(changelog).not.toContain('0.8.0');
    expect(changelog).toContain('Remove the old thing');
    expect(changelog).toContain('Fix the thing');
    expect(fs.existsSync(path.join(root, '.changeset/remove-thing.md'))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(root, '.changeset/fix-it.md'))).toBe(false);
  });

  it('keeps the patch path: a declared 0.6.7 with a [fix] Changeset releases 0.6.7', async () => {
    const root = workspace('0.6.7', {'fix-it': FIX});

    const {releases} = await versionAtDeclared(root, '0.6.7');

    expect(releases.find(r => r.name === '@astryxdesign/core').computed).toBe(
      '0.6.8',
    );
    for (const dir of ['core', 'cli', 'theme-neutral'])
      expect(manifest(root, dir).version).toBe('0.6.7');
    const changelog = read(root, 'packages/core/CHANGELOG.md');
    expect(changelog).toMatch(/^## 0\.6\.7$/m);
    expect(changelog).not.toContain('0.6.8');
    expect(fs.existsSync(path.join(root, '.changeset/fix-it.md'))).toBe(false);
  });

  it('refuses a release version the packages do not carry, before writing', async () => {
    const root = workspace('0.7.0', {'fix-it': FIX});
    await expect(versionAtDeclared(root, '0.7.1')).rejects.toThrow(
      'is 0.7.0, but the release version is 0.7.1',
    );
    expect(fs.existsSync(path.join(root, '.changeset/fix-it.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'packages/core/CHANGELOG.md'))).toBe(
      false,
    );
  });

  it('refuses an empty release', async () => {
    const root = workspace('0.7.0', {});
    await expect(versionAtDeclared(root, '0.7.0')).rejects.toThrow(
      'no Changesets to release',
    );
  });
});

describe('pinReleasePlan', () => {
  const fixedNames = new Set(['@scope/a', '@scope/b']);

  it('pins every fixed release to the declared version', () => {
    const {plan, problems} = pinReleasePlan(
      {
        releases: [
          {name: '@scope/a', oldVersion: '1.3.0', newVersion: '1.4.0'},
          {name: '@scope/b', oldVersion: '1.3.0', newVersion: '1.4.0'},
        ],
      },
      {version: '1.3.0', fixedNames},
    );
    expect(problems).toEqual([]);
    expect(plan.releases.map(r => r.newVersion)).toEqual(['1.3.0', '1.3.0']);
  });

  it('refuses a stable release outside the fixed group', () => {
    const {problems} = pinReleasePlan(
      {
        releases: [
          {name: '@scope/x', oldVersion: '1.3.0', newVersion: '1.3.1'},
        ],
      },
      {version: '1.3.0', fixedNames},
    );
    expect(problems[0]).toMatch(/publishes outside the fixed package group/);
  });

  it('leaves private dependents on the version Changesets computes', () => {
    const {plan, problems} = pinReleasePlan(
      {
        releases: [
          {name: '@scope/a', oldVersion: '1.3.0', newVersion: '1.4.0'},
          {name: '@scope/lab', oldVersion: '0.1.9', newVersion: '0.1.10'},
        ],
      },
      {version: '1.3.0', fixedNames, unstableNames: new Set(['@scope/lab'])},
    );
    expect(problems).toEqual([]);
    expect(plan.releases.map(r => r.newVersion)).toEqual(['1.3.0', '0.1.10']);
  });
});

describe('versioning runs only on a release branch', () => {
  it('refuses on a checkout with no active release marker, such as main', () => {
    if (fs.existsSync(path.join(REPO, '.release/active.json'))) return;
    const result = spawnSync(
      process.execPath,
      [path.join(REPO, 'scripts/release/version-packages.mjs')],
      {cwd: REPO, encoding: 'utf8'},
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Versioning runs only on a marked release branch; main publishes canaries only.',
    );
  });
});
