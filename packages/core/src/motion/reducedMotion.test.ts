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
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  REDUCED_MOTION_FADE_QUERY,
  REDUCED_MOTION_INSTANT_QUERY,
  reducedMotionFade,
} from './reducedMotion';
import {
  reducedMotionFadeConsts,
  reducedMotionKeys,
} from './reducedMotion.stylex';
import {timing} from './uikit/timing';

/** The person's settings, through `matchMedia`: no option overrides them. */
function settings(reduced: boolean, coarse: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion')
      ? reduced
      : query.includes('pointer: coarse')
        ? coarse
        : false,
    media: query,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reducedMotionFade', () => {
  it('is null when motion is not reduced', () => {
    settings(false, true);
    expect(reducedMotionFade(null)).toBeNull();
  });

  it('fades 200 ms at most on easeInOut on a coarse pointer', () => {
    settings(true, true);
    const fade = reducedMotionFade(null);
    expect(fade).toEqual({
      duration: timing.reducedMotionCrossFadeMs,
      easing: 'cubic-bezier(0.42, 0, 0.58, 1)',
    });
    expect(fade?.duration).toBeGreaterThan(0);
    expect(fade?.duration).toBeLessThanOrEqual(200);
  });

  it('completes at once on any other pointer, unless a touch release started it', () => {
    settings(true, false);
    expect(reducedMotionFade(null)).toEqual({duration: 0, easing: 'linear'});
    expect(reducedMotionFade(null, {touchRelease: true})?.duration).toBe(
      timing.reducedMotionCrossFadeMs,
    );
  });
});

describe('the CSS side of the policy', () => {
  it('holds the same fade as the table', () => {
    expect(reducedMotionFadeConsts.duration).toBe(
      `${timing.reducedMotionCrossFadeMs}ms`,
    );
    expect(reducedMotionFadeConsts.easing).toBe(
      `cubic-bezier(${timing.curves.move.join(', ')})`,
    );
  });

  it('spells the two media keys from the queries', () => {
    expect(reducedMotionKeys.fade).toBe(`@media ${REDUCED_MOTION_FADE_QUERY}`);
    expect(reducedMotionKeys.instant).toBe(
      `@media ${REDUCED_MOTION_INSTANT_QUERY}`,
    );
  });

  it('every key that splits Reduce Motion by pointer is one of the two constants, spelled exactly', () => {
    const allowed = new Set<string>([
      reducedMotionKeys.fade,
      reducedMotionKeys.instant,
    ]);
    const root = resolve(__dirname, '..');
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
          // A constant as a computed key lands in a later priority layer.
          if (
            !/[/\\]motion[/\\]reducedMotion\.ts$/.test(path) &&
            /\[reducedMotionKeys\.(fade|instant)\]/.test(
              readFileSync(path, 'utf8'),
            )
          ) {
            offenders.push(
              `${path.slice(root.length)}: a computed reducedMotionKeys key`,
            );
          }
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
