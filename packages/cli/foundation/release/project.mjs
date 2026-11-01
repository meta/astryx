// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What a folder's project says about which CLI release answers there.
 *
 * Global mode picks one release per folder (spec AST-081 FR2): the project's
 * own CLI when it matches the project's Core, otherwise the CLI release that
 * matches the Core. This module reads the facts that choice needs, and nothing
 * else: the Core the folder reads, the CLI the folder installs, and the Astryx
 * versions its package.json and lockfile record.
 *
 * It finds Core and the CLI with the CLI's released reach, the same lookups
 * every read uses (`findCoreDir`, `findInstalledPackage`), so the release that
 * answers always pairs with the Core its reads load. A folder inside another
 * project therefore belongs to that project, as it does for reads.
 *
 * Plain files only: no imports beyond Node built-ins and the path helpers, so
 * the bin can read these facts before it loads anything else.
 *
 * @input  a folder
 * @output {@link ReleaseFacts}
 * @position foundation/release — read by the bin's hand-off and by the run
 *   context that names who answered.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {findInstalledPackage} from '../fs/paths.mjs';

/** The CLI package. */
export const CLI_PACKAGE_NAME = '@astryxdesign/cli';
/** The Core package. */
export const CORE_PACKAGE_NAME = '@astryxdesign/core';

/**
 * An installed package and its version.
 * @typedef {object} InstalledAstryxPackage
 * @property {string} dir the package folder
 * @property {string} version its package.json version
 */

/**
 * What one folder's project says about releases.
 * @typedef {object} ReleaseFacts
 * @property {boolean} inProject the folder belongs to a project: it reads an
 *   installed Core or CLI, or a package.json above it declares one
 * @property {InstalledAstryxPackage | null} core the Core the folder reads
 * @property {InstalledAstryxPackage | null} cli the CLI the folder installs
 * @property {string | null} declaringDir the nearest folder whose package.json
 *   declares the Core or the CLI
 * @property {string | null} declaredCoreRange the Core range it declares
 * @property {string | null} declaredCliRange the CLI range it declares
 * @property {string | null} lockedCoreVersion the Core version its lockfile records
 * @property {string | null} lockedCliVersion the CLI version its lockfile records
 */

/**
 * Read and parse a JSON file, or null.
 * @param {string} file
 * @returns {any}
 */
export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    // Missing or unreadable: the caller treats it as absent.
    return null;
  }
}

/**
 * The version of an installed package folder, when it is the package named.
 * @param {string} dir
 * @param {string} name
 * @returns {InstalledAstryxPackage | null}
 */
function installedAs(dir, name) {
  const pkg = readJson(path.join(dir, 'package.json'));
  if (!pkg || pkg.name !== name || typeof pkg.version !== 'string') {
    return null;
  }
  return {dir, version: pkg.version};
}

/**
 * The Core the folder reads, found the way `findCoreDir` finds it: the
 * folder and up to four folders above it, a workspace's `packages/core` or
 * an installed `node_modules/@astryxdesign/core`, else the same from the
 * folder of the package.json that makes the folder part of a project. A `packages/core` that is
 * another package is skipped, because no release pairs with it.
 * @param {string} startDir
 * @returns {InstalledAstryxPackage | null}
 */
export function findReadCore(startDir) {
  const near = nearbyReadCore(startDir);
  if (near) return near;
  // A folder deeper than that reach still belongs to the project the walk to
  // its package.json finds, so its Core is read from there (spec AST-081, a
  // folder's project).
  const declaring = findDeclaringPackage(startDir);
  return declaring && declaring.dir !== path.resolve(startDir)
    ? nearbyReadCore(declaring.dir)
    : null;
}

/**
 * The Core installed in the folder or one of the four folders above it, or a
 * workspace's own Core package there.
 * @param {string} startDir
 * @returns {InstalledAstryxPackage | null}
 */
function nearbyReadCore(startDir) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 5; i++) {
    const workspace = installedAs(
      path.join(dir, 'packages', 'core'),
      CORE_PACKAGE_NAME,
    );
    if (workspace) return workspace;
    const installed = installedAs(
      path.join(dir, 'node_modules', '@astryxdesign', 'core'),
      CORE_PACKAGE_NAME,
    );
    if (installed) return installed;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * The CLI the folder installs, found the way reads find installed packages;
 * else a workspace's own CLI package: the folder itself when it is the CLI
 * package, or a `packages/cli` that is, in the folder or one of the five
 * folders above it (spec AST-081, a folder's project). A repository that
 * builds the CLI and Core side by side answers with its own CLI.
 * @param {string} startDir
 * @returns {InstalledAstryxPackage | null}
 */
export function findProjectCli(startDir) {
  const start = path.resolve(startDir);
  const dir = findInstalledPackage(start, CLI_PACKAGE_NAME);
  if (dir) return installedAs(dir, CLI_PACKAGE_NAME);
  let at = start;
  for (let i = 0; i < 6; i++) {
    const own =
      installedAs(at, CLI_PACKAGE_NAME) ??
      installedAs(path.join(at, 'packages', 'cli'), CLI_PACKAGE_NAME);
    if (own) return own;
    const parent = path.dirname(at);
    if (parent === at) break;
    at = parent;
  }
  return null;
}

/** Version-control metadata that marks a repository's root. */
const REPOSITORY_MARKERS = ['.git', '.hg', '.sl'];

/**
 * The Astryx ranges a package.json declares, from any dependency field.
 * @param {any} pkg
 * @returns {{core: string | null, cli: string | null}}
 */
function declaredRanges(pkg) {
  /** @type {{core: string | null, cli: string | null}} */
  const out = {core: null, cli: null};
  if (!pkg || typeof pkg !== 'object') return out;
  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    const deps = pkg[field];
    if (!deps || typeof deps !== 'object') continue;
    if (out.core === null && typeof deps[CORE_PACKAGE_NAME] === 'string') {
      out.core = deps[CORE_PACKAGE_NAME];
    }
    if (out.cli === null && typeof deps[CLI_PACKAGE_NAME] === 'string') {
      out.cli = deps[CLI_PACKAGE_NAME];
    }
  }
  return out;
}

/**
 * The nearest package.json at or above `startDir` that declares the Core or
 * the CLI. The search stops after the first folder that holds
 * version-control metadata, and passes the home folder by unless the run
 * starts there, so a stray package.json in the home folder never claims every
 * folder beneath it.
 * @param {string} startDir
 * @returns {{dir: string, core: string | null, cli: string | null} | null}
 */
export function findDeclaringPackage(startDir) {
  const home = path.resolve(os.homedir());
  const start = path.resolve(startDir);
  let dir = start;
  for (;;) {
    if (dir !== home || dir === start) {
      const ranges = declaredRanges(readJson(path.join(dir, 'package.json')));
      if (ranges.core !== null || ranges.cli !== null) return {dir, ...ranges};
    }
    if (REPOSITORY_MARKERS.some(m => fs.existsSync(path.join(dir, m)))) {
      return null;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Every lockfile name the version reader understands.
 */
const LOCKFILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
];

/**
 * The version a lockfile records for `name`, for the package at `memberDir`.
 * @param {string} lockfile
 * @param {string} memberDir the folder whose package.json declares it
 * @param {string} name
 * @param {string | null} range the range that folder declares
 * @returns {string | null}
 */
export function lockedVersion(lockfile, memberDir, name, range) {
  let text;
  try {
    text = fs.readFileSync(lockfile, 'utf-8');
  } catch {
    // An unreadable lockfile records nothing.
    return null;
  }
  const base = path.basename(lockfile);
  const rel = path
    .relative(path.dirname(lockfile), memberDir)
    .split(path.sep)
    .join('/');
  if (base === 'package-lock.json' || base === 'npm-shrinkwrap.json') {
    const lock = safeJson(text);
    const packages = lock?.packages;
    if (packages && typeof packages === 'object') {
      for (const key of [
        rel ? `${rel}/node_modules/${name}` : null,
        `node_modules/${name}`,
      ]) {
        const version = key ? packages[key]?.version : undefined;
        if (typeof version === 'string') return version;
      }
    }
    const legacy = lock?.dependencies?.[name]?.version;
    return typeof legacy === 'string' ? legacy : null;
  }
  if (base === 'pnpm-lock.yaml') return pnpmLockedVersion(text, rel, name);
  if (base === 'yarn.lock') return yarnLockedVersion(text, name, range);
  if (base === 'bun.lock') return bunLockedVersion(text, name);
  return null;
}

/**
 * @param {string} text
 * @returns {any}
 */
function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** @param {string} s */
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * A pnpm lockfile's version for `name` in the importer at `rel` (`.` at the
 * root): the `version:` under that importer's dependency entry, with any
 * peer suffix (`0.7.1(react@19.0.0)`) dropped.
 * @param {string} text
 * @param {string} rel
 * @param {string} name
 * @returns {string | null}
 */
function pnpmLockedVersion(text, rel, name) {
  const lines = text.split(/\r?\n/);
  const importer = rel || '.';
  let inImporters = false;
  let inThisImporter = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^importers:\s*$/.test(line)) {
      inImporters = true;
      continue;
    }
    if (inImporters && /^\S/.test(line)) break;
    if (!inImporters) continue;
    const importerMatch = /^ {2}(?! )(['"]?)(.+?)\1:\s*$/.exec(line);
    if (importerMatch) {
      inThisImporter = importerMatch[2] === importer;
      continue;
    }
    if (!inThisImporter) continue;
    const depMatch = new RegExp(`^ {6}(['"]?)${escapeRe(name)}\\1:\\s*$`).exec(
      line,
    );
    if (!depMatch) continue;
    for (let j = i + 1; j < lines.length && /^ {8}/.test(lines[j]); j++) {
      const v = /^ {8}version:\s*['"]?([^'"\s(]+)/.exec(lines[j]);
      if (v) return cleanVersion(v[1]);
    }
  }
  // An older lockfile without importers lists `/name@version` keys.
  const key = new RegExp(
    `^ {2}['"]?/?${escapeRe(name)}[@/](\\d[^:'"\\s(]*)`,
    'm',
  );
  const m = key.exec(text);
  return m ? cleanVersion(m[1]) : null;
}

/**
 * A yarn.lock's version for `name`: the entry whose descriptors include the
 * declared range (classic `name@^1`, Berry `name@npm:^1`), else the only
 * entry for the name.
 * @param {string} text
 * @param {string} name
 * @param {string | null} range
 * @returns {string | null}
 */
function yarnLockedVersion(text, name, range) {
  const blocks = text.split(/\r?\n(?=\S)/);
  /** @type {string[]} */
  const versions = [];
  for (const block of blocks) {
    const [head, ...rest] = block.split(/\r?\n/);
    const descriptors = head
      .replace(/:\s*$/, '')
      .split(',')
      .map(d => d.trim().replace(/^"|"$/g, ''));
    const ours = descriptors.filter(
      d => d.startsWith(`${name}@`) && !d.startsWith(`${name}@patch:`),
    );
    if (ours.length === 0) continue;
    const versionLine = rest.find(l => /^\s+version:?\s/.test(l));
    const v = versionLine && /version:?\s+"?([^"\s]+)"?/.exec(versionLine);
    const version = v ? cleanVersion(v[1]) : null;
    if (!version) continue;
    if (
      range &&
      ours.some(d => d === `${name}@${range}` || d === `${name}@npm:${range}`)
    ) {
      return version;
    }
    versions.push(version);
  }
  return versions.length === 1 ? versions[0] : null;
}

/**
 * A bun.lock's version for `name`: its `packages` entry,
 * `"name": ["name@version", …]`.
 * @param {string} text
 * @param {string} name
 * @returns {string | null}
 */
function bunLockedVersion(text, name) {
  const m = new RegExp(
    `"${escapeRe(name)}"\\s*:\\s*\\[\\s*"${escapeRe(name)}@([^"]+)"`,
  ).exec(text);
  return m ? cleanVersion(m[1]) : null;
}

/**
 * A plain version from a lockfile value: strips an `npm:` protocol and any
 * peer suffix.
 * @param {string} value
 * @returns {string | null}
 */
function cleanVersion(value) {
  const v = value.replace(/^npm:/, '').replace(/\(.*$/, '');
  return /^\d+\.\d+\.\d+/.test(v) ? v : null;
}

/**
 * The lockfile that records the package at `memberDir`: the nearest one at or
 * above it, up to the repository root.
 * @param {string} memberDir
 * @returns {string | null}
 */
export function findLockfile(memberDir) {
  let dir = path.resolve(memberDir);
  for (;;) {
    for (const name of LOCKFILES) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) return file;
    }
    if (REPOSITORY_MARKERS.some(m => fs.existsSync(path.join(dir, m)))) {
      return null;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Read every release fact for `startDir`.
 * @param {string} startDir
 * @returns {ReleaseFacts}
 */
export function readReleaseFacts(startDir) {
  const declaring = findDeclaringPackage(startDir);
  // A folder deeper than the nearby look reaches still belongs to the project
  // the walk found, so its own CLI is looked up from there too, as a package
  // runner resolves the project's command from any depth (spec AST-081, a
  // folder's project); findReadCore does the same for Core.
  const fromRoot =
    declaring && declaring.dir !== path.resolve(startDir)
      ? declaring.dir
      : null;
  const core = findReadCore(startDir);
  const cli =
    findProjectCli(startDir) ?? (fromRoot ? findProjectCli(fromRoot) : null);
  let lockedCoreVersion = null;
  let lockedCliVersion = null;
  if (declaring && (!core || !cli)) {
    const lockfile = findLockfile(declaring.dir);
    if (lockfile) {
      lockedCoreVersion = declaring.core
        ? lockedVersion(
            lockfile,
            declaring.dir,
            CORE_PACKAGE_NAME,
            declaring.core,
          )
        : null;
      lockedCliVersion = declaring.cli
        ? lockedVersion(
            lockfile,
            declaring.dir,
            CLI_PACKAGE_NAME,
            declaring.cli,
          )
        : null;
    }
  }
  return {
    inProject: Boolean(core || cli || declaring),
    core,
    cli,
    declaringDir: declaring?.dir ?? null,
    declaredCoreRange: declaring?.core ?? null,
    declaredCliRange: declaring?.cli ?? null,
    lockedCoreVersion,
    lockedCliVersion,
  };
}
