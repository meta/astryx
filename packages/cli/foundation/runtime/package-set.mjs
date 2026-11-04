// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Matching a project to a host's package sets (architecture:cli-surface
 * INV30). A package set is a root whose `node_modules` holds a CLI, the Core
 * equal to it, and the integrations installed with them; a run resolves from at
 * most one root, and a hosted run installs nothing.
 *
 * Inside a project a root fills only the `@astryxdesign/*` packages the
 * project leaves uninstalled whose copy in the root ships no integration
 * manifest. For a run that a release other than the starting copy answers, the
 * first root in the host's order qualifies when its CLI and Core are that
 * release and it holds, for each package it may fill, the version the project
 * would install: the lockfile's, else a published version in the declared
 * range.
 *
 * @input A release, the project folder, and the host's roots.
 * @output The root that serves the run, or why none can.
 * @position foundation/runtime — read by the release choice (handoff.mjs) in a
 *   hosted run.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {findManifestPaths} from '../integrations/integrations.mjs';
import {readJson} from '../release/project.mjs';
import {cliBinOf, isVersionRange} from '../release/cache.mjs';
import {isValidSemver, satisfiesRange} from '../env/semver.mjs';
import {projectAstryxPins} from './locked-versions.mjs';

const CLI = '@astryxdesign/cli';
const CORE = '@astryxdesign/core';

/**
 * A root's own copy of `name`, read from its `node_modules` only: a root never
 * reaches past itself.
 * @param {string} root
 * @param {string} name
 * @returns {{dir: string, version: string | null} | null}
 */
export function rootPackage(root, name) {
  const dir = path.join(root, 'node_modules', ...name.split('/'));
  const pkg = readJson(path.join(dir, 'package.json'));
  if (!pkg || typeof pkg !== 'object' || pkg.name !== name) return null;
  return {dir, version: typeof pkg.version === 'string' ? pkg.version : null};
}

/**
 * Whether `version` is one the project's install could bring in for `range`:
 * a plain version range only, and a prerelease only when the range names a
 * prerelease of the same version.
 * @param {string | null} version
 * @param {string} range
 * @returns {boolean}
 */
export function satisfiesInstall(version, range) {
  if (!version || !isValidSemver(version) || !isVersionRange(range)) {
    return false;
  }
  const dash = version.indexOf('-');
  if (dash !== -1 && !range.includes(`${version.slice(0, dash)}-`)) {
    return false;
  }
  return satisfiesRange(version, range);
}

/**
 * Whether `root` holds what the project would install for one pin it leaves
 * uninstalled. A package the root holds as an integration, or does not hold at
 * all, is one the root never fills, so it never keeps the root out.
 * @param {string} root
 * @param {import('./locked-versions.mjs').AstryxPin} pin
 * @returns {boolean}
 */
function holds(root, pin) {
  if (pin.name === CLI) return true;
  const copy = rootPackage(root, pin.name);
  if (!copy) return pin.name !== CORE;
  if (findManifestPaths(copy.dir).length > 0) return true;
  if (pin.locked) return copy.version === pin.locked;
  return satisfiesInstall(copy.version, pin.declared);
}

/**
 * @typedef {object} ServingRoot
 * @property {string} root
 * @property {string} cliDir the root's CLI package
 * @property {string | null} bin the root's `astryx` bin
 * @property {string | null} hostEntry the root's `host/index.mjs`, when its
 *   CLI ships one
 */

/**
 * The first of `roots` that may serve a run in `projectDir` that CLI
 * `release` answers.
 * @param {{release: string, projectDir: string | null, roots: readonly string[], needsHostEntry?: boolean}} input
 *   `needsHostEntry` keeps out a root whose CLI has no host entry
 * @returns {ServingRoot | {reason: string}}
 */
export function qualifyingRoot({
  release,
  projectDir,
  roots,
  needsHostEntry = false,
}) {
  const open = projectDir
    ? projectAstryxPins(projectDir).filter(pin => pin.installed === null)
    : [];
  for (const root of roots) {
    const cli = rootPackage(root, CLI);
    if (!cli || cli.version !== release) continue;
    const core = rootPackage(root, CORE);
    if (!core || core.version !== release) continue;
    const hostEntry = path.join(cli.dir, 'host', 'index.mjs');
    const hasHostEntry = fs.existsSync(hostEntry);
    if (needsHostEntry && !hasHostEntry) continue;
    const bin = cliBinOf(cli.dir);
    if (!bin && !hasHostEntry) continue;
    if (!open.every(pin => holds(root, pin))) continue;
    return {
      root,
      cliDir: cli.dir,
      bin,
      hostEntry: hasHostEntry ? hostEntry : null,
    };
  }
  return {
    reason: `no package set the host passed holds CLI ${release} with this project's packages`,
  };
}
