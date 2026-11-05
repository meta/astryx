#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Release-branch versioning at the version main declared.
 *
 * `spec:AST-017` FR47: a release branch releases the fixed-group version
 * declared at its cut, and consuming Changesets never moves it. Stock
 * `changeset version` adds each Changeset's bump to the current version, so a
 * branch that already declares 0.7.0 would become 0.8.0 on its first
 * `[breaking]` entry. This step assembles the same release plan with the same
 * Changesets libraries the pinned CLI uses, pins every release to the declared
 * version, and applies it: changelogs are written under the declared version,
 * consumed Changesets are deleted, and package versions stay where main put
 * them.
 *
 * It runs only on the marked release branch whose marker names the declared
 * version, and only after release admission passes (FR48, FR49).
 *
 * @input  a release-branch checkout with `.release/active.json`
 * @output CHANGELOG entries at the declared version; consumed Changesets removed
 * @position scripts/release — first step of `pnpm version-packages`
 */

import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {isStableReleasePackage, validateIdentity} from './active-release.mjs';
import {admitRelease} from './release-inputs.mjs';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const MARKER = '.release/active.json';
const PLAN = '.release/plan.json';

/**
 * The Changesets libraries `@changesets/cli` itself resolves, so versioning
 * reads Changesets, fixed groups, and changelog output exactly as the pinned
 * CLI does.
 */
function changesetsLibraries() {
  const cliManifest = createRequire(import.meta.url).resolve(
    '@changesets/cli/package.json',
  );
  const fromCli = createRequire(cliManifest);
  const load = name => {
    const mod = fromCli(name);
    return mod.default ?? mod;
  };
  return {
    cliDist: path.join(path.dirname(cliManifest), 'dist'),
    readChangesets: load('@changesets/read'),
    assembleReleasePlan: load('@changesets/assemble-release-plan'),
    applyReleasePlan: load('@changesets/apply-release-plan'),
    readConfig: fromCli('@changesets/config').read,
    getPackages: fromCli('@manypkg/get-packages').getPackages,
  };
}

/**
 * FR47 — pin a Changesets release plan to the declared version.
 *
 * Every fixed-group release must already carry the declared version and keeps
 * it. Private and canary-only packages outside the group never publish to the
 * stable channel, so they keep the version Changesets computes for them, as
 * they always have. Any other release would publish a version main did not
 * declare.
 *
 * @param {{releases: Array<{name: string, oldVersion: string, newVersion: string}>}} plan
 * @param {object} input
 * @param {string} input.version  declared release version
 * @param {Set<string>} input.fixedNames
 * @param {Set<string>} [input.unstableNames]  private or canary-only packages
 * @returns {{plan: object, problems: string[]}}
 */
export function pinReleasePlan(
  plan,
  {version, fixedNames, unstableNames = new Set()},
) {
  const problems = [];
  const releases = plan.releases.map(release => {
    if (!fixedNames.has(release.name)) {
      if (!unstableNames.has(release.name))
        problems.push(
          `${release.name} publishes outside the fixed package group, so it has no declared release version.`,
        );
      return release;
    }
    if (release.oldVersion !== version) {
      problems.push(
        `${release.name} is ${release.oldVersion}, but the release version is ${version}.`,
      );
    }
    return {...release, newVersion: version};
  });
  return {plan: {...plan, releases}, problems};
}

/**
 * Consume every pending Changeset at `root` into changelogs for `version`.
 *
 * @param {string} root
 * @param {string} version  declared release version
 * @returns {Promise<{releases: Array<{name: string, computed: string, version: string}>}>}
 */
export async function versionAtDeclared(root, version) {
  const lib = changesetsLibraries();
  const packages = await lib.getPackages(root);
  const config = await lib.readConfig(root, packages);
  const changesets = await lib.readChangesets(root);
  if (changesets.length === 0) {
    throw new Error('there are no Changesets to release.');
  }

  const assembled = lib.assembleReleasePlan(
    changesets,
    packages,
    config,
    undefined,
  );
  const fixedNames = new Set((config.fixed || []).flat());
  const unstableNames = new Set(
    packages.packages
      .filter(({packageJson}) => !isStableReleasePackage(packageJson))
      .map(({packageJson}) => packageJson.name),
  );
  const {plan, problems} = pinReleasePlan(assembled, {
    version,
    fixedNames,
    unstableNames,
  });
  if (problems.length) throw new Error(problems.join('\n'));

  await lib.applyReleasePlan(plan, packages, config, undefined, lib.cliDist);
  return {
    releases: assembled.releases.map(release => ({
      name: release.name,
      computed: release.newVersion,
      version: fixedNames.has(release.name) ? version : release.newVersion,
    })),
  };
}

function currentBranch(root) {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}

async function main(argv) {
  const branchFlag = argv.indexOf('--branch');
  const root = ROOT;
  const markerPath = path.join(root, MARKER);
  if (!fs.existsSync(markerPath)) {
    throw new Error(
      `${MARKER} is missing. Versioning runs only on a marked release branch; main publishes canaries only.`,
    );
  }
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  const plan = JSON.parse(fs.readFileSync(path.join(root, PLAN), 'utf8'));
  const identity = validateIdentity(marker, plan);
  if (identity.length) throw new Error(identity.join('\n'));
  const branch = branchFlag >= 0 ? argv[branchFlag + 1] : currentBranch(root);
  if (marker.state !== 'active' || branch !== marker.branch) {
    throw new Error(
      `versioning runs only on the active marked release branch ${marker.branch}; this checkout is ${branch}.`,
    );
  }

  const admission = admitRelease(root, {version: marker.version});
  if (admission.problems.length) {
    throw new Error(
      `release admission refused ${marker.version}:\n  - ${admission.problems.join('\n  - ')}`,
    );
  }

  await versionAtDeclared(root, marker.version);
  console.log(
    `✓ consumed ${admission.entries.length} Changeset(s) into ${marker.version} changelogs (${admission.tier} release of ${admission.latestStable})`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error(`version-packages: ${error.message}`);
    process.exit(1);
  });
}
