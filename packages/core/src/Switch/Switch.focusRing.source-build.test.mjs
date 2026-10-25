// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Switch.focusRing.source-build.test.mjs
 * @input Uses Babel, the StyleX plugin as the package stylesheet compiles it,
 *   and the Switch source
 * @output Verifies the shipped focus ring follows the switch's own input
 *   through a sibling relation, with no `:has()` ancestor scan
 * @position Regression test for the compiled CSS of the Switch module
 *
 * The ring's condition once read `:has(:focus-visible)` on an ancestor of the
 * track (`.track:where(.scope:has(:focus-visible) *)`). That shape makes the
 * browser restyle everything under the ancestor on every DOM change. The
 * track's preceding sibling is the focusable input, so the ring reads that
 * input directly.
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

describe('the shipped Switch focus ring', () => {
  it('reads the input as the track\u2019s preceding sibling, never through :has()', async () => {
    const selectors = selectorsOf(await compiledCss('Switch.tsx'));
    const ring = selectors.filter(selector =>
      selector.includes(':focus-visible'),
    );
    expect(ring.length).toBeGreaterThan(0);
    for (const selector of ring) {
      expect(selector).toMatch(/:focus-visible ~ \*/);
      expect(selector).not.toContain(':has(');
    }
  });

  it('ships no :has() followed by a descendant *', async () => {
    const selectors = selectorsOf(await compiledCss('Switch.tsx'));
    expect(
      selectors.filter(selector => /:has\([^{]*\)[^{,]* \*/.test(selector)),
    ).toEqual([]);
  });
});
