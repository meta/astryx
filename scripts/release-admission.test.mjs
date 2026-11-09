// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file release-admission.test.mjs
 * Release-version admission (`spec:AST-017` FR46-FR50).
 *
 * Main declares the next version; a release branch admits Changesets against
 * it. No version, package, or surface in these fixtures is a real one — the
 * rule must read the same for any release.
 */

import {describe, it, expect} from 'vitest';
import {
  checkAdmission,
  compareVersions,
  declaredVersion,
  isIncompatible,
  latestStableVersion,
  minorSuccessor,
  patchSuccessor,
  releaseTier,
} from './release-admission.mjs';

const GROUP = ['@scope/a', '@scope/b', '@scope/c'];
const FIXED = [GROUP];

const versions = (v, overrides = {}) =>
  new Map(GROUP.map(name => [name, overrides[name] ?? v]));

const entry = (file, category, releases) => ({file, category, releases});
const compatible = file => entry(file, 'fix', {'@scope/a': 'patch'});
const breaking = file => entry(file, 'breaking', {'@scope/a': 'minor'});

const run = (declared, input = {}) =>
  checkAdmission({
    fixedGroups: FIXED,
    versionByName: versions(declared),
    entries: [],
    latestStable: '1.2.3',
    ...input,
  });

describe('FR47/FR48 — a declared minor admits breaking work at that version', () => {
  it('admits a breaking Changeset when main already declares the minor', () => {
    const result = run('1.3.0', {
      entries: [breaking('remove-thing.md'), compatible('a.md')],
    });
    expect(result).toMatchObject({
      declared: '1.3.0',
      latestStable: '1.2.3',
      tier: 'minor',
      problems: [],
    });
  });

  it('admits every breaking Changeset in a minor, with no per-change record', () => {
    const result = run('1.3.0', {
      entries: [breaking('one.md'), breaking('two.md'), breaking('three.md')],
    });
    expect(result.problems).toEqual([]);
  });

  it('never derives a later version from the pending Changesets', () => {
    // A pre-bumped minor plus a [breaking] entry is still that minor; the
    // Changeset's own `minor` bump is the tier it needs, not a further bump.
    const result = run('1.3.0', {entries: [breaking('b.md')]});
    expect(result.declared).toBe('1.3.0');
    expect(minorSuccessor(result.declared)).toBe('1.4.0');
    expect(result.problems.join('\n')).not.toContain('1.4.0');
  });
});

describe('FR48 — a declared patch refuses incompatible work', () => {
  it('admits compatible work in a patch release', () => {
    const result = run('1.2.4', {
      entries: [compatible('a.md'), compatible('b.md')],
    });
    expect(result).toMatchObject({tier: 'patch', problems: []});
  });

  it('refuses a breaking Changeset in a patch release', () => {
    const result = run('1.2.4', {
      entries: [compatible('a.md'), breaking('b.md')],
    });
    expect(result.tier).toBe('patch');
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatch(/^b\.md: this entry is incompatible/);
  });

  it('reads a minor bump alone as incompatible, failing closed', () => {
    const result = run('1.2.4', {
      entries: [entry('m.md', 'feat', {'@scope/a': 'minor'})],
    });
    expect(result.problems).toHaveLength(1);
  });

  it('admits a deprecation in a patch release', () => {
    const result = run('1.2.4', {
      entries: [entry('dep.md', 'feat', {'@scope/a': 'patch'})],
    });
    expect(result.problems).toEqual([]);
  });

  it('names the declared release and both ways forward', () => {
    const [message] = run('1.2.4', {entries: [breaking('b.md')]}).problems;
    expect(message).toContain('this release is 1.2.4 — a patch of 1.2.3');
    expect(message).toContain('deprecate it instead (AST-017 FR28)');
    expect(message).toContain("bumps main's fixed-group");
    expect(message).toContain('version to 1.3.0 before the next cut');
    expect(message).not.toContain('target.json');
  });
});

describe('FR49 — the declared version fails closed', () => {
  it('refuses a version that is already released', () => {
    const result = run('1.2.3', {entries: [compatible('a.md')]});
    expect(result.tier).toBeNull();
    expect(result.problems[0]).toMatch(
      /declares 1\.2\.3, which is not newer than the latest stable release 1\.2\.3/,
    );
  });

  it('refuses a version that moves backward', () => {
    expect(run('1.2.0').problems[0]).toMatch(/not newer than/);
  });

  it('refuses a version that skips a release', () => {
    expect(run('1.2.5').problems[0]).toMatch(
      /the next release is 1\.2\.4 or 1\.3\.0/,
    );
    expect(run('1.4.0').problems[0]).toMatch(
      /the next release is 1\.2\.4 or 1\.3\.0/,
    );
    expect(run('2.0.0').tier).toBeNull();
  });

  it('refuses when no stable release exists to compare against', () => {
    const result = run('1.3.0', {latestStable: null});
    expect(result.tier).toBeNull();
    expect(result.problems[0]).toMatch(/no stable vX\.Y\.Z release tag/);
  });

  it('refuses a group whose members disagree', () => {
    const result = checkAdmission({
      fixedGroups: FIXED,
      versionByName: versions('1.3.0', {'@scope/c': '1.2.4'}),
      entries: [],
      latestStable: '1.2.3',
    });
    expect(result.declared).toBeNull();
    expect(result.problems[0]).toMatch(/does not declare one version/);
  });

  it('never treats a canary as a declared version', () => {
    const {declared, problems} = declaredVersion(
      FIXED,
      versions('1.3.0-canary.abc1234'),
    );
    expect(declared).toBeNull();
    expect(problems.join('\n')).toMatch(/never a declared release version/);
  });

  it('takes the base from the newest stable tag only', () => {
    expect(
      latestStableVersion([
        'v1.2.3',
        'v1.10.0',
        'v1.9.9',
        'v2.0.0-canary.1',
        'v1.11.0-rc.1',
        'nope',
      ]),
    ).toBe('1.10.0');
    expect(latestStableVersion([])).toBeNull();
  });
});

describe('helpers', () => {
  it('orders versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('0.6.7', '0.7.0')).toBeLessThan(0);
    expect(compareVersions('0.7.0', '0.7.0')).toBe(0);
  });

  it('places a declared version in its tier', () => {
    expect(
      releaseTier({declared: patchSuccessor('0.6.6'), latestStable: '0.6.6'})
        .tier,
    ).toBe('patch');
    expect(
      releaseTier({declared: minorSuccessor('0.6.6'), latestStable: '0.6.6'})
        .tier,
    ).toBe('minor');
  });

  it('classifies incompatibility from category or bump', () => {
    expect(isIncompatible(breaking('x'))).toBe(true);
    expect(isIncompatible(compatible('x'))).toBe(false);
  });
});
