// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated test that the discovery's case index is built once per
 * operation. It runs against the real @astryxdesign/core registry: one
 * `component` call (api/component/component.mjs), the CLI's list view and the
 * XLE registry. It counts the index's builds. A counting wrapper replaces the
 * listing cache's `oncePerListing`, so the test runs in a file of its own.
 */

import {describe, it, expect, vi} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {component} from './component.mjs';
import {findComponentSource} from '../../foundation/discovery/component-discovery.mjs';
import {buildRegistry} from '../../foundation/xle/registry.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

const builds = vi.hoisted(() => ({count: 0}));

vi.mock('../../foundation/fs/listing-cache.mjs', async importOriginal => {
  /** @type {typeof import('../../foundation/fs/listing-cache.mjs')} */
  const actual = await importOriginal();
  return {
    ...actual,
    /** @type {typeof actual.oncePerListing} */
    oncePerListing: (key, compute) =>
      actual.oncePerListing(key, () => {
        if (key.startsWith('case-stems')) builds.count += 1;
        return compute();
      }),
  };
});

// api/component/ -> up 4 = repo root (has packages/core, which findCoreDir walks to).
const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

describe('one component call', () => {
  it('builds the case index once for a batch of names', async () => {
    builds.count = 0;
    await component(['Button', 'tab', 'Tokenizer'], {cwd: REPO});
    expect(builds.count).toBe(1);
  });

  it('builds no case index for a lookup that finds no file', () => {
    builds.count = 0;
    expect(
      findComponentSource(path.join(REPO, 'packages/core'), 'NoSuchName'),
    ).toBeNull();
    expect(builds.count).toBe(0);
  });

  it('builds the case index a fixed number of times for the list view, however many rows it prints', async () => {
    builds.count = 0;
    const {status} = await runCli(['component', '--list'], {cwd: REPO});
    expect(status).toBe(0);
    // One for the list's own read, one for its text view's import column.
    expect(builds.count).toBeLessThanOrEqual(2);
  });

  it('builds the case index once for the XLE registry', async () => {
    builds.count = 0;
    // Nothing above builds the registry, so this call reads it, not the
    // module's cache.
    await buildRegistry({cwd: REPO});
    expect(builds.count).toBe(1);
  });
});
