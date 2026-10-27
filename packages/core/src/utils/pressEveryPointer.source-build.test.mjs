// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressEveryPointer.source-build.test.mjs
 * @input Uses Babel, the StyleX plugin as the package stylesheet compiles it,
 *   and the sources of the controls that paint the press on a descendant
 * @output Verifies Tab paints the controller's press for every pointer, not
 *   only inside `@media (pointer: coarse)`
 * @position Regression test for `spec:AST-094` FR43 (one press model for
 *   every pointer) in the compiled CSS of those modules
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
  const file = path.join(__dirname, '..', fileName);
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

/**
 * The rules painting the press image on an arm, each with whether it sits
 * inside `@media (pointer: coarse)`.
 */
function pressImageRules(css, arm) {
  const out = [];
  const media = /@media ([^{]+)\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g;
  const coarseRanges = [];
  for (const match of css.matchAll(media)) {
    if (match[1].includes('pointer: coarse')) {
      coarseRanges.push([match.index, match.index + match[0].length]);
    }
  }
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (
      match[1].includes(`[data-astryx-press="${arm}"]`) &&
      /background-image:\s*var\(--_press-paint-image\)/.test(match[2])
    ) {
      out.push({
        coarseOnly: coarseRanges.some(
          ([from, to]) => match.index >= from && match.index < to,
        ),
      });
    }
  }
  return out;
}

const CONTROLS = ['TabList/Tab.tsx'];

describe('controls that paint the press on a descendant', () => {
  for (const control of CONTROLS) {
    it(`${control} paints both arms for every pointer, not only a coarse one`, async () => {
      const css = await compiledCss(control);
      for (const arm of ['on', 'fading']) {
        const rules = pressImageRules(css, arm);
        expect(rules.length, `${control} ${arm}`).toBeGreaterThan(0);
        expect(
          rules.some(rule => !rule.coarseOnly),
          `${control} ${arm}`,
        ).toBe(true);
      }
    });
  }
});
