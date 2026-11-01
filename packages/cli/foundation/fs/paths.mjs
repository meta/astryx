// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Path resolution utilities for Astryx CLI
 *
 * Finds the Astryx project a folder belongs to and its workspace root, the
 * project's @astryxdesign/core and the other packages it installed, and the
 * CLI package root.
 */

import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {listDir, pathExists} from './listing-cache.mjs';
import {ERROR_CODES} from '../response/error-codes.mjs';
import {carriedCore, runChoice} from '../release/run-context.mjs';
import {findDeclaringPackage} from '../release/project.mjs';
import {hostedRun, recordResolved} from '../runtime/package-root.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Root of the @astryxdesign/cli package */
export const CLI_ROOT = path.resolve(__dirname, '..', '..');

/** The package every Core lookup answers for. */
const CORE_PACKAGE = '@astryxdesign/core';

/**
 * The Core a command answers from: the project's (see
 * {@link findProjectCoreDir}), else, when a copy other than the project's own
 * CLI answers, the Core that copy carries (spec AST-081 FR3): the
 * `@astryxdesign/core` of its own release, beside it or in the per-user
 * release cache. Never fetches; {@link requireCoreDir} does.
 *
 * Commands that judge or change a project (`doctor`, `swizzle`, `upgrade`)
 * read {@link findProjectCoreDir} instead, so a carried Core never passes a
 * project check or lands in a folder that installed none.
 *
 * @param {string} [startDir]
 * @returns {string | null}
 */
export function findCoreDir(startDir = process.cwd()) {
  const own = findProjectCoreDir(startDir);
  return own
    ? noteCore(own, 'project')
    : noteCore(carriedCoreFor(startDir).dir);
}

/**
 * Note the Core a hosted run reads, for the record its host entry returns
 * (architecture:cli-surface INV30). Does nothing outside a hosted run.
 * @template {string | null} T
 * @param {T} dir
 * @param {'project'} [source] where it came from, when the caller knows
 * @returns {T}
 */
function noteCore(dir, source) {
  if (dir && hostedRun()) {
    let version;
    try {
      version = JSON.parse(
        fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
      ).version;
    } catch {
      version = null;
    }
    recordResolved('@astryxdesign/core', version, dir, source);
  }
  return dir;
}

/**
 * Why a command that reads Core cannot run, when the answering release's own
 * Core is needed and cannot be installed: outside a project, or in a project
 * with nothing installed (spec AST-081 FR3).
 * @param {{unavailable: string | null, version?: string, reason?: string}} found
 * @param {boolean} inProject
 * @returns {string}
 */
export function unavailableCoreMessage(found, inProject) {
  const unwritable = /cannot be written/.test(found.unavailable ?? '');
  if (inProject) {
    const core = found.version ? `Core ${found.version}` : 'its Core';
    const why = found.reason ? ` (${found.reason})` : '';
    return `This project has no Core installed, and ${core} could not be downloaded${why}. Install the project's dependencies${unwritable ? ', or make that folder writable' : ''}, then run again.`;
  }
  return `${found.unavailable}. Outside a project, commands that read Core use the Core of the release that answers; ${unwritable ? 'make that folder writable and run again' : 'run again when the package registry can be reached'}.`;
}

/**
 * Like {@link findCoreDir}, but a copy that carries no Core installs its
 * release's Core into the per-user cache first. Throws ERR_CORE_NOT_FOUND
 * when there is no Core to answer from, and ERR_VERSIONS_UNAVAILABLE when the
 * carried Core is needed and cannot be installed.
 *
 * @param {string} [startDir]
 * @returns {string}
 */
export function requireCoreDir(startDir = process.cwd()) {
  const found = findProjectCoreDir(startDir) ?? carriedCoreFor(startDir, true);
  if (typeof found === 'string') return noteCore(found, 'project');
  if (found.unavailable) {
    throw codedError(
      unavailableCoreMessage(found, runChoice(startDir).inProject),
      ERROR_CODES.ERR_VERSIONS_UNAVAILABLE,
    );
  }
  if (found.dir) return noteCore(found.dir);
  throw codedError(
    'Could not find @astryxdesign/core package',
    ERROR_CODES.ERR_CORE_NOT_FOUND,
  );
}

/**
 * An Error carrying a stable error code, which the JSON envelope and every
 * command's error output read the way they read an API error's.
 * @param {string} message
 * @param {string} code
 * @returns {Error & {code: string}}
 */
function codedError(message, code) {
  return Object.assign(new Error(message), {code});
}

/**
 * The carried Core alone, for a caller that already looked for the project's
 * Core its own way: the folder, or null when the copy answering in `startDir`
 * is the project's own CLI or carries none.
 * @param {string} startDir
 * @param {{fetch?: boolean}} [options]
 * @returns {string | null}
 */
export function findCarriedCoreDir(startDir, {fetch = false} = {}) {
  return carriedCoreFor(startDir, fetch).dir;
}

/**
 * The carried Core for a run in `startDir`, when the copy answering there is
 * not the project's own CLI.
 * @param {string} startDir
 * @param {boolean} [fetch]
 * @returns {{dir: string | null, unavailable: string | null, version?: string, reason?: string}}
 */
function carriedCoreFor(startDir, fetch = false) {
  const carried = carriedCore({fetch: false});
  if (!carried.dir && !fetch) return carried;
  if (runChoice(startDir).copy === 'project') {
    return {dir: null, unavailable: null};
  }
  return carried.dir ? carried : carriedCore({fetch: true});
}

/**
 * The project's own @astryxdesign/core, never a carried one: found from the
 * folder (see {@link findNearbyCoreDir}), else from the folder of the
 * package.json that makes the folder part of a project, however deep the
 * folder is.
 *
 * @param {string} [startDir]
 * @returns {string | null}
 */
export function findProjectCoreDir(startDir = process.cwd()) {
  const near = findNearbyCoreDir(startDir);
  if (near) return near;
  // A folder deeper than that reach still belongs to the project the walk to
  // its package.json finds, so its Core is looked up from there too (spec
  // AST-081, a folder's project): never the carried Core in its place.
  const declaring = findDeclaringPackage(startDir);
  return declaring && declaring.dir !== path.resolve(startDir)
    ? findNearbyCoreDir(declaring.dir)
    : null;
}

/**
 * How many folders, counting the start, the read lookups always search: the
 * reach they had in released versions, so nothing they found before goes
 * missing. Past this reach they continue only up to the workspace root of the
 * Astryx project the start folder belongs to.
 */
const CORE_REACH = 5;
const INSTALLED_REACH = 6;

/** Package scopes whose declaration makes a package.json an Astryx project. */
const ASTRYX_SCOPES = ['@astryxdesign/', '@xds/'];

/** package.json fields in which a package declares what it depends on. */
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

/** Folders that mark a repository root; the project search stops there. */
const REPOSITORY_MARKERS = ['.git', '.hg', '.sl'];

/**
 * `startDir` and every folder above it, nearest first, up to the filesystem
 * root: the folders Node's resolver searches for `node_modules`.
 *
 * @param {string} startDir
 * @returns {Generator<string>}
 */
function* foldersUpFrom(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    yield dir;
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

/**
 * `dir/node_modules/<name>` when the package is installed there. Its
 * package.json decides, so a stale empty folder is not an install.
 *
 * @param {string} dir
 * @param {string} name
 * @returns {string|null}
 */
function installedIn(dir, name) {
  const candidate = path.join(dir, 'node_modules', ...name.split('/'));
  return fs.existsSync(path.join(candidate, 'package.json')) ? candidate : null;
}

/**
 * The package.json in `dir`, or null when it is missing or not a JSON object.
 *
 * @param {string} dir
 * @returns {Record<string, any>|null}
 */
function readPackageJson(dir) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'),
    );
    return pkg && typeof pkg === 'object' ? pkg : null;
  } catch {
    return null;
  }
}

/**
 * Whether `dir` is @astryxdesign/core's own source, by the name in its
 * package.json. The folder name says nothing: many monorepos keep an unrelated
 * package in `packages/core`.
 *
 * @param {string} dir
 * @returns {boolean}
 */
function isCoreSource(dir) {
  return readPackageJson(dir)?.name === CORE_PACKAGE;
}

/**
 * `p` resolved through symlinks when it exists, so folders compare equal
 * however they were reached.
 *
 * @param {string} p
 * @returns {string}
 */
function realDir(p) {
  try {
    return fs.realpathSync(path.resolve(p));
  } catch {
    return path.resolve(p);
  }
}

/**
 * The home folder, resolved through symlinks, or null when there is none.
 *
 * @returns {string|null}
 */
function homeFolder() {
  try {
    const home = os.homedir();
    return home ? realDir(home) : null;
  } catch {
    return null;
  }
}

/**
 * Whether `child` lies strictly inside `parent`.
 *
 * @param {string} child
 * @param {string} parent
 * @returns {boolean}
 */
function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Whether the package.json in `dir` declares an Astryx package, in any
 * dependency field.
 *
 * @param {string} dir
 * @returns {boolean}
 */
function declaresAstryx(dir) {
  const pkg = readPackageJson(dir);
  if (pkg == null) return false;
  return DEPENDENCY_FIELDS.some(field => {
    const deps = pkg[field];
    return (
      deps != null &&
      typeof deps === 'object' &&
      Object.keys(deps).some(name =>
        ASTRYX_SCOPES.some(scope => name.startsWith(scope)),
      )
    );
  });
}

/**
 * The project root: the directory of the nearest package.json at or above
 * `startDir`, or null when there is none.
 *
 * @param {string} startDir
 * @returns {string|null}
 */
export function findPackageRoot(startDir) {
  for (const dir of foldersUpFrom(startDir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
  }
  return null;
}

/**
 * The Astryx project `startDir` belongs to: the nearest folder at or above it
 * whose package.json declares an Astryx package (`@astryxdesign/*`, or the
 * legacy `@xds/*`), or that a workspace whose root declares one lists as a
 * member. The search stops at a repository root, and it ends at the home
 * folder without counting it. Returns null when no folder qualifies.
 *
 * @param {string} startDir
 * @returns {string|null}
 */
export function findAstryxProject(startDir) {
  const start = path.resolve(startDir);
  const home = homeFolder();
  for (const dir of foldersUpFrom(start)) {
    if (home != null && realDir(dir) === home) return null;
    if (declaresAstryx(dir) || isAstryxWorkspaceMember(dir)) return dir;
    if (
      REPOSITORY_MARKERS.some(marker => fs.existsSync(path.join(dir, marker)))
    ) {
      return null;
    }
  }
  return null;
}

/**
 * The workspace root (`spec:AST-048` FR15): the nearest directory at or above
 * `startDir` that declares a workspace, by a `pnpm-workspace.yaml` or a
 * package.json `workspaces` field; outside a workspace, the directory of the
 * nearest package.json; with no package.json, `startDir` itself.
 *
 * @param {string} startDir
 * @returns {string}
 */
export function findWorkspaceRoot(startDir) {
  /** @type {string|null} */
  let nearestPackage = null;
  for (const dir of foldersUpFrom(startDir)) {
    if (
      fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')) ||
      readPackageJson(dir)?.workspaces != null
    ) {
      return dir;
    }
    if (
      nearestPackage == null &&
      fs.existsSync(path.join(dir, 'package.json'))
    ) {
      nearestPackage = dir;
    }
  }
  return nearestPackage ?? path.resolve(startDir);
}

/**
 * The highest folder a lookup for `project`'s packages searches: its
 * workspace root, where a workspace keeps the packages its members share. For
 * a project inside the home folder, never the home folder or above.
 *
 * @param {string} project
 * @returns {string}
 */
function workspaceBound(project) {
  const workspace = findWorkspaceRoot(project);
  const home = homeFolder();
  if (
    home != null &&
    isInside(realDir(project), home) &&
    !isInside(realDir(workspace), home)
  ) {
    return project;
  }
  return workspace;
}

/**
 * Escape `text` for use inside a regular expression.
 * @param {string} text
 * @returns {string}
 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The alternatives of the brace list that opens at `glob[start]`, split at
 * its own commas, and the index of its closing brace; null when it is never
 * closed.
 *
 * @param {string} glob
 * @param {number} start
 * @returns {{alternatives: string[], end: number} | null}
 */
function braceList(glob, start) {
  const alternatives = [];
  let depth = 0;
  let from = start + 1;
  for (let i = start; i < glob.length; i++) {
    if (glob[i] === '{') {
      depth++;
    } else if (glob[i] === '}' && --depth === 0) {
      alternatives.push(glob.slice(from, i));
      return {alternatives, end: i};
    } else if (glob[i] === ',' && depth === 1) {
      alternatives.push(glob.slice(from, i));
      from = i + 1;
    }
  }
  return null;
}

/**
 * The regular-expression source for a workspace glob: `*` and `?` stay
 * within one folder name, `**` spans any number of folders, and `{a,b}`
 * matches either alternative, each a glob of its own.
 *
 * @param {string} glob
 * @returns {string}
 */
function globSource(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    const list = char === '{' ? braceList(glob, i) : null;
    if (char === '*' && glob[i + 1] === '*') {
      // `**/` also matches no folder at all.
      source += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else if (list) {
      source += `(?:${list.alternatives.map(globSource).join('|')})`;
      i = list.end;
    } else {
      source += escapeRegExp(char);
    }
  }
  return source;
}

/**
 * A regular expression for a workspace pattern, tested against a member's
 * path relative to the workspace root (see `globSource`).
 *
 * @param {string} pattern
 * @returns {RegExp}
 */
function workspacePatternRegExp(pattern) {
  const glob = pattern
    .trim()
    .replace(/^(?:\.\/)+/, '')
    .replace(/\/+$/, '');
  return new RegExp(`^${globSource(glob)}$`);
}

/**
 * The `packages` list in the pnpm-workspace.yaml in `dir`, as block or flow
 * YAML; empty when there is none.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function pnpmWorkspacePatterns(dir) {
  let text;
  try {
    text = fs.readFileSync(path.join(dir, 'pnpm-workspace.yaml'), 'utf-8');
  } catch {
    return [];
  }
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(line => /^packages\s*:/.test(line));
  if (start === -1) return [];
  /** @param {string} item */
  const unquote = item => item.trim().replace(/^(['"])(.*)\1$/, '$2');
  const inline = lines[start]
    .replace(/^packages\s*:/, '')
    .replace(/\s#.*$/, '')
    .trim();
  if (inline.startsWith('[')) {
    return inline
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(unquote)
      .filter(Boolean);
  }
  /** @type {string[]} */
  const patterns = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    const item = /^\s*-\s*(.+?)\s*(?:\s#.*)?$/.exec(line);
    if (!item) break;
    patterns.push(unquote(item[1]));
  }
  return patterns;
}

/**
 * Whether the workspace rooted at `root` lists `dir` as a member: a pattern
 * in its package.json `workspaces` (an array, or `{packages: [...]}`) or its
 * pnpm-workspace.yaml `packages` matches `dir`, and no `!` pattern excludes
 * it.
 *
 * @param {string} dir
 * @param {string} root
 * @returns {boolean}
 */
function isWorkspaceMember(dir, root) {
  const rel = path.relative(root, dir).split(path.sep).join('/');
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return false;
  const workspaces = readPackageJson(root)?.workspaces;
  const patterns = [
    ...(Array.isArray(workspaces) ? workspaces : (workspaces?.packages ?? [])),
    ...pnpmWorkspacePatterns(root),
  ].filter(pattern => typeof pattern === 'string');
  const matches = (/** @type {string} */ pattern) =>
    workspacePatternRegExp(pattern).test(rel);
  return (
    patterns.some(pattern => !pattern.startsWith('!') && matches(pattern)) &&
    !patterns.some(
      pattern => pattern.startsWith('!') && matches(pattern.slice(1)),
    )
  );
}

/**
 * Whether `dir` is a member its workspace lists, where the workspace root
 * declares an Astryx package. Such a member uses the Astryx its workspace
 * installs, so it is an Astryx project of its own.
 *
 * @param {string} dir
 * @returns {boolean}
 */
function isAstryxWorkspaceMember(dir) {
  if (!fs.existsSync(path.join(dir, 'package.json'))) return false;
  const root = workspaceBound(dir);
  return root !== dir && declaresAstryx(root) && isWorkspaceMember(dir, root);
}

/**
 * The folders a read lookup searches, nearest first: `startDir` and the
 * `reach - 1` folders above it, as released versions did; then the root of
 * the Astryx project `startDir` belongs to, if any, and the folders from it up
 * to its workspace root. Past the reach the search starts at the project root,
 * so a folder between the two that installs packages but declares no Astryx
 * package (a tool inside the project) never answers for the project.
 *
 * @param {string} startDir
 * @param {number} reach
 * @returns {Generator<string>}
 */
function* readFolders(startDir, reach) {
  /** @type {Set<string>} */
  const searched = new Set();
  for (const dir of foldersUpFrom(startDir)) {
    if (searched.size >= reach) break;
    searched.add(dir);
    yield dir;
  }
  const project = findAstryxProject(startDir);
  if (project == null) return;
  const bound = workspaceBound(project);
  for (const dir of foldersUpFrom(project)) {
    if (!searched.has(dir)) yield dir;
    if (dir === bound) return;
  }
}

/**
 * The @astryxdesign/core installed for `startDir`.
 *
 * Searches `startDir` and the four folders above it, as released versions
 * did, then on up to the workspace root of the Astryx project it belongs to.
 * In each folder a `packages/core` whose package.json names
 * @astryxdesign/core (the Astryx repository's own source) comes first, then
 * an installed `node_modules/@astryxdesign/core`. It takes the first it finds,
 * whatever version the project declares: that is the copy Node loads. When no
 * folder holds one, it asks Yarn Plug'n'Play, which keeps no node_modules.
 *
 * @param {string} startDir
 * @returns {string|null} the Core package directory, or null when there is none
 */
function findNearbyCoreDir(startDir) {
  for (const dir of readFolders(startDir, CORE_REACH)) {
    const source = path.join(dir, 'packages', 'core');
    if (isCoreSource(source)) return source;
    const installed = installedIn(dir, CORE_PACKAGE);
    if (installed) return installed;
  }
  return findPnpPackage(startDir, CORE_PACKAGE);
}

/**
 * Where Yarn's Plug'n'Play runtime says a package lives.
 *
 * A PnP project has no node_modules for the walks in this file to find. PnP
 * answers from the project's own dependency graph and ignores NODE_PATH, so
 * asking it keeps the lookup project-local. Outside a PnP process there is
 * nothing to ask.
 *
 * @param {string} startDir
 * @param {string} name
 * @returns {string|null}
 */
function findPnpPackage(startDir, name) {
  if (!process.versions.pnp) return null;
  try {
    const from = path.resolve(startDir);
    const api = createRequire(path.join(from, 'noop.js'))('pnpapi');
    const dir = api.resolveToUnqualified(name, path.join(from, '/'));
    return dir && fs.existsSync(path.join(dir, 'package.json')) ? dir : null;
  } catch {
    // The project does not declare it, or this is not a PnP process after all.
    return null;
  }
}

/**
 * The nearest `node_modules/<name>` at or above `startDir`, found the way
 * Node's resolver finds a package, and the folder whose node_modules holds it.
 * It searches every folder up to the filesystem root and does not ask
 * Plug'n'Play.
 *
 * @param {string} startDir
 * @param {string} name bare package name; callers reject path segments first
 * @returns {{packageDir: string, hostDir: string}|null}
 */
export function findNodeModulesPackage(startDir, name) {
  for (const dir of foldersUpFrom(startDir)) {
    const packageDir = installedIn(dir, name);
    if (packageDir) return {packageDir, hostDir: dir};
  }
  return null;
}

/**
 * Locate a package the project at `startDir` actually installed.
 *
 * Deliberately not `require.resolve`: Node folds NODE_PATH and the global
 * folders into resolution even when `paths` is given, so a package merely
 * reachable from the ambient environment reads as installed here. pnpm's
 * isolated layout puts every package in `node_modules/.pnpm/node_modules`,
 * and Vitest puts that directory on NODE_PATH, so the gap is not theoretical.
 * Reading package.json off disk also sidesteps packages that don't export it,
 * so the version is always available to range-check.
 *
 * Searches the node_modules of `startDir` and the five folders above it, as
 * released versions did, then on up to the workspace root of the Astryx
 * project it belongs to. Then it asks PnP, which covers the Yarn default
 * layout where that chain does not exist.
 *
 * @param {string} startDir
 * @param {string} name
 * @param {number} [maxDepth] how many folders to walk up; `Infinity` walks
 *   every ancestor, as Node's own resolution does
 * @returns {string|null} the package directory, or null when not installed
 */
export function findInstalledPackage(
  startDir,
  name,
  maxDepth = INSTALLED_REACH,
) {
  for (const dir of readFolders(startDir, maxDepth)) {
    const packageDir = installedIn(dir, name);
    if (packageDir) return packageDir;
  }
  return findPnpPackage(startDir, name);
}

/**
 * The first of `names` the Astryx project of `startDir` installed, for a
 * command that writes to the project (`upgrade`).
 *
 * It searches the node_modules of the project root, nearest name first. For
 * a member its workspace lists, it then searches each folder above the
 * project up to the workspace root, where the workspace installs the packages
 * its members share; otherwise the search stops at the project root. Then it
 * asks Plug'n'Play, in name order. With no Astryx project it looks only in the
 * node_modules of `startDir` itself, as released versions did.
 *
 * @param {string} startDir
 * @param {readonly string[]} names in order of preference
 * @returns {{name: string, packageDir: string}|null}
 */
export function findProjectPackageOf(startDir, names) {
  const project = findAstryxProject(startDir);
  if (project == null) {
    const dir = path.resolve(startDir);
    for (const name of names) {
      const packageDir = installedIn(dir, name);
      if (packageDir) return {name, packageDir};
    }
    return null;
  }
  const workspace = workspaceBound(project);
  const top =
    workspace !== project && isWorkspaceMember(project, workspace)
      ? workspace
      : project;
  for (const dir of foldersUpFrom(project)) {
    for (const name of names) {
      const packageDir = installedIn(dir, name);
      if (packageDir) return {name, packageDir};
    }
    if (dir === top) break;
  }
  for (const name of names) {
    const packageDir = findPnpPackage(project, name);
    if (packageDir) return {name, packageDir};
  }
  return null;
}

/**
 * Find the monorepo root by looking for the root package.json
 * that has workspaces defined.
 */
export function findProjectRoot(startDir = process.cwd()) {
  let dir = startDir;

  for (let i = 0; i < 5; i++) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.workspaces) {
          return dir;
        }
      } catch {
        // skip invalid JSON
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

/**
 * Discover external Astryx-compatible packages from node_modules.
 * Scans for packages with an "astryx" field in their package.json:
 *
 *   { "astryx": { "docs": "./src", "category": "Common", "blocks": "./blocks/components" } }
 *
 * Returns array of { name, category, docsDir, blocksDir }.
 */
export function discoverExternalPackages(startDir = process.cwd()) {
  /** @type {Array<{name: string, category: string, docsDir: string, blocksDir: string | null}>} */
  const externals = [];
  let dir = startDir;

  // Walk up to find node_modules
  let nodeModulesDir = null;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'node_modules');
    if (fs.existsSync(candidate)) {
      nodeModulesDir = candidate;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  if (!nodeModulesDir) return externals;

  /** @param {string} searchDir */
  const scanDir = searchDir => {
    if (!fs.existsSync(searchDir)) return;
    const entries = fs.readdirSync(searchDir, {withFileTypes: true});

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === '.bin') continue;

      const fullPath = path.join(searchDir, entry.name);

      // Recurse into scoped packages (@org/*)
      if (entry.name.startsWith('@')) {
        scanDir(fullPath);
        continue;
      }

      const pkgJsonPath = path.join(fullPath, 'package.json');
      if (!fs.existsSync(pkgJsonPath)) continue;

      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        if (pkg.name === '@astryxdesign/core') continue;
        if (pkg.astryx && pkg.astryx.docs) {
          externals.push({
            name: pkg.name,
            category: pkg.astryx.category || pkg.name,
            docsDir: path.resolve(fullPath, pkg.astryx.docs),
            blocksDir: pkg.astryx.blocks
              ? path.resolve(fullPath, pkg.astryx.blocks)
              : null,
          });
        }
      } catch {
        // skip invalid JSON
      }
    }
  };

  scanDir(nodeModulesDir);
  return externals;
}

/**
 * List available component directories in packages/core/src.
 * Returns directory names that contain Astryx*.tsx files.
 * @param {string} coreDir
 */
export function listComponents(coreDir) {
  const srcDir = path.join(coreDir, 'src');
  if (!fs.existsSync(srcDir)) return [];

  const entries = fs.readdirSync(srcDir, {withFileTypes: true});
  return entries
    .filter(e => {
      if (!e.isDirectory()) return false;
      // Skip non-component dirs
      if (['hooks', 'theme', 'utils'].includes(e.name)) return false;
      return true;
    })
    .map(e => e.name)
    .sort();
}

/**
 * Does `targetPath` exist with EXACTLY this spelling?
 *
 * `fs.existsSync` answers through the filesystem's own case folding, so on
 * macOS and Windows a probe for `src/button/Button.doc.mjs` succeeds against
 * the real `src/Button/Button.doc.mjs`. Name resolvers built on that probe
 * then resolve a component or hook the caller never named, and hand back a
 * path spelled the way the caller typed it — a path that does not exist on
 * Linux, where the same lookup correctly misses. Every segment below
 * `rootDir` is checked against its parent's real directory listing.
 *
 * @param {string} targetPath - Path to probe; must be inside `rootDir`.
 * @param {string} rootDir - Already-real path; it and its parents are not checked.
 * @returns {boolean}
 */
export function existsCaseExact(targetPath, rootDir) {
  if (!pathExists(targetPath)) return false;

  const rel = path.relative(rootDir, targetPath);
  if (rel === '') return true;
  if (path.isAbsolute(rel) || rel === '..' || rel.startsWith(`..${path.sep}`))
    return false;

  let dir = rootDir;
  for (const segment of rel.split(path.sep)) {
    let entries;
    try {
      entries = listDir(dir);
    } catch {
      return false;
    }
    if (!entries.includes(segment)) return false;
    dir = path.join(dir, segment);
  }
  return true;
}
