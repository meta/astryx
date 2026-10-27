// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {
  isValidSemver,
  satisfiesRange,
  semverCompare,
  semverGt,
  semverGte,
} from './semver.mjs';

describe('semverCompare', () => {
  it('orders patch versions numerically (not lexicographically)', () => {
    // The bug fix that motivated this util: '0.0.10' < '0.0.9' under
    // string comparison, but '0.0.10' > '0.0.9' under semver.
    expect(semverCompare('0.0.10', '0.0.9')).toBeGreaterThan(0);
    expect(semverCompare('0.0.9', '0.0.10')).toBeLessThan(0);
    expect(semverCompare('0.0.20', '0.0.5')).toBeGreaterThan(0);
  });

  it('returns 0 for equal versions', () => {
    expect(semverCompare('1.2.3', '1.2.3')).toBe(0);
  });

  it('orders by major, then minor, then patch', () => {
    expect(semverCompare('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(semverCompare('1.2.0', '1.1.99')).toBeGreaterThan(0);
  });

  it('strips prerelease tags before comparing', () => {
    expect(semverCompare('0.0.5-beta.1', '0.0.5')).toBe(0);
  });

  it('treats missing components as zero', () => {
    expect(semverCompare('1.0', '1.0.0')).toBe(0);
  });
});

describe('semverGt / semverGte', () => {
  it('semverGte is true for equal versions', () => {
    expect(semverGte('0.0.5', '0.0.5')).toBe(true);
    expect(semverGt('0.0.5', '0.0.5')).toBe(false);
  });

  it('semverGte handles double-digit patches correctly', () => {
    // The original upgrade-gate bug: string compare said 0.0.9 >= 0.0.10.
    expect(semverGte('0.0.9', '0.0.10')).toBe(false);
    expect(semverGte('0.0.10', '0.0.9')).toBe(true);
  });
});

describe('isValidSemver', () => {
  it('accepts MAJOR.MINOR.PATCH', () => {
    expect(isValidSemver('0.0.5')).toBe(true);
    expect(isValidSemver('1.2.3')).toBe(true);
    expect(isValidSemver('10.20.30')).toBe(true);
  });

  it('accepts prerelease and build metadata', () => {
    expect(isValidSemver('1.0.0-beta.1')).toBe(true);
    expect(isValidSemver('1.0.0+build.5')).toBe(true);
  });

  it('rejects bogus values', () => {
    expect(isValidSemver('bogus')).toBe(false);
    expect(isValidSemver('1.0')).toBe(false);
    expect(isValidSemver('v1.0.0')).toBe(false);
    expect(isValidSemver('')).toBe(false);
    expect(isValidSemver(null)).toBe(false);
    expect(isValidSemver(undefined)).toBe(false);
    expect(isValidSemver(123)).toBe(false);
  });
});

describe('satisfiesRange', () => {
  it('handles caret ranges, including 0.x semantics', () => {
    expect(satisfiesRange('0.19.0', '^0.19.0')).toBe(true);
    expect(satisfiesRange('0.19.2', '^0.19.0')).toBe(true);
    // 0.x caret is locked to the minor — the peer-dep bug that motivated this.
    expect(satisfiesRange('0.10.1', '^0.19.0')).toBe(false);
    expect(satisfiesRange('0.20.0', '^0.19.0')).toBe(false);
    // major > 0 caret allows any minor/patch below the next major.
    expect(satisfiesRange('1.5.0', '^1.2.0')).toBe(true);
    expect(satisfiesRange('2.0.0', '^1.2.0')).toBe(false);
  });

  it('handles comparators and partial versions', () => {
    expect(satisfiesRange('19.0.0', '>=19.0.0')).toBe(true);
    expect(satisfiesRange('20.1.0', '>=19.0.0')).toBe(true);
    expect(satisfiesRange('18.2.0', '>=19.0.0')).toBe(false);
    expect(satisfiesRange('0.10.5', '^0.10')).toBe(true);
    expect(satisfiesRange('0.11.0', '^0.10')).toBe(false);
  });

  it('widens a partial caret target to the parts given', () => {
    expect(satisfiesRange('0.5.0', '^0')).toBe(true);
    expect(satisfiesRange('0.0.3', '^0')).toBe(true);
    expect(satisfiesRange('1.0.0', '^0')).toBe(false);
    expect(satisfiesRange('0.0.3', '^0.0')).toBe(true);
    expect(satisfiesRange('0.1.0', '^0.0')).toBe(false);
    // A full 0.0.x target stays locked to that patch.
    expect(satisfiesRange('0.0.4', '^0.0.3')).toBe(false);
  });

  it('handles hyphen ranges as inclusive bounds', () => {
    expect(satisfiesRange('1.5.0', '1.0.0 - 2.0.0')).toBe(true);
    expect(satisfiesRange('1.0.0', '1.0.0 - 2.0.0')).toBe(true);
    expect(satisfiesRange('2.0.0', '1.0.0 - 2.0.0')).toBe(true);
    expect(satisfiesRange('2.0.1', '1.0.0 - 2.0.0')).toBe(false);
    expect(satisfiesRange('0.9.9', '1.0.0 - 2.0.0')).toBe(false);
    expect(satisfiesRange('3.0.0', '1.0.0 - 2.0.0 || >=3')).toBe(true);
  });

  it('handles exact, tilde, unions, and wildcards', () => {
    expect(satisfiesRange('1.2.3', '1.2.3')).toBe(true);
    expect(satisfiesRange('1.2.4', '1.2.3')).toBe(false);
    expect(satisfiesRange('1.2.9', '~1.2.0')).toBe(true);
    expect(satisfiesRange('1.3.0', '~1.2.0')).toBe(false);
    expect(satisfiesRange('16.14.0', '>=16 <18 || >=19')).toBe(true);
    expect(satisfiesRange('18.0.0', '>=16 <18 || >=19')).toBe(false);
    expect(satisfiesRange('19.0.0', '*')).toBe(true);
  });

  it('never emits a false mismatch on non-semver input or unparseable ranges', () => {
    expect(satisfiesRange('not-a-version', '^0.19.0')).toBe(true);
    expect(satisfiesRange('0.10.1', '')).toBe(true);
    expect(satisfiesRange('0.10.1', 'latest')).toBe(true);
    expect(satisfiesRange('0.10.1', 'workspace:*')).toBe(true);
  });
});
