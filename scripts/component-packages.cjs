// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';
/* global module, require */

/**
 * @file Shared registry of component-bearing Astryx packages and their layouts.
 * @input Repository package names, source roots, public barrels, component docs,
 *   and Storybook routing namespaces.
 * @output Package metadata and public component discovery helpers.
 * @position Single registry used by audit rosters and component knowledge paths.
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Component-bearing packages covered by both the audit roster and component
 * knowledge records.
 *
 * `nested`: components are exported through package and component barrels, and
 * independently public components are identified by their consumer docs.
 * `flat`: public component modules live directly under src and are exported by
 * the package barrel.
 */
const COMPONENT_PACKAGES = Object.freeze([
  {
    name: 'core',
    src: 'packages/core/src',
    layout: 'nested',
    storyPrefixes: ['core-'],
    storyNamespaces: ['Core'],
  },
  {
    name: 'lab',
    src: 'packages/lab/src',
    layout: 'nested',
    storyPrefixes: ['lab-'],
    storyNamespaces: ['Lab'],
  },
  {
    name: 'charts',
    src: 'packages/charts/src',
    layout: 'flat',
    storyPrefixes: ['charts-'],
    storyNamespaces: ['Charts'],
  },
  {
    name: 'richtext',
    src: 'packages/richtext/src',
    layout: 'flat',
    storyPrefixes: ['richtext-'],
    storyNamespaces: ['RichText'],
  },
  {
    name: 'vega',
    src: 'packages/vega/src',
    layout: 'flat',
    storyPrefixes: ['vega-'],
    storyNamespaces: ['Vega'],
  },
]);

const COMPONENT_PACKAGE_NAMES = Object.freeze(
  COMPONENT_PACKAGES.map(pkg => pkg.name),
);
const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]*$/;

function componentPackage(name) {
  return COMPONENT_PACKAGES.find(pkg => pkg.name === name) ?? null;
}

function resolveLocalModule(fromFile, specifier, sourceRoot) {
  if (!specifier.startsWith('.')) return null;
  const unresolved = path.resolve(path.dirname(fromFile), specifier);
  const relative = path.relative(sourceRoot, unresolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;

  for (const candidate of [
    unresolved,
    `${unresolved}.tsx`,
    `${unresolved}.ts`,
    path.join(unresolved, 'index.ts'),
  ]) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Try the next supported source shape.
    }
  }
  return null;
}

function namedExportItems(list) {
  const items = [];
  for (const rawItem of list.split(',')) {
    const item = rawItem.trim();
    if (!item || item.startsWith('type ')) continue;
    const [sourceName, exportedName = sourceName] = item.split(/\s+as\s+/);
    if (!COMPONENT_NAME.test(exportedName)) continue;
    items.push({sourceName, exportedName});
  }
  return items;
}

/**
 * Resolve every non-type PascalCase export in one public barrel to the TSX
 * module that implements it. This follows local star exports, named exports,
 * aliases, and parent-relative paths without leaving the package source root.
 *
 * @returns {Map<string, string>} public export name -> resolved TSX file
 */
function componentExportsFromBarrel(
  barrelPath,
  sourceRoot,
  state = {cache: new Map(), visiting: new Set()},
) {
  const resolvedBarrel = path.resolve(barrelPath);
  const cached = state.cache.get(resolvedBarrel);
  if (cached) return cached;
  if (state.visiting.has(resolvedBarrel)) return new Map();
  state.visiting.add(resolvedBarrel);

  let barrel;
  try {
    barrel = fs.readFileSync(resolvedBarrel, 'utf8');
  } catch {
    const empty = new Map();
    state.visiting.delete(resolvedBarrel);
    state.cache.set(resolvedBarrel, empty);
    return empty;
  }

  const exports = new Map();
  const starExportPattern = /export\s*\*\s*from\s*['"]([^'"]+)['"]/gm;
  for (const match of barrel.matchAll(starExportPattern)) {
    const target = resolveLocalModule(resolvedBarrel, match[1], sourceRoot);
    if (!target || path.extname(target) === '.tsx') continue;
    for (const [name, implementation] of componentExportsFromBarrel(
      target,
      sourceRoot,
      state,
    )) {
      exports.set(name, implementation);
    }
  }

  const namedExportPattern =
    /export\s*(type\s+)?\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/gm;
  for (const match of barrel.matchAll(namedExportPattern)) {
    if (match[1]) continue;
    const target = resolveLocalModule(resolvedBarrel, match[3], sourceRoot);
    if (!target) continue;
    const items = namedExportItems(match[2]);
    if (path.extname(target) === '.tsx') {
      for (const {exportedName} of items) exports.set(exportedName, target);
      continue;
    }

    const targetExports = componentExportsFromBarrel(target, sourceRoot, state);
    for (const {sourceName, exportedName} of items) {
      const implementation = targetExports.get(sourceName);
      if (implementation) exports.set(exportedName, implementation);
    }
  }

  state.visiting.delete(resolvedBarrel);
  state.cache.set(resolvedBarrel, exports);
  return exports;
}

/** Public PascalCase component exports from a package source root. */
function exportedComponentNames(sourceDir) {
  return [
    ...componentExportsFromBarrel(
      path.join(sourceDir, 'index.ts'),
      sourceDir,
    ).keys(),
  ].sort();
}

function flatPackageComponentNames(repoRoot, packageConfig) {
  return exportedComponentNames(path.join(repoRoot, packageConfig.src));
}

/** Names one component directory's current consumer docs declare. */
function documentedComponentNames(componentDir) {
  const names = new Set();
  let files;
  try {
    files = fs.readdirSync(componentDir, {withFileTypes: true});
  } catch {
    return [];
  }
  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith('.doc.mjs')) continue;
    const content = fs.readFileSync(path.join(componentDir, file.name), 'utf8');
    for (const match of content.matchAll(
      /\bname:\s*['"]([A-Z][A-Za-z0-9]*)['"]/g,
    )) {
      names.add(match[1]);
    }
  }
  return [...names];
}

/** Names current consumer docs identify as independent public components. */
function documentedNestedComponentNames(sourceDir) {
  let entries;
  try {
    entries = fs.readdirSync(sourceDir, {withFileTypes: true});
  } catch {
    return [];
  }

  const names = new Set();
  for (const entry of entries) {
    if (!entry.isDirectory() || !COMPONENT_NAME.test(entry.name)) continue;
    for (const name of documentedComponentNames(
      path.join(sourceDir, entry.name),
    )) {
      names.add(name);
    }
  }
  return [...names];
}

/**
 * Public component exports that current docs identify as independent components.
 * Export resolution, rather than directory or filename equality, keeps aliases
 * and components implemented in another TSX module while excluding family,
 * hook, context, and utility directory names that are not component exports.
 */
function nestedPackageComponentNames(repoRoot, packageConfig) {
  const sourceDir = path.join(repoRoot, packageConfig.src);
  const exported = new Set(exportedComponentNames(sourceDir));
  return documentedNestedComponentNames(sourceDir)
    .filter(name => exported.has(name))
    .sort();
}

/**
 * Documented, exported components that live outside PascalCase directories in
 * a nested package (Core's `theme/` holds Theme, MediaTheme and SyntaxTheme;
 * `i18n/` holds InternationalizationProvider), which
 * `nestedPackageComponentNames` does not reach. Flat packages have none.
 */
function documentedComponentsOutsideComponentDirectories(
  repoRoot,
  packageConfig,
) {
  if (packageConfig.layout === 'flat') return [];
  const sourceDir = path.join(repoRoot, packageConfig.src);
  let entries;
  try {
    entries = fs.readdirSync(sourceDir, {withFileTypes: true});
  } catch {
    return [];
  }
  const exported = new Set(exportedComponentNames(sourceDir));
  const names = new Set();
  for (const entry of entries) {
    if (!entry.isDirectory() || COMPONENT_NAME.test(entry.name)) continue;
    for (const name of documentedComponentNames(
      path.join(sourceDir, entry.name),
    )) {
      if (exported.has(name)) names.add(name);
    }
  }
  return [...names].sort();
}

function packageHasPublicComponent(repoRoot, packageName, componentName) {
  const packageConfig = componentPackage(packageName);
  if (!packageConfig) return false;
  const names =
    packageConfig.layout === 'flat'
      ? flatPackageComponentNames(repoRoot, packageConfig)
      : nestedPackageComponentNames(repoRoot, packageConfig);
  return names.includes(componentName);
}

module.exports = {
  COMPONENT_PACKAGES,
  COMPONENT_PACKAGE_NAMES,
  componentExportsFromBarrel,
  componentPackage,
  documentedComponentNames,
  documentedComponentsOutsideComponentDirectories,
  documentedNestedComponentNames,
  exportedComponentNames,
  flatPackageComponentNames,
  nestedPackageComponentNames,
  packageHasPublicComponent,
};
