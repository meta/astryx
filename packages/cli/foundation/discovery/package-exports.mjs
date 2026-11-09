// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Package export-map inspection for built theme assets.
 *
 * Resolves exact and wildcard subpaths through ordinary conditional export
 * objects without executing package code. Packages with no exports map retain
 * their legacy public deep paths and are resolved from files on disk.
 *
 * @input Parsed package.json, package directory, and a public subpath
 * @output The public specifier and confined target file, when exported, and
 *   the file a subpath's `source` condition names, when the package has it
 * @position packages/cli/foundation/discovery — shared package import metadata
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const MODULE_EXTENSIONS = [
  '.mjs',
  '.js',
  '.cjs',
  '.mts',
  '.ts',
  '.cts',
  '.tsx',
  '.jsx',
];
const CONDITION_ORDER = ['import', 'default', 'browser', 'node', 'require'];

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Select one string target from a conditional or fallback export value.
 * @param {unknown} value
 * @returns {string|null}
 */
function targetString(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const selected = targetString(item);
      if (selected) return selected;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  const keys = [
    ...CONDITION_ORDER.filter(key => Object.hasOwn(value, key)),
    ...Object.keys(value).filter(
      key => key !== 'types' && !CONDITION_ORDER.includes(key),
    ),
  ];
  for (const key of keys) {
    const selected = targetString(value[key]);
    if (selected) return selected;
  }
  return null;
}

/**
 * Find an exact or one-star subpath mapping and the wildcard value it matched.
 * @param {Record<string, unknown>} map
 * @param {string} subpath
 */
function subpathValue(map, subpath) {
  if (Object.hasOwn(map, subpath)) {
    return {found: map[subpath] != null, value: map[subpath], wildcard: ''};
  }
  const patterns = Object.keys(map)
    .filter(key => key.startsWith('./') && key.split('*').length === 2)
    .sort((a, b) => b.length - a.length);
  for (const pattern of patterns) {
    const star = pattern.indexOf('*');
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (
      subpath.length >= prefix.length + suffix.length &&
      subpath.startsWith(prefix) &&
      subpath.endsWith(suffix)
    ) {
      return {
        found: map[pattern] != null,
        value: map[pattern],
        wildcard: subpath.slice(prefix.length, subpath.length - suffix.length),
      };
    }
  }
  return {found: false, value: null, wildcard: ''};
}

/**
 * Select the export value for one subpath.
 * @param {unknown} exportsField
 * @param {string} subpath
 */
function exportValue(exportsField, subpath) {
  if (exportsField === undefined) {
    return {hasMap: false, exported: true, target: null};
  }
  if (!isRecord(exportsField)) {
    return {
      hasMap: true,
      exported: subpath === '.' && exportsField != null,
      target: subpath === '.' ? targetString(exportsField) : null,
    };
  }
  const keys = Object.keys(exportsField);
  const subpathMap = keys.some(key => key.startsWith('.'));
  if (!subpathMap) {
    return {
      hasMap: true,
      exported: subpath === '.',
      target: subpath === '.' ? targetString(exportsField) : null,
    };
  }
  const selected = subpathValue(exportsField, subpath);
  const target = selected.found ? targetString(selected.value) : null;
  return {
    hasMap: true,
    exported: selected.found && target != null,
    target: target?.replaceAll('*', selected.wildcard) ?? null,
  };
}

/** @param {string} file */
function regularFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve an export target while confining it to its package.
 * @param {string} packageDir
 * @param {string} target
 */
function resolveTarget(packageDir, target) {
  if (!target.startsWith('./')) return null;
  const resolved = path.resolve(packageDir, target);
  const root = path.resolve(packageDir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return regularFile(resolved) ? resolved : null;
}

/**
 * Resolve a public legacy deep path for a package with no exports map.
 * @param {string} packageDir
 * @param {string} subpath
 */
function resolveLegacy(packageDir, subpath) {
  if (!subpath.startsWith('./')) return null;
  const base = path.resolve(packageDir, subpath.slice(2));
  const root = path.resolve(packageDir);
  if (base !== root && !base.startsWith(root + path.sep)) return null;
  const candidates = [
    base,
    ...MODULE_EXTENSIONS.map(extension => `${base}${extension}`),
    ...MODULE_EXTENSIONS.map(extension => path.join(base, `index${extension}`)),
  ];
  return candidates.find(regularFile) ?? null;
}

/**
 * The raw export value one subpath maps to, with the wildcard it matched.
 * @param {unknown} exportsField
 * @param {string} subpath
 * @returns {{value: unknown, wildcard: string} | null}
 */
function rawExportValue(exportsField, subpath) {
  if (exportsField == null) return null;
  if (!isRecord(exportsField)) {
    return subpath === '.' ? {value: exportsField, wildcard: ''} : null;
  }
  if (!Object.keys(exportsField).some(key => key.startsWith('.'))) {
    return subpath === '.' ? {value: exportsField, wildcard: ''} : null;
  }
  const selected = subpathValue(exportsField, subpath);
  return selected.found
    ? {value: selected.value, wildcard: selected.wildcard}
    : null;
}

/**
 * The file a subpath's `source` condition names, when that file is in the
 * package. A package that ships its source (or a workspace package before it
 * is built) declares it beside the built target, so reading it answers the
 * same with or without a build. Null when there is no such condition or file.
 * @param {{exports?: unknown}} pkg
 * @param {string} packageDir
 * @param {string} subpath `.` or a `./`-prefixed subpath
 * @returns {string|null}
 */
export function sourceExportTarget(pkg, packageDir, subpath) {
  const selected = rawExportValue(pkg.exports, subpath);
  if (!selected || !isRecord(selected.value)) return null;
  const source = selected.value.source;
  if (typeof source !== 'string') return null;
  return resolveTarget(packageDir, source.replaceAll('*', selected.wildcard));
}

/**
 * @typedef {object} PackageExportResult
 * @property {string} subpath
 * @property {string} specifier
 * @property {boolean} exported
 * @property {string|null} target
 * @property {string|null} authoredTarget
 */

/**
 * Inspect one public package subpath.
 * @param {{name?: unknown, exports?: unknown}} pkg
 * @param {string} packageDir
 * @param {string} subpath `.` or a `./`-prefixed subpath
 * @returns {PackageExportResult}
 */
export function inspectPackageExport(pkg, packageDir, subpath) {
  const name = typeof pkg.name === 'string' ? pkg.name : '';
  const selected = exportValue(pkg.exports, subpath);
  const target = selected.hasMap
    ? selected.target
      ? resolveTarget(packageDir, selected.target)
      : null
    : resolveLegacy(packageDir, subpath);
  const suffix = subpath === '.' ? '' : `/${subpath.slice(2)}`;
  return {
    subpath,
    specifier: `${name}${suffix}`,
    exported: selected.exported,
    target,
    authoredTarget: selected.target,
  };
}
