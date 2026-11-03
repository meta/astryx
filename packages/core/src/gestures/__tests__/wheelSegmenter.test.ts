// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file wheelSegmenter.test.ts
 * @input A WheelSegmenter fed deltas along one axis with their times
 * @output Tests for how a wheel stream splits into gestures, where a
 *   trackpad's fingers lift, and which wheels a stall merged (spec:AST-094
 *   FR43)
 * @position Unit tests of wheelSegmenter.ts
 */

import {describe, expect, it} from 'vitest';
import {isBunched, WheelSegmenter} from '../wheelSegmenter';

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

/** Wheel times at `hz` from 1000 ms, through `stamp`, each moved by ±`jitter`. */
function frames(
  hz: number,
  count: number,
  stamp: (time: number) => number = time => time,
  jitter = 0,
): number[] {
  return Array.from({length: count}, (_, i) =>
    stamp(1000 + (i * 1000) / hz + (i % 2 === 0 ? jitter : -jitter)),
  );
}

const whole = (time: number) => Math.round(time);

/** Trackpad streams: frame rates, whole-millisecond stamps and jitter. */
const STREAMS = [
  ['60 Hz', 60, undefined, 0],
  ['120 Hz', 120, undefined, 0],
  ['240 Hz', 240, undefined, 0],
  ['240 Hz, ±0.3 ms jitter', 240, undefined, 0.3],
  ['240 Hz, whole ms', 240, whole, 0],
  ['300 Hz', 300, undefined, 0],
  ['300 Hz, whole ms', 300, whole, 0],
  ['360 Hz', 360, undefined, 0],
  ['360 Hz, whole ms', 360, whole, 0],
  ['480 Hz, whole ms', 480, whole, 0],
  ['500 Hz, whole ms', 500, whole, 0],
] as const;

describe("WheelSegmenter's merges: one stall's wheels, not frames", () => {
  it.each(STREAMS)(
    'takes no frame of a steady stream at %s as a merge',
    (_name, hz, stamp, jitter) => {
      const segmenter = new WheelSegmenter();
      const seen = frames(hz, 40, stamp, jitter).map(time =>
        segmenter.push(time, 10, 180),
      );
      expect(seen.filter(segment => segment.bunched)).toEqual([]);
    },
  );

  it.each(STREAMS)(
    "takes a wheel 1 ms after a stall's last one as a merge at %s",
    (_name, hz, stamp, jitter) => {
      const segmenter = new WheelSegmenter();
      const times = frames(hz, 20, stamp, jitter);
      for (const time of times) {
        segmenter.push(time, 10, 180);
      }
      // The page stalls 50 ms, then receives the steps it held back.
      const resumed = times[times.length - 1] + 50;
      expect(segmenter.push(resumed, 10, 180).bunched).toBe(false);
      const merged = segmenter.push(resumed + 1, 20, 180);
      expect(merged.boundary).toBeNull();
      expect(merged.bunched).toBe(true);
    },
  );

  it("takes each of a stall's held-back wheels as a merge when the page receives them one by one, 1 ms apart", () => {
    const segmenter = new WheelSegmenter();
    const times = frames(120, 20);
    for (const time of times) {
      segmenter.push(time, 10, 180);
    }
    const resumed = times[times.length - 1] + 50;
    segmenter.push(resumed, 10, 180);
    const held = [1, 2, 3, 4, 5].map(ms =>
      segmenter.push(resumed + ms, 10, 180),
    );
    expect(held.map(segment => segment.bunched)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it('judges a wheel by its own interval alone: a frame after slow wheels is a frame', () => {
    const segmenter = new WheelSegmenter();
    for (const time of [0, 80, 160, 240, 320, 400]) {
      segmenter.push(time, 2, 180);
    }
    expect(segmenter.push(416, 10, 180).bunched).toBe(false);
    expect(segmenter.push(418, 10, 180).bunched).toBe(false);
  });

  it('takes a wheel within 1.5 ms of the one before as a merge, and no frame up to 500 Hz', () => {
    expect(isBunched(0)).toBe(true);
    expect(isBunched(1)).toBe(true);
    expect(isBunched(1.5)).toBe(true);
    expect(isBunched(2)).toBe(false);
    expect(isBunched(1000 / 480)).toBe(false);
    expect(isBunched(1000 / 60)).toBe(false);
  });
});
