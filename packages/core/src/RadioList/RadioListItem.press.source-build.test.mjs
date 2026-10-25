// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RadioListItem.press.source-build.test.mjs
 * @input Uses Babel, the StyleX plugin as the package stylesheet compiles it,
 *   and the RadioListItem source
 * @output Verifies the shipped mouse press reaches the radio circle through an
 *   inherited custom property, with no `:has()` ancestor scan
 * @position Regression test for the compiled CSS of the RadioListItem module
 *
 * The circle's pressed layer once read the row through
 * `.layer:where(.row:active:not(:has(...)) *)`. That shape makes the browser
 * restyle everything under the row on every DOM change. The row now declares
 * the press's paint under a `:has()` on itself, and the layer reads it.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {transformAsync} from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import {describe, expect, it} from 'vitest';
import stylexResolution from '../../../../scripts/stylex-module-resolution.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function compiledCss(fileName) {
  const file = path.join(__dirname, fileName);
  const result = await transformAsync(await fs.readFile(file, 'utf8'), {
    babelrc: false,
    configFile: false,
    filename: file,
    presets: [
      ['@babel/preset-typescript', {isTSX: true, allExtensions: true}],
      ['@babel/preset-react', {runtime: 'automatic'}],
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

/** Every selector in `css`, one per rule. */
function selectorsOf(css) {
  return [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(match => match[1].trim());
}

describe('the shipped RadioListItem mouse press', () => {
  it('ships no :has() followed by a descendant *', async () => {
    const selectors = selectorsOf(await compiledCss('RadioListItem.tsx'));
    expect(
      selectors.filter(selector => /:has\([^{]*\)[^{,]* \*/.test(selector)),
    ).toEqual([]);
  });

  it('keeps the nested-control exclusion on the row itself', async () => {
    const css = await compiledCss('RadioListItem.tsx');
    const press = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(match =>
      match[2].includes('--_radio-row-press:'),
    );
    expect(press.length).toBeGreaterThan(0);
    for (const [, selector] of press) {
      expect(selector).toMatch(/:active:not\(:has\(a:active/);
      expect(selector).not.toMatch(/ \*/);
    }
  });
});
