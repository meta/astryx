// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file busy.test.ts
 * @input Synthetic tracked frames (no browser)
 * @output The busy-main-thread verdict's limits: dropped frames a loaded
 *   machine produces pass, a frozen animation fails every criterion, a window
 *   with nothing moving to judge fails, and out-of-order frames are judged in
 *   presentation order.
 * @position Unit test of ./busy and ./frames' ordering; the browser proof
 *   with a real compositor animation and a rAF control is in
 *   harness.interaction.browser.spec.ts.
 */

import {describe, expect, it} from 'vitest';
import {busyWindowProof} from './busy';
import {inPresentationOrder, type TrackedFrame} from './frames';

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

  it('fails a window in which the animation under test was not moving', () => {
    // Settled before the block: the judgment ends where it starts.
    const settled = moving().map(f =>
      f.t < 950
        ? f
        : ({...f, box: {...f.box!, y: 3 * at(950)}} as TrackedFrame),
    );
    const before = busyWindowProof(settled, BLOCK, {settledWithin: 2});
    expect(before.verdict.pass).toBe(false);
    expect(before.verdict.failures.join('\n')).toMatch(
      /judged = -?\d+ frames < 4: the animation under test was not moving/,
    );
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
