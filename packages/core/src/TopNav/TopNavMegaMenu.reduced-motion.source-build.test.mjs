// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TopNavMegaMenu.reduced-motion.source-build.test.mjs
 * @input Uses Babel, the core StyleX build config, and the TopNavMegaMenu
 *   source
 * @output Verifies the shipped panel follows design:reduced-motion: under
 *   reduced motion it never rises (DR1), cross-fades in 200 ms on a touch
 *   screen (DR2) and opens and closes at once with a mouse (DR3)
 * @position Regression test for the compiled CSS of the mega-menu panel;
 *   jsdom evaluates no media queries or transitions
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {transformAsync} from '@babel/core';
import {describe, expect, it} from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '../..');
const SOURCE = path.join(__dirname, 'TopNavMegaMenu.tsx');

async function compiledRules() {
  const result = await transformAsync(await fs.readFile(SOURCE, 'utf8'), {
    babelrc: false,
    configFile: path.join(CORE_ROOT, 'babel.config.json'),
    filename: SOURCE,
  });
  return (result?.metadata?.stylex ?? []).map(([, rule]) => rule.ltr);
}

const REDUCED = /@media \(prefers-reduced-motion: ?reduce\)\{/;
const REDUCED_COARSE =
  /@media \(prefers-reduced-motion: ?reduce\) and \(pointer: ?coarse\)\{/;
const REDUCED_FINE =
  /@media \(prefers-reduced-motion: ?reduce\) and \(not \(pointer: ?coarse\)\)\{/;

/** The declarations the rules matching `media` set, as one string each. */
function declarationsUnder(rules, media) {
  return rules
    .filter(rule => media.test(rule))
    .map(rule => rule.replace(/\s/g, ''));
}

describe('the mega-menu panel under reduced motion', () => {
  it('never rises: no transform transition, and no offset (DR1)', async () => {
    const reduced = declarationsUnder(await compiledRules(), REDUCED);
    expect(reduced).toContainEqual(
      expect.stringContaining('transition-property:opacity,overlay,display'),
    );
    expect(reduced).toContainEqual(expect.stringContaining('transform:none'));
  });

  it('cross-fades in 200 ms on easeInOut under a coarse pointer (DR2)', async () => {
    const rules = await compiledRules();
    // StyleX rewrites sibling media queries so they never overlap; every
    // rule that sets the 200 ms still applies only to reduced motion under a
    // coarse pointer.
    const fade = rules.filter(rule =>
      /transition-duration:(\.2s|200ms)/.test(rule),
    );
    expect(fade.length).toBeGreaterThan(0);
    for (const rule of fade) {
      expect(rule).toMatch(
        /\(prefers-reduced-motion: ?reduce\) and \(pointer: ?coarse\)/,
      );
    }
    const coarse = declarationsUnder(rules, REDUCED_COARSE);
    expect(coarse).toContainEqual(
      expect.stringMatching(
        /transition-timing-function:cubic-bezier\(0?\.42,0,0?\.58,1\)/,
      ),
    );
  });

  it('opens and closes at once under a fine pointer (DR3)', async () => {
    const fine = declarationsUnder(await compiledRules(), REDUCED_FINE);
    expect(fine).toContainEqual(
      expect.stringContaining('transition-duration:0s'),
    );
  });
});
