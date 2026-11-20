// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RadioIndicator.circle.source-build.test.mjs
 * @input Uses Babel and the StyleX plugin as the package stylesheet compiles
 *   it, and the RadioIndicator and RadioListItem sources
 * @output Verifies the radio's circle, its dot and the pressed layer over the
 *   circle are drawn at 50%, never with the --radius-full pill token
 * @position Regression test for the compiled CSS of the radio marks
 *
 * A circle marks a radio; it is no corner. A theme that squares its pills
 * through --radius-full keeps round radios.
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
// Core declares the presets, so they resolve from here, not from the folder
// the tests run in.
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

/** Every border-radius value in `css`. @param {string} css */
const radii = css =>
  [...css.matchAll(/border-radius:\s*([^;}]+)/g)].map(m => m[1].trim());

describe('the radio marks', () => {
  it('draw the circle and the dot at 50%, never with the pill token', async () => {
    const css = await compiledCss('RadioIndicator.tsx');
    expect(radii(css).length).toBeGreaterThanOrEqual(1);
    expect(radii(css).every(v => v === '50%')).toBe(true);
    expect(css).not.toMatch(/radius-full/);
  });

  it('draw the pressed layer over the circle at 50%', async () => {
    const css = await compiledCss('../RadioList/RadioListItem.tsx');
    expect(radii(css)).toContain('50%');
    expect(css).not.toMatch(/radius-full/);
  });
});
