// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Verifies that `findComponentReadme` finds the same doc inside an
 * operation, where it reads each folder's listing once for every name, as
 * outside one, where every probe reads the disk.
 *
 * Runs against the real packages/core source, not mocks.
 */

import {describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {withListingCache} from '../fs/listing-cache.mjs';
import {
  discoverComponents,
  findComponentReadme,
} from './component-discovery.mjs';

// packages/cli/foundation/discovery/ -> up 4 = repo root (has packages/core).
const CORE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../core',
);

describe('findComponentReadme inside an operation', () => {
  it('finds the doc it finds outside one, for a sample of Core names', () => {
    // Every eighth name keeps the probes outside an operation short.
    const names = Object.values(discoverComponents(CORE))
      .flat()
      .sort()
      .filter((_, index) => index % 8 === 0);
    const sample = [
      ...names,
      ...names.map(name => name.toLowerCase()),
      ...names.map(name => `XDS${name}`),
      'Nope',
    ];
    const outside = sample.map(name => findComponentReadme(CORE, name));
    const inside = withListingCache(() =>
      sample.map(name => findComponentReadme(CORE, name)),
    );
    expect(inside.filter(Boolean).length).toBeGreaterThan(20);
    expect(inside).toEqual(outside);
  });

  it('keeps the first folder in listing order when several hold the name', () => {
    const core = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-readme-order-'));
    try {
      for (const folder of ['Alpha', 'Beta', 'Gamma']) {
        const dir = path.join(core, 'src', folder);
        fs.mkdirSync(path.join(dir, 'Card'), {recursive: true});
        fs.writeFileSync(path.join(dir, 'Card', 'Card.doc.mjs'), '');
        fs.writeFileSync(path.join(dir, 'Tile.doc.mjs'), '');
      }
      for (const name of ['Card', 'Tile']) {
        const outside = findComponentReadme(core, name);
        expect(outside).not.toBeNull();
        expect(withListingCache(() => findComponentReadme(core, name))).toBe(
          outside,
        );
      }
    } finally {
      fs.rmSync(core, {recursive: true, force: true});
    }
  });
});
