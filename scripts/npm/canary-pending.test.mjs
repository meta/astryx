// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which canary packages main's tip still needs
 * (scripts/npm/canary-pending.mjs).
 */

import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {canaryPackages, pendingPackages} from './canary-pending.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');

describe('canaryPackages', () => {
  it('lists public packages and private canary-only ones, never other private packages', () => {
    const packages = canaryPackages(ROOT);
    const byName = new Map(packages.map(pkg => [pkg.name, pkg]));

    expect(byName.get('@astryxdesign/core')).toEqual({
      dir: 'packages/core',
      name: '@astryxdesign/core',
      privateCanary: false,
    });
    expect(byName.get('@astryxdesign/theme-neutral')?.dir).toBe(
      'packages/themes/neutral',
    );
    expect(byName.get('@astryxdesign/vega')?.privateCanary).toBe(true);
    expect(byName.has('@astryxdesign/theme-probe')).toBe(false);
  });
});

describe('pendingPackages', () => {
  const packages = [
    {name: 'core', privateCanary: false},
    {name: 'vega', privateCanary: true},
  ];
  const run = ({published, exists}) =>
    pendingPackages({
      packages,
      version: '1.0.0-canary.abc1234',
      isPublished: async name => published[name] ?? false,
      exists: async name => exists[name] ?? true,
    });

  it('is empty when every package has the version', async () => {
    expect(
      await run({published: {core: true, vega: true}, exists: {}}),
    ).toEqual([]);
  });

  it('keeps a package the registry does not have, or cannot answer for', async () => {
    expect(await run({published: {core: true}, exists: {}})).toEqual(['vega']);
    expect(
      await run({published: {core: null, vega: true}, exists: {}}),
    ).toEqual(['core']);
  });

  it('drops a private canary-only package only when its name certainly does not exist', async () => {
    expect(await run({published: {core: true}, exists: {vega: false}})).toEqual(
      [],
    );
    expect(await run({published: {core: true}, exists: {vega: null}})).toEqual([
      'vega',
    ]);
  });

  it('never drops a public package for a missing name', async () => {
    expect(await run({published: {vega: true}, exists: {core: false}})).toEqual(
      ['core'],
    );
  });
});
