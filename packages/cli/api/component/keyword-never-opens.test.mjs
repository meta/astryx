// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file keyword-never-opens.test.mjs
 * @input A made-up Core under a repo-local temp dir
 * @output Tests that a bare component lookup opens by a name, never by a
 *   keyword, and that a clear keyword match is the first suggestion
 * @position spec:AST-083 FR7's rule for names that are a keyword
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {withListingCache} from '../../foundation/fs/listing-cache.mjs';
import {REPO_ROOT} from '../../test-utils/repo-root.mjs';
import {resolveUnscopedDoc} from './_adapter.mjs';

/** @type {string} */
let core;

/**
 * Write a made-up Core component: its doc and its source.
 * @param {string} name
 * @param {string[]} keywords
 */
function writeComponent(name, keywords) {
  const dir = path.join(core, 'src', name);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, `${name}.doc.mjs`),
    `export const docs = ${JSON.stringify({name, keywords})};\n`,
  );
  fs.writeFileSync(
    path.join(dir, `${name}.tsx`),
    `export function ${name}() { return null; }\n`,
  );
}

/**
 * What a bare lookup of `typed` gives: the name it opens, or its error code
 * and suggested names.
 * @param {string} typed
 * @returns {Promise<{opens: string} | {code: string, suggested: string[]}>}
 */
async function lookup(typed) {
  return withListingCache(async () => {
    try {
      const found = await resolveUnscopedDoc(typed, {
        coreDir: core,
        cwd: core,
        name: typed,
      });
      return {opens: found.resolvedName};
    } catch (error) {
      const e = /** @type {any} */ (error);
      return {
        code: e.code,
        suggested: (e.suggestions ?? []).map(
          (/** @type {{name: string}} */ s) => s.name,
        ),
      };
    }
  });
}

beforeAll(() => {
  core = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-keyword-never-opens-'));
  fs.writeFileSync(
    path.join(core, 'package.json'),
    JSON.stringify({name: '@astryxdesign/core', version: '0.0.0'}),
  );
  writeComponent('Zorblet', ['quandle', 'wibble flap']);
  writeComponent('Frobnitz', ['snorkel', 'gleep']);
  writeComponent('Glimmer', ['gleep']);
});

afterAll(() => {
  fs.rmSync(core, {recursive: true, force: true});
});

describe('a bare component lookup and keywords (spec:AST-083 FR7)', () => {
  it('opens a component by its exact name, in any case', async () => {
    expect(await lookup('Zorblet')).toEqual({opens: 'Zorblet'});
    expect(await lookup('zorblet')).toEqual({opens: 'Zorblet'});
  });

  it('never opens a component by a keyword only it declares, and suggests it first', async () => {
    for (const typed of ['quandle', 'Quandle', 'snorkel', 'wibble flap']) {
      const found = await lookup(typed);
      expect(found).toMatchObject({code: 'ERR_UNKNOWN_COMPONENT'});
      const {suggested} = /** @type {{suggested: string[]}} */ (found);
      expect(suggested[0]).toBe(typed === 'snorkel' ? 'Frobnitz' : 'Zorblet');
      expect(suggested.length).toBeLessThanOrEqual(3);
    }
  });

  it('suggests every component that declares a shared keyword', async () => {
    const found = await lookup('gleep');
    expect(found).toMatchObject({code: 'ERR_UNKNOWN_COMPONENT'});
    expect(
      [.../** @type {{suggested: string[]}} */ (found).suggested].sort(),
    ).toEqual(['Frobnitz', 'Glimmer']);
  });

  it('keeps a typo of a name on the suggestion path', async () => {
    const found = await lookup('Zorblat');
    expect(found).toMatchObject({code: 'ERR_UNKNOWN_COMPONENT'});
    expect(/** @type {{suggested: string[]}} */ (found).suggested[0]).toBe(
      'Zorblet',
    );
  });
});
