// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file labelGap.source-build.test.mjs
 * @input Uses Babel and the StyleX plugin as the package stylesheet compiles
 *   it, and the CheckboxInput, Switch and FieldStatus sources
 * @output Verifies the room between the box (or the switch) and its label is
 *   the row's gap read from the field's derived variable, falling back to
 *   --spacing-2, and that the status message's padding does not read it
 * @position Regression test for the compiled CSS of the label gap
 *
 * A theme writes `gap` on the `checkbox-input` or `switch-field` target; the
 * compiler hands it to the row as a private variable (derivedVarRegistry),
 * so the status box below the row keeps its own spacing.
 */

import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {transformAsync} from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import {describe, expect, it} from 'vitest';
import stylexResolution from '../../../../scripts/stylex-module-resolution.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** @param {string} fileName relative to this folder */
async function compiledCss(fileName) {
  const file = path.join(__dirname, fileName);
  const result = await transformAsync(await fs.readFile(file, 'utf8'), {
    babelrc: false,
    configFile: false,
    filename: file,
    presets: [
      [
        require.resolve('@babel/preset-typescript'),
        {isTSX: true, allExtensions: true},
      ],
      [require.resolve('@babel/preset-react'), {runtime: 'automatic'}],
    ],
    plugins: [
      [
        stylexBabelPlugin,
        {
          dev: false,
          runtimeInjection: false,
          genConditionalClasses: true,
          treeshakeCompensation: true,
          unstable_moduleResolution: stylexResolution.stylexModuleResolution,
        },
      ],
    ],
  });
  return stylexBabelPlugin.processStylexRules(
    result?.metadata?.stylex ?? [],
    false,
  );
}

/** Every value `prop` takes in `css`. @param {string} css @param {string} prop */
const values = (css, prop) =>
  [...css.matchAll(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;}]+)`, 'g'))].map(
    m => m[1].trim(),
  );

describe('the room between a control and its label', () => {
  it.each([
    ['CheckboxInput.tsx', '--_checkbox-input-gap'],
    ['../Switch/Switch.tsx', '--_switch-field-gap'],
  ])('%s: the row gap reads %s, else --spacing-2', async (file, v) => {
    const gaps = values(await compiledCss(file), 'gap');
    expect(gaps).toContain(`var(${v},var(--spacing-2))`);
    // A hidden label keeps no gap.
    expect(gaps).toContain('0');
  });

  it('leaves the status message padding on --spacing-2', async () => {
    const css = await compiledCss('../FieldStatus/FieldStatus.tsx');
    expect(css).not.toMatch(/--_checkbox-input-gap|--_switch-field-gap/);
  });
});
