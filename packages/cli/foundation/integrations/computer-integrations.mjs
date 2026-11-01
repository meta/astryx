// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Computer-level integrations (spec AST-081 FR12): the integration
 * packages installed in the same install root as the running copy of the CLI,
 * such as a package manager's global folder beside a global copy, or the
 * package set a door installs together.
 *
 * - The install root is the folder whose `node_modules` holds the running
 *   CLI package (above pnpm's `.pnpm` store). pnpm 11 and later give each
 *   global package a folder of its own, and every one of them counts. A
 *   package runner's temporary install and the per-user release cache are not
 *   install roots: they hold what one run asked for.
 * - When the root has a package.json, its declared dependencies are read, as
 *   autolink reads a project's; otherwise (npm's global folder) every package
 *   directly in its `node_modules`, scoped ones included. Either way, only a
 *   package with exactly one root `astryx.integration.*` manifest counts, and
 *   the CLI and Core packages never do.
 * - Outside a project they load as a project's integrations do (Project.load).
 *   One whose declared `@astryxdesign/core` or `@astryxdesign/cli` peer range
 *   excludes the answering release is skipped, and doctor says why.
 * - Inside a project none load; discover lists the ones the project does not
 *   install as available, and doctor names them.
 *
 * Listing reads package.json files only; nothing is imported until a load.
 *
 * @input  the running CLI package's folder
 * @output the computer-level integration candidates, and their loaded records
 * @position foundation/integrations — read by config/project, discover, and
 *   doctor.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {findManifestPaths, loadIntegrations} from './integrations.mjs';
import {
  readDeclaredDependencies,
  resolveInstalledPackageDir,
} from './autolink.mjs';
import {installPlaceOf} from '../release/choose.mjs';
import {isInReleaseCache} from '../release/cache.mjs';
import {satisfiesRange} from '../env/semver.mjs';

/** Packages that are the CLI itself, never an integration of it. */
const NOT_INTEGRATIONS = new Set(['@astryxdesign/cli', '@astryxdesign/core']);

/** Peers whose ranges must admit the answering release. */
const RELEASE_PEERS = ['@astryxdesign/core', '@astryxdesign/cli'];

/**
 * @typedef {object} ComputerIntegrationCandidate
 * @property {string} name the package name
 * @property {string | undefined} version
 * @property {string | undefined} description
 * @property {string} packageDir
 * @property {string} hostDir the folder whose node_modules holds it
 * @property {string | null} incompatible why its peer ranges exclude the
 *   answering release, or null
 */

/**
 * @param {string} p
 * @returns {string}
 */
function real(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * @param {string} dir
 * @returns {Record<string, any> | null}
 */
function readPackage(dir) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
    );
    return pkg && typeof pkg === 'object' ? pkg : null;
  } catch {
    return null;
  }
}

/**
 * The install root of the CLI package at `cliRoot`, or null when it has none
 * that counts: it is not installed in a `node_modules` folder, or it lives in
 * a package runner's temporary install or the per-user release cache.
 * @param {string} cliRoot
 * @param {{cacheDir?: string}} [options]
 * @returns {string | null}
 */
export function computerInstallRoot(cliRoot, options = {}) {
  const root = real(cliRoot);
  const place = installPlaceOf(root);
  if (place.runner || !place.owner) return null;
  if (isInReleaseCache(root, options.cacheDir)) return null;
  return place.owner;
}

/**
 * Every install root that holds packages installed with the CLI at
 * `cliRoot`. Usually one: its install root. pnpm 11 and later install each
 * global package in a folder of its own, `<pnpm home>/global/v<N>/<id>`, with
 * its files in `<pnpm home>/store/v<N>/links` or inside that folder, so every
 * such global folder counts, provided one of them installs this CLI.
 * @param {string} cliRoot
 * @param {{cacheDir?: string}} [options]
 * @returns {string[]}
 */
export function computerInstallRoots(cliRoot, options = {}) {
  const fromPnpm = pnpmGlobalFolders(real(cliRoot));
  if (fromPnpm.length > 0) return fromPnpm;
  const root = computerInstallRoot(cliRoot, options);
  return root ? [root] : [];
}

/**
 * pnpm's global folders for a CLI installed globally by pnpm 11 or later, or
 * none. Its files are either in pnpm's store (`<home>/store/v<N>/links/...`,
 * with the global virtual store) or inside its own global folder
 * (`<home>/global/v<N>/<id>/node_modules/...`, without it).
 * @param {string} cli the CLI package's real path
 * @returns {string[]}
 */
function pnpmGlobalFolders(cli) {
  const parts = cli.split(/[\\/]/);
  /** @type {string | null} */
  let globalDir = null;
  const storeAt = parts.lastIndexOf('store');
  if (
    storeAt > 0 &&
    /^v\d+$/.test(parts[storeAt + 1] ?? '') &&
    parts[storeAt + 2] === 'links'
  ) {
    const home = parts.slice(0, storeAt).join(path.sep) || path.sep;
    globalDir = path.join(home, 'global', parts[storeAt + 1]);
  } else {
    const at = parts.findIndex(
      (part, k) =>
        part === 'global' &&
        /^v\d+$/.test(parts[k + 1] ?? '') &&
        parts[k + 3] === 'node_modules',
    );
    if (at > 0) globalDir = parts.slice(0, at + 2).join(path.sep) || path.sep;
  }
  if (globalDir == null) return [];
  /** @type {string[]} */
  let names;
  try {
    names = fs.readdirSync(globalDir).sort();
  } catch {
    return [];
  }
  const folders = names
    .map(name => path.join(globalDir, name))
    .filter(dir => fs.existsSync(path.join(dir, 'package.json')));
  const installsThisCli = folders.some(
    dir => real(path.join(dir, 'node_modules', '@astryxdesign', 'cli')) === cli,
  );
  return installsThisCli ? folders : [];
}

/**
 * Every package name directly in `<root>/node_modules`, scoped ones included.
 * @param {string} root
 * @returns {string[]}
 */
function installedNames(root) {
  const modules = path.join(root, 'node_modules');
  /** @type {string[]} */
  const names = [];
  /** @type {fs.Dirent[]} */
  let entries;
  try {
    entries = fs.readdirSync(modules, {withFileTypes: true});
  } catch {
    return names;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name.startsWith('@')) {
      try {
        for (const scoped of fs.readdirSync(path.join(modules, entry.name))) {
          if (!scoped.startsWith('.')) names.push(`${entry.name}/${scoped}`);
        }
      } catch {
        // An unreadable scope folder holds nothing to read.
      }
    } else {
      names.push(entry.name);
    }
  }
  return names.sort();
}

/**
 * Why `pkg`'s peer ranges exclude `release`, or null when they admit it.
 * @param {Record<string, any>} pkg
 * @param {string} release the answering release's version
 * @returns {string | null}
 */
export function peerProblem(pkg, release) {
  const peers = pkg.peerDependencies;
  if (!peers || typeof peers !== 'object') return null;
  for (const peer of RELEASE_PEERS) {
    const range = peers[peer];
    if (typeof range !== 'string') continue;
    let admits;
    try {
      admits = satisfiesRange(release, range);
    } catch {
      // A range this CLI cannot read never keeps the integration out.
      admits = true;
    }
    if (!admits) {
      return `it needs ${peer} ${range}, and this computer's CLI is ${release}`;
    }
  }
  return null;
}

/**
 * The computer-level integrations installed beside the CLI at `cliRoot`, in
 * name order (declaration order when the root declares them), then each
 * integration a host approves (`approved`, architecture:cli-surface INV30),
 * resolved by name from the package set that holds that CLI alone. Reads
 * package.json files only.
 * @param {{cliRoot: string, release: string, cacheDir?: string, approved?: readonly string[]}} options
 * @returns {ComputerIntegrationCandidate[]}
 */
export function scanComputerIntegrations({
  cliRoot,
  release,
  cacheDir,
  approved = [],
}) {
  const self = real(cliRoot);
  /** @type {ComputerIntegrationCandidate[]} */
  const found = [];
  const seen = new Set();
  for (const root of computerInstallRoots(cliRoot, {cacheDir})) {
    scanRoot(root, {self, release, found, seen});
  }
  const owner = approved.length > 0 ? installPlaceOf(self).owner : null;
  if (owner) scanRoot(owner, {self, release, found, seen}, approved);
  return found;
}

/**
 * `name` as installed in `root`'s own `node_modules`, never in a folder above.
 * @param {string} name
 * @param {string} root
 * @returns {{packageDir: string, hostDir: string} | null}
 */
function ownPackageDir(name, root) {
  const packageDir = path.join(root, 'node_modules', ...name.split('/'));
  return fs.existsSync(path.join(packageDir, 'package.json'))
    ? {packageDir, hostDir: root}
    : null;
}

/**
 * Add the integrations installed in one install root: those it declares or
 * installs, or, given `approved`, those names installed in its own
 * `node_modules`.
 * @param {string} root
 * @param {{self: string, release: string, found: ComputerIntegrationCandidate[], seen: Set<string>}} into
 * @param {readonly string[] | null} [approved]
 */
function scanRoot(root, {self, release, found, seen}, approved = null) {
  const declared =
    approved ??
    (readPackage(root)
      ? readDeclaredDependencies(root).map(d => d.name)
      : installedNames(root));
  for (const name of declared) {
    if (NOT_INTEGRATIONS.has(name)) continue;
    const resolved = approved
      ? ownPackageDir(name, root)
      : resolveInstalledPackageDir(name, root);
    if (!resolved) continue;
    const identity = real(resolved.packageDir);
    if (identity === self || seen.has(identity)) continue;
    if (findManifestPaths(resolved.packageDir).length !== 1) continue;
    const pkg = readPackage(resolved.packageDir);
    if (!pkg || typeof pkg.name !== 'string') continue;
    if (NOT_INTEGRATIONS.has(pkg.name)) continue;
    seen.add(identity);
    found.push({
      name: pkg.name,
      version: typeof pkg.version === 'string' ? pkg.version : undefined,
      description:
        typeof pkg.description === 'string' ? pkg.description : undefined,
      packageDir: resolved.packageDir,
      hostDir: resolved.hostDir,
      incompatible: peerProblem(pkg, release),
    });
  }
}

/**
 * Load the compatible computer-level integrations as provider candidates,
 * each in isolation, under the autolinked policy (a broken one is recorded
 * and contributes nothing; the same package reached twice loads once). Each
 * loaded record is marked `__computer`. An incompatible one is not loaded.
 * @param {ComputerIntegrationCandidate[]} candidates
 * @param {{fresh?: boolean, exclude?: Iterable<string>}} [options] `exclude`
 *   names packages the folder already loads, which keep their own copy
 * @returns {Promise<import('./provider-resolution.mjs').ProviderCandidate[]>}
 */
export async function loadComputerIntegrations(candidates, options = {}) {
  const {fresh = false, exclude = []} = options;
  const taken = new Set(exclude);
  /** @type {import('./provider-resolution.mjs').ProviderCandidate[]} */
  const loaded = [];
  for (const candidate of candidates) {
    if (candidate.incompatible || taken.has(candidate.name)) continue;
    try {
      const [integration] = await loadIntegrations([candidate.name], {
        cwd: candidate.hostDir,
        fresh,
      });
      loaded.push({
        source: 'autolinked',
        spec: candidate.name,
        packageDir: candidate.packageDir,
        ...(integration == null
          ? {}
          : {integration: {...integration, __computer: true}}),
      });
    } catch (error) {
      loaded.push({
        source: 'autolinked',
        spec: candidate.name,
        packageDir: candidate.packageDir,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return loaded;
}
