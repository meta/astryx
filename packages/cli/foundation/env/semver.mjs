// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Minimal semver utilities for the CLI.
 *
 * We deliberately avoid pulling in `semver` from npm — Astryx releases follow a
 * strict `MAJOR.MINOR.PATCH[-prerelease]` shape and the CLI runs in consumer
 * sandboxes where a smaller dependency surface is preferred.
 */

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * True if `value` looks like a valid semver string (MAJOR.MINOR.PATCH with
 * optional prerelease/build metadata).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidSemver(value) {
  return typeof value === 'string' && SEMVER_RE.test(value);
}

/**
 * Compare two semver strings numerically.
 *
 * Returns a negative number if `a < b`, positive if `a > b`, 0 if equal.
 * Prerelease tags are stripped — `0.0.5-beta.1` compares equal to `0.0.5`.
 * That's adequate for the upgrade gate, which only cares about ordering of
 * released versions.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function semverCompare(a, b) {
  const pa = String(a).split('-')[0].split('.').map(Number);
  const pb = String(b).split('-')[0].split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (Number.isNaN(na) || Number.isNaN(nb)) {
      // Fall back to lexicographic compare on garbage input rather than
      // returning NaN, which would silently break sort/filter callers.
      return String(a).localeCompare(String(b));
    }
    if (na !== nb) return na - nb;
  }
  return 0;
}

/**
 * `true` if `a` is greater than or equal to `b` in semver order.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function semverGte(a, b) {
  return semverCompare(a, b) >= 0;
}

/**
 * `true` if `a` is strictly greater than `b` in semver order.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function semverGt(a, b) {
  return semverCompare(a, b) > 0;
}

/**
 * Parse a (possibly partial) version like `1`, `1.2`, or `1.2.3` into numeric
 * parts — missing components default to 0, and `count` records how many were
 * actually given (so `^0.10` can be told apart from `^0.10.0`).
 *
 * @param {string} value
 * @returns {{major: number, minor: number, patch: number, count: number}}
 */
function parseVersionParts(value) {
  const core = String(value).trim().replace(/^[v=]+/, '').split(/[-+]/)[0];
  const nums = core.split('.').map(n => parseInt(n, 10));
  return {
    major: Number.isFinite(nums[0]) ? nums[0] : 0,
    minor: Number.isFinite(nums[1]) ? nums[1] : 0,
    patch: Number.isFinite(nums[2]) ? nums[2] : 0,
    count: nums.filter(n => Number.isFinite(n)).length,
  };
}

/**
 * `true` if `version` satisfies a single comparator token (`^1.2.3`, `~1.2`,
 * `>=1.0.0`, `<2.0.0`, `=1.2.3`, or a bare `1.2.3`). An unrecognized token
 * returns `true` (treated as "no constraint") so callers never emit a false
 * mismatch on input this minimal parser doesn't model.
 *
 * @param {string} version
 * @param {string} token
 * @returns {boolean}
 */
function satisfiesComparator(version, token) {
  const m = /^(\^|~|>=|<=|>|<|=)?\s*(.*)$/.exec(token.trim());
  if (!m) return true;
  const op = m[1] || '=';
  const target = m[2].trim();
  if (target === '' || target === '*' || target.toLowerCase() === 'x') return true;
  const t = parseVersionParts(target);
  // No numeric component (e.g. `workspace:*`, a git/url spec) — can't model it,
  // so treat as unconstrained rather than emit a false mismatch.
  if (t.count === 0) return true;
  const cmp = semverCompare(version, `${t.major}.${t.minor}.${t.patch}`);
  const below = (/** @type {string} */ upper) =>
    cmp >= 0 && semverCompare(version, upper) < 0;
  switch (op) {
    case '>=':
      return cmp >= 0;
    case '>':
      return cmp > 0;
    case '<=':
      return cmp <= 0;
    case '<':
      return cmp < 0;
    case '^':
      // A partial target widens the range to the parts given: `^0` is any
      // 0.x.y, `^0.0` is any 0.0.y, while `^0.0.3` is locked to the patch.
      if (t.major > 0 || t.count === 1) return below(`${t.major + 1}.0.0`);
      if (t.minor > 0 || t.count === 2) return below(`0.${t.minor + 1}.0`);
      return below(`0.0.${t.patch + 1}`);
    case '~':
      return below(t.count >= 2 ? `${t.major}.${t.minor + 1}.0` : `${t.major + 1}.0.0`);
    case '=':
    default:
      // A full version is exact; a partial (`1`, `1.2`) behaves like a range.
      if (t.count >= 3) return cmp === 0;
      return below(t.count === 2 ? `${t.major}.${t.minor + 1}.0` : `${t.major + 1}.0.0`);
  }
}

/**
 * Minimal semver range-satisfaction check covering the range forms Astryx peers
 * use: exact, caret (`^`), tilde (`~`), comparators (`>=` `>` `<=` `<` `=`),
 * partial versions (`^0.10`), the wildcards `*` / `x` / empty, and `||`-joined
 * unions of space-joined intersections (`>=1 <2`).
 *
 * Returns `true` when `version` satisfies `range`. On a non-semver `version` or a
 * range this parser can't confidently model, returns `true` — the peer-dep check
 * only acts on a *confident* mismatch, so an unparseable range never becomes a
 * false warning.
 *
 * @param {string} version installed version (MAJOR.MINOR.PATCH)
 * @param {string} range a peerDependencies range
 * @returns {boolean}
 */
export function satisfiesRange(version, range) {
  if (!isValidSemver(version)) return true;
  const r = String(range ?? '').trim();
  if (r === '' || r === '*' || r.toLowerCase() === 'x' || r.toLowerCase() === 'latest') {
    return true;
  }
  return r.split('||').some(union => {
    // A hyphen range `A - B` is the inclusive intersection `>=A <=B`; left
    // as-is its two bare versions would each read as an exact match that
    // can never both hold.
    const normalized = union
      .trim()
      .replace(/^(\S+)\s+-\s+(\S+)$/, '>=$1 <=$2');
    const tokens = normalized.split(/\s+/).filter(Boolean);
    return tokens.length === 0 || tokens.every(tok => satisfiesComparator(version, tok));
  });
}
