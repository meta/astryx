// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Unit tests for the Node.js version preflight gate (`node-version.mjs`).
 *
 * The CLI requires Node >=22.13.0 because dependencies import `styleText` from
 * `node:util`, which only exists from that version onward. These tests lock in
 * the parsing and comparison logic that decides whether the running runtime is
 * supported, so the entry-point guard reliably rejects old Node and accepts new
 * Node across the major.minor.patch boundary.
 */

import {describe, it, expect} from 'vitest';
import {
  MIN_NODE_VERSION,
  parseNodeVersion,
  isNodeVersionSupported,
  unsupportedNodeMessage,
} from './node-version.mjs';

describe('parseNodeVersion', () => {
  it('parses a plain semver string', () => {
    expect(parseNodeVersion('22.14.1')).toEqual({
      major: 22,
      minor: 14,
      patch: 1,
    });
  });

  it('strips a leading v', () => {
    expect(parseNodeVersion('v20.10.0')).toEqual({
      major: 20,
      minor: 10,
      patch: 0,
    });
  });

  it('ignores a prerelease/build suffix on the patch segment', () => {
    expect(parseNodeVersion('16.20.2-nightly')).toEqual({
      major: 16,
      minor: 20,
      patch: 2,
    });
  });

  it('defaults missing segments to 0', () => {
    expect(parseNodeVersion('24')).toEqual({major: 24, minor: 0, patch: 0});
  });
});

describe('isNodeVersionSupported', () => {
  it('rejects clearly old majors', () => {
    expect(isNodeVersionSupported('16.20.2')).toBe(false);
    expect(isNodeVersionSupported('20.10.0')).toBe(false);
  });

  it('rejects the same major but an older minor', () => {
    expect(isNodeVersionSupported('22.12.0')).toBe(false);
  });

  it('rejects the same major but an older minor regardless of patch', () => {
    expect(isNodeVersionSupported('22.12.99')).toBe(false);
  });

  it('accepts exactly the minimum version', () => {
    expect(isNodeVersionSupported('22.13.0')).toBe(true);
  });

  it('accepts a newer patch within the minimum minor', () => {
    expect(isNodeVersionSupported('22.13.1')).toBe(true);
  });

  it('accepts a newer minor', () => {
    expect(isNodeVersionSupported('22.14.1')).toBe(true);
  });

  it('accepts a newer major', () => {
    expect(isNodeVersionSupported('24.1.0')).toBe(true);
  });

  it('handles a v-prefixed running version', () => {
    expect(isNodeVersionSupported('v22.13.0')).toBe(true);
    expect(isNodeVersionSupported('v18.0.0')).toBe(false);
  });

  it('uses MIN_NODE_VERSION (22.13.0) as the default threshold', () => {
    expect(MIN_NODE_VERSION).toBe('22.13.0');
    expect(isNodeVersionSupported(MIN_NODE_VERSION)).toBe(true);
  });
});

describe('unsupportedNodeMessage', () => {
  it('names both the required minimum and the running version', () => {
    const msg = unsupportedNodeMessage('16.20.2');
    expect(msg).toContain('>=22.13.0');
    expect(msg).toContain('v16.20.2');
    expect(msg).toContain('upgrade Node');
  });

  it('normalizes a v-prefixed running version to a single v', () => {
    expect(unsupportedNodeMessage('v20.10.0')).toContain('v20.10.0');
  });
});
