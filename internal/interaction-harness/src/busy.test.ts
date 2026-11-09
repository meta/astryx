// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file busy.test.ts
 * @input Synthetic tracked frames and recorded runs (no browser)
 * @output The busy-main-thread verdict's limits: dropped frames a loaded
 *   machine produces pass, a frozen animation fails every criterion, a window
 *   with nothing moving to judge fails, and out-of-order frames are judged in
 *   presentation order; a settle bound in cast steps reads the step from the
 *   run (2 px in WebKit's cast, 1 px in Chromium's), stops a WebKit coast at
 *   its tail's plateaus where a 2 px bound reads them as a stall, and still
 *   fails a 40 ms freeze more than two steps from rest in either cast. The
 *   proof reads a held frame at its run's own pace, whatever the settle
 *   bound. A slow spring late in a WebKit block passes, and its holds and a
 *   freeze still fail. A sub-pixel read judges every frame of a slow slide
 *   that a whole-pixel read shows as stalls, and still fails a freeze. Against
 *   a control, a frame delivered early on such a slide misses on a
 *   whole-pixel read and moves on a sub-pixel one.
 * @position Unit test of ./busy and ./frames' ordering; the browser proof
 *   with a real compositor animation and a rAF control is in
 *   harness.interaction.browser.spec.ts.
 */

import {describe, expect, it} from 'vitest';
import {busyWindowProof, BusyWindowTooLateError, castStep} from './busy';
import * as lateBlock from './busy.lateblock.fixture';
import * as skip from './busy.skip.fixture';
import * as slowTail from './busy.slowtail.fixture';
import * as webkitDecel from './busy.webkitdecel.fixture';
import * as webkitTail from './busy.webkittail.fixture';
import {
  inPresentationOrder,
  SUBPIXEL_STEP_PX,
  type TrackedFrame,
} from './frames';

const FRAME = 1000 / 60;
const BLOCK = {from: 1000, to: 1700};

/** A marker moving 3 px per frame from t = 800 to 1900, minus `dropped` frame indices. */
function moving(dropped: readonly number[] = []): TrackedFrame[] {
  const frames: TrackedFrame[] = [];
  for (let i = 0; 800 + i * FRAME <= 1900; i += 1) {
    if (dropped.includes(i)) {
      continue;
    }
    frames.push({
      t: 800 + i * FRAME,
      box: {x: 0, y: 3 * i, width: 10, height: 10},
    } as TrackedFrame);
  }
  return frames;
}

/** Index of the first frame at or after `t`. */
const at = (t: number) => Math.ceil((t - 800) / FRAME);

/** `moving()` with each frame in `repeats` presenting the previous frame's position. */
function repeating(repeats: readonly number[]): TrackedFrame[] {
  return moving().map((f, i) =>
    repeats.includes(i)
      ? ({...f, box: {...f.box!, y: 3 * (i - 1)}} as TrackedFrame)
      : f,
  );
}

/** A marker moving 3 px per frame from t = 800 to 1900, frames `intervals` apart in turn. */
function cadenced(intervals: readonly number[]): TrackedFrame[] {
  const frames: TrackedFrame[] = [];
  for (let i = 0, t = 800; t <= 1900; i += 1) {
    frames.push({
      t,
      box: {x: 0, y: 3 * i, width: 10, height: 10},
    } as TrackedFrame);
    t += intervals[i % intervals.length];
  }
  return frames;
}

describe('busyWindowProof verdict', () => {
  it('passes a compositor animation with every frame', () => {
    const proof = busyWindowProof(moving(), BLOCK);
    expect(proof.verdict.failures).toEqual([]);
    expect(proof.longestStallFrames).toBe(1);
  });

  it('passes one and two consecutive dropped frames (3 intervals)', () => {
    const k = at(1300);
    expect(busyWindowProof(moving([k]), BLOCK).verdict.failures).toEqual([]);
    const two = busyWindowProof(moving([k, k + 1]), BLOCK);
    expect(two.longestStallFrames).toBe(3);
    expect(two.verdict.failures).toEqual([]);
  });

  it('fails three consecutive dropped frames', () => {
    const k = at(1300);
    const proof = busyWindowProof(moving([k, k + 1, k + 2]), BLOCK);
    expect(proof.longestStallFrames).toBe(4);
    expect(proof.verdict.failures.join('\n')).toMatch(/longest stall/);
  });

  it('fails when more than 10% of the delivered frames do not move', () => {
    const k = at(1050);
    // 39 frames delivered: up to 3 may show no new position (10% = 3.9).
    const scattered = [0, 12, 24].map(d => k + d);
    expect(
      busyWindowProof(repeating(scattered), BLOCK).verdict.failures,
    ).toEqual([]);
    const many = [0, 6, 12, 18, 24].map(d => k + d);
    expect(
      busyWindowProof(repeating(many), BLOCK).verdict.failures.join('\n'),
    ).toMatch(/expected frames moved/);
  });

  it('judges a frame the screencast did not deliver as a gap for the stall check, not a miss', () => {
    // The same five frames, not delivered: two-interval gaps, and every
    // delivered frame moved.
    const k = at(1050);
    const many = [0, 6, 12, 18, 24].map(d => k + d);
    const proof = busyWindowProof(moving(many), BLOCK);
    expect(proof.verdict.failures).toEqual([]);
    expect(proof.deliveredFrames).toBe(proof.moved);
  });

  it('judges an irregular cast on the frames it delivered', () => {
    // A cast cycling 11.7, 11.7 and 17 ms: its median interval would expect
    // 56 frames where it delivered 49, every one moved.
    const proof = busyWindowProof(cadenced([11.7, 11.7, 17]), BLOCK);
    expect(proof.verdict.failures).toEqual([]);
    expect(proof.deliveredFrames).toBe(49);
    expect(proof.moved).toBe(49);
    // Still a stall where it delivers nothing for four frames, and still a
    // miss where five delivered frames show no new position.
    const gap = cadenced([11.7, 11.7, 17]).filter(
      f => f.t < 1300 || f.t > 1360,
    );
    expect(busyWindowProof(gap, BLOCK).verdict.failures.join('\n')).toMatch(
      /longest stall/,
    );
    const unmoved = cadenced([11.7, 11.7, 17]).map((f, i, all) =>
      [20, 26, 32, 38, 44].includes(i)
        ? ({...f, box: {...all[i - 1].box!}} as TrackedFrame)
        : f,
    );
    expect(busyWindowProof(unmoved, BLOCK).verdict.failures.join('\n')).toMatch(
      /expected frames moved/,
    );
  });

  it('judges a window that delivered fewer than four frames against its span', () => {
    // A rAF animation frozen by the block, in WebKit: one frame from before
    // the block arrives 45 ms into it, then nothing until after it.
    const late = moving().filter(f => f.t <= 1000 || f.t >= 1750);
    late.push({
      t: 1045,
      box: {x: 0, y: 3 * at(1001), width: 10, height: 10},
    } as TrackedFrame);
    const proof = busyWindowProof(inPresentationOrder(late), BLOCK);
    expect(proof.verdict.failures.join('\n')).toMatch(/expected frames moved/);
  });

  it('lets a short window miss a frame, not three', () => {
    // 150 ms judged: nine frames delivered, one miss allowed (10% would be 0.9).
    const short = {from: 1000, to: 1190};
    const k = at(1040);
    expect(busyWindowProof(repeating([k]), short).verdict.failures).toEqual([]);
    expect(
      busyWindowProof(
        repeating([k, k + 3, k + 6]),
        short,
      ).verdict.failures.join('\n'),
    ).toMatch(/expected frames moved/);
  });

  it('fails a frozen animation on every criterion', () => {
    // Frames before and after the block only: nothing changed during it.
    const frozen = moving().filter(f => f.t < BLOCK.from || f.t > BLOCK.to);
    const proof = busyWindowProof(frozen, BLOCK);
    expect(proof.changed).toBe(0);
    expect(proof.verdict.pass).toBe(false);
    expect(proof.verdict.failures.join('\n')).toMatch(/no frame presented/);
    expect(proof.verdict.failures.join('\n')).toMatch(/longest stall/);
    expect(proof.verdict.failures.join('\n')).toMatch(/expected frames moved/);
  });

  it('names a block that began after the motion had settled, with its numbers', () => {
    // Settled 50 ms before the block: nothing in it is left to judge.
    const settled = moving().map(f =>
      f.t < 950
        ? f
        : ({...f, box: {...f.box!, y: 3 * at(950)}} as TrackedFrame),
    );
    let thrown: unknown;
    try {
      busyWindowProof(settled, BLOCK, {settledWithin: 2});
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BusyWindowTooLateError);
    const late = thrown as BusyWindowTooLateError;
    expect(late.message).toMatch(
      /within 2 px of where it ends from 0 ms after the block began, before the judged part began at 20 ms/,
    );
    expect(late.numbers).toEqual({
      settledAtMs: 0,
      judgedFromMs: 20,
      presented: expect.any(Number),
    });
  });

  it('names a late block on a sparse screencast, whichever frames it delivers', () => {
    // Settled 100 ms before the block, one frame in six: the block's first
    // frame can come after the judged part begins.
    const settled = moving().map(f =>
      f.t < 900
        ? f
        : ({...f, box: {...f.box!, y: 3 * at(900)}} as TrackedFrame),
    );
    for (let phase = 0; phase < 6; phase += 1) {
      const sixth = settled.filter((_, i) => i % 6 === phase);
      expect(() => busyWindowProof(sixth, BLOCK, {settledWithin: 2})).toThrow(
        BusyWindowTooLateError,
      );
    }
    // The fourth phase's first frame in the block comes 50 ms in, after the
    // judged part begins. The frame 50 ms before the block names the settle.
    let thrown: unknown;
    try {
      busyWindowProof(
        settled.filter((_, i) => i % 6 === 3),
        BLOCK,
        {settledWithin: 2},
      );
    } catch (error) {
      thrown = error;
    }
    expect((thrown as BusyWindowTooLateError).message).toMatch(
      /within 2 px of where it ends from 50 ms before the block began/,
    );
    expect((thrown as BusyWindowTooLateError).numbers.settledAtMs).toBeCloseTo(
      -50,
    );
  });

  it('fails a window in which the animation under test was not moving', () => {
    // Settled 40 ms into the block: two frames, too few to judge.
    const early = moving().map(f =>
      f.t < 1040
        ? f
        : ({...f, box: {...f.box!, y: 3 * at(1040)}} as TrackedFrame),
    );
    expect(
      busyWindowProof(early, BLOCK, {settledWithin: 2}).verdict.failures.join(
        '\n',
      ),
    ).toMatch(/frames < 4: the animation under test was not moving/);
  });

  it('judges the frames a slower screencast delivers by default, and display rate only when asked', () => {
    // One frame in six, as a loaded machine's screencast delivers: every
    // delivered frame moved, so the default verdict passes.
    const sixth = moving().filter((_, i) => i % 6 === 0);
    expect(busyWindowProof(sixth, BLOCK).verdict.failures).toEqual([]);
    // Half rate fails only a proof that claims display rate.
    const odd = moving().filter((_, i) => i % 2 === 1);
    expect(busyWindowProof(odd, BLOCK).verdict.pass).toBe(true);
    expect(
      busyWindowProof(odd, BLOCK, {maxMedianFrameMs: 20}).verdict.failures.join(
        '\n',
      ),
    ).toMatch(/median frame interval/);
  });
});

describe('busyWindowProof settledWithin', () => {
  it('ends the judgment at a rounded easing tail, which would read as a stall', () => {
    // An ease-out to y = 24 as the screencast reports it: whole pixels, so the
    // tail repeats values while it still moves.
    const ys = [
      120, 100, 82, 67, 55, 46, 39, 34, 30, 28, 27, 26, 26, 26, 25, 25, 24, 24,
      24, 24,
    ];
    const frames = ys.map(
      (y, i) =>
        ({
          t: 1000 + i * FRAME,
          box: {x: 0, y, width: 10, height: 10},
        }) as TrackedFrame,
    );
    const window = {from: 1000, to: 1000 + ys.length * FRAME};
    const loose = busyWindowProof(frames, window, {
      settledWithin: 2,
      marginMs: 0,
    });
    expect(loose.verdict.failures).toEqual([]);
    const strict = busyWindowProof(frames, window, {
      settledWithin: 1,
      marginMs: 0,
    });
    expect(strict.longestStallFrames).toBeGreaterThanOrEqual(3);
  });

  it('takes the end value from settledAt over a stale last frame', () => {
    // The tail reaches y = 24, then the last frame shows a stale 100 (WebKit
    // presents the last committed position once an accelerated animation
    // ends while the main thread is still blocked).
    const ys = [
      120, 100, 82, 67, 55, 46, 39, 34, 30, 28, 27, 26, 25, 24, 24, 24, 100,
    ];
    const frames = ys.map(
      (y, i) =>
        ({
          t: 1000 + i * FRAME,
          box: {x: 0, y, width: 10, height: 10},
        }) as TrackedFrame,
    );
    const window = {from: 1000, to: 1000 + ys.length * FRAME};
    const stale = busyWindowProof(frames, window, {
      settledWithin: 2,
      marginMs: 0,
    });
    expect(stale.verdict.pass).toBe(false);
    const fromPage = busyWindowProof(frames, window, {
      settledWithin: 2,
      settledAt: 24,
      marginMs: 0,
    });
    expect(fromPage.verdict.failures).toEqual([]);
    expect(fromPage.judged.to).toBe(frames[11].t);
  });
});

/** Seen at rest at t = 900, then on screen from `start`, moving 3 px a frame. */
function startingAt(start: number): TrackedFrame[] {
  const frames = [
    {t: 900, box: {x: 0, y: 0, width: 10, height: 10}} as TrackedFrame,
  ];
  for (let i = 1; start + (i - 1) * FRAME <= 1900; i += 1) {
    frames.push({
      t: start + (i - 1) * FRAME,
      box: {x: 0, y: 3 * i, width: 10, height: 10},
    } as TrackedFrame);
  }
  return frames;
}

describe('busyWindowProof on-screen start', () => {
  it('judges a just-started animation from its first presented change when it was seen at rest before the block, and reports when', () => {
    // On screen 87 ms into the block: four intervals after the judged part's start.
    const proof = busyWindowProof(startingAt(1087), BLOCK);
    expect(proof.verdict.failures).toEqual([]);
    expect(proof.onScreenFromMs).toBeCloseTo(87, 5);
    expect(proof.judged.from).toBeCloseTo(1087, 5);
    expect(proof.summary).toMatch(
      /on screen from \+87 ms \(nothing moved before the block\)/,
    );
  });

  it('still fails an animation that was already moving and stalls at the block start', () => {
    const k = at(1020);
    const proof = busyWindowProof(moving([k, k + 1, k + 2, k + 3]), BLOCK);
    expect(proof.onScreenFromMs).toBeNull();
    expect(proof.verdict.failures.join('\n')).toMatch(/longest stall/);
  });

  it('still fails a stall at the start when no frame before the block shows it at rest', () => {
    const unseen = startingAt(1087).filter(f => f.t >= BLOCK.from);
    const proof = busyWindowProof(unseen, BLOCK);
    expect(proof.onScreenFromMs).toBeNull();
    expect(proof.verdict.failures.join('\n')).toMatch(/longest stall/);
  });

  it('judges an element that enters from off screen from its first position inside the block, and reports when', () => {
    // The cast's frames before the block show the screen without it.
    const entering = moving().map(f =>
      f.t < 1020
        ? ({...f, box: null} as TrackedFrame)
        : ({...f, box: {...f.box!, y: f.box!.y - 60}} as TrackedFrame),
    );
    const proof = busyWindowProof(entering, BLOCK);
    expect(proof.verdict.failures).toEqual([]);
    expect(proof.onScreenFromMs).toBeGreaterThanOrEqual(20);
    expect(proof.onScreenFromMs).toBeLessThan(20 + FRAME);
    expect(proof.summary).toMatch(/\(off screen before the block\)/);
  });

  it('still fails an entrance the main thread drives: off screen before the block, and no frame in it shows the element', () => {
    const blocked = moving().map(f =>
      f.t < 1720 ? ({...f, box: null} as TrackedFrame) : f,
    );
    const proof = busyWindowProof(blocked, BLOCK);
    expect(proof.onScreenFromMs).toBeNull();
    expect(proof.verdict.failures.join('\n')).toMatch(/no frame presented/);
  });

  it('still fails an entrance the block delays: too few frames inside it from the first position', () => {
    const late = moving().map(f =>
      f.t < 1640 ? ({...f, box: null} as TrackedFrame) : f,
    );
    const proof = busyWindowProof(late, BLOCK);
    expect(proof.onScreenFromMs).toBeGreaterThanOrEqual(640);
    expect(proof.verdict.failures.join('\n')).toMatch(
      /frames < 4: the animation under test was not moving/,
    );
  });

  it('still fails a start the block itself delays until it ends', () => {
    const proof = busyWindowProof(startingAt(1720), BLOCK);
    expect(proof.onScreenFromMs).toBeNull();
    expect(proof.verdict.failures.join('\n')).toMatch(/no frame presented/);
    expect(proof.verdict.failures.join('\n')).toMatch(/longest stall/);
  });

  it('still fails a start that leaves fewer than minJudgedFrames inside the block', () => {
    const proof = busyWindowProof(startingAt(1640), BLOCK);
    expect(proof.onScreenFromMs).toBeCloseTo(640, 5);
    expect(proof.verdict.failures.join('\n')).toMatch(
      /frames < 4: the animation under test was not moving/,
    );
  });
});

describe('busyWindowProof position step', () => {
  it("reports the cast's position step and motion per frame, and notes motion under two steps without failing", () => {
    // 2.4 px a frame on a 2 px grid, as WebKit's casts report positions.
    const grid = moving().map(
      (f, i) =>
        ({
          ...f,
          box: {...f.box!, y: 2 * Math.round((2.4 * i) / 2)},
        }) as TrackedFrame,
    );
    const coarse = busyWindowProof(grid, BLOCK);
    expect(coarse.stepPx).toBe(2);
    expect(coarse.pxPerFrame).toBeCloseTo(2.4, 1);
    expect(coarse.notes.join('\n')).toMatch(
      /under two of the cast's 2 px position steps/,
    );
    expect(coarse.summary).toMatch(/2\.4 px\/frame in 2 px steps; note: /);
    expect(coarse.verdict.failures).toEqual([]);
    // 3 px a frame in whole pixels: resolvable, nothing to note.
    const fine = busyWindowProof(moving(), BLOCK);
    expect(fine.stepPx).toBe(1);
    expect(fine.pxPerFrame).toBeCloseTo(3, 1);
    expect(fine.notes).toEqual([]);
  });
});

/** The compositor presenting every frame from `from` to `to`, minus `gaps` ([from, to] spans). */
function drawn(
  gaps: ReadonlyArray<readonly [number, number]> = [],
  from = 700,
  to = 2000,
): number[] {
  const draws: number[] = [];
  for (let t = from; t <= to; t += FRAME) {
    if (!gaps.some(([a, b]) => t > a && t < b)) {
      draws.push(t);
    }
  }
  return draws;
}

const skipFrames = (): TrackedFrame[] =>
  skip.frames.map(
    ([t, y]) =>
      ({
        t,
        box: y == null ? null : {x: 0, y, width: 10, height: 10},
      }) as TrackedFrame,
  );

describe('busyWindowProof with the compositor record', () => {
  it('with a compositor record, judges a sparse cast from its first to its last moved frame', () => {
    // One screencast frame in six, as on a loaded machine, with the compositor
    // presenting every frame: the frames before the first and after the last
    // moved one are the stall check's, not misses.
    const sparse = moving().filter((_, i) => i % 6 === 0);
    expect(
      busyWindowProof(sparse, BLOCK, {presented: drawn()}).verdict.failures,
    ).toEqual([]);
  });

  it('with a compositor record and an on-screen start, counts the frames it credits as skipped in what it judges', () => {
    // On screen 87 ms into the block, then four delivered frames that show
    // no new position: that fails on a full cast.
    const misses = [15, 20, 25, 30];
    const missing = startingAt(1087).map((f, i, all) =>
      misses.includes(i)
        ? ({...f, box: {...all[i - 1].box!}} as TrackedFrame)
        : f,
    );
    const full = busyWindowProof(missing, BLOCK, {presented: drawn()});
    expect(full.verdict.failures.join('\n')).toMatch(/expected frames moved/);
    // The screencast skipping the five frames after the on-screen frame
    // changes nothing: the compositor presented them, and they are judged.
    const skip = (frames: TrackedFrame[]) =>
      frames.filter((_, i) => i < 2 || i > 6);
    const skipped = busyWindowProof(skip(missing), BLOCK, {
      presented: drawn(),
    });
    expect(skipped.recorderSkipped).toBe(5);
    expect(skipped.verdict.failures.join('\n')).toMatch(
      /expected frames moved/,
    );
    // And a run with no misses never reads as more than every frame moved.
    const clean = busyWindowProof(skip(startingAt(1087)), BLOCK, {
      presented: drawn(),
    });
    expect(clean.verdict.failures).toEqual([]);
    expect(clean.movedFraction).toBeLessThanOrEqual(1);
  });

  it('reads frames the screencast skipped while the compositor presented them as presented: a recorded run that fails without the record', () => {
    const frames = skipFrames();
    const alone = busyWindowProof(frames, skip.block, {settledWithin: 1});
    expect(alone.verdict.failures.join('\n')).toMatch(
      /longest stall 6\d\.\d ms = 4 intervals > 3/,
    );
    // Every frame the screencast delivered moved: only the stall remains,
    // which the record resolves.
    expect(alone.verdict.failures.join('\n')).not.toMatch(
      /expected frames moved/,
    );
    const proof = busyWindowProof(frames, skip.block, {
      settledWithin: 1,
      presented: skip.presented,
    });
    expect(proof.verdict.failures).toEqual([]);
    expect(proof.recorderSkipped).toBe(5);
    expect(proof.longestStallFrames).toBeLessThanOrEqual(2);
    expect(proof.summary).toMatch(
      /the screencast skipped 5 frames the compositor presented \(at \+3\d\d ms, \+4\d\d ms\)/,
    );
  });

  it('counts a gap the compositor drew through as skipped, and one it did not draw through as a stall', () => {
    const k = at(1300);
    const gap: [number, number] = [
      800 + (k - 1) * FRAME,
      800 + (k + 4) * FRAME,
    ];
    const frames = moving([k, k + 1, k + 2, k + 3]);
    expect(busyWindowProof(frames, BLOCK).verdict.pass).toBe(false);
    const skipped = busyWindowProof(frames, BLOCK, {presented: drawn()});
    expect(skipped.verdict.failures).toEqual([]);
    expect(skipped.recorderSkipped).toBe(4);
    const stalled = busyWindowProof(frames, BLOCK, {presented: drawn([gap])});
    expect(stalled.recorderSkipped).toBe(0);
    expect(stalled.verdict.failures.join('\n')).toMatch(/longest stall/);
  });

  it('still fails an element that does not move while the compositor presents for something else', () => {
    const frozen = moving().map(f =>
      f.t >= BLOCK.from && f.t <= BLOCK.to
        ? ({...f, box: {...f.box!, y: 3 * at(BLOCK.from)}} as TrackedFrame)
        : f,
    );
    const proof = busyWindowProof(frozen, BLOCK, {presented: drawn()});
    expect(proof.verdict.failures.join('\n')).toMatch(/longest stall/);
    expect(proof.verdict.failures.join('\n')).toMatch(/expected frames moved/);
  });

  it('still fails a frozen animation, whether or not the compositor presents during the block', () => {
    const frozen = moving().filter(f => f.t < BLOCK.from || f.t > BLOCK.to);
    for (const presented of [drawn([[BLOCK.from, BLOCK.to]]), drawn()]) {
      const proof = busyWindowProof(frozen, BLOCK, {presented});
      expect(proof.verdict.failures.join('\n')).toMatch(/no frame presented/);
      expect(proof.verdict.failures.join('\n')).toMatch(/longest stall/);
    }
  });

  it('keeps a gap a stall when the screencast delivered a frame inside it that did not move', () => {
    const k = at(1300);
    const frames = moving([k, k + 1, k + 3]).map(f =>
      f.t > 800 + (k + 1.5) * FRAME && f.t < 800 + (k + 2.5) * FRAME
        ? ({...f, box: {...f.box!, y: 3 * (k - 1)}} as TrackedFrame)
        : f,
    );
    const proof = busyWindowProof(frames, BLOCK, {presented: drawn()});
    expect(proof.recorderSkipped).toBe(0);
    expect(proof.verdict.failures.join('\n')).toMatch(/longest stall/);
  });

  it('still counts single dropped frames the compositor did not present as missed', () => {
    const k = at(1050);
    const drops = [0, 6, 12, 18, 24, 30].map(d => k + d);
    const frames = moving(drops);
    const gaps = drops.map(
      i =>
        [800 + (i - 0.5) * FRAME, 800 + (i + 0.5) * FRAME] as [number, number],
    );
    expect(
      busyWindowProof(frames, BLOCK, {
        presented: drawn(gaps),
      }).verdict.failures.join('\n'),
    ).toMatch(/expected frames moved/);
    expect(
      busyWindowProof(frames, BLOCK, {presented: drawn()}).verdict.failures,
    ).toEqual([]);
  });

  it('judges a gap at the edge of the judged part from the screencast alone', () => {
    // Nothing delivered for the block's first 90 ms: a stall at its start,
    // whatever the compositor drew, since no moved frame opens the gap.
    const frames = moving().filter(
      f => f.t < BLOCK.from || f.t > BLOCK.from + 90,
    );
    const proof = busyWindowProof(frames, BLOCK, {presented: drawn()});
    expect(proof.recorderSkipped).toBe(0);
    expect(proof.verdict.failures.join('\n')).toMatch(/longest stall/);
  });

  it('treats an empty record as no record, and says so', () => {
    const frames = moving([at(1300), at(1300) + 1, at(1300) + 2, at(1300) + 3]);
    const proof = busyWindowProof(frames, BLOCK, {presented: []});
    expect(proof.verdict.failures).toEqual(
      busyWindowProof(frames, BLOCK).verdict.failures,
    );
    expect(proof.summary).toMatch(/no compositor frames recorded/);
  });
});

describe('inPresentationOrder', () => {
  it('sorts frames delivered out of order, so motion stays monotonic', () => {
    const frames = moving();
    const k = at(1040);
    const shuffled = [...frames];
    [shuffled[k], shuffled[k + 1]] = [shuffled[k + 1], shuffled[k]];
    expect(busyWindowProof(shuffled, BLOCK).monotonic).toBe(false);
    const proof = busyWindowProof(inPresentationOrder(shuffled), BLOCK);
    expect(proof.monotonic).toBe(true);
    expect(proof.verdict.failures).toEqual([]);
  });
});

/** `slowTail`'s frames as tracked boxes on the x axis. */
const slowTailFrames = (
  frames: ReadonlyArray<readonly [number, number | null]>,
): TrackedFrame[] =>
  frames.map(
    ([t, x]) =>
      ({
        t,
        box: x == null ? null : {x, y: 0, width: 1, height: 1},
      }) as TrackedFrame,
  );

describe('busyWindowProof in a slow tail', () => {
  it('reads a frame that shows no step under two steps a frame, then a two-frame catch-up, as moved', () => {
    // A spring settling: 3.6 px a frame over the window, about 1.7 in its
    // tail on a 1 px grid. Its frame at +968 ms holds the position before
    // while the control moves, and the next catches up 2 px.
    const proof = busyWindowProof(
      slowTailFrames(slowTail.tracked),
      slowTail.block,
      {
        axis: 'x',
        settledWithin: 2,
        control: slowTailFrames(slowTail.control),
      },
    );
    expect(proof.verdict.failures).toEqual([]);
    expect(proof.notes.join('\n')).toMatch(
      /under two of the cast's 1 px position steps from \+\d+ ms/,
    );
  });

  it('still fails a two-frame freeze in a slow tail', () => {
    const tracked = slowTailFrames(slowTail.tracked);
    // Hold the tail's position for two frames before the catch-up.
    const i = tracked.findIndex(f => f.t > 968 && f.t < 975);
    const frozen = tracked.map((f, k) =>
      k === i + 1 ? ({...f, box: {...tracked[i].box!}} as TrackedFrame) : f,
    );
    const proof = busyWindowProof(frozen, slowTail.block, {
      axis: 'x',
      settledWithin: 2,
      control: slowTailFrames(slowTail.control),
    });
    expect(proof.verdict.failures.join('\n')).toMatch(/moved on \d+ of/);
  });

  it('still fails a two-frame freeze right after one frame that showed no step, at one step a frame or more', () => {
    // 1.75 px a frame on a 1 px grid, the control moving on every frame: one
    // frame shows no step (an early delivery can explain that), then the two
    // frames after the next step hold too, which an early delivery cannot.
    const j = at(1300);
    const frames = moving().map((f, i) => {
      const y =
        i === j
          ? Math.floor(1.75 * (j - 1))
          : i === j + 2 || i === j + 3
            ? Math.floor(1.75 * (j + 1))
            : Math.floor(1.75 * i);
      return {...f, box: {...f.box!, y}} as TrackedFrame;
    });
    const control = moving().map(
      f =>
        ({
          ...f,
          box: {x: f.box!.y, y: 0, width: 12, height: 12},
        }) as TrackedFrame,
    );
    const proof = busyWindowProof(frames, BLOCK, {control});
    expect(proof.stepPx).toBe(1);
    expect(proof.verdict.failures.join('\n')).toMatch(/moved on \d+ of/);
  });

  it('under one step a frame, still fails a two-frame freeze that ends in a three-step catch-up, and reads one early frame as moved', () => {
    // 0.8 px a frame on a 1 px grid, then the same doubled on a 2 px grid,
    // the control moving on every frame. Frame 42 shows 33 px (0.8 px a frame
    // from 0); an early frame there adds at most one step to the catch-up.
    const control = moving().map(
      f =>
        ({
          ...f,
          box: {x: f.box!.y, y: 0, width: 12, height: 12},
        }) as TrackedFrame,
    );
    const at08 = (held: readonly number[], grid: number) =>
      moving().map((f, i) => {
        const shown = held.includes(i) ? 42 : i;
        return {
          ...f,
          box: {...f.box!, y: grid * Math.floor(0.8 * shown)},
        } as TrackedFrame;
      });
    for (const grid of [1, 2]) {
      // 32, 32, 33, 33, 33, 36 (doubled on the 2 px grid): a freeze.
      const frozen = busyWindowProof(at08([43, 44], grid), BLOCK, {control});
      expect(frozen.stepPx).toBe(grid);
      expect(frozen.verdict.failures.join('\n')).toMatch(/moved on \d+ of/);
      // 32, 32, 33, 33, 35: one early frame, then the frames go on.
      const early = busyWindowProof(at08([43], grid), BLOCK, {control});
      expect(early.verdict.failures).toEqual([]);
    }
  });

  it('still fails a frame that shows no step in a fast window', () => {
    // 3 px a frame, the control moving on every frame: one repeated frame is
    // a freeze there, and its 6 px catch-up two steps past the grid.
    const control = moving().map(
      f =>
        ({
          ...f,
          box: {x: f.box!.y, y: 0, width: 12, height: 12},
        }) as TrackedFrame,
    );
    const proof = busyWindowProof(repeating([at(1300)]), BLOCK, {control});
    expect(proof.verdict.failures.join('\n')).toMatch(/moved on \d+ of/);
  });
});

describe('busyWindowProof in a slow tail late in a WebKit block', () => {
  const control = slowTailFrames(lateBlock.control);
  /**
   * The spring's frames, each frame from `from` through `to` ms holding the
   * position before.
   */
  const held = (from: number, to: number): TrackedFrame[] => {
    const frames = slowTailFrames(lateBlock.tracked);
    const hold = [...frames].reverse().find(f => f.t < from)!.box!;
    return frames.map(f =>
      f.t >= from && f.t <= to ? ({...f, box: {...hold}} as TrackedFrame) : f,
    );
  };
  const judge = (tracked: readonly TrackedFrame[]) =>
    busyWindowProof(tracked, lateBlock.block, {
      axis: 'x',
      settledWithin: 2,
      control,
    });

  it("reads a held frame at its run's own pace where uneven stamps put the frames before it over two steps a frame", () => {
    // The frame at +942 ms holds the position before while the control
    // moves, and the next catches up 2 px. The run moves 1.0 px a frame.
    const proof = judge(slowTailFrames(lateBlock.tracked));
    expect(proof.verdict.failures).toEqual([]);
  });

  it('still fails a one-frame hold there where the spring moves two steps a frame or more', () => {
    // Held at 168 px at +397 ms, where the spring moves about 5 px a frame:
    // the next frame catches up 9 px.
    const proof = judge(held(390, 400));
    expect(proof.verdict.failures.join('\n')).toMatch(
      /moved on \d+ of the \d+ frames the control moved/,
    );
  });

  it('still fails a two-frame hold in its slow tail', () => {
    // Held at 258 px at +847 and +872 ms, then 264 px: about 1.6 px a frame
    // across the run, two frames held.
    const proof = judge(held(840, 880));
    expect(proof.verdict.failures.join('\n')).toMatch(
      /moved on \d+ of the \d+ frames the control moved/,
    );
  });

  it('still fails the spring frozen through the block', () => {
    const proof = judge(held(100, 1000));
    expect(proof.verdict.pass, proof.summary).toBe(false);
  });

  it('reads a held frame across a sparse stretch at the pace before it', () => {
    // 1 px a frame, then three frames 36.7 ms apart read 230, 230 and 232.
    // The pace before the run explains the held frame, as with frames on
    // time. The run's own reading, over the time it spans, is slower.
    const frames: (readonly [number, number])[] = [];
    for (let i = 0; i <= 30; i += 1) {
      frames.push([-200 + i * 16.7, 200 + i]);
    }
    const sparse = frames[frames.length - 1][0];
    frames.push([sparse + 36.7, 230], [sparse + 73.4, 232]);
    for (let j = 1; sparse + 73.4 + j * 16.7 <= 1100; j += 1) {
      frames.push([sparse + 73.4 + j * 16.7, 232 + j]);
    }
    const proof = busyWindowProof(slowTailFrames(frames), lateBlock.block, {
      axis: 'x',
      settledWithin: 2,
      control: slowTailFrames(
        frames.map(([t]) => [t, Math.round(0.18 * (t + 200))] as const),
      ),
    });
    expect(proof.verdict.failures).toEqual([]);
  });
});

describe('busyWindowProof settledWithinSteps', () => {
  /** Holds the position the frame at or before `fromT` shows for `ms`. */
  const freeze = (
    frames: readonly TrackedFrame[],
    fromT: number,
    ms: number,
  ): TrackedFrame[] => {
    const held = [...frames].reverse().find(f => f.t <= fromT)!.box!;
    return frames.map(f =>
      f.t > fromT && f.t <= fromT + ms
        ? ({...f, box: {...held}} as TrackedFrame)
        : f,
    );
  };
  /** Frames as `trackMarker` returns them, with the cast's step. */
  const cast = (
    frames: ReadonlyArray<readonly [number, number | null]>,
    step: {x: number; y: number},
  ): TrackedFrame[] => slowTailFrames(frames).map(f => ({...f, step}));
  // Chromium's cast is a PNG at the viewport's size: 1 px a step.
  const PNG = {x: 1, y: 1};
  const chromium = (frames: ReadonlyArray<readonly [number, number | null]>) =>
    cast(frames, PNG);
  const webkit = (frames: ReadonlyArray<readonly [number, number | null]>) =>
    cast(frames, webkitTail.step);

  it("reads the cast's position step from its frames, not from the motion", () => {
    expect(castStep(webkit(webkitTail.tracked), 'x')).toBe(2);
    expect(castStep(chromium(slowTail.tracked), 'x')).toBe(1);
    expect(() => castStep(slowTailFrames(slowTail.tracked), 'x')).toThrow(
      /no tracked frame carries the cast's step/,
    );
  });

  it("judges a WebKit coast to two of its cast's 2 px steps from rest, where a 2 px bound reads the tail's plateaus as a stall", () => {
    const control = webkit(webkitTail.control);
    const tracked = webkit(webkitTail.tracked);
    // Its tail during the block: 212, 212, 214, 214, 216 for four frames,
    // then 218 from +225 ms, the control moving on every frame.
    const inPx = busyWindowProof(tracked, webkitTail.block, {
      axis: 'x',
      settledWithin: 2,
      control,
    });
    expect(inPx.verdict.failures.join('\n')).toMatch(
      /longest stall 54\.\d ms, longer than the control's/,
    );
    const inSteps = busyWindowProof(tracked, webkitTail.block, {
      axis: 'x',
      settledWithinSteps: 2,
      control,
    });
    expect(inSteps.verdict.failures).toEqual([]);
    expect(inSteps.judged.to).toBeCloseTo(170, 0);
  });

  it('on a 1 px cast, judges a run whose changes are all even as settledWithin: 2 does', () => {
    // A coast toward 200 px slowing 12, 10, 8, 6, 4 and 2 px a frame, held
    // three frames at 196, 4 px from rest, the control moving every frame:
    // its changes share a factor of 2, but its cast's step is 1 px.
    const values = [
      ...Array<number>(4).fill(146),
      158,
      168,
      176,
      182,
      186,
      188,
      190,
      192,
      194,
      196,
      196,
      196,
      196,
      198,
      ...Array<number>(14).fill(200),
    ];
    const tracked = values.map(
      (x, i) =>
        ({
          t: -50 + i * 16.7,
          box: {x, y: 0, width: 1, height: 1},
          pixels: 1,
          step: PNG,
        }) as TrackedFrame,
    );
    const control = values.map(
      (_, i) =>
        ({
          t: -50 + i * 16.7,
          box: {x: 10 * i, y: 0, width: 1, height: 1},
          pixels: 1,
          step: PNG,
        }) as TrackedFrame,
    );
    const block = {from: 0, to: 400};
    const inPx = busyWindowProof(tracked, block, {
      axis: 'x',
      settledWithin: 2,
      control,
    });
    const inSteps = busyWindowProof(tracked, block, {
      axis: 'x',
      settledWithinSteps: 2,
      control,
    });
    expect(inPx.verdict.failures.join('\n')).toMatch(/longest stall/);
    expect(inSteps.judged).toEqual(inPx.judged);
    expect(inSteps.verdict).toEqual(inPx.verdict);
  });

  it('under one step a frame, reads a two-frame plateau right after two changes in a row as the cast’s step, not a stall', () => {
    // The tail shows 214 px one frame early, at +132 ms: 212, then 214 for
    // three frames, then 216 at +170. At about 0.7 px a frame the 2 px
    // position changes every three frames, so the plateau is the cast's.
    const tracked = webkit(webkitTail.tracked).map(f =>
      f.t > 130 && f.t < 135 && f.box != null
        ? ({...f, box: {...f.box, x: 214}} as TrackedFrame)
        : f,
    );
    const proof = busyWindowProof(tracked, webkitTail.block, {
      axis: 'x',
      settledWithinSteps: 2,
      control: webkit(webkitTail.control),
    });
    expect(proof.verdict.failures).toEqual([]);
    // A pixel bound reads it by the run before it, as before: a stall.
    const inPx = busyWindowProof(tracked, webkitTail.block, {
      axis: 'x',
      settledWithin: 4,
      control: webkit(webkitTail.control),
    });
    expect(inPx.verdict.failures.join('\n')).toMatch(
      /longest stall \d+\.\d ms, longer than the control's/,
    );
  });

  it('under one step a frame, still fails a long hold near rest, where the frames after the change no longer move', () => {
    // The tail holds 214 px, 4 px from rest, until the change to 218 px. It
    // holds for 82 ms (to +225 ms) and for 139 ms (to +282 ms). The frames
    // after the change are the settled plateau, so their pace is 0. The
    // motion before the hold still bounds how long one position may show.
    for (const holdTo of [225, 282]) {
      const tracked = webkit(webkitTail.tracked).map(f =>
        f.t > 160 && f.t < holdTo - 5 && f.box != null
          ? ({...f, box: {...f.box, x: 214}} as TrackedFrame)
          : f,
      );
      const proof = busyWindowProof(tracked, webkitTail.block, {
        axis: 'x',
        settledWithinSteps: 2,
        control: webkit(webkitTail.control),
      });
      expect(
        proof.verdict.failures.join('\n'),
        `held to +${holdTo} ms`,
      ).toMatch(/longest stall \d+\.\d ms, longer than the control's/);
    }
  });

  it('under one step a frame, fails a stall whose slow tail would excuse it: the allowance stays near the pace before the run', () => {
    // The tail holds 212 px for four more frames, 82 ms in all, then replays
    // the rest of the coast four frames late. The slow frames after the stall
    // set no allowance of their own. A pixel bound of the same 4 px fails it
    // too.
    const original = webkit(webkitTail.tracked);
    const held = original.findIndex(f => f.t > 130 && f.t < 135);
    const tracked = original.map((f, i) => {
      if (f.box == null || i <= held) {
        return f;
      }
      const x = i <= held + 4 ? 212 : original[i - 4].box?.x;
      return x == null ? f : ({...f, box: {...f.box, x}} as TrackedFrame);
    });
    const control = webkit(webkitTail.control);
    const inSteps = busyWindowProof(tracked, webkitTail.block, {
      axis: 'x',
      settledWithinSteps: 2,
      control,
    });
    expect(inSteps.verdict.failures.join('\n')).toMatch(
      /longest stall 82\.\d ms, longer than the control's/,
    );
    const inPx = busyWindowProof(tracked, webkitTail.block, {
      axis: 'x',
      settledWithin: 4,
      control,
    });
    expect(inPx.verdict.failures.join('\n')).toMatch(/longest stall 82\.\d ms/);
  });

  it('under one step a frame, still fails a three-frame freeze whose motion resumes from where it held', () => {
    // 1.2 px a frame on a 2 px cast, the control 3 px a frame. The coast
    // holds three frames, then moves on from where it held, so the change
    // that ends the still run is one step: the pace around the run, not
    // across it, bounds the run.
    const q = (x: number) => 2 * Math.floor(x / 2);
    const at = (t: number, x: number) =>
      ({
        t,
        box: {x, y: 0, width: 1, height: 1},
        step: {x: 2, y: 2},
      }) as TrackedFrame;
    const tracked: TrackedFrame[] = [];
    const control: TrackedFrame[] = [];
    let x = 100;
    for (let n = -12; n <= 54; n += 1) {
      if (n < 18 || n >= 21) {
        x += 1.2;
      }
      tracked.push(at(n * 16.7, q(x)));
      control.push(at(n * 16.7, q(3 * (n + 12))));
    }
    const proof = busyWindowProof(
      tracked,
      {from: 0, to: 700},
      {axis: 'x', settledWithinSteps: 2, control},
    );
    expect(proof.verdict.failures.join('\n')).toMatch(
      /longest stall \d+\.\d ms, longer than the control's/,
    );
  });

  it("still fails a 40 ms freeze in a WebKit coast's tail, more than two steps from rest", () => {
    // Held at 200 px, 20 px from rest, then a 10 px catch-up.
    const proof = busyWindowProof(
      freeze(webkit(webkitTail.tracked), 48, 40),
      webkitTail.block,
      {
        axis: 'x',
        settledWithinSteps: 2,
        control: webkit(webkitTail.control),
      },
    );
    expect(proof.verdict.failures.join('\n')).toMatch(
      /longest stall \d+\.\d ms, longer than the control's/,
    );
  });

  it('still fails a 40 ms freeze in a Chromium tail, more than two steps from rest', () => {
    const proof = busyWindowProof(
      freeze(chromium(slowTail.tracked), 600, 40),
      slowTail.block,
      {
        axis: 'x',
        settledWithinSteps: 2,
        control: chromium(slowTail.control),
      },
    );
    expect(proof.verdict.failures.join('\n')).toMatch(
      /longest stall \d+\.\d ms, longer than the control's/,
    );
  });

  it("reads a held frame in a fast-slowing WebKit coast at the run's own pace, under two steps a frame", () => {
    // 4.5 px a frame over the four frames before the hold, 2.3 across it:
    // the frame at +52 ms shows no step while the control moves, and the
    // next catches up 4 px, two frames' motion at the run's pace.
    const proof = busyWindowProof(
      webkit(webkitDecel.tracked),
      webkitDecel.block,
      {
        axis: 'x',
        settledWithinSteps: 2,
        control: webkit(webkitDecel.control),
      },
    );
    expect(proof.verdict.failures).toEqual([]);
  });

  it("reads that held frame at the run's own pace under a pixel bound too", () => {
    // The same coast with a pixel bound: the settle bound does not change how
    // a held frame is read.
    const proof = busyWindowProof(
      webkit(webkitDecel.tracked),
      webkitDecel.block,
      {
        axis: 'x',
        settledWithin: 4,
        control: webkit(webkitDecel.control),
      },
    );
    expect(proof.verdict.failures).toEqual([]);
  });

  it('reads a three-frame plateau that ends in a two-step change at about 1.3 px a frame as slow motion', () => {
    // Held at 192 px from +63 ms through +91, then 196 at +109.
    const proof = busyWindowProof(
      freeze(webkit(webkitDecel.tracked), 80, 20),
      webkitDecel.block,
      {
        axis: 'x',
        settledWithinSteps: 2,
        control: webkit(webkitDecel.control),
      },
    );
    expect(proof.verdict.failures).toEqual([]);
  });

  it('still fails that plateau when its catch-up carries the time it held at the pace before it', () => {
    // The same hold, then a jump to 200 px, where 2.3 px a frame would have
    // carried it, and the rest of the coast 4 px further on.
    const tracked = webkit(webkitDecel.tracked).map(f =>
      f.box == null
        ? f
        : f.t > 80 && f.t <= 100
          ? ({...f, box: {...f.box, x: 192}} as TrackedFrame)
          : f.t > 100
            ? ({...f, box: {...f.box, x: f.box.x + 4}} as TrackedFrame)
            : f,
    );
    const proof = busyWindowProof(tracked, webkitDecel.block, {
      axis: 'x',
      settledWithinSteps: 2,
      control: webkit(webkitDecel.control),
    });
    expect(proof.verdict.failures.join('\n')).toMatch(
      /moved on \d+ of the \d+ frames the control moved/,
    );
  });

  it('still fails a one-frame hold in a WebKit coast moving two steps a frame or more', () => {
    // Held at 180 px at +25 ms, where the coast moves about 4.5 px a frame:
    // the next frame catches up 8 px, two frames' motion at that pace.
    const proof = busyWindowProof(
      freeze(webkit(webkitDecel.tracked), 7, 20),
      webkitDecel.block,
      {
        axis: 'x',
        settledWithinSteps: 2,
        control: webkit(webkitDecel.control),
      },
    );
    expect(proof.verdict.failures.join('\n')).toMatch(
      /moved on 7 of the 8 frames the control moved/,
    );
  });

  it('on a 1 px cast, two steps judge what settledWithin: 2 judges', () => {
    const tracked = chromium(slowTail.tracked);
    const control = chromium(slowTail.control);
    const inPx = busyWindowProof(tracked, slowTail.block, {
      axis: 'x',
      settledWithin: 2,
      control,
    });
    const inSteps = busyWindowProof(tracked, slowTail.block, {
      axis: 'x',
      settledWithinSteps: 2,
      control,
    });
    expect(inSteps.judged).toEqual(inPx.judged);
    expect(inSteps.verdict).toEqual(inPx.verdict);
  });

  it("takes settledWithin or settledWithinSteps, not both, and settledWithinSteps needs the cast's step", () => {
    expect(() =>
      busyWindowProof(chromium(slowTail.tracked), slowTail.block, {
        axis: 'x',
        settledWithin: 2,
        settledWithinSteps: 2,
      }),
    ).toThrow(/settledWithin or settledWithinSteps, not both/);
    expect(() =>
      busyWindowProof(slowTailFrames(slowTail.tracked), slowTail.block, {
        axis: 'x',
        settledWithinSteps: 2,
      }),
    ).toThrow(/no tracked frame carries the cast's step/);
  });
});

describe('busyWindowProof on a sub-pixel read', () => {
  /**
   * A marker sliding `pxPerFrame` from t = 800 to 1900, read as `trackMarker`
   * reads it: under a pixel with `subpixel`, else in whole pixels.
   */
  const slide = (pxPerFrame: number, subpixel: boolean): TrackedFrame[] =>
    moving().map((f, i) => {
      const y = pxPerFrame * i;
      return {
        ...f,
        box: {...f.box!, y: subpixel ? y : Math.round(y)},
        step: subpixel
          ? {x: SUBPIXEL_STEP_PX, y: SUBPIXEL_STEP_PX}
          : {x: 1, y: 1},
      } as TrackedFrame;
    });

  it('judges every frame of a slide under a pixel a frame, which a whole-pixel read shows as stalls', () => {
    // 0.2 px a frame: each change is under the 0.25 px a whole-pixel read
    // counts from.
    const fine = busyWindowProof(slide(0.2, true), BLOCK, {axis: 'y'});
    expect(fine.verdict.failures, fine.summary).toEqual([]);
    expect(fine.stepPx).toBe(SUBPIXEL_STEP_PX);
    expect(fine.movedFraction).toBe(1);
    const whole = busyWindowProof(slide(0.2, false), BLOCK, {axis: 'y'});
    expect(whole.verdict.pass).toBe(false);
    expect(whole.verdict.failures.join('\n')).toMatch(/expected frames moved/);
  });

  it('still fails a slide that freezes for the block, read under a pixel', () => {
    const frozen = slide(0.2, true).map(f =>
      f.t >= BLOCK.from
        ? ({...f, box: {...f.box!, y: 0.2 * at(BLOCK.from)}} as TrackedFrame)
        : f,
    );
    const proof = busyWindowProof(frozen, BLOCK, {axis: 'y'});
    expect(proof.verdict.pass).toBe(false);
    expect(proof.moved).toBe(0);
  });

  it('counts a change from half the read step, so jitter under it is no motion', () => {
    // 0.02 px of jitter around a position that holds: no frame moves.
    const jitter = slide(0, true).map(
      (f, i) =>
        ({...f, box: {...f.box!, y: i % 2 === 0 ? 0 : 0.02}}) as TrackedFrame,
    );
    const proof = busyWindowProof(jitter, BLOCK, {axis: 'y'});
    expect(proof.moved).toBe(0);
    expect(proof.verdict.pass).toBe(false);
  });
});

describe('busyWindowProof against a control, on a sub-pixel read', () => {
  /**
   * A slide of 0.4 px a frame, with one frame delivered 3 ms after frame 20.
   * It is read in whole pixels or under a pixel, beside the control's frames.
   */
  const earlyFrame = (
    subpixel: boolean,
    freeze?: {from: number; to: number},
  ) => {
    const times: number[] = [];
    for (let i = 0; 800 + i * FRAME <= 1900; i += 1) {
      times.push(800 + i * FRAME);
      if (i === 20) {
        times.push(800 + i * FRAME + 3);
      }
    }
    const position = (t: number) => {
      const held =
        freeze != null && t >= freeze.from
          ? Math.min(t, freeze.to) - freeze.from
          : 0;
      return (0.4 * (t - 800 - held)) / FRAME;
    };
    const tracked = times.map(
      t =>
        ({
          t,
          box: {
            x: 0,
            y: subpixel ? position(t) : Math.round(position(t)),
            width: 10,
            height: 10,
          },
          step: subpixel
            ? {x: SUBPIXEL_STEP_PX, y: SUBPIXEL_STEP_PX}
            : {x: 1, y: 1},
        }) as TrackedFrame,
    );
    const control = times.map(
      t =>
        ({
          t,
          box: {
            x: Math.round((3 * (t - 800)) / FRAME),
            y: 0,
            width: 12,
            height: 12,
          },
        }) as TrackedFrame,
    );
    return {tracked, control};
  };

  it('reads a frame delivered early as moved, which a whole-pixel read misses', () => {
    const whole = earlyFrame(false);
    const wholeProof = busyWindowProof(whole.tracked, BLOCK, {
      axis: 'y',
      control: whole.control,
    });
    expect(wholeProof.verdict.failures).toContain(
      'moved on 37 of the 40 frames the control moved (93%)',
    );
    const fine = earlyFrame(true);
    const fineProof = busyWindowProof(fine.tracked, BLOCK, {
      axis: 'y',
      control: fine.control,
    });
    expect(fineProof.verdict.failures, fineProof.summary).toEqual([]);
  });

  it('still fails a slide that holds for five frames inside the block', () => {
    const held = earlyFrame(true, {from: 1300, to: 1300 + 5 * FRAME});
    const proof = busyWindowProof(held.tracked, BLOCK, {
      axis: 'y',
      control: held.control,
    });
    expect(proof.verdict.pass).toBe(false);
    expect(proof.verdict.failures.join('\n')).toMatch(
      /moved on \d+ of the \d+ frames the control moved/,
    );
  });
});
