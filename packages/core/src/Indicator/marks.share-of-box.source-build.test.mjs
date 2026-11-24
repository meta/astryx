// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file marks.share-of-box.source-build.test.mjs
 * @input Uses Babel and the StyleX plugin as the package stylesheet compiles
 *   it, and the CheckboxIndicator and RadioIndicator sources
 * @output Verifies the check, the dash and the radio dot are sized as a share
 *   of the box: exactly their shipped pixels at the 20px and 24px boxes, and
 *   inside a box a theme shrinks, whatever the border width
 * @position Regression test for the compiled CSS of the built-in marks
 *
 * A theme may size the box through the `checkbox-indicator` and
 * `radio-indicator` targets. A mark in fixed pixels would then overflow a
 * smaller box (a clipped check, an off-center dot). Centering is the box's own
 * flex alignment, so a mark that fits stays centered.
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

const SHARE =
  /^calc\(\(100% \+ 2 \* var\(--border-width\)\) (?:\* (\d+) \/ (\d+)|\/ (\d+))\)$/;

/**
 * The share of the border box a mark length takes, or null when the length is
 * not written as a share of the box. A percentage reads the content box, so
 * `100% + 2 * border` is the border box at any border width.
 * @param {string} value
 */
function shareOfBox(value) {
  // (The dot's share is also written rounded to whole pixels, with the exact
  // share as the fallback; both are the same share.)
  const exact = value.trim().replace(/^round\((.*),\s*1px\)$/, '$1');
  const m = SHARE.exec(exact);
  if (!m) return null;
  return m[3] ? 1 / Number(m[3]) : Number(m[1]) / Number(m[2]);
}

/** Every width and height value in `css`. @param {string} css */
const lengths = (css, prop) =>
  [...css.matchAll(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;}]+)`, 'g'))].map(
    m => m[1].trim(),
  );

/**
 * The px a share-of-box length draws in a box of `box` px.
 * @param {string} value @param {number} box
 */
const drawn = (value, box) => {
  const share = shareOfBox(value);
  if (share === null) throw new Error(`not a share of the box: ${value}`);
  return box * share;
};

describe('the built-in marks', () => {
  it('size the check and the dash as a share of the checkbox', async () => {
    const css = await compiledCss('CheckboxIndicator.tsx');
    const shares = [...lengths(css, 'width'), ...lengths(css, 'height')]
      .filter(v => v.startsWith('calc('))
      .map(shareOfBox);
    // The check (sm and md) and the dash width; nothing else is a share.
    expect(new Set(shares)).toEqual(new Set([12 / 20, 14 / 24, 1 / 2]));
    // The shipped boxes draw the shipped marks to the pixel.
    expect(20 * (12 / 20)).toBe(12);
    expect(24 * (14 / 24)).toBe(14);
    expect([20 / 2, 24 / 2]).toEqual([10, 12]);
    // No mark length is left in fixed pixels but the dash's 2px stroke.
    const fixed = [...lengths(css, 'width'), ...lengths(css, 'height')].filter(
      v => /^\d+(\.\d+)?px$/.test(v),
    );
    expect(new Set(fixed)).toEqual(new Set(['20px', '24px', '2px']));
  });

  it('size the radio dot as a share of the circle', async () => {
    const css = await compiledCss('RadioIndicator.tsx');
    const shares = [...lengths(css, 'width'), ...lengths(css, 'height')].filter(
      v => /^(?:round\()?calc\(/.test(v),
    );
    expect(new Set(shares.map(v => shareOfBox(v)))).toEqual(
      new Set([8 / 20, 10 / 24]),
    );
    // Rounded to whole pixels where the browser can (a fractional dot draws
    // as a rounded square), the exact share as the fallback.
    expect(shares.filter(v => v.startsWith('round(')).length).toBe(4);
    expect(
      drawn(
        shares.find(v => shareOfBox(v) === 8 / 20),
        20,
      ),
    ).toBe(8);
    expect(
      drawn(
        shares.find(v => shareOfBox(v) === 10 / 24),
        24,
      ),
    ).toBe(10);
  });

  it('keep every mark inside a box a theme shrinks to 13px', async () => {
    const css = [
      await compiledCss('CheckboxIndicator.tsx'),
      await compiledCss('RadioIndicator.tsx'),
    ].join('\n');
    const marks = [...lengths(css, 'width'), ...lengths(css, 'height')].filter(
      v => /^(?:round\()?calc\(/.test(v),
    );
    // check sm and md, the dash, the dot sm and md
    expect(marks.length).toBeGreaterThanOrEqual(5);
    // The shipped border tokens are 1px and 2px.
    for (const border of [0, 1, 2]) {
      const room = 13 - 2 * border;
      for (const value of marks) {
        expect(drawn(value, 13)).toBeLessThanOrEqual(room);
      }
    }
  });
});
