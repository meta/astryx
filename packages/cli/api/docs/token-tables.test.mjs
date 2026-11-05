// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The design tokens are written once. Each category's table lives in its
 * guide under the tokens namespace; a token reference to `tokens` reads that
 * guide, so no flat copy of the tables is listed, searched, or compiled.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {docs} from './docs.mjs';
import {search} from '../search/search.mjs';

const SLOW = 60_000;
const DOCS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/docs',
);

/** Every authored CLI doc file, flat and placed (translation overlays aside). */
function authoredDocFiles() {
  return [DOCS_DIR, path.join(DOCS_DIR, 'tree')].flatMap(dir =>
    fs
      .readdirSync(dir)
      .filter(file => /^[\w-]+\.doc\.mjs$/.test(file))
      .map(file => path.join(dir, file)),
  );
}

describe('the design tokens', () => {
  it('are each written in exactly one doc table', async () => {
    /** @type {Map<string, string[]>} */
    const owners = new Map();
    for (const file of authoredDocFiles()) {
      const {docs: doc} = await import(file);
      for (const section of doc.sections ?? []) {
        for (const block of section.content ?? []) {
          if (block?.type !== 'table') continue;
          for (const row of block.rows) {
            if (!/^--[a-z]/.test(row[0])) continue;
            owners.set(row[0], [
              ...(owners.get(row[0]) ?? []),
              path.relative(DOCS_DIR, file),
            ]);
          }
        }
      }
    }
    expect(owners.size).toBeGreaterThan(200);
    expect([...owners].filter(([, files]) => files.length > 1)).toEqual([]);
  });

  it(
    'are not listed or searched twice',
    async () => {
      const listed = await docs();
      const names = listed.data.map(entry => entry.topic);
      expect(names).not.toContain('token-tables');
      expect(listed.meta.namespaces.map(entry => entry.topic)).toContain(
        'tokens',
      );

      const found = (await search('spacing tokens', {type: 'doc', limit: 50}))
        .data.results;
      const holders = found
        .filter(
          hit =>
            hit.section === 'spacing-tokens' ||
            hit.name === 'tokens/tokens-spacing',
        )
        .map(hit => hit.name);
      expect(new Set(holders)).toEqual(new Set(['tokens/tokens-spacing']));
    },
    SLOW,
  );

  it(
    'still answer a token reference to `tokens`, in every language',
    async () => {
      for (const options of [{}, {dense: true}, {zh: true}]) {
        const read = await docs('color', null, options);
        const text = JSON.stringify(read.data.sections);
        expect(text).not.toContain('[token-ref');
        expect(text).toContain('--color-accent');
      }
      const section = await docs('spacing', 'scale');
      expect(JSON.stringify(section.data)).toContain('--spacing-4');
    },
    SLOW,
  );
});
