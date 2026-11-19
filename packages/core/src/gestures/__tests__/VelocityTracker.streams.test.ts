// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file VelocityTracker.streams.test.ts
 * @input Recorded pointer and touch streams (fixtures/pointer-streams): what
 *   real browsers delivered for a slow drag, a fling and a stop-then-release —
 *   Chromium and Firefox on an Android emulator, Safari on an iOS simulator,
 *   and desktop Chromium's mouse, pen and touch — each with its events'
 *   timestamps and `getCoalescedEvents()` samples, and the injected ground
 *   truth
 * @output VelocityTracker's release velocity on each, fed one sample per
 *   pointermove as PanGestureRecognizer reads them: within 10% of the
 *   injected speed for the slow drag and the fling (the iOS streams miss it
 *   and are checked for direction only), 0 for the stop-then-release; the
 *   same under a busy main thread that dispatches one event per four input
 *   samples; the touch stream agrees with the pointer stream; a shifted clock
 *   changes nothing (spec:AST-100 FR4)
 * @position Evidence for the velocity source on real input streams; the
 *   synthetic cases are in VelocityTracker.test.ts. The fixtures' README says
 *   how they were captured and what the rig's input is not.
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {VelocityTracker} from '../VelocityTracker';

/** [time ms after the pointerdown, x, y] in CSS px from where it went down. */
type Sample = readonly [number, number, number];
type StreamEvent =
  | readonly [string, number, number, number]
  | readonly [
      string,
      number,
      number,
      number,
      ReadonlyArray<Sample>,
      number | null,
    ];

interface Fixture {
  readonly file: string;
  readonly schema: 1;
  readonly platform: string;
  readonly browser: string;
  readonly pointerType: 'touch' | 'pen' | 'mouse';
  readonly gesture: 'slow' | 'fling' | 'stop-release';
  readonly caveat: string;
  /** `speed`: px/s along y while the contact moved. */
  readonly injected: {readonly speed: number};
  /**
   * Where the replay releases (the lift, or the last move). Its velocity is
   * checked against the injected speed, except (`shape`) for a stream that
   * misses it by more than 10%: only its direction and axis are checked.
   * `note` says why.
   */
  readonly release: {
    readonly at: 'pointerup' | 'lastMove';
    readonly check?: 'shape';
    readonly note?: string;
  };
  readonly events: ReadonlyArray<StreamEvent>;
}

const DIR = path.resolve(__dirname, 'fixtures/pointer-streams');
const FIXTURES: Fixture[] = fs
  .readdirSync(DIR)
  .filter(name => name.endsWith('.json'))
  .sort()
  .map(name => ({
    file: name,
    ...(JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8')) as Omit<
      Fixture,
      'file'
    >),
  }));

const of = (f: Fixture, type: string) => f.events.filter(e => e[0] === type);

/**
 * What PanGestureRecognizer feeds its tracker: the touch-down, then each
 * pointermove event's own position and time, one sample per event (it does
 * not read `getCoalescedEvents()`).
 */
function pointerSamples(f: Fixture): Sample[] {
  return [...of(f, 'pointerdown').slice(0, 1), ...of(f, 'pointermove')].map(
    e => [e[1], e[2], e[3]] as const,
  );
}

/**
 * The input the browser received: the touch-down, then each pointermove's
 * coalesced samples in order, or the event itself when its list is empty.
 */
function inputSamples(f: Fixture): Sample[] {
  const down = of(f, 'pointerdown')[0];
  const samples: Sample[] = [[down[1], down[2], down[3]]];
  for (const move of of(f, 'pointermove')) {
    const coalesced: ReadonlyArray<Sample> =
      (move.length > 4 ? move[4] : undefined) ?? [];
    samples.push(
      ...(coalesced.length > 0
        ? coalesced
        : [[move[1], move[2], move[3]] as const]),
    );
  }
  return samples;
}

/**
 * What the recognizer reads when the main thread is busy: the browser
 * dispatches one pointermove per `every` input samples, at the latest of
 * them, and folds the rest into its coalesced list.
 */
function busySamples(f: Fixture, every: number): Sample[] {
  const input = inputSamples(f);
  const samples: Sample[] = [input[0]];
  for (let i = 1; i < input.length; i += every) {
    samples.push(input[Math.min(i + every - 1, input.length - 1)]);
  }
  return samples;
}

/** The same contact from its touch events: the touchstart, then each touchmove. */
function touchSamples(f: Fixture): Sample[] {
  return [...of(f, 'touchstart'), ...of(f, 'touchmove')].map(
    e => [e[1], e[2], e[3]] as const,
  );
}

function releaseTime(
  f: Fixture,
  lift: string,
  moves: ReadonlyArray<Sample>,
): number {
  return f.release.at === 'lastMove'
    ? moves[moves.length - 1][0]
    : of(f, lift)[0][1];
}

/** Replays samples through a tracker, on a clock shifted by `shift` ms. */
function replay(
  samples: ReadonlyArray<Sample>,
  release: number,
  {shift = 0}: {shift?: number} = {},
) {
  const tracker = new VelocityTracker();
  for (const [time, x, y] of samples) {
    tracker.add(x, y, time + shift);
  }
  return {
    pan: tracker.velocity(release + shift),
    scroll: tracker.scrollVelocity(release + shift),
  };
}

describe('VelocityTracker on recorded pointer streams (spec:AST-100 FR4)', () => {
  it('has a slow drag, a fling and a stop-then-release for every platform, browser and pointer type', () => {
    const sources = [
      'android-chromium',
      'android-firefox',
      'ios-safari',
      'desktop-chromium-mouse',
      'desktop-chromium-pen',
      'desktop-chromium-touch',
    ];
    expect(FIXTURES.map(f => f.file)).toEqual(
      sources
        .flatMap(source =>
          ['fling', 'slow', 'stop-release'].map(g => `${source}-${g}.json`),
        )
        .sort(),
    );
    for (const f of FIXTURES) {
      expect(f.schema).toBe(1);
      expect(f.caveat).toMatch(/not a finger/);
    }
  });

  for (const f of FIXTURES) {
    describe(`${f.file} (${f.browser}, ${f.pointerType})`, () => {
      const samples = pointerSamples(f);
      const release = releaseTime(f, 'pointerup', samples);
      const pointer = replay(samples, release);

      if (f.gesture === 'stop-release') {
        it('releases at 0 after holding still', () => {
          expect(pointer.pan).toEqual({x: 0, y: 0});
          expect(pointer.scroll).toEqual({x: 0, y: 0});
        });
      } else if (f.release.check === 'shape') {
        it('is not velocity evidence: it releases moving along +y, with x under 10% of y', () => {
          expect(pointer.pan.y).toBeGreaterThan(0);
          expect(Math.abs(pointer.pan.x)).toBeLessThanOrEqual(
            0.1 * pointer.pan.y,
          );
        });
      } else {
        it('releases within 10% of the injected speed', () => {
          const speed = f.injected.speed;
          expect(Math.abs(pointer.pan.y - speed)).toBeLessThanOrEqual(
            0.1 * speed,
          );
          expect(Math.abs(pointer.scroll.y - speed)).toBeLessThanOrEqual(
            0.1 * speed,
          );
          expect(Math.abs(pointer.pan.x)).toBeLessThanOrEqual(0.1 * speed);
        });
      }

      const touches = touchSamples(f);
      if (touches.length > 1) {
        it('reads the same velocity from the touch stream, within 10%', () => {
          const touch = replay(touches, releaseTime(f, 'touchend', touches));
          const scale = Math.max(Math.abs(pointer.pan.y), 1);
          expect(Math.abs(touch.pan.y - pointer.pan.y)).toBeLessThanOrEqual(
            0.1 * scale,
          );
        });
      }

      if (f.release.check !== 'shape') {
        it('reads the same under a busy main thread: one event per four input samples', () => {
          const busy = replay(busySamples(f, 4), release);
          if (f.gesture === 'stop-release') {
            expect(busy.pan).toEqual({x: 0, y: 0});
          } else {
            const speed = f.injected.speed;
            expect(Math.abs(busy.pan.y - speed)).toBeLessThanOrEqual(
              0.1 * speed,
            );
          }
        });
      }

      it('reads each event’s own time: a shifted clock changes nothing', () => {
        const shifted = replay(samples, release, {shift: 123_456.789});
        expect(shifted.pan.x).toBeCloseTo(pointer.pan.x, 6);
        expect(shifted.pan.y).toBeCloseTo(pointer.pan.y, 6);
      });
    });
  }
});
