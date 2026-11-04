// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resolution-compat.test.mjs
 * @input The names recorded in __fixtures__/resolutions/, resolved against the
 *   real @astryxdesign/core
 * @output Tests that each recorded name opens its recorded entry
 * @position spec:AST-083 FR7's guard over the names that resolve through a
 *   fallback: a component's name in another case, and a module's name. Each
 *   line holds the name, the entry and doc it opens, and its `--source` file.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {withListingCache} from '../../foundation/fs/listing-cache.mjs';
import {resolveCoreSourcePath, resolveUnscopedDoc} from './_adapter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const CORE = path.join(REPO, 'packages', 'core');
const SRC = path.join(CORE, 'src');
const RECORDED = path.join(HERE, '__fixtures__', 'resolutions');
// Each file holds a range of names. A case spelling goes through the
// component matcher, which reads the catalog again for each name. A range
// stays small enough for the default timeout on a busy machine.
const RANGES = fs
  .readdirSync(RECORDED)
  .filter(file => file.endsWith('.txt'))
  .sort();

/**
 * @param {string | null} file
 * @returns {string}
 */
function relative(file) {
  return file == null ? '-' : path.relative(SRC, file);
}

/**
 * @param {string} name
 * @returns {Promise<string>}
 */
async function resolution(name) {
  let entry;
  try {
    const found = await resolveUnscopedDoc(name, {
      coreDir: CORE,
      cwd: REPO,
      name,
    });
    entry = `${found.resolvedName} ${relative(found.readmePath)}`;
  } catch (error) {
    entry = `${/** @type {{code?: string}} */ (error).code} -`;
  }
  return `${name} ${entry} ${relative(resolveCoreSourcePath(CORE, name))}`;
}

describe('names that resolve through a fallback (spec:AST-083 FR7)', () => {
  it.each(RANGES)(
    '%s: each name keeps opening its recorded entry',
    async range => {
      const file = path.join(RECORDED, range);
      const names = fs
        .readFileSync(file, 'utf8')
        .trim()
        .split('\n')
        .map(line => line.split(' ')[0]);
      // One listing of each folder serves every lookup.
      const lines = await withListingCache(async () => {
        const resolved = [];
        for (const name of names) resolved.push(await resolution(name));
        return resolved;
      });
      await expect(`${lines.join('\n')}\n`).toMatchFileSnapshot(file);
    },
  );
});
