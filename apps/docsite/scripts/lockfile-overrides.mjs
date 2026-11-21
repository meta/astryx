// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file npm `overrides` that pin a packed workspace package's dependencies to
 * the versions the repository's pnpm lockfile resolved.
 *
 * build-mcp-runtime.mjs installs the packed CLI and Core with npm, as a reader
 * does. Without a lockfile npm takes the newest matching versions from the
 * registry, so a release published moments earlier can break the install (a
 * package that needs a sibling the registry does not serve yet). These
 * overrides make npm install the lockfile's versions instead.
 *
 * A name with one version in the closure is pinned everywhere. A name with
 * several is pinned under each parent that resolves it (`parent@version`, or
 * the parent's own entry when the parent has one version).
 *
 * What stays unpinned: npm skips a `parent@version` entry where a nearer
 * override already pins that parent by name, so the parent's own children
 * with several versions resolve from the registry, within the lockfile's
 * ranges. Today that is `domelementtype` (`^3.0.0`) under `css-select`'s
 * `domhandler@6.0.1` and `domutils@4.0.2`. Nesting those pins under
 * `css-select` does not help: npm 11 then builds an invalid tree.
 *
 * @input the text of a pnpm lockfile (v9); the importers to pin, with their package names
 * @output an npm `overrides` object
 * @position docsite build — read by build-mcp-runtime.mjs
 */

import YAML from 'yaml';

/** The name and version of a lockfile key such as `@babel/core@7.29.7(x@1)`. */
function splitKey(key) {
  const at = key.indexOf('@', key.startsWith('@') ? 1 : 0);
  return {name: key.slice(0, at), version: bareVersion(key.slice(at + 1))};
}

/** A lockfile version without its peer suffix: `7.29.7(x@1)` -> `7.29.7`. */
function bareVersion(version) {
  return String(version).replace(/\(.*$/, '');
}

/**
 * The npm overrides that pin every registry dependency the importers reach,
 * directly or through other packages, to the lockfile's version (npm applies
 * all of them but the nested case the file header names).
 * @param {string} lockText the pnpm-lock.yaml text
 * @param {{path: string, name: string}[]} importers lockfile importer paths
 *   (`packages/cli`) and the names they publish under (`@astryxdesign/cli`)
 * @returns {Record<string, string | Record<string, string>>}
 */
export function lockfileOverrides(lockText, importers) {
  const lock = YAML.parse(lockText);
  /** name -> Set of versions */
  const versions = new Map();
  /** `name@version` -> {child name: child version} */
  const children = new Map();
  const queue = [];
  /** importer package name -> {direct dependency: version} */
  const direct = new Map();
  for (const importer of importers) {
    const entry = lock.importers?.[importer.path];
    if (!entry)
      throw new Error(`The lockfile has no importer ${importer.path}`);
    const own = {};
    for (const [name, dep] of Object.entries({
      ...(entry.dependencies ?? {}),
      ...(entry.optionalDependencies ?? {}),
    })) {
      // A workspace package (link:) is packed, not installed from the registry.
      if (String(dep.version).startsWith('link:')) continue;
      own[name] = bareVersion(dep.version);
      queue.push(`${name}@${dep.version}`);
    }
    direct.set(importer.name, own);
  }
  const seen = new Set();
  while (queue.length > 0) {
    const key = queue.pop();
    if (seen.has(key)) continue;
    seen.add(key);
    const {name, version} = splitKey(key);
    if (!versions.has(name)) versions.set(name, new Set());
    versions.get(name).add(version);
    const snapshot =
      lock.snapshots?.[key] ?? lock.snapshots?.[`${name}@${version}`];
    if (!snapshot) throw new Error(`The lockfile has no snapshot for ${key}`);
    const deps = {
      ...(snapshot.dependencies ?? {}),
      ...(snapshot.optionalDependencies ?? {}),
    };
    const own = children.get(`${name}@${version}`) ?? {};
    for (const [child, childVersion] of Object.entries(deps)) {
      own[child] = bareVersion(childVersion);
      queue.push(`${child}@${childVersion}`);
    }
    children.set(`${name}@${version}`, own);
  }

  const single = name => versions.get(name)?.size === 1;
  /** @type {Record<string, string | Record<string, string>>} */
  const overrides = {};
  for (const [name, set] of [...versions].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    for (const version of [...set].sort()) {
      // The children with several versions in the closure, pinned under this parent.
      const pinned = Object.fromEntries(
        Object.entries(children.get(`${name}@${version}`) ?? {})
          .filter(([child]) => !single(child))
          .sort(([a], [b]) => a.localeCompare(b)),
      );
      if (single(name)) {
        overrides[name] =
          Object.keys(pinned).length > 0 ? {'.': version, ...pinned} : version;
      } else if (Object.keys(pinned).length > 0) {
        overrides[`${name}@${version}`] = pinned;
      }
    }
  }
  // A direct dependency with several versions in the closure, pinned under the packed package.
  for (const [name, own] of direct) {
    const pinned = Object.fromEntries(
      Object.entries(own)
        .filter(([child]) => !single(child))
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    if (Object.keys(pinned).length > 0) overrides[name] = pinned;
  }
  return overrides;
}

/**
 * The same pins, applied only inside one package's dependency tree: the
 * overrides nest under that package's name. A sibling package with its own
 * dependency ranges keeps the versions npm resolves for it.
 * @param {Record<string, string | Record<string, string>>} overrides
 * @param {string} owner the package whose tree the pins apply to
 * @returns {Record<string, Record<string, string | Record<string, string>>>}
 */
export function scopedOverrides(overrides, owner) {
  const {[owner]: ownPins, ...rest} = overrides;
  return {[owner]: {...rest, ...(typeof ownPins === 'object' ? ownPins : {})}};
}
