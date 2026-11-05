// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListItem.source-build.test.mjs
 * @input Uses Babel, the core StyleX build config, and ListItem source
 * @output Verifies the divider reset for the last item survives compilation
 * @position Regression test for the shipped ListItem stylesheet
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {transformAsync} from '@babel/core';
import {describe, expect, it} from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '../..');
const LIST_ITEM_SOURCE = path.join(__dirname, 'ListItem.tsx');

async function compileListItemRules() {
  const source = await fs.readFile(LIST_ITEM_SOURCE, 'utf8');
  const result = await transformAsync(source, {
    babelrc: false,
    configFile: path.join(CORE_ROOT, 'babel.config.json'),
    filename: LIST_ITEM_SOURCE,
  });
  return (result?.metadata?.stylex ?? []).map(([, rule]) => rule.ltr);
}

describe('ListItem divider stylesheet', () => {
  it('emits a :last-child rule that removes the divider after the last item', async () => {
    const rules = await compileListItemRules();

    // The divider is the item's block-end border. StyleX's default
    // property-specificity mode silently drops a `borderBlockEnd` shorthand,
    // so the last-item reset must be a longhand to reach the shipped CSS.
    expect(rules).toContainEqual(
      expect.stringMatching(/:last-child\{border-bottom-width:0\}$/),
    );
  });
});
