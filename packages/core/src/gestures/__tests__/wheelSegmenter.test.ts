// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file wheelSegmenter.test.ts
 * @input A WheelSegmenter fed deltas along one axis with their times
 * @output Tests for how a wheel stream splits into gestures and where a
 *   trackpad's fingers lift (spec:AST-094 FR43)
 * @position Unit tests of wheelSegmenter.ts
 */

import {describe, expect, it} from 'vitest';
import {WheelSegmenter} from '../wheelSegmenter';

/** Push `deltas` 16 ms apart from `from`, with a 180 ms finger pause. */
function feed(segmenter: WheelSegmenter, deltas: number[], from = 0) {
  return deltas.map((delta, i) => segmenter.push(from + i * 16, delta, 180));
}

describe('WheelSegmenter (spec:AST-094 FR43)', () => {
  it('starts a gesture at the first wheel, and again after a finger pause of idleMs', () => {
    const segmenter = new WheelSegmenter();
    expect(segmenter.push(0, 10, 180).boundary).toBe('first');
    expect(segmenter.push(16, 10, 180).boundary).toBeNull();
    expect(segmenter.push(195, 10, 180).boundary).toBeNull();
    const after = segmenter.push(375, 10, 180);
    expect(after.boundary).toBe('idle');
    expect(after.gesture).toBe(2);
  });

  it('reads the lift where a run of shrinking deltas has lost a fifth of its size, and marks the shrinking ones before it as held', () => {
    const seen = feed(
      new WheelSegmenter(),
      [10, 10, 10, 10, 9.5, 9, 8.5, 8, 7.5],
    );
    expect(seen.map(segment => segment.liftNow)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
    ]);
    expect(seen.map(segment => segment.decaying)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(seen[7].phase).toBe('momentum');
    expect(seen[8].boundary).toBeNull();
  });

  it('keeps a slow finger, whose deltas shrink and grow again, in its finger phase', () => {
    const seen = feed(new WheelSegmenter(), [10, 10, 10, 9, 8, 9, 10, 9, 8, 9]);
    expect(seen.some(segment => segment.liftNow)).toBe(false);
    expect(seen.every(segment => segment.phase === 'finger')).toBe(true);
  });

  for (const [name, next, at] of [
    ['reversal', -5, 16],
    ['gap', 7, 50],
    ['jump', 20, 16],
  ] as const) {
    it(`starts a new gesture in momentum at a ${name}: momentum never ${name === 'gap' ? 'pauses' : name === 'jump' ? 'grows' : 'reverses'}`, () => {
      const segmenter = new WheelSegmenter();
      const seen = feed(segmenter, [10, 10, 10, 10, 9.5, 9, 8.5, 8]);
      expect(seen[7].liftNow).toBe(true);
      const segment = segmenter.push(7 * 16 + at, next, 180);
      expect(segment.boundary).toBe(name);
      expect(segment.phase).toBe('finger');
      expect(segment.gesture).toBe(2);
    });
  }

  it('starts a gesture at the next wheel once the last one ended on its own', () => {
    const segmenter = new WheelSegmenter();
    feed(segmenter, [10, 10]);
    segmenter.end();
    expect(segmenter.push(40, 10, 180).boundary).toBe('idle');
  });
});
