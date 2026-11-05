// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file An integration's own block answers a query that names it, though no
 * learned table lists it: its authored display name is a title search reads,
 * so "rich text editor" finds the rich text package's block first and build
 * offers it, while a variant label that does not name the block (Lab's "Inside
 * a card") captures nothing.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {search} from './search.mjs';
import {build} from '../build/build.mjs';

const SLOW = 60_000;
const packages = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

describe('an integration block found by its display name', () => {
  /** @type {string} */
  let dir;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-integration-block-'));
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'consumer',
        dependencies: {
          '@astryxdesign/core': '*',
          '@astryxdesign/richtext': '*',
          '@astryxdesign/lab': '*',
        },
      }),
    );
    const scope = path.join(dir, 'node_modules', '@astryxdesign');
    fs.mkdirSync(scope, {recursive: true});
    for (const name of ['core', 'richtext', 'lab'])
      fs.symlinkSync(path.join(packages, name), path.join(scope, name), 'dir');
  });
  afterAll(() => fs.rmSync(dir, {recursive: true, force: true}));

  it.each(['rich text editor', 'rich text', 'text editor'])(
    '`%s` ranks the rich text block first among templates',
    async query => {
      const {results} = (await search(query, {cwd: dir, type: 'template'}))
        .data;
      expect(results[0], JSON.stringify(results.slice(0, 3))).toMatchObject({
        name: 'RichTextEditorShowcase',
      });
    },
    SLOW,
  );

  it(
    'a whole display name names the block outright',
    async () => {
      const {results} = (
        await search('rich text editor', {cwd: dir, type: 'template'})
      ).data;
      expect(results[0]).toMatchObject({
        name: 'RichTextEditorShowcase',
        reason: 'exact name',
      });
    },
    SLOW,
  );

  it(
    "a variant label that does not name the block's subject is no title",
    async () => {
      const {results} = (
        await search('table inside a card', {cwd: dir, type: 'template'})
      ).data;
      expect(results[0], JSON.stringify(results.slice(0, 3))).toMatchObject({
        name: 'TableInCard',
      });
      const kit = (await build('a settings form inside a card', {cwd: dir}))
        .data;
      expect(kit.blocks[0]?.name).not.toBe('CommentsInCard');
    },
    SLOW,
  );

  it(
    'build offers the rich text block for a request that names it',
    async () => {
      const kit = (
        await build('a comment box with a rich text editor', {cwd: dir})
      ).data;
      expect(kit.blocks.map(b => b.name)).toContain('RichTextEditorShowcase');
    },
    SLOW,
  );
});
