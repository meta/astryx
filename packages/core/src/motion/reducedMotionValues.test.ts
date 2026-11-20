// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotionValues.test.ts
 * @input Core's component sources and reducedMotionFadeConsts
 * @output Every Reduce Motion fade arm that spells the cross-fade's duration
 *   or curve as a literal spells reducedMotionFadeConsts' value exactly. So
 *   does an arm that caps a theme duration at it.
 * @position Unit test beside reducedMotion.test.ts. A swizzled component
 *   cannot import the internal reducedMotion.stylex.ts, so it spells the
 *   values. This test keeps them one definition.
 */

import {readdirSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  reducedMotionFadeConsts,
  reducedMotionKeys,
} from './reducedMotion.stylex';

describe("the cross-fade's values spelled in components", () => {
  it('equal reducedMotionFadeConsts wherever a fade arm spells them', () => {
    const root = resolve(__dirname, '..');
    const arm = new RegExp(
      `'${reducedMotionKeys.fade.replace(/[()]/g, '\\$&')}':\\s*'([^']*)'`,
      'g',
    );
    // A theme duration capped under Reduce Motion is capped at the
    // cross-fade's bound: `min(<duration token>, <cap>)`.
    const capped =
      /`min\(\$\{durationVars\['--duration-[a-z-]+'\]\},\s*([\d.]+m?s)\)`/g;
    const spelled: string[] = [];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, {withFileTypes: true})) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== '__tests__') {
            walk(path);
          }
        } else if (
          /\.tsx?$/.test(entry.name) &&
          !/\.(test|spec|stories)\.tsx?$/.test(entry.name)
        ) {
          const source = readFileSync(path, 'utf8');
          for (const match of source.matchAll(capped)) {
            const where = `${path.slice(root.length)}: ${match[0]}`;
            spelled.push(where);
            if (match[1].trim() !== reducedMotionFadeConsts.duration) {
              offenders.push(where);
            }
          }
          for (const match of source.matchAll(arm)) {
            const value = match[1];
            const where = `${path.slice(root.length)}: ${value}`;
            // A zero duration applies a change at once; it is not a fade.
            if (/^[\d.]+m?s$/.test(value) && parseFloat(value) !== 0) {
              spelled.push(where);
              if (value !== reducedMotionFadeConsts.duration) {
                offenders.push(where);
              }
            } else if (value.startsWith('cubic-bezier')) {
              spelled.push(where);
              if (value !== reducedMotionFadeConsts.easing) {
                offenders.push(where);
              }
            }
          }
        }
      }
    };
    walk(root);
    // A pattern that stopped matching would pass with nothing checked.
    expect(spelled.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
