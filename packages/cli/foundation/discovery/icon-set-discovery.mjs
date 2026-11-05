// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon-set discovery (AST-084 FR1–FR5, FR8, FR17): the one seam
 * every icon surface reads installed icon sets through.
 *
 * An integration's `experimental.iconSets` root holds one lower-kebab directory per set.
 * Each set has a statically read `<name>.doc.mjs` IconSetDoc and a
 * `<name>.icons.json` data file. Discovery never executes the descriptor, the
 * data file, or the icon module. A set whose descriptor or data is invalid,
 * or whose `module` does not resolve from the project, is withdrawn: it
 * answers nothing, and its reason is kept for Doctor.
 *
 * @input Loaded integrations and the project directory
 * @output Discovered icon sets, withdrawn sets with reasons, and the
 *   project's icon-set choice
 * @position packages/cli/foundation/discovery — icon-set discovery seam
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseIconSet,
  parseIconSetData,
} from '../../authoring/doctypes/icon-set/parse.mjs';
import {assertWithin} from '../fs/path-safety.mjs';
import {findInstalledPackage} from '../fs/paths.mjs';
import {inspectPackageExport} from './package-exports.mjs';
import {
  astryxDefinitionsByName,
  readDefinitionsDir,
} from './icon-definition-discovery.mjs';
import {
  isIgnoredThemeEntry,
  readStaticDescriptorValue,
} from './theme-discovery.mjs';

/** @typedef {import('../../authoring/doctypes/icon-set/type').IconSetData} IconSetData */
/** @typedef {import('../../authoring/doctypes/icon-set/type').IconSetIcon} IconSetIcon */

const SET_NAME_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

/** A license or notice file a set ships beside its data (FR15). */
export const NOTICE_FILE_RE = /^(?:licen[cs]e|notice|copying)(?:[.-].*)?$/iu;

/**
 * One installed icon set: its descriptor, its data, and where it came from.
 * @typedef {object} DiscoveredIconSet
 * @property {string} name set name, the directory name
 * @property {string} displayName
 * @property {string} description
 * @property {boolean} maintained
 * @property {string} license SPDX expression for the artwork
 * @property {string} package the integration package that ships the set
 * @property {string} [packageDir] absolute directory of that package
 * @property {string} dir absolute set directory
 * @property {string} docPath absolute descriptor path
 * @property {string} dataPath absolute data-file path
 * @property {IconSetData} data the validated data file
 * @property {string[]} notices license and notice files in the set directory
 * @property {import('./icon-definition-discovery.mjs').DiscoveredIconDefinition[]} definitions
 *   the set's own definitions, from its `definitions` folder
 * @property {string | null} [moduleFile] the file `data.module` resolves to
 *   from the project, when it resolves
 */

/**
 * A set that was found but answers nothing, and why.
 * @typedef {object} WithdrawnIconSet
 * @property {string} name
 * @property {string} package
 * @property {'invalid' | 'unresolved'} kind `invalid`: the descriptor or data
 *   file is invalid; `unresolved`: its module does not resolve from the project
 * @property {string} reason
 */

/**
 * The project's icon set (FR8).
 * @typedef {object} IconSetChoice
 * @property {'selected' | 'none' | 'ambiguous' | 'missing' | 'withdrawn'} status
 *   `selected`: one set is the project's; `none`: no set is installed;
 *   `ambiguous`: two or more are installed and `experimental.iconSet` names none of them
 *   uniquely; `missing`: `experimental.iconSet` names a set that is not installed;
 *   `withdrawn`: it names a set that is installed but withdrawn (invalid, or
 *   its module does not resolve), and `reason` says why
 * @property {DiscoveredIconSet} [set] the project's set, when selected
 * @property {string} [configured] the `experimental.iconSet` config value, when set
 * @property {string} reason one sentence saying why
 */

/**
 * Read every set under one `iconSets` root, without executing anything.
 * @param {string} root absolute `iconSets` root
 * @param {string} owner the package that ships the root
 * @returns {{sets: DiscoveredIconSet[], errors: Array<{name: string, message: string}>}}
 */
export function discoverIconSetDirectory(root, owner) {
  /** @type {DiscoveredIconSet[]} */
  const sets = [];
  /** @type {Array<{name: string, message: string}>} */
  const errors = [];
  let entries;
  try {
    entries = fs.readdirSync(root, {withFileTypes: true});
  } catch {
    return {sets, errors};
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (isIgnoredThemeEntry(entry.name) || !entry.isDirectory()) continue;
    // Only a lower-kebab directory is a set (FR1).
    if (!SET_NAME_RE.test(entry.name)) continue;
    try {
      sets.push(readIconSet(root, entry.name, owner));
    } catch (error) {
      errors.push({
        name: entry.name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {sets, errors};
}

/**
 * Read one set directory: its descriptor, its data file, and its notices.
 * @param {string} root
 * @param {string} name
 * @param {string} owner
 * @returns {DiscoveredIconSet}
 */
function readIconSet(root, name, owner) {
  const dir = assertWithin(name, root, {label: 'icon set directory'});
  const docPath = path.join(dir, `${name}.doc.mjs`);
  const dataPath = path.join(dir, `${name}.icons.json`);
  const label = `Icon set "${name}" in ${owner}`;
  for (const [file, what] of [
    [docPath, 'descriptor'],
    [dataPath, 'data file'],
  ]) {
    let stat;
    try {
      stat = fs.lstatSync(file);
    } catch {
      throw new Error(
        `${label} has no ${what}: add ${path.basename(file)} to its directory.`,
      );
    }
    if (!stat.isFile()) {
      throw new Error(
        `${label}: ${path.basename(file)} must be a regular file inside the set directory.`,
      );
    }
  }

  const doc = parseIconSet(
    readStaticDescriptorValue(docPath, `${label} descriptor`, 'IconSetDoc'),
    `${label} descriptor`,
  );
  if (doc.name !== name) {
    throw new Error(
      `${label}: the descriptor names "${doc.name}", but a set's name must equal its directory name.`,
    );
  }

  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${label}: ${name}.icons.json is not valid JSON: ${message}`,
      {
        cause: error,
      },
    );
  }
  const data = parseIconSetData(raw, `${label} data file`);
  // A reviewed match names an icon in another set (AST-084 FR3).
  for (const icon of data.icons) {
    for (const match of icon.matches ?? []) {
      if (match.set === name) {
        throw new Error(
          `${label} data file is invalid: icon "${icon.id}" has a match that names this set itself; a match names an icon in another set.`,
        );
      }
    }
  }

  // The set's own definitions, one file each in its `definitions` folder. A file
  // that does not read makes the set invalid, like its descriptor.
  const own = readDefinitionsDir(path.join(dir, 'definitions'), owner);
  if (own.errors.length > 0) {
    throw new Error(
      `${label}: ${own.errors.map(error => error.message).join(' ')}`,
    );
  }
  // Every key of `map` is Astryx's definition or one the set declares.
  const astryx = astryxDefinitionsByName();
  const declared = new Set(
    own.definitions.map(definition => definition.doc.name),
  );
  for (const [name, id] of Object.entries(data.map ?? {})) {
    if (astryx.has(name) || declared.has(name)) continue;
    throw new Error(
      `${label} data file is invalid: map "${name}" (icon "${id}") is not an icon definition. Declare it in definitions/${name}.doc.mjs, or use an Astryx icon definition (astryx docs cli/experimental/icon-definitions).`,
    );
  }

  const notices = fs
    .readdirSync(dir, {withFileTypes: true})
    .filter(file => file.isFile() && NOTICE_FILE_RE.test(file.name))
    .map(file => file.name)
    .sort();

  return {
    name,
    displayName: doc.displayName,
    description: doc.description,
    maintained: doc.maintained,
    license: doc.license,
    package: owner,
    dir,
    docPath,
    dataPath,
    data,
    notices,
    definitions: own.definitions,
  };
}

/**
 * The definitions each icon draws, by icon id, from the set's `map`.
 * @param {IconSetData} data
 * @returns {Map<string, string[]>}
 */
export function definitionsByIcon(data) {
  /** @type {Map<string, string[]>} */
  const byIcon = new Map();
  for (const [name, id] of Object.entries(data.map ?? {})) {
    const list = byIcon.get(id) ?? [];
    list.push(name);
    byIcon.set(id, list);
  }
  return byIcon;
}

/**
 * Split an import specifier into its package name and subpath.
 * @param {string} specifier
 * @returns {{name: string, subpath: string}}
 */
export function splitSpecifier(specifier) {
  const parts = specifier.split('/');
  const count = specifier.startsWith('@') ? 2 : 1;
  const name = parts.slice(0, count).join('/');
  const rest = parts.slice(count).join('/');
  return {name, subpath: rest ? `./${rest}` : '.'};
}

/**
 * The file a package's root resolves to when it has no `exports` map.
 * @param {string} packageDir
 * @param {Record<string, unknown>} pkg
 * @returns {string | null}
 */
function legacyRootEntry(packageDir, pkg) {
  const candidates = [
    ...[pkg.module, pkg.main].filter(
      (/** @type {unknown} */ value) => typeof value === 'string',
    ),
    'index.js',
    'index.mjs',
    'index.ts',
  ];
  for (const candidate of /** @type {string[]} */ (candidates)) {
    for (const file of [candidate, `${candidate}.js`, `${candidate}.mjs`]) {
      try {
        const resolved = assertWithin(file, packageDir, {
          label: 'package entry',
        });
        if (fs.statSync(resolved).isFile()) return resolved;
      } catch {
        // Try the next candidate.
      }
    }
  }
  return null;
}

/**
 * Resolve an icon module specifier from a directory, the way the project
 * would import it, without executing anything: the package is found through
 * node_modules (or the package being authored, when it is that package), and
 * the subpath through its `exports` map.
 * @param {string} specifier
 * @param {string} fromDir
 * @param {{name?: string, dir?: string}} [self] the package being read, which
 *   resolves its own name even when it does not install itself
 * @returns {string | null} the module file, or null when it does not resolve
 */
export function resolveIconModule(specifier, fromDir, self = {}) {
  const {name, subpath} = splitSpecifier(specifier);
  const packageDir =
    self.name === name && self.dir
      ? self.dir
      : // Node's own resolution: every ancestor's node_modules, no depth cap.
        findInstalledPackage(fromDir, name, Infinity);
  if (!packageDir) return null;
  /** @type {Record<string, unknown>} */
  let pkg;
  try {
    pkg = JSON.parse(
      fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8'),
    );
  } catch {
    return null;
  }
  if (pkg.exports === undefined && subpath === '.') {
    return legacyRootEntry(packageDir, pkg);
  }
  return inspectPackageExport(pkg, packageDir, subpath).target;
}

/**
 * Discover one loaded integration's icon sets, and withdraw each one that is
 * invalid or whose module does not resolve from the project (FR3, FR17).
 * @param {import('../integrations/integrations.mjs').LoadedIntegration} integration
 * @param {{projectDir: string}} options
 * @returns {{sets: DiscoveredIconSet[], withdrawn: WithdrawnIconSet[]}}
 */
export function discoverIntegrationIconSets(integration, {projectDir}) {
  /** @type {DiscoveredIconSet[]} */
  const sets = [];
  /** @type {WithdrawnIconSet[]} */
  const withdrawn = [];
  if (!integration.iconSets) return {sets, withdrawn};
  const found = discoverIconSetDirectory(
    integration.iconSets,
    integration.name,
  );
  for (const error of found.errors) {
    withdrawn.push({
      name: error.name,
      package: integration.name,
      kind: 'invalid',
      reason: error.message,
    });
  }
  for (const set of found.sets) {
    const moduleFile = resolveIconModule(set.data.module, projectDir, {
      name: integration.name,
      dir: integration.__packageDir,
    });
    if (!moduleFile) {
      withdrawn.push({
        name: set.name,
        package: integration.name,
        kind: 'unresolved',
        reason: `Icon set "${set.name}" in ${integration.name}: its module "${set.data.module}" does not resolve from the project. Install it, or fix "module" in ${set.name}.icons.json.`,
      });
      continue;
    }
    sets.push({...set, packageDir: integration.__packageDir, moduleFile});
  }
  return {sets, withdrawn};
}

/**
 * The withdrawn sets a selector names, as `"<set>"` or `"<package>/<set>"`.
 * @param {WithdrawnIconSet[]} withdrawn
 * @param {string} selector
 * @returns {WithdrawnIconSet[]}
 */
export function withdrawnNamed(withdrawn, selector) {
  const exact = withdrawn.filter(
    each => `${each.package}/${each.name}` === selector,
  );
  return exact.length > 0
    ? exact
    : withdrawn.filter(each => each.name === selector);
}

/**
 * Pick the project's icon set (FR8, FR17): the set `experimental.iconSet`
 * names, as `"<set>"` or `"<package>/<set>"`; otherwise the only installed
 * set; otherwise none. A configured name that matches no valid set but an
 * installed set that was withdrawn says so, with why.
 * @param {DiscoveredIconSet[]} sets installed sets, in integration load order
 * @param {string | undefined} configured the `experimental.iconSet` config value
 * @param {WithdrawnIconSet[]} [withdrawn] installed sets that were withdrawn
 * @returns {IconSetChoice}
 */
export function chooseProjectIconSet(sets, configured, withdrawn = []) {
  if (configured) {
    const exact = sets.filter(
      set => `${set.package}/${set.name}` === configured,
    );
    const byName =
      exact.length > 0 ? exact : sets.filter(set => set.name === configured);
    if (byName.length === 1) {
      return {
        status: 'selected',
        set: byName[0],
        configured,
        reason: `experimental.iconSet names "${configured}".`,
      };
    }
    if (byName.length > 1) {
      return {
        status: 'ambiguous',
        configured,
        reason: `experimental.iconSet "${configured}" names a set in ${byName.map(set => set.package).join(' and ')}; write it as "<package>/<set>".`,
      };
    }
    const gone = withdrawnNamed(withdrawn, configured);
    if (gone.length > 0) {
      return {
        status: 'withdrawn',
        configured,
        reason: `experimental.iconSet names "${configured}", which is installed but withdrawn: ${gone.map(each => each.reason).join(' ')}`,
      };
    }
    return {
      status: 'missing',
      configured,
      reason: `experimental.iconSet names "${configured}", but no installed set has that name${sets.length > 0 ? ` (installed: ${sets.map(iconSetKey).join(', ')})` : ''}.`,
    };
  }
  if (sets.length === 1) {
    return {
      status: 'selected',
      set: sets[0],
      reason: `"${iconSetKey(sets[0])}" is the only installed icon set.`,
    };
  }
  if (sets.length === 0) {
    return {status: 'none', reason: 'No icon set is installed.'};
  }
  return {
    status: 'ambiguous',
    reason: `${sets.length} icon sets are installed (${sets.map(iconSetKey).join(', ')}) and astryx.config sets no experimental.iconSet.`,
  };
}

/**
 * A set's full name, `<package>/<set>`.
 * @param {{package: string, name: string}} set
 */
export function iconSetKey(set) {
  return `${set.package}/${set.name}`;
}

/**
 * Sets in tie order (FR6, FR8): the project's set first, then load order.
 * @param {DiscoveredIconSet[]} sets
 * @param {IconSetChoice} choice
 * @returns {DiscoveredIconSet[]}
 */
export function orderIconSets(sets, choice) {
  const first = choice.set;
  if (!first) return [...sets];
  return [first, ...sets.filter(set => set !== first)];
}
