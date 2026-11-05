// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Release-version admission for a release branch.
 *
 * Implements `spec:AST-017` FR46-FR50. Main's package.json carries the next
 * planned version for the fixed package group, and a release branch releases
 * exactly that version:
 *
 *   main            declares the next version; publishes canaries only
 *   release branch  admits pending Changesets against that declared version
 *
 * The declared version must be the patch or minor successor of the latest
 * stable release, and that choice is the release tier. Incompatible Changesets
 * are admissible only in a minor release. A Changeset never moves the version:
 * the owner sets it on main before the cut.
 *
 * This answers one question — does this release admit these Changesets — and
 * nothing else. Deprecation lifecycle, cleanup ids, release planning, and
 * ordinary review live where they already live and are not enforced here.
 * Pull-request CI on main does not run it.
 *
 * @input  fixed groups, package versions, parsed Changesets, latest stable tag
 * @output {declared, latestStable, tier, problems} — problems empty means admissible
 * @position scripts/ — consumed by release-branch tooling under scripts/release
 */

const STABLE_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const STABLE_TAG = /^v(\d+\.\d+\.\d+)$/;

/**
 * Is this Changeset incompatible?
 *
 * The `[breaking]` category is the authoring vocabulary (FR7); a declared
 * `minor` is the incompatible tier itself while packages are 0.x.
 * `check-changesets.mjs` already requires the two to agree, so reading either
 * alone as incompatible is the fail-closed direction.
 *
 * @param {{category: string|null, releases: Record<string,string>}} entry
 * @returns {boolean}
 */
export function isIncompatible(entry) {
  if (entry.category === 'breaking') return true;
  return Object.values(entry.releases || {}).some(bump => bump === 'minor');
}

/** The version a minor from `base` would carry. */
export function minorSuccessor(base) {
  const m = STABLE_VERSION.exec(base || '');
  return m ? `${Number(m[1])}.${Number(m[2]) + 1}.0` : null;
}

/** The version a patch from `base` would carry. */
export function patchSuccessor(base) {
  const m = STABLE_VERSION.exec(base || '');
  return m ? `${Number(m[1])}.${Number(m[2])}.${Number(m[3]) + 1}` : null;
}

/**
 * Order two MAJOR.MINOR.PATCH versions.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} negative, zero, or positive
 */
export function compareVersions(a, b) {
  const pa = STABLE_VERSION.exec(a);
  const pb = STABLE_VERSION.exec(b);
  if (!pa || !pb) throw new Error(`cannot compare "${a}" with "${b}"`);
  for (let i = 1; i <= 3; i += 1) {
    const delta = Number(pa[i]) - Number(pb[i]);
    if (delta !== 0) return delta;
  }
  return 0;
}

/**
 * The newest stable release among `vX.Y.Z` tags. Prerelease and canary tags
 * are publication metadata and never a release base.
 *
 * @param {string[]} tags
 * @returns {string|null}
 */
export function latestStableVersion(tags) {
  const versions = (tags || [])
    .map(tag => STABLE_TAG.exec(tag.trim())?.[1])
    .filter(Boolean);
  if (versions.length === 0) return null;
  return versions.sort(compareVersions).at(-1);
}

/**
 * The version main declares for the fixed group. The group publishes as one
 * version, so members that disagree declare nothing, and a prerelease or
 * canary identifier is never a declared release version.
 *
 * @param {string[][]} fixedGroups
 * @param {Map<string,string>} versionByName
 * @returns {{declared: string|null, problems: string[]}}
 */
export function declaredVersion(fixedGroups, versionByName) {
  const problems = [];
  const seen = new Map();

  for (const group of fixedGroups || []) {
    for (const name of group || []) {
      const version = versionByName.get(name);
      if (version === undefined) continue;
      if (!STABLE_VERSION.test(version)) {
        problems.push(
          `${name}: version "${version}" is not MAJOR.MINOR.PATCH. A prerelease or canary identifier is never a declared release version.`,
        );
        continue;
      }
      if (!seen.has(version)) seen.set(version, []);
      seen.get(version).push(name);
    }
  }

  if (seen.size > 1) {
    const spread = [...seen.entries()]
      .sort((a, b) => compareVersions(a[0], b[0]))
      .map(([version, names]) => `${version} (${names.join(', ')})`)
      .join('; ');
    problems.push(
      `the fixed package group does not declare one version: ${spread}. The group releases together, so it must carry one version.`,
    );
  }
  if (seen.size === 0 && problems.length === 0) {
    problems.push('the fixed package group declares no version.');
  }

  if (problems.length) return {declared: null, problems};
  return {declared: [...seen.keys()][0], problems};
}

/**
 * FR47/FR49 — which tier the declared version is.
 *
 * @param {object} input
 * @param {string|null} input.declared
 * @param {string|null} input.latestStable
 * @returns {{tier: 'patch'|'minor'|null, problems: string[]}}
 */
export function releaseTier({declared, latestStable}) {
  if (!declared) return {tier: null, problems: []};
  if (!latestStable) {
    return {
      tier: null,
      problems: [
        `no stable vX.Y.Z release tag is available, so the declared ${declared} cannot be placed in a tier.`,
      ],
    };
  }
  if (declared === patchSuccessor(latestStable)) {
    return {tier: 'patch', problems: []};
  }
  if (declared === minorSuccessor(latestStable)) {
    return {tier: 'minor', problems: []};
  }
  const problem =
    compareVersions(declared, latestStable) <= 0
      ? `main declares ${declared}, which is not newer than the latest stable release ${latestStable}. A release owner bumps main to the next planned version (${patchSuccessor(latestStable)} or ${minorSuccessor(latestStable)}) before the cut.`
      : `main declares ${declared}, but the latest stable release is ${latestStable}; the next release is ${patchSuccessor(latestStable)} or ${minorSuccessor(latestStable)}.`;
  return {tier: null, problems: [problem]};
}

/**
 * FR48/FR50 — the refusal. Names the declared release and both ways forward,
 * and names no particular version, surface, or contributor as a special case:
 * every value is read from the tree being checked.
 *
 * @param {string} file
 * @param {string} declared
 * @param {string} latestStable
 * @returns {string}
 */
function refuse(file, declared, latestStable) {
  const minor = minorSuccessor(latestStable);
  return (
    `${file}: this entry is incompatible, and this release is ${declared} — a patch of ${latestStable}.\n` +
    `      Incompatible work ships only in a minor release.\n` +
    `      Either keep the release patch-compatible: leave the released surface working\n` +
    `      and deprecate it instead (AST-017 FR28) — ship the replacement, keep old usage\n` +
    `      equivalent, and let the removal ship in a minor release.\n` +
    `      Or plan the minor (AST-017 FR47): a release owner bumps main's fixed-group\n` +
    `      version to ${minor} before the next cut.`
  );
}

/**
 * FR46-FR50 — decide what this release admits.
 *
 * @param {object} input
 * @param {string[][]} input.fixedGroups
 * @param {Map<string,string>} input.versionByName
 * @param {Array<{file: string, category: string|null, releases: Record<string,string>}>} input.entries
 * @param {string|null} input.latestStable  newest stable release version
 * @returns {{declared: string|null, latestStable: string|null, tier: 'patch'|'minor'|null, problems: string[]}}
 */
export function checkAdmission({
  fixedGroups,
  versionByName,
  entries,
  latestStable,
}) {
  const {declared, problems} = declaredVersion(fixedGroups, versionByName);
  const tier = releaseTier({declared, latestStable});
  problems.push(...tier.problems);

  if (tier.tier === 'patch') {
    for (const entry of (entries || []).filter(isIncompatible)) {
      problems.push(refuse(entry.file, declared, latestStable));
    }
  }

  return {declared, latestStable, tier: tier.tier, problems};
}
