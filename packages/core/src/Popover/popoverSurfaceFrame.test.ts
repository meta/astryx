// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file popoverSurfaceFrame.test.ts
 * @input vitest, the popover's timing tokens, its UIKit table and the
 *   Storybook theme's motion scale
 * @output Checks that the growth plays the Storybook theme's duration step
 *   nearest iOS's measured growth, naming both numbers. It also checks that
 *   the shrink keeps the exit every overlay shares.
 * @position Testing; the motion that plays these tokens is checked in
 *   popoverSurfaceMotion.test.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {popover} from '../motion/uikit';
import {expandMotionScale} from '../theme/expandMotionScale';
import {
  POPOVER_ENTRANCE_TOKENS,
  POPOVER_EXIT_TOKENS,
} from './popoverSurfaceFrame';

// The Storybook theme (neutral) declares its motion scale in its own source.
const NEUTRAL_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../../themes/neutral/src/neutralTheme.ts'),
  'utf8',
);
const SCALE =
  /motion: \{fast: (\d+), medium: (\d+), slow: (\d+), ratio: ([\d.]+)\}/.exec(
    NEUTRAL_SOURCE,
  );
if (SCALE == null) {
  throw new Error('the neutral theme declares no motion scale');
}
const NEUTRAL = expandMotionScale({
  fast: Number(SCALE[1]),
  medium: Number(SCALE[2]),
  slow: Number(SCALE[3]),
  ratio: Number(SCALE[4]),
});

/** The neutral theme's duration token whose value is nearest `ms`. */
function nearestNeutral(ms: number): string {
  const gap = (value: string) => Math.abs(Number.parseFloat(value) - ms);
  const [[token]] = Object.entries(NEUTRAL)
    .filter(([name]) => name.startsWith('--duration-'))
    .sort(([, a], [, b]) => gap(a) - gap(b));
  return token;
}

describe('popover timing tokens', () => {
  it('grows on --duration-medium-min, 225 ms in the Storybook theme, the step nearest iOS\u2019s 206 ms growth', () => {
    expect(popover.growMs).toBe(206);
    expect(NEUTRAL['--duration-medium-min']).toBe('225ms');
    expect(nearestNeutral(popover.growMs)).toBe('--duration-medium-min');
    expect(POPOVER_ENTRANCE_TOKENS).toEqual({
      duration: '--duration-medium-min',
      easing: '--ease-entrance',
    });
  });

  it('shrinks on the theme\u2019s exit duration and easing, which every overlay shares, keeping iOS\u2019s 249 ms shrink as a reference', () => {
    expect(popover.shrinkMs).toBe(249);
    expect(POPOVER_EXIT_TOKENS).toEqual({
      duration: '--duration-exit',
      easing: '--ease-exit',
    });
  });
});
