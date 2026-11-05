// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Dialog.source-build.test.mjs
 * @input Uses Babel, the core StyleX build config, and Dialog source
 * @output Verifies the dialog border reset survives compilation
 * @position Regression test for the shipped Dialog stylesheet
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {transformAsync} from '@babel/core';
import {describe, expect, it} from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '../..');
const DIALOG_SOURCE = path.join(__dirname, 'Dialog.tsx');

async function compileDialogRules() {
  const source = await fs.readFile(DIALOG_SOURCE, 'utf8');
  const result = await transformAsync(source, {
    babelrc: false,
    configFile: path.join(CORE_ROOT, 'babel.config.json'),
    filename: DIALOG_SOURCE,
  });
  return (result?.metadata?.stylex ?? []).map(([, rule]) => rule.ltr);
}

describe('Dialog border stylesheet', () => {
  it('emits the border reset that hides the UA <dialog> frame', async () => {
    const rules = await compileDialogRules();

    // StyleX's default property-specificity mode silently drops the `border`
    // shorthand, so the reset must be longhands to reach the shipped CSS.
    // Without it, a consumer that does not load reset.css sees the UA
    // `dialog { border: solid }` frame.
    expect(rules).toContainEqual(expect.stringMatching(/\{border-width:0\}$/));
    expect(rules).toContainEqual(
      expect.stringMatching(/\{border-style:none\}$/),
    );
  });
});
