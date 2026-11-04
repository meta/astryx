// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Autolink — load installed integrations that no astryx.config names.
 *
 * An integration used to need two things to be visible: the package installed,
 * and its name written into `astryx.config.*`. In practice the second half goes
 * missing. A scaffold adds the dependency and writes no config; the package
 * ships components, templates, docs and codemods; and the CLI reports that none
 * of it exists. Nothing is broken, so nobody looks — the integration is simply
 * never used, because we said it was not there.
 *
 * Autolink closes that gap from the side that is always true: a package the
 * project DECLARED as a dependency and that ships a root
 * `astryx.integration.*` manifest is an integration, config entry or not.
 *
 * Two rules bound it:
 *
 *   - DECLARED dependencies only. We read the dependency KEYS out of the
 *     project's own package.json and resolve those. We never walk node_modules
 *     looking for manifests: a transitive dependency of a dependency did not
 *     ask to contribute to this project, and a tree walk is unbounded work for
 *     an answer the project already wrote down.
 *   - The KEY, never the VALUE. `"@acme/legacy-ui": "npm:@acme/ui@0.1.22"`
 *     is a real, installed shape; so are `workspace:*`, `file:../lib`, `link:`
 *     and `catalog:`. None of them is a semver range, and none of them has to
 *     be parsed: the key is the directory name under node_modules, which is the
 *     only thing resolution needs. Identity still comes from the resolved
 *     package's own package.json `name` (see loadIntegrations), so an aliased
 *     dependency reports the package it actually is.
 *
 * An explicit config entry always wins: a dependency whose directory is
 * already loaded from config is never imported again, and comes back as a
 * repeat so the provider ledger still records it.
 *
 * @position lib — sits between config/project (the caller) and
 *   integrations/integrations (the loader); contributes no discovery of its own.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {findNodeModulesPackage} from '../fs/paths.mjs';
import {findManifestPaths, loadIntegrations} from './integrations.mjs';
import {resolveProviders} from './provider-resolution.mjs';

/**
 * package.json fields whose keys name a dependency this project installs.
 *
 * `peerDependencies` is deliberately absent: a peer is a requirement the
 * CONSUMER must satisfy, not something this project's install brings in, so a
 * peer that happens to be present is not a declaration that it belongs here.
 *
 * @type {readonly string[]}
 */
export const DEPENDENCY_FIELDS = Object.freeze([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
]);

/**
 * Whether a dependency key is a bare package name safe to resolve.
 *
 * Mirrors the guard in {@link import('./integrations.mjs').resolvePackageDir}:
 * a name is a directory under node_modules, so a path segment (`.`, `..`) or an
 * absolute spec must never reach the resolver, which goes on to dynamically
 * import what it finds.
 *
 * @param {string} name
 * @returns {boolean}
 */
function isBarePackageName(name) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    !path.isAbsolute(name) &&
    !name.startsWith('@/') &&
    !name.split('/').some(segment => segment === '.' || segment === '..')
  );
}

/**
 * The dependency names this project declares, in field then declaration order,
 * each tagged with the field that declared it. A name declared twice keeps the
 * first field it appeared in.
 *
 * Only keys are read. See the file header for why values are never parsed.
 *
 * @param {string} projectDir directory holding the project's package.json
 * @returns {Array<{name: string, field: string}>}
 */
export function readDeclaredDependencies(projectDir) {
  /** @type {Record<string, unknown>} */
  let pkg;
  try {
    pkg = JSON.parse(
      fs.readFileSync(path.join(projectDir, 'package.json'), 'utf-8'),
    );
  } catch {
    // No package.json, or unreadable/malformed — nothing is declared.
    return [];
  }

  /** @type {Array<{name: string, field: string}>} */
  const declared = [];
  const seen = new Set();
  for (const field of DEPENDENCY_FIELDS) {
    const entry = pkg?.[field];
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    for (const name of Object.keys(entry)) {
      if (seen.has(name) || !isBarePackageName(name)) continue;
      seen.add(name);
      declared.push({name, field});
    }
  }
  return declared;
}

/**
 * Resolve an installed package's directory the way Node's resolver finds it:
 * the nearest `node_modules/<name>` walking up from `fromDir`.
 *
 * Walking up matters because hoisting is normal — yarn and npm workspaces lift
 * a workspace member's dependency to the repo root, so the app's own
 * node_modules can be empty of a package it genuinely declares. Integrations
 * named in astryx.config resolve through the same walk.
 *
 * Presence is decided by the package's own package.json, not the directory, so
 * a stale empty directory is not mistaken for an install.
 *
 * @param {string} name bare package name
 * @param {string} fromDir directory to start walking up from
 * @returns {{packageDir: string, hostDir: string}|null} the resolved package
 *   directory and the directory whose node_modules holds it
 */
export function resolveInstalledPackageDir(name, fromDir) {
  if (!isBarePackageName(name)) return null;
  return findNodeModulesPackage(fromDir, name);
}

/**
 * Resolve a path through symlinks for identity comparison. pnpm links every
 * dependency into node_modules from a single content-addressed store, so two
 * different dependency keys pointing at one package share a real path and
 * differ in every other way.
 * @param {string} target
 * @returns {string}
 */
function realPath(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

/**
 * @typedef {object} AutolinkCandidate
 * @property {string} spec
 * @property {string} field
 * @property {string} packageDir
 * @property {string} hostDir
 * @property {boolean} [repeat] the directory is already loaded or already a
 *   candidate under another dependency key; it is not loaded again
 */

/**
 * Every declared dependency that ships exactly one root manifest, in
 * declaration order, including the ones whose directory is already loaded or
 * already a candidate (`repeat`), so a caller can account for each of them.
 *
 * @param {string} projectDir directory holding the project's package.json
 * @param {{exclude?: Iterable<string>}} [options] `exclude` — package
 *   directories already loaded (from config); matched through symlinks
 * @returns {AutolinkCandidate[]}
 */
export function scanAutolinkCandidates(projectDir, {exclude = []} = {}) {
  const taken = new Set([...exclude].map(realPath));
  /** @type {AutolinkCandidate[]} */
  const candidates = [];

  for (const {name, field} of readDeclaredDependencies(projectDir)) {
    const resolved = resolveInstalledPackageDir(name, projectDir);
    if (!resolved) continue;

    if (findManifestPaths(resolved.packageDir).length !== 1) continue;

    // Two dependency keys can name one installed package — an npm alias beside
    // the package it aliases, or the two spellings of a package mid-rename
    // resolving through one store entry. Load it once.
    const identity = realPath(resolved.packageDir);
    if (taken.has(identity)) {
      candidates.push({spec: name, field, ...resolved, repeat: true});
      continue;
    }

    taken.add(identity);
    candidates.push({spec: name, field, ...resolved});
  }

  return candidates;
}

/**
 * Declared dependencies that ship an integration manifest and are not already
 * loaded, in declaration order.
 *
 * A candidate must have EXACTLY ONE root manifest. Zero is the ordinary case
 * (almost every dependency), and more than one is a packaging mistake the
 * loader treats as a hard error — an error the project did not ask for and
 * cannot fix, so an ambiguous package is passed over here rather than allowed
 * to fail the load of a project that merely depends on it.
 *
 * @param {string} projectDir directory holding the project's package.json
 * @param {{exclude?: Iterable<string>}} [options] `exclude` — package
 *   directories already loaded (from config); matched through symlinks
 * @returns {Array<{spec: string, field: string, packageDir: string, hostDir: string}>}
 */
export function findAutolinkCandidates(projectDir, options) {
  return scanAutolinkCandidates(projectDir, options)
    .filter(candidate => !candidate.repeat)
    .map(({spec, field, packageDir, hostDir}) => ({
      spec,
      field,
      packageDir,
      hostDir,
    }));
}

/**
 * Load every autolink candidate, each in isolation, as provider candidates for
 * {@link resolveProviders}. Nothing is filtered here: a candidate whose load
 * throws or whose manifest fails comes back with its error, and a repeated
 * directory comes back unloaded, so the resolver records each one.
 *
 * @param {object} options
 * @param {string} options.projectDir directory holding the project's package.json
 * @param {import('./integrations.mjs').LoadedIntegration[]} [options.loaded]
 *   integrations already loaded from config
 * @param {boolean} [options.fresh]
 * @returns {Promise<import('./provider-resolution.mjs').ProviderCandidate[]>}
 */
export async function loadAutolinkCandidates({
  projectDir,
  loaded = [],
  fresh = false,
}) {
  const scanned = scanAutolinkCandidates(projectDir, {
    // A configured entry that never resolved to a directory has none to exclude.
    exclude: loaded.flatMap(integration =>
      typeof integration.__packageDir === 'string'
        ? [integration.__packageDir]
        : [],
    ),
  });

  /** @type {import('./provider-resolution.mjs').ProviderCandidate[]} */
  const candidates = [];
  for (const candidate of scanned) {
    const {spec, packageDir} = candidate;
    if (candidate.repeat) {
      candidates.push({source: 'autolinked', spec, packageDir, repeat: true});
      continue;
    }
    try {
      // Resolve from the directory whose node_modules actually holds the
      // package, so a hoisted dependency resolves the same way Node found it.
      const [integration] = await loadIntegrations([spec], {
        cwd: candidate.hostDir,
        fresh,
      });
      candidates.push({
        source: 'autolinked',
        spec,
        packageDir,
        ...(integration == null
          ? {}
          : {
              integration: {
                ...integration,
                __autolinked: true,
                __dependencyField: candidate.field,
              },
            }),
      });
    } catch (error) {
      candidates.push({
        source: 'autolinked',
        spec,
        packageDir,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return candidates;
}

/**
 * Load every declared dependency that ships an integration manifest and is not
 * already loaded from config.
 *
 * Each candidate is loaded in isolation. A dependency the project never asked
 * to be an integration must not be able to take down `Project.load` for the
 * whole project, so a manifest that throws on import is dropped here with the
 * rest of that package's contributions — including the load-error marker
 * `loadIntegrations` returns for it. A CONFIGURED integration is the opposite
 * case: the project named it, so its failure is an issue the project owns and
 * can act on. An autolinked one is a dependency's own packaging bug, which the
 * consuming project can neither fix nor silence, and which
 * `astryx doctor integration validate <package>` reports on demand.
 *
 * One package reached twice (an alias beside the package it aliases, at the
 * same version) loads once. The same name at another version is kept, so the
 * provider pass reports it instead of dropping it. Project.load does not call
 * this; it hands {@link loadAutolinkCandidates} to the resolver, whose ledger
 * records every candidate dropped here.
 *
 * @param {object} options
 * @param {string} options.projectDir directory holding the project's package.json
 * @param {import('./integrations.mjs').LoadedIntegration[]} [options.loaded]
 *   integrations already loaded from config; these win
 * @param {boolean} [options.fresh]
 * @returns {Promise<import('./integrations.mjs').LoadedIntegration[]>}
 */
export async function autolinkIntegrations({
  projectDir,
  loaded = [],
  fresh = false,
}) {
  const candidates = await loadAutolinkCandidates({projectDir, loaded, fresh});
  const {ledger} = resolveProviders([
    ...loaded.map(integration => ({
      source: /** @type {const} */ ('configured'),
      integration,
      spec: integration.__spec,
    })),
    ...candidates,
  ]);
  /** @type {import('./integrations.mjs').LoadedIntegration[]} */
  const autolinked = [];
  for (const entry of ledger.values()) {
    const {candidate} = entry;
    if (
      candidate.source === 'autolinked' &&
      candidate.integration != null &&
      (entry.outcome === 'contributes' || entry.outcome === 'set-aside')
    ) {
      autolinked.push(candidate.integration);
    }
  }
  return autolinked;
}
