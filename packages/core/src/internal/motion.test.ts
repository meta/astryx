// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file motion.test.ts
 * @input The internal `internal/motion` entry and the motion foundation
 * @output INV13's entry checks: the entry re-exports the motion foundation's
 *   primitives by name, the same values a Core component imports by path, and
 *   nothing else
 * @position Unit tests of packages/core/src/internal/motion.ts
 *   (architecture:react-component-runtime INV13)
 */

import {describe, expect, it} from 'vitest';

describe('internal/motion', () => {
  it('re-exports the motion foundation by name, the same values Core imports by path', async () => {
    const entry: Record<string, unknown> = await import('./motion');
    const animator = await import('../motion/animator');
    const bezier = await import('../motion/bezier');
    const timing = await import('../motion/uikit/timing');
    expect(entry.createAnimator).toBe(animator.createAnimator);
    expect(entry.cubicBezier).toBe(bezier.cubicBezier);
    expect(entry.timing).toBe(timing.timing);
    // Named re-exports only: no gathering object a component would carry
    // whole (architecture:component-style-authoring INV6).
    expect(Object.keys(entry).sort()).toEqual([
      'createAnimator',
      'cubicBezier',
      'timing',
    ]);
  });
});
