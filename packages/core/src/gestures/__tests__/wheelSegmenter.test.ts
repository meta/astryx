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

/** A fling: a trackpad's deltas growing as the fingers speed up. */
const FLING = [8, 16, 24, 30, 32];

/** The fling's momentum: `count` steps shrinking 5 % a frame from 30. */
function momentum(count: number): number[] {
  return Array.from({length: count}, (_, frame) => 30 * 0.95 ** frame);
}

describe("WheelSegmenter's reading of a stall's merge: no jump, no lift", () => {
  it.each(STREAMS)(
    "keeps a fling's momentum one gesture, and reads new fingers as a jump, at %s",
    (_name, hz, stamp, jitter) => {
      const segmenter = new WheelSegmenter();
      const glide = momentum(60);
      // New fingers: three times the momentum's last step, twice.
      const sizes = [...FLING, ...glide, glide[59] * 3, glide[59] * 3];
      const times = frames(hz, sizes.length, stamp, jitter);
      const seen = sizes.map((size, index) =>
        segmenter.push(times[index], size, 180),
      );
      const lift = seen.findIndex(segment => segment.liftNow);
      expect(lift).toBeGreaterThanOrEqual(0);
      const glided = seen.slice(lift, FLING.length + glide.length);
      expect(glided.filter(segment => segment.boundary != null)).toEqual([]);
      expect(seen.slice(-2).map(segment => segment.boundary)).toContain('jump');
    },
  );

  it.each(STREAMS)(
    "reads a momentum wheel 1 ms after the one before as one stall's merge of two steps, not a jump, at %s",
    (_name, hz, stamp, jitter) => {
      const segmenter = new WheelSegmenter();
      const sizes = [...FLING, ...momentum(10)];
      const times = frames(hz, sizes.length + 2, stamp, jitter);
      sizes.forEach((size, index) => {
        segmenter.push(times[index], size, 180);
      });
      // A stalled page receives the next two steps as one wheel.
      const step = 30 * 0.95 ** 10;
      const last = times[sizes.length - 1];
      const merged = segmenter.push(last + 1, step + step * 0.95, 180);
      const next = segmenter.push(times[sizes.length + 1], step * 0.9, 180);
      expect([
        merged.boundary,
        merged.phase,
        next.boundary,
        next.phase,
      ]).toEqual([null, 'momentum', null, 'momentum']);
    },
  );

  it('still starts a new gesture at a jump up against the decay right after a merged momentum wheel', () => {
    const segmenter = new WheelSegmenter();
    feed(segmenter, [10, 10, 10, 10, 9.5, 9, 8.5, 8, 7.5]);
    segmenter.push(144, 3, 180);
    segmenter.push(145, 2.8 + 2.6, 180);
    // New fingers: 5 px against the merged wheel's last step is a jump.
    const fingers = segmenter.push(161, 5, 180);
    expect({boundary: fingers.boundary, gesture: fingers.gesture}).toEqual({
      boundary: 'jump',
      gesture: 2,
    });
  });

  it('reads no lift from the steps after a merged finger wheel', () => {
    const segmenter = new WheelSegmenter();
    // The fingers move 4 px every 16 ms, and one step shrinks. The page then
    // receives the next two steps as one wheel 1 ms later. Steps of about
    // 4 px follow, shrinking a little.
    const times = [0, 16, 32, 48, 64, 80, 81, 97, 113, 129, 145, 161];
    const sizes = [4, 4, 4, 4, 4, 3.9, 8, 4.2, 4.1, 4, 3.9, 3.8];
    const seen = times.map((time, index) =>
      segmenter.push(time, sizes[index], 180),
    );
    expect({
      lift: seen.some(segment => segment.liftNow),
      afterMerge: seen[7].decaying,
    }).toEqual({lift: false, afterMerge: false});
  });
});

describe('WheelSegmenter: a slowing drag with a merged wheel', () => {
  it("reads a slowing drag's lift at the same frame whether or not a stall merged two of its steps", () => {
    // Steady 10 px steps every 16 ms, then a drag slowing 1 % a frame.
    const sizes = [10, 10, 10, 10];
    for (let frame = 1; frame <= 30; frame++) {
      sizes.push(10 * 0.99 ** frame);
    }
    const times = sizes.map((_, index) => index * 16);
    const liftTime = (merge: number | null) => {
      const segmenter = new WheelSegmenter();
      for (let index = 0; index < sizes.length; index++) {
        let size = sizes[index];
        let time = times[index];
        if (index === merge) {
          // A stalled page receives this step and the next as one wheel,
          // 1 ms after the one before.
          size += sizes[index + 1];
          time = times[index - 1] + 1;
        } else if (merge != null && index === merge + 1) {
          continue;
        }
        if (segmenter.push(time, size, 180).liftNow) {
          return times[index];
        }
      }
      return null;
    };
    const control = liftTime(null);
    expect(control).not.toBeNull();
    expect(liftTime(10)).toBe(control);
  });
});
