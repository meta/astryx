// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerViewportInset.source-build.test.mjs
 * @input Uses Babel, the core StyleX build config, the StyleX rule processor,
 *   and the sources that cap or inset anchored layers
 * @output Verifies the shipped stylesheet carries the dynamic-viewport,
 *   safe-area gutter and caps (spec:AST-059 FR1–FR3), not only the fallbacks
 * @position Regression test for the compiled layer viewport inset
 *
 * `stylex.firstThatWorks(a, b)` turns two `var()` arguments into one nested
 * `var(a, b)`. A `defineConsts` reference compiles to such a `var()`, and the
 * rule processor inlines a constant only where its `var()` stands alone, so a
 * pair of bare constant references shipped as `var(--<hash>, <fallback>)`
 * with `--<hash>` defined nowhere: every engine took the fallback.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {transformAsync} from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import {describe, expect, it} from 'vitest';
import {LAYER_LIFT_PROPERTY} from './layerSlideRules';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');
const CORE_ROOT = path.resolve(SRC, '..');

const SOURCES = [
  'Layer/layerViewportInset.stylex.ts',
  'Layer/useLayer.tsx',
  'Popover/Popover.tsx',
  'DropdownMenu/DropdownMenu.tsx',
  'DropdownMenu/DropdownMenuSubMenu.tsx',
];

async function compileStylesheet() {
  const rules = [];
  for (const relative of SOURCES) {
    const filename = path.join(SRC, relative);
    const result = await transformAsync(await fs.readFile(filename, 'utf8'), {
      babelrc: false,
      configFile: path.join(CORE_ROOT, 'babel.config.json'),
      filename,
    });
    rules.push(...(result?.metadata?.stylex ?? []));
  }
  return stylexBabelPlugin.processStylexRules(rules, false);
}

/** Every declaration of `property` in the compiled sheet. */
function declarations(css, property) {
  return [...css.matchAll(new RegExp(`[{;]${property}:([^;}]+)`, 'g'))].map(
    match => match[1],
  );
}

describe('layer viewport inset stylesheet (spec:AST-059)', () => {
  it('leaves no constant reference unresolved behind a fallback', async () => {
    const css = await compileStylesheet();
    const defined = new Set(
      [...css.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]),
    );
    const undefinedReferences = [
      ...css.matchAll(/var\((--x[a-z0-9]+),/g),
    ].flatMap(match => (defined.has(match[1]) ? [] : [match[0]]));
    // Covers the caps and the four alignment-axis gutter margins.
    expect(undefinedReferences).toEqual([]);
  });

  it('caps both axes against the dynamic viewport and the safe-area gutters', async () => {
    const css = await compileStylesheet();
    const blockCaps = declarations(css, 'max-height');
    const inlineCaps = declarations(css, 'max-width');

    expect(blockCaps).toContainEqual(
      expect.stringMatching(
        /^calc\(min\(calc\(100dvb - .*safe-area-inset-top.*var\(--_layer-keyboard-max-block-size, 100dvb\)/,
      ),
    );
    expect(inlineCaps).toContainEqual(
      expect.stringMatching(/^calc\(calc\(100vi - .*safe-area-inset-left/),
    );
    // The older-engine fallbacks still ship, ahead of the preferred value.
    expect(blockCaps).toContainEqual(
      expect.stringMatching(/^calc\(min\(calc\(100vh - /),
    );
    expect(inlineCaps).toContainEqual(
      expect.stringMatching(/^calc\(calc\(100vw - /),
    );
  });

  it('places anchored layers with anchor() insets that read the keyboard lift the runtime writes', async () => {
    const css = await compileStylesheet();
    // StyleX writes the block insets as `top` and `bottom`.
    const readsLift = value =>
      value.includes('anchor(outside)') &&
      value.replace(/\s/g, '').includes(`var(${LAYER_LIFT_PROPERTY},0px)`);
    expect(declarations(css, 'top').some(readsLift)).toBe(true);
    expect(declarations(css, 'bottom').some(readsLift)).toBe(true);
    // The aligned inset holds the resolved gutter, not a constant reference.
    expect(
      declarations(css, 'inset-inline-start').some(value =>
        /^max\(calc\(max\(var\(--spacing-4\), env\(safe-area-inset-left/.test(
          value,
        ),
      ),
    ).toBe(true);
  });
});
