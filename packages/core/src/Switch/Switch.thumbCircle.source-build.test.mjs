// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Switch.thumbCircle.source-build.test.mjs
 * @input Uses Babel and the StyleX plugin as the package stylesheet compiles
 *   it, and the Switch source
 * @output Verifies the switch thumb is drawn at 50%, never with the
 *   --radius-full pill token, while the track keeps the pill token
 * @position Regression test for the compiled CSS of the switch thumb
 *
 * A circle marks the thumb; it is no corner. A theme that squares its pills
 * through --radius-full squares the track and keeps a round thumb.
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

/** The declarations of each rule in `css`, by its selector. @param {string} css */
const rules = css =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({
    selector: m[1].trim(),
    body: m[2],
  }));

describe('the switch thumb', () => {
  it('is drawn at 50%, and the track with the pill token', async () => {
    const css = await compiledCss('Switch.tsx');
    const radii = rules(css)
      .map(r => /border-radius:\s*([^;]+)/.exec(r.body)?.[1]?.trim())
      .filter(Boolean);
    // One 50% radius: the thumb's own (its layers inherit it).
    expect(radii.filter(v => v === '50%')).toHaveLength(1);
    // The track's pill is the token, which a theme may square.
    expect(radii.some(v => /--radius-full/.test(String(v)))).toBe(true);
  });
});
