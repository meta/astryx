// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RadioListItem.press.source-build.test.mjs
 * @input Uses Babel, the StyleX plugin as the package stylesheet compiles it,
 *   and the RadioListItem source
 * @output Verifies the shipped RadioListItem press scans no ancestor with
 *   `:has()` and keeps no `:active` row press: the press controller marks
 *   the row for every pointer, and a link or a button inside the row takes
 *   its own press there (#8682's boundary)
 * @position Regression test for the compiled CSS of the RadioListItem module
 *
 * The circle's pressed layer once read the row through
 * `.layer:where(.row:active:not(:has(...)) *)`. That shape makes the browser
 * restyle everything under the row on every DOM change. The row then declared
 * a mouse press's paint under a `:has()` on itself, and the layer read it
 * (#8424). A mouse now presses through the press controller, as a finger
 * does (`spec:AST-094` FR11's fine-pointer profile, FR43), and the
 * controller draws the nested-control boundary for every pointer (#8682), so
 * the row ships no `:active` press at all.
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

describe('the shipped RadioListItem press', () => {
  it('ships no :has() followed by a descendant *', async () => {
    const selectors = selectorsOf(await compiledCss('RadioListItem.tsx'));
    expect(
      selectors.filter(selector => /:has\([^{]*\)[^{,]* \*/.test(selector)),
    ).toEqual([]);
  });

  it('ships no `:active` row press: the press controller draws the nested-control boundary', async () => {
    // A link or a button inside the row takes its own press for every
    // pointer in the press controller (#8682), which replaces the row's
    // `:active:not(:has(a:active, button:active, …))` arm (#8424).
    const css = await compiledCss('RadioListItem.tsx');
    expect(css).not.toContain('--_radio-row-press');
    expect(
      selectorsOf(css).filter(selector => /:active:not\(:has\(/.test(selector)),
    ).toEqual([]);
  });
});
