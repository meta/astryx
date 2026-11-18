// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The stable publish order: dependencies before the packages that use
 * them (scripts/npm/publish-order.mjs).
 */

import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {publishOrder} from './publish-order.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const pkg = (dir, name, dependsOn = []) => ({dir, name, dependsOn});
const dirs = packages => packages.map(entry => entry.dir);

describe('publishOrder', () => {
  it('puts a package after the packages it depends on, wherever they were listed', () => {
    const order = publishOrder([
      pkg('cli', 'cli', ['core', 'theme']),
      pkg('core', 'core'),
      pkg('theme', 'theme', ['core']),
    ]);
    expect(dirs(order)).toEqual(['core', 'theme', 'cli']);
  });

  it('keeps the given order between packages that do not depend on each other', () => {
    const order = publishOrder([
      pkg('b', 'b'),
      pkg('a', 'a'),
      pkg('c', 'c', ['a']),
    ]);
    expect(dirs(order)).toEqual(['b', 'a', 'c']);
  });

  it('ignores dependencies outside the listed packages', () => {
    const order = publishOrder([pkg('theme', 'theme', ['react', 'lab'])]);
    expect(dirs(order)).toEqual(['theme']);
  });

  it('refuses a dependency cycle instead of guessing an order', () => {
    expect(() =>
      publishOrder([pkg('a', 'a', ['b']), pkg('b', 'b', ['a'])]),
    ).toThrow('dependency cycle among: a, b');
  });

  it("orders this repository's packages so the CLI and the theme come after Core", () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/npm/publish-order.mjs',
        'packages/cli',
        'packages/core',
        'packages/themes/neutral',
      ],
      {cwd: ROOT, encoding: 'utf8'},
    );
    expect(result.status).toBe(0);
    const order = result.stdout.trim().split('\n');
    expect(order).toHaveLength(3);
    expect(order[0]).toBe('packages/core');
    expect(order.slice(1).sort()).toEqual([
      'packages/cli',
      'packages/themes/neutral',
    ]);
  });
});
