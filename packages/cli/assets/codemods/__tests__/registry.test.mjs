// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, test} from 'vitest';
import {versions, getTransformsBetween} from '../registry.mjs';

describe('registry', () => {
  describe('versions', () => {
    test('are sorted in ascending semver order across digit boundaries', () => {
      expect(versions).toEqual([
        '0.0.2',
        '0.0.6',
        '0.0.7',
        '0.0.8',
        '0.0.10',
        '0.0.12',
        '0.0.13',
        '0.0.14',
        '0.0.15',
        '0.1.0',
        '0.1.2',
        '0.1.3',
        '0.1.5',
        '0.1.7',
        '0.1.8',
        '0.2.0',
        '0.2.1',
        '0.3.0',
        '0.4.0',
        '0.5.0',
        '0.6.0',
        '0.6.4',
        '0.6.7',
        '0.7.0',
        '0.7.2',
        '0.7.5',
      ]);
    });
  });

  describe('getTransformsBetween', () => {
    test('returns v0.0.10 transforms for range 0.0.9 to 0.0.10', async () => {
      const results = await getTransformsBetween('0.0.9', '0.0.10');
      expect(results.map(r => r.version)).toEqual(['0.0.10']);
    });

    test('returns v0.0.6, v0.0.7, v0.0.8 for range 0.0.2 to 0.0.8', async () => {
      const results = await getTransformsBetween('0.0.2', '0.0.8');
      expect(results.map(r => r.version)).toEqual(['0.0.6', '0.0.7', '0.0.8']);
    });

    test('returns empty array when from equals to', async () => {
      const results = await getTransformsBetween('0.0.6', '0.0.6');
      expect(results).toEqual([]);
    });

    test('returns empty array when from is greater than to', async () => {
      const results = await getTransformsBetween('0.0.8', '0.0.2');
      expect(results).toEqual([]);
    });

    test('handles prerelease suffixes in --to (canary versions)', async () => {
      const results = await getTransformsBetween(
        '0.0.12',
        '0.0.13-canary.21d98fa',
      );
      expect(results.map(r => r.version)).toEqual(['0.0.13']);
    });

    test('handles prerelease suffixes in --from', async () => {
      const results = await getTransformsBetween(
        '0.0.12-canary.abc1234',
        '0.0.13',
      );
      expect(results.map(r => r.version)).toEqual(['0.0.13']);
    });
  });
});
