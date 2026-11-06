// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file focusOwner.source-build.test.mjs
 * @input Uses Babel, the core StyleX build config, the StyleX rule processor,
 *   and privateAttributes/focusOwner.stylex.ts
 * @output Verifies the shared focus-owner ring compiles to a ring on the
 *   wrapper itself, keyed to its marked control's `:focus-visible`, and never
 *   to a rule that reaches every descendant (`:has(...) *`)
 * @position Regression test for the focus-owner wrapper ring
 *   (`architecture:interaction-modality` INV3)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {transformAsync} from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import {describe, expect, it} from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');
const CORE_ROOT = path.resolve(SRC, '..');

async function compile(relative) {
  const filename = path.join(SRC, relative);
  const result = await transformAsync(await fs.readFile(filename, 'utf8'), {
    babelrc: false,
    configFile: path.join(CORE_ROOT, 'babel.config.json'),
    filename,
  });
  return stylexBabelPlugin.processStylexRules(
    result?.metadata?.stylex ?? [],
    false,
  );
}

describe('focus-owner wrapper ring', () => {
  it('rings the wrapper for its own marked control only', async () => {
    const css = await compile('privateAttributes/focusOwner.stylex.ts');
    const ringRules = css
      .split('}')
      .filter(rule => rule.includes('var(--focus-outline-'));
    expect(ringRules.length).toBeGreaterThan(0);
    for (const rule of ringRules) {
      // On the wrapper, while its marked control shows keyboard focus.
      expect(rule).toMatch(/:has\(> \[data-astryx-focus-owner\]:focus-visible/);
      // Never every descendant.
      expect(rule).not.toMatch(/:has\([^{]*\)\)?\s+\*/);
    }
  });
});
