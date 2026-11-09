// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Pure views over discover sources' catalogs: which catalog packages the
 * project already has, what it could add, and the items search looks through.
 * No I/O; the adapter supplies every input.
 *
 * @position api/discover — shared by the list, detail, item, and search leaves.
 */

import {KIND_FIELDS} from './_adapter.mjs';

/**
 * @typedef {import('./_adapter.mjs').InstalledPackage} InstalledPackage
 * @typedef {import('./_adapter.mjs').CatalogResult} CatalogResult
 * @typedef {CatalogResult['packages'][number]} CatalogPackage
 * @typedef {import('../../authoring/discover/type').DiscoverKind} DiscoverKind
 */

/**
 * An item search looks through. `kind: 'package'` is a package itself.
 * @typedef {object} SearchItem
 * @property {string} package
 * @property {DiscoverKind | 'package'} kind
 * @property {string} name
 * @property {boolean} installed
 * @property {string} [title]
 * @property {string} [summary]
 * @property {string[]} [keywords]
 * @property {string} [description]
 */

/**
 * Group a version's contributions into the entry fields, one list per kind.
 * `components` is always present, like on an installed entry.
 * @param {CatalogPackage['contributions']} contributions
 * @returns {Record<string, string[]>}
 */
export function kindLists(contributions) {
  /** @type {Record<string, string[]>} */
  const lists = {components: []};
  for (const [kind, field] of KIND_FIELDS) {
    const names = contributions.filter(c => c.kind === kind).map(c => c.name);
    if (names.length > 0 || field === 'components') lists[field] = names;
  }
  return lists;
}

/**
 * Whether an entry adds at least one item of `kind`.
 * @param {Record<string, unknown>} entry
 * @param {DiscoverKind} kind
 * @returns {boolean}
 */
export function hasKind(entry, kind) {
  const field = KIND_FIELDS.find(([k]) => k === kind)?.[1];
  const values = field == null ? undefined : entry[field];
  return Array.isArray(values) && values.length > 0;
}

/**
 * Where a catalog package stands against the project. An entry the official
 * list supplied is checked against the project's own package.json
 * (`officialDeclared`); any other entry against the folder discover runs in
 * (`declared`).
 * @param {CatalogPackage} pkg
 * @param {Set<string>} installedNames
 * @param {Set<string>} declared
 * @param {Set<string>} [officialDeclared]
 * @returns {{state: 'installed' | 'declared' | 'alias' | 'available', installedAs?: string}}
 */
export function catalogState(pkg, installedNames, declared, officialDeclared) {
  if (installedNames.has(pkg.package)) return {state: 'installed'};
  if (
    (pkg.official && officialDeclared ? officialDeclared : declared).has(
      pkg.package,
    )
  )
    return {state: 'declared'};
  const installedAs = pkg.aliases.find(
    name => installedNames.has(name) || declared.has(name),
  );
  if (installedAs != null) return {state: 'alias', installedAs};
  return {state: 'available'};
}

/**
 * The version a catalog package shows by default.
 * @param {CatalogPackage} pkg
 * @returns {string | undefined}
 */
export function defaultVersion(pkg) {
  return pkg.latest ?? pkg.versions[0]?.version;
}

/**
 * Project a catalog package into the entry shape installed packages use.
 * @param {CatalogPackage} pkg
 * @param {string | undefined} version
 */
export function catalogEntry(pkg, version) {
  const {components, ...others} = kindLists(pkg.contributions);
  return {
    name: pkg.package,
    package: pkg.package,
    category: pkg.package,
    components,
    ...(version ? {version} : {}),
    ...(pkg.description ? {description: pkg.description} : {}),
    ...others,
  };
}

/**
 * What the project could add: every catalog package it does not have, once per
 * integration (the first name a source lists), never an alias of one it has,
 * each with the command that adds it when `install` is given.
 * @param {CatalogResult} catalog
 * @param {InstalledPackage[]} installed
 * @param {Set<string>} declared
 * @param {{officialDeclared?: Set<string>, install?: (pkg: CatalogPackage) => string}} [options]
 */
export function availableEntries(
  catalog,
  installed,
  declared,
  {officialDeclared, install} = {},
) {
  const installedNames = new Set(installed.map(p => p.name));
  /** @type {Set<string>} */
  const integrations = new Set();
  const entries = [];
  for (const pkg of catalog.packages) {
    if (
      catalogState(pkg, installedNames, declared, officialDeclared).state !==
      'available'
    )
      continue;
    if (integrations.has(pkg.integration)) continue;
    integrations.add(pkg.integration);
    const version = defaultVersion(pkg);
    const {category: _category, ...entry} = catalogEntry(pkg, version);
    entries.push({
      ...entry,
      ...(pkg.aliases.length > 0 ? {aliases: pkg.aliases} : {}),
      source: pkg.source,
      ...(install ? {install: install(pkg)} : {}),
    });
  }
  return entries;
}

/**
 * Installed packages with the latest release a source knows for each.
 * @param {InstalledPackage[]} installed
 * @param {CatalogResult} catalog
 * @returns {Array<InstalledPackage & {latest?: string}>}
 */
export function withLatest(installed, catalog) {
  const byName = new Map(catalog.packages.map(p => [p.package, p]));
  return installed.map(pkg => {
    const latest = byName.get(pkg.name)?.latest;
    return latest ? {...pkg, latest} : pkg;
  });
}

/**
 * Everything search looks through besides installed components (which the
 * search leaf keeps resolving the way it always has): installed packages and
 * their other items, and every package the project could add with its items.
 * @param {InstalledPackage[]} installed
 * @param {CatalogResult} catalog
 * @param {Set<string>} declared
 * @param {Set<string>} [officialDeclared]
 * @returns {SearchItem[]}
 */
export function searchItems(installed, catalog, declared, officialDeclared) {
  /** @type {SearchItem[]} */
  const items = [];
  for (const pkg of installed) {
    items.push({
      package: pkg.name,
      kind: 'package',
      name: pkg.name,
      installed: true,
      ...(pkg.description ? {description: pkg.description} : {}),
    });
    for (const [kind, field] of KIND_FIELDS) {
      if (kind === 'component') continue;
      const names = /** @type {Record<string, unknown>} */ (pkg)[field];
      if (!Array.isArray(names)) continue;
      for (const name of names) {
        items.push({package: pkg.name, kind, name, installed: true});
      }
    }
  }
  const installedNames = new Set(installed.map(p => p.name));
  /** @type {Set<string>} */
  const integrations = new Set();
  for (const pkg of catalog.packages) {
    if (
      catalogState(pkg, installedNames, declared, officialDeclared).state !==
      'available'
    )
      continue;
    if (integrations.has(pkg.integration)) continue;
    integrations.add(pkg.integration);
    items.push({
      package: pkg.package,
      kind: 'package',
      name: pkg.package,
      installed: false,
      ...(pkg.description ? {description: pkg.description} : {}),
    });
    for (const c of pkg.contributions) {
      items.push({
        package: pkg.package,
        kind: c.kind,
        name: c.name,
        installed: false,
        ...(c.title ? {title: c.title} : {}),
        ...(c.summary ? {summary: c.summary} : {}),
        ...(c.keywords ? {keywords: c.keywords} : {}),
      });
    }
  }
  return items;
}
