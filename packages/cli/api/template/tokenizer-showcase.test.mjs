// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract test for the Tokenizer showcase block.
 * @input The shipped TokenizerShowcase block source.
 * @output Guards the block's search source: typing in the showcase must list
 *   matching tags rather than an empty menu.
 * @position CLI template regression coverage; runs in the node test project.
 *   The block is the hero example of the Tokenizer docs page. Like the other
 *   template contract tests here it reads the block's source instead of
 *   importing it, so it needs no built `@astryxdesign/core`.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const sourcePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/templates/blocks/components/Tokenizer/TokenizerShowcase.tsx',
);
const source = fs.readFileSync(sourcePath, 'utf8');

// Evaluate the block's tag list and search source on their own, with the
// type annotations removed, so the test exercises the shipped logic.
function loadSearchSource() {
  const tags = source.match(/const tags[^=]*=\s*(\[[\s\S]*?\n\]);/)?.[1];
  const searchSource = source.match(
    /const source[^=]*=\s*(\{[\s\S]*?\n\});/,
  )?.[1];
  if (tags == null || searchSource == null) {
    throw new Error('TokenizerShowcase no longer declares `tags` and `source`');
  }
  const untyped = searchSource.replace(/\((\w+):\s*string\)/g, '($1)');
  return new Function(`const tags = ${tags}; return ${untyped};`)();
}

describe('Tokenizer showcase block', () => {
  it('lists the tags that match a typed query, ignoring case', async () => {
    const {search, bootstrap} = loadSearchSource();
    const labels = async query => (await search(query)).map(tag => tag.label);
    expect(await labels('mar')).toEqual(['Marketing']);
    expect(await labels('A')).toEqual(['Marketing', 'Research', 'Sales']);
    expect((await bootstrap()).length).toBeGreaterThan(0);
  });
});
