// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated test that one hook call reads each folder once. It runs
 * against the real @astryxdesign/core hooks: one compact list, which finds
 * and loads every hook's doc. A counting wrapper replaces `fs.readdirSync`,
 * so the test runs in a file of its own.
 */

import {describe, it, expect, vi} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hook} from './hook.mjs';

const reads = vi.hoisted(() => ({byFolder: new Map()}));

vi.mock('node:fs', async importOriginal => {
  /** @type {typeof import('node:fs')} */
  const actual = await importOriginal();
  /** @type {typeof actual.readdirSync} */
  const readdirSync = /** @type {any} */ (
    (/** @type {any} */ folder, /** @type {any} */ options) => {
      const key = String(folder);
      reads.byFolder.set(key, (reads.byFolder.get(key) ?? 0) + 1);
      return actual.readdirSync(folder, options);
    }
  );
  return {...actual, readdirSync, default: {...actual, readdirSync}};
});

// api/hook/ -> up 4 = repo root (has packages/core, which findCoreDir walks to).
const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

describe('one hook call', () => {
  it('reads each folder once for the compact list of every hook', async () => {
    reads.byFolder.clear();
    const result = await hook(undefined, {
      cwd: REPO,
      list: true,
      detail: 'compact',
    });
    expect(result.type).toBe('hook.list');
    // The count sees the call's reads, so a list of no repeats means something.
    expect(reads.byFolder.size).toBeGreaterThan(0);
    const repeated = [...reads.byFolder].filter(([, count]) => count > 1);
    expect(repeated).toEqual([]);
  });
});
