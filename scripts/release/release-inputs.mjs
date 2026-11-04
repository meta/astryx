// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Release-branch admission over a working tree.
 *
 * Reads what `release-admission.mjs` judges — the fixed group, the version
 * main declared for it, the pending Changesets, and the latest stable tag —
 * from a checkout, and requires the declared version to be the release
 * version. Run where a release is planned and versioned, never on main.
 *
 * @input  a checkout root and the release version its marker or cut names
 * @output {declared, latestStable, tier, entries, problems}
 * @position scripts/release — used by active-release create/refresh and
 *   version-packages
 */

import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {parseFrontmatter} from '../check-changesets.mjs';
import {expandWorkspaceDirs} from '../lib/workspace-globs.mjs';
import {checkAdmission, latestStableVersion} from '../release-admission.mjs';

const require = createRequire(import.meta.url);
const {parseEntry} = require('../changeset-entry-format.cjs');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Every `v*` tag in the repository at `root`, or none outside a repository. */
export function repositoryTags(root) {
  try {
    return execFileSync('git', ['tag', '--list', 'v*'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** The Changesets pending at `root`, as admission reads them. */
export function pendingEntries(root) {
  const dir = path.join(root, '.changeset');
  return fs
    .readdirSync(dir)
    .filter(name => name.endsWith('.md') && name !== 'README.md')
    .sort()
    .flatMap(name => {
      const fm = parseFrontmatter(
        fs.readFileSync(path.join(dir, name), 'utf8'),
      );
      // An unparseable Changeset is check:changesets' finding; admission adds
      // nothing guessed.
      if (!fm) return [];
      return [
        {
          file: name,
          category: parseEntry(fm.summary).category,
          releases: fm.releases,
        },
      ];
    });
}

/** Name -> version for every workspace package at `root`. */
export function workspaceVersions(root) {
  const versions = new Map();
  for (const dir of expandWorkspaceDirs(root)) {
    const file = path.join(dir, 'package.json');
    if (!fs.existsSync(file)) continue;
    const manifest = readJson(file);
    if (manifest.name && manifest.version)
      versions.set(manifest.name, manifest.version);
  }
  return versions;
}

/**
 * Admit the release at `root`.
 *
 * @param {string} root
 * @param {object} input
 * @param {string} input.version  release version named by the cut or marker
 * @param {string[]} [input.tags]  defaults to the repository's tags
 * @returns {{declared: string|null, latestStable: string|null, tier: 'patch'|'minor'|null, entries: object[], problems: string[]}}
 */
export function admitRelease(root, {version, tags = repositoryTags(root)}) {
  const config = readJson(path.join(root, '.changeset/config.json'));
  const entries = pendingEntries(root);
  const result = checkAdmission({
    fixedGroups: config.fixed || [],
    versionByName: workspaceVersions(root),
    entries,
    latestStable: latestStableVersion(tags),
  });
  if (result.declared && result.declared !== version) {
    result.problems.unshift(
      `the release version is ${version}, but main declares ${result.declared}. A release branch releases the version main's package.json declares.`,
    );
  }
  return {...result, entries};
}
