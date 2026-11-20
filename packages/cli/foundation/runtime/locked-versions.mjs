// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The versions a project would install for the Astryx packages it
 * declares (architecture:cli-surface INV30): for each `@astryxdesign/*`
 * dependency, the value its package.json declares, the version installed for
 * it, and, when nothing is installed for it, the version its lockfile records.
 *
 * @input A project folder.
 * @output One pin per declared `@astryxdesign/*` package.
 * @position foundation/runtime — read by package-set.mjs to match a project to
 *   a host's package set.
 */

import * as path from 'node:path';
import {findLockfile, lockedVersions, readJson} from '../release/project.mjs';
import {resolveInstalledPackageDir} from '../integrations/installed-package.mjs';

const SCOPE = '@astryxdesign/';
const FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'];

/**
 * @typedef {object} AstryxPin
 * @property {string} name
 * @property {string} declared the value the project's package.json declares
 * @property {string | null} locked the version the project's lockfile records,
 *   read only when nothing is installed for the package
 * @property {string | null} installed the version installed for the project
 */

/**
 * The project's `@astryxdesign/*` dependencies, in field then declaration
 * order; a name declared twice keeps its first field.
 * @param {string} projectDir the folder whose package.json declares them
 * @returns {AstryxPin[]}
 */
export function projectAstryxPins(projectDir) {
  const pkg = readJson(path.join(projectDir, 'package.json'));
  if (!pkg || typeof pkg !== 'object') return [];
  /** @type {Array<Omit<AstryxPin, 'locked'>>} */
  const pins = [];
  const seen = new Set();
  for (const field of FIELDS) {
    const deps = pkg[field];
    if (!deps || typeof deps !== 'object' || Array.isArray(deps)) continue;
    for (const [name, declared] of Object.entries(deps)) {
      if (!name.startsWith(SCOPE) || seen.has(name)) continue;
      if (typeof declared !== 'string') continue;
      seen.add(name);
      const found = resolveInstalledPackageDir(name, projectDir);
      const version = found
        ? readJson(path.join(found.packageDir, 'package.json'))?.version
        : null;
      pins.push({
        name,
        declared,
        installed: typeof version === 'string' ? version : null,
      });
    }
  }
  // Read the lockfile only for a package that is not installed, and read it
  // once for all of them.
  const open = pins.filter(pin => pin.installed === null);
  const lockfile = open.length > 0 ? findLockfile(projectDir) : null;
  const locked = lockfile
    ? lockedVersions(
        lockfile,
        projectDir,
        open.map(pin => ({name: pin.name, range: pin.declared})),
      )
    : new Map();
  return pins.map(pin => ({...pin, locked: locked.get(pin.name) ?? null}));
}
