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

/**
 * Where `findComponentReadme` found the doc for `name`: in the name's own
 * folder, in a parent folder, as its family's doc, or nowhere.
 * @param {string} name
 * @param {string | null} doc
 * @returns {string}
 */
function matchKind(name, doc) {
  if (doc == null) return 'none';
  const parts = path.relative(path.join(CORE, 'src'), doc).split(path.sep);
  const file = parts.at(-1);
  const isOwn = file === `${name}.doc.mjs` || file === `XDS${name}.doc.mjs`;
  if (parts.length === 2 && parts[0] === name && isOwn) return 'own folder';
  if (parts.length === 3 && parts[1] === name && isOwn) return 'nested';
  if (parts.length === 2 && isOwn) return 'parent folder';
  return 'family doc';
}

describe('findComponentReadme inside an operation', () => {
  it('finds the doc it finds outside one, for a Core name of each kind of match', () => {
    const names = Object.values(discoverComponents(CORE)).flat().sort();
    /** @type {Record<string, (name: string) => string>} */
    const forms = {
      name: name => name,
      lowercase: name => name.toLowerCase(),
      prefixed: name => `XDS${name}`,
    };
    const queries = Object.entries(forms).flatMap(([form, spell]) =>
      names.map(name => ({form, name: spell(name)})),
    );
    queries.push({form: 'absent', name: 'Nope'});
    const inside = withListingCache(() =>
      queries.map(({name}) => findComponentReadme(CORE, name)),
    );
    expect(inside.filter(Boolean).length).toBeGreaterThan(20);
    // Outside an operation every probe reads the disk again, so one query of
    // each form and kind of match stands for the rest there.
    /** @type {Map<string, number>} */
    const firstOfKind = new Map();
    queries.forEach(({form, name}, index) => {
      const kind = `${form}: ${matchKind(name, inside[index])}`;
      if (!firstOfKind.has(kind)) firstOfKind.set(kind, index);
    });
    expect([...firstOfKind.keys()]).toEqual(
      expect.arrayContaining([
        'name: own folder',
        'name: parent folder',
        'name: family doc',
        'lowercase: none',
        'prefixed: none',
        'absent: none',
      ]),
    );
    for (const index of firstOfKind.values()) {
      expect(findComponentReadme(CORE, queries[index].name)).toBe(
        inside[index],
      );
    }
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
