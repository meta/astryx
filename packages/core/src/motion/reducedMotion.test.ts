// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotion.test.ts
 * @input reducedMotion.ts, reducedMotion.stylex.ts, the timing table, and
 *   every StyleX source file in core
 * @output Proof that the Reduced Motion policy for code beside the animator
 *   fades 200 ms at most on a coarse pointer or a touch release and completes
 *   at once elsewhere, that its CSS constants match the table, and that every
 *   StyleX key splitting Reduce Motion by pointer spells the two queries
 * @position Testing for /packages/core/src/motion/reducedMotion.ts
 */

import {readdirSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  REDUCED_MOTION_FADE_QUERY,
  REDUCED_MOTION_INSTANT_QUERY,
  reducedMotionFade,
} from './reducedMotion';
import {reducedMotionFadeConsts} from './reducedMotion.stylex';
import {timing} from './uikit/timing';

const on = () => true;
const off = () => false;

describe('reducedMotionFade', () => {
  it('is null when motion is not reduced', () => {
    expect(reducedMotionFade(null, {prefersReducedMotion: off})).toBeNull();
  });

  it('fades 200 ms at most on easeInOut on a coarse pointer', () => {
    const fade = reducedMotionFade(null, {
      prefersReducedMotion: on,
      isCoarsePointer: on,
    });
    expect(fade).toEqual({
      duration: timing.reducedMotionCrossFadeMs,
      easing: 'cubic-bezier(0.42, 0, 0.58, 1)',
    });
    expect(fade?.duration).toBeGreaterThan(0);
    expect(fade?.duration).toBeLessThanOrEqual(200);
  });

  it('completes at once on any other pointer, unless a touch release started it', () => {
    expect(
      reducedMotionFade(null, {prefersReducedMotion: on, isCoarsePointer: off}),
    ).toEqual({duration: 0, easing: 'linear'});
    expect(
      reducedMotionFade(null, {
        prefersReducedMotion: on,
        isCoarsePointer: off,
        touchRelease: true,
      })?.duration,
    ).toBe(timing.reducedMotionCrossFadeMs);
  });
});

describe('the CSS side of the policy', () => {
  it('holds the same fade as the table', () => {
    expect(reducedMotionFadeConsts.duration).toBe(
      `${timing.reducedMotionCrossFadeMs}ms`,
    );
    expect(reducedMotionFadeConsts.easing).toBe(
      `cubic-bezier(${timing.curves.easeInOut.join(', ')})`,
    );
  });

  it('every StyleX key that splits Reduce Motion by pointer spells the two queries', () => {
    const root = resolve(__dirname, '..');
    const allowed = new Set([
      `@media ${REDUCED_MOTION_FADE_QUERY}`,
      `@media ${REDUCED_MOTION_INSTANT_QUERY}`,
    ]);
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
          for (const match of readFileSync(path, 'utf8').matchAll(
            /'(@media[^']*prefers-reduced-motion: reduce[^']*pointer[^']*)'/g,
          )) {
            if (!allowed.has(match[1])) {
              offenders.push(`${path.slice(root.length)}: ${match[1]}`);
            }
          }
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
