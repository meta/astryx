// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressPaintPriority.test.ts
 * @input Uses vitest, Babel with the StyleX plugin (the repository's shared
 *   module resolution) and interactionOverlay.stylex.ts
 * @output Checks, in the compiled CSS, that the press paint outranks the
 *   coarse-pointer `:active` reset of the overlay
 * @position Regression test for the cascade order of the press overlay
 *
 * WebKit applies `:active` during a touch. Under a coarse pointer the overlay
 * turns the bare `:active` image off, and the press paint
 * (`[data-astryx-press="on"]`) must still win: its rule has to sit in a
 * higher StyleX priority than the reset. The order is a property of how
 * each key is spelled: an imported `defineConsts` key compiles to a higher
 * priority than the same literal, which put the reset above the paint and
 * erased the touch-down frame.
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import stylexResolution from '../../../../scripts/stylex-module-resolution.cjs';

type Rule = [string, {ltr: string}, number];

// Babel's types are not part of core's typecheck; type the one call used.
const {transformSync} = createRequire(import.meta.url)('@babel/core') as {
  transformSync: (
    code: string,
    options: Record<string, unknown>,
  ) => {metadata?: unknown} | null;
};

function compiledRules(file: string): Rule[] {
  const output = transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file,
    babelrc: false,
    configFile: false,
    parserOpts: {plugins: ['typescript', 'jsx']},
    plugins: [
      [
        '@stylexjs/babel-plugin',
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
  return (output?.metadata as {stylex?: Rule[]}).stylex ?? [];
}

describe('press overlay cascade', () => {
  it('ranks the press paint above the coarse-pointer :active reset', () => {
    const rules = compiledRules(
      path.resolve(__dirname, 'interactionOverlay.stylex.ts'),
    );
    const resets = rules.filter(
      // Matched without its condition's text: an imported key compiles to a
      // placeholder until the bundle step.
      ([, {ltr}]) =>
        ltr.includes(':active') && ltr.includes('background-image:none'),
    );
    const paints = rules.filter(
      ([, {ltr}]) =>
        ltr.includes('[data-astryx-press="on"]') &&
        ltr.includes('background-image:'),
    );
    expect(resets.length).toBeGreaterThan(0);
    expect(paints.length).toBeGreaterThan(0);
    const highestReset = Math.max(...resets.map(([, , priority]) => priority));
    const lowestPaint = Math.min(...paints.map(([, , priority]) => priority));
    expect(highestReset).toBeLessThan(lowestPaint);
  });
});
