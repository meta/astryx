// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How a package.json `exports` field declares a subpath, read without
 * touching the targets (which may be build output that does not exist yet).
 *
 * @input A package.json `exports` value and a `.`/`./…` subpath.
 * @output Whether the subpath is declared for an ES module importer, and why
 *   not when it is not.
 * @position foundation/integrations; read by the public-import checks.
 */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Whether an export value gives an ES module importer something: a string,
 * or a condition object / fallback array with a target under a condition
 * other than `require` and `types`.
 * @param {unknown} value
 * @returns {boolean}
 */
export function importable(value) {
  if (typeof value === 'string') return true;
  if (Array.isArray(value)) return value.some(importable);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([condition, target]) =>
      condition !== 'require' && condition !== 'types' && importable(target),
  );
}

/**
 * Every string target an export value names, any condition.
 * @param {unknown} value
 * @param {string[]} [out]
 * @returns {string[]}
 */
export function allTargets(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) allTargets(v, out);
  else if (isRecord(value))
    for (const v of Object.values(value)) allTargets(v, out);
  return out;
}

/**
 * @typedef {object} SubpathDeclaration
 * @property {'declared'|'no_exports'|'root_only'|'missing'|'blocked'|'not_importable'} state
 * @property {unknown} [value] the matched export value
 * @property {string} [wildcard] what a `*` key matched
 */

/**
 * How a package's `exports` field declares one subpath, without touching the
 * targets: a missing key, a key with only a `require` condition, an `exports`
 * that is a bare string or a condition object (so only `.`), a wildcard that
 * does not match, or a `null` that blocks it. An `exports` of `null` is no
 * `exports` field, as Node reads it.
 * @param {unknown} exportsField
 * @param {string} subpath `.` or `./…`
 * @returns {SubpathDeclaration}
 */
export function subpathDeclaration(exportsField, subpath) {
  if (exportsField == null) return {state: 'no_exports'};
  const keys = isRecord(exportsField) ? Object.keys(exportsField) : [];
  // An empty object is a subpath map with no keys: it exports nothing, so
  // every subpath (the root too) is missing from it.
  const isMap =
    isRecord(exportsField) && keys.every(key => key.startsWith('.'));
  if (!isMap) {
    if (subpath !== '.') return {state: 'root_only'};
    return importable(exportsField)
      ? {state: 'declared', value: exportsField}
      : {state: 'not_importable', value: exportsField};
  }
  const map = /** @type {Record<string, unknown>} */ (exportsField);
  /** @type {{value: unknown, wildcard: string} | null} */
  let hit = null;
  if (Object.hasOwn(map, subpath)) {
    hit = {value: map[subpath], wildcard: ''};
  } else {
    const patterns = keys
      .filter(key => key.split('*').length === 2)
      .sort((a, b) => b.indexOf('*') - a.indexOf('*') || b.length - a.length);
    for (const pattern of patterns) {
      const star = pattern.indexOf('*');
      const prefix = pattern.slice(0, star);
      const suffix = pattern.slice(star + 1);
      if (
        subpath.length >= prefix.length + suffix.length &&
        subpath.startsWith(prefix) &&
        subpath.endsWith(suffix)
      ) {
        hit = {
          value: map[pattern],
          wildcard: subpath.slice(
            prefix.length,
            subpath.length - suffix.length,
          ),
        };
        break;
      }
    }
  }
  if (!hit) return {state: 'missing'};
  if (hit.value == null) return {state: 'blocked'};
  if (!importable(hit.value))
    return {state: 'not_importable', value: hit.value, wildcard: hit.wildcard};
  return {state: 'declared', value: hit.value, wildcard: hit.wildcard};
}
