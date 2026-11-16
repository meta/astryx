// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hitArea.test.ts
 * @input Vitest and rects
 * @output Checks the touch target geometry: a rect grows toward 44 px,
 *   centered, and a group's touch resolves to the nearest target
 * @position Test for utils/hitArea.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  distanceTo,
  type HitRect,
  resolveHitTarget,
  touchTargetRect,
} from './hitArea';

function rect(left: number, top: number, width: number, height: number) {
  return {left, top, right: left + width, bottom: top + height};
}

describe('touchTargetRect', () => {
  it('grows a 24 px target to 44 px, centered, and leaves a 44 px axis alone', () => {
    expect(touchTargetRect(rect(100, 100, 24, 24))).toEqual(
      rect(90, 90, 44, 44),
    );
    expect(touchTargetRect(rect(0, 100, 120, 32))).toEqual(
      rect(0, 94, 120, 44),
    );
  });
});

describe('distanceTo', () => {
  it('is 0 inside the rect and the straight-line distance outside it', () => {
    expect(distanceTo(rect(0, 0, 10, 10), 5, 5)).toBe(0);
    expect(distanceTo(rect(0, 0, 10, 10), 13, 14)).toBe(5);
  });
});

describe('resolveHitTarget', () => {
  // Two 28 px buttons 4 px apart, as in a dense toolbar.
  const toolbar: HitRect[] = [rect(0, 0, 28, 28), rect(32, 0, 28, 28)];

  it('gives a touch in the gap to the nearer button', () => {
    expect(resolveHitTarget(29, 14, toolbar)).toBe(0);
    expect(resolveHitTarget(31, 14, toolbar)).toBe(1);
  });

  it('extends each button toward 44 px where nothing is near', () => {
    expect(resolveHitTarget(-7, 14, toolbar)).toBe(0);
    expect(resolveHitTarget(14, 35, toolbar)).toBe(0);
  });

  it('gives a corner touch to the nearer of two diagonal targets', () => {
    const pair: HitRect[] = [rect(100, 100, 24, 24), rect(128, 130, 24, 24)];
    // 9.2 px from the first, 4 px from the second.
    expect(resolveHitTarget(133, 126, pair)).toBe(1);
  });

  it('answers -1 beyond every hit area', () => {
    expect(resolveHitTarget(14, 60, toolbar)).toBe(-1);
  });

  it('picks the nearer target, not the earlier one, where targets overlap', () => {
    const overlapping: HitRect[] = [rect(0, 0, 40, 28), rect(30, 0, 40, 28)];
    expect(resolveHitTarget(36, 14, overlapping)).toBe(1);
  });
});

describe('the package surface', () => {
  it('keeps hitArea out of the public utils entry', () => {
    const entry = fs.readFileSync(
      path.join(path.dirname(new URL(import.meta.url).pathname), 'index.ts'),
      'utf8',
    );
    expect(entry).not.toMatch(/hitArea/);
  });
});
