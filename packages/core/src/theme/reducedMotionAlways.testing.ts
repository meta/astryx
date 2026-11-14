// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotionAlways.testing.ts
 * @input themeMotion's real exports
 * @output ALWAYS_TEMPO and resolvingAlways, for a `vi.mock` of themeMotion
 *   that resolves one test theme's `reducedMotion` to 'always'
 * @position Test helper. No public theme can set `reducedMotion` yet, so a
 *   test reaches 'always' through this mock: a theme whose motion sets
 *   `tempo: ALWAYS_TEMPO` resolves to it
 */

import type * as ThemeMotion from './themeMotion';

type ThemeMotionModule = typeof ThemeMotion;

/** A tempo no other test theme uses; the mock reads it as 'always'. */
export const ALWAYS_TEMPO = 0.76;

/** themeMotion with resolveMotionKnobs reading ALWAYS_TEMPO as 'always'. */
export function resolvingAlways(actual: ThemeMotionModule): ThemeMotionModule {
  return {
    ...actual,
    resolveMotionKnobs: config => {
      const resolved = actual.resolveMotionKnobs(config);
      const tempo = config?.tempo;
      return tempo === ALWAYS_TEMPO
        ? {...resolved, reducedMotion: 'always'}
        : resolved;
    },
  };
}
