// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file busy.control.test.ts
 * @input Synthetic tracked frames (no browser)
 * @output The busy-main-thread verdict against a control: a component that
 *   moves on the control's frames passes through a stall the compositor itself
 *   makes, and a frozen one, or one the control outpaces by a single frame,
 *   still fails. Unchanged frames under one cast step a frame count as
 *   moved; a freeze, whose catch-up is more than one step, and a stall
 *   longer than the component's runs before it do not. Runs
 *   of a block too short to judge alone are judged pooled: the control over
 *   all of them, each run's stall against that run's control. A held
 *   animation is judged up to its curve's end. A stall before that end still
 *   fails, and a curve that ends too soon is named.
 * @position Unit test of ./busy's control judgment; the frames are
 *   busy.test.ts's fixtures, and the browser proof with a real compositor
 *   control is in harness.interaction.browser.spec.ts.
 */

import {describe, expect, it} from 'vitest';
import {busyWindowProof, BusyWindowTooLateError, pooledBusyProof} from './busy';
import {FrameStarvationError, type TrackedFrame} from './frames';

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

/** `frames` as the control's: the same frames and times, moving along x. */
function asControl(frames: readonly TrackedFrame[]): TrackedFrame[] {
  return frames.map(
    f =>
      ({
        ...f,
        box: f.box == null ? null : {x: f.box.y, y: 0, width: 12, height: 12},
      }) as TrackedFrame,
  );
}

/**
 * A frame-counted loop: `step` px a frame, standing still from `lag` ms into
 * each window to its end, then going on without catching up.
 */
function frameCounted(
  windows: readonly {from: number; to: number}[],
  lag: number,
  step = 1,
): TrackedFrame[] {
  let y = 0;
  return moving().map((f, i) => {
    if (i > 0 && !windows.some(w => f.t >= w.from + lag && f.t < w.to)) {
      y += step;
    }
    return {...f, box: {...f.box!, y}} as TrackedFrame;
  });
}

describe('busyWindowProof against a control', () => {
  it('passes a component that moves on every frame the control does, through a stall the compositor makes for both, which fails without the control', () => {
    // Three frames in a row presented nothing, for the control too: the
    // compositor shared the core the block spins on (a two-core runner).
    const gap = [at(1300), at(1300) + 1, at(1300) + 2];
    const component = moving(gap);
    const control = asControl(moving(gap));
    const alone = busyWindowProof(component, BLOCK);
    expect(alone.verdict.failures.join('\n')).toMatch(/longest stall/);
    const against = busyWindowProof(component, BLOCK, {control});
    expect(against.verdict.failures, against.summary).toEqual([]);
    expect(against.control).toMatchObject({moved: against.control?.movedWith});
    expect(against.summary).toMatch(
      /against the control: moved on \d+ of its \d+ frames/,
    );
  });

  it('still fails a frozen component while the control moves', () => {
    const frozen = moving().map(
      f =>
        ({
          ...f,
          box: {
            ...f.box!,
            y: f.t >= BLOCK.from ? 3 * at(BLOCK.from) : f.box!.y,
          },
        }) as TrackedFrame,
    );
    const proof = busyWindowProof(frozen, BLOCK, {
      control: asControl(moving()),
    });
    expect(proof.verdict.pass).toBe(false);
    expect(proof.verdict.failures.join('\n')).toMatch(
      /moved on 0 of the \d+ frames the control moved/,
    );
    expect(proof.verdict.failures.join('\n')).toMatch(
      /longer than the control's/,
    );
  });

  it('fails a component the control outpaces: it repeats positions on frames the control moves', () => {
    const repeats = [0, 1, 2, 3].map(k => at(1100) + 6 * k);
    const proof = busyWindowProof(repeating(repeats), BLOCK, {
      control: asControl(moving()),
    });
    expect(proof.verdict.failures.join('\n')).toMatch(
      /moved on \d+ of the \d+ frames the control moved/,
    );
  });

  it('fails a component that misses a single frame the control moved', () => {
    // One repeated position: a frame the control moved on and the component
    // did not, which a compositor animation never shows, since both are read
    // from the same screencast frames.
    const proof = busyWindowProof(repeating([at(1300)]), BLOCK, {
      control: asControl(moving()),
    });
    expect(proof.verdict.failures.join('\n')).toMatch(
      /moved on \d+ of the \d+ frames the control moved/,
    );
    expect(proof.control!.moved - proof.control!.movedWith).toBe(1);
  });

  it('counts unchanged frames on a tail under one cast step a frame as moved: each run of them ends in a single step', () => {
    // 3 px a frame, then half a pixel a frame from 1400 ms: the whole-pixel
    // positions change every other frame, one step at a time.
    const k = at(1400);
    const tail = moving().map((f, i) =>
      i < k
        ? f
        : ({
            ...f,
            box: {...f.box!, y: 3 * k + Math.floor((i - k) / 2)},
          } as TrackedFrame),
    );
    const proof = busyWindowProof(tail, BLOCK, {control: asControl(moving())});
    expect(proof.verdict.failures, proof.summary).toEqual([]);
    expect(proof.control?.belowStep).toBeGreaterThan(0);
    expect(proof.summary).toMatch(/where the cast could not show the step/);
  });

  it('still fails a slow component frozen on frames the control moved on: the change that ends the run catches up more than one step', () => {
    // Half a pixel a frame throughout, frozen for 12 frames from 1200 ms, then
    // back where its clock says: the change that ends the run is 6 steps.
    const k = at(1200);
    const slow = moving().map(
      (f, i) =>
        ({
          ...f,
          box: {
            ...f.box!,
            y: Math.floor((i >= k && i < k + 12 ? k - 1 : i) / 2),
          },
        }) as TrackedFrame,
    );
    const proof = busyWindowProof(slow, BLOCK, {control: asControl(moving())});
    expect(proof.verdict.failures.join('\n')).toMatch(
      /moved on \d+ of the \d+ frames the control moved/,
    );
  });

  it('still fails a component that stops for good while the control moves: no change ends its run', () => {
    const k = at(1300);
    const stopped = moving().map((f, i) =>
      i < k ? f : ({...f, box: {...f.box!, y: 3 * k}} as TrackedFrame),
    );
    const proof = busyWindowProof(stopped, BLOCK, {
      control: asControl(moving()),
    });
    expect(proof.verdict.failures.join('\n')).toMatch(
      /moved on \d+ of the \d+ frames the control moved/,
    );
  });

  it('still fails a frame-counted component that stands still through the block and resumes one step a frame: it shows too little motion to judge', () => {
    // 1 px a frame, counted per frame rather than by the clock: it stands
    // still from the block's start to its end, then goes on one step a
    // frame, so the change that ends the run is a single step.
    const s0 = at(BLOCK.from);
    const s1 = at(BLOCK.to);
    const counted = moving().map(
      (f, i) =>
        ({
          ...f,
          box: {
            ...f.box!,
            y: i < s0 ? i : i <= s1 ? s0 - 1 : s0 - 1 + (i - s1),
          },
        }) as TrackedFrame,
    );
    const proof = busyWindowProof(counted, BLOCK, {
      control: asControl(moving()),
    });
    expect(proof.verdict.failures.join('\n')).toMatch(
      /too little motion in this window to judge/,
    );
  });

  it('still fails a frame-counted loop that stalls for a few frames inside the block: its run is longer than the runs before it', () => {
    // 1 px a frame, so each step is one cast step, standing still for three
    // frames from 1300 ms and going on from there without catching up.
    const proof = busyWindowProof(
      frameCounted([{from: 1300, to: 1350}], 0),
      BLOCK,
      {control: asControl(moving())},
    );
    expect(proof.verdict.failures.join('\n')).toMatch(
      /moved on \d+ of the \d+ frames the control moved/,
    );
    expect(proof.control?.belowStep).toBe(0);
  });

  it('reads the finest cast step when the judged part shows no change, so a larger jump never passes for one step', () => {
    const frozen = moving().map(
      f =>
        ({...f, box: {...f.box!, y: f.t < BLOCK.to ? 0 : 2}}) as TrackedFrame,
    );
    const proof = busyWindowProof(frozen, BLOCK, {
      control: asControl(moving()),
    });
    expect(proof.stepPx).toBe(0.5);
    expect(proof.control?.belowStep).toBe(0);
  });

  it('reads the cast step from changes, so a position committed off the grid once the block ends does not shrink it', () => {
    // An ease-out on a 2 px grid, as WebKit casts one, that ends on 401 once
    // the block is over: its tail shows runs of unchanged frames that end in
    // a single 2 px step.
    const eased = moving().map(
      (f, i) =>
        ({
          ...f,
          box: {
            ...f.box!,
            y:
              f.t > BLOCK.to + 20
                ? 401
                : 2 * Math.round((400 - 400 * 0.93 ** i) / 2),
          },
        }) as TrackedFrame,
    );
    const proof = busyWindowProof(eased, BLOCK, {
      control: asControl(moving()),
    });
    expect(proof.stepPx).toBe(2);
    expect(proof.verdict.failures, proof.summary).toEqual([]);
    expect(proof.control?.belowStep).toBeGreaterThan(0);
  });

  it('judges a component that enters from off screen from its first position inside the block, against the control', () => {
    // A card pushed in from an edge first shows 20 ms into the block. The
    // cast's frames before the block show the screen without it.
    const entering = moving().map(f =>
      f.t < 1020
        ? ({...f, box: null} as TrackedFrame)
        : ({...f, box: {...f.box!, y: f.box!.y - 60}} as TrackedFrame),
    );
    const proof = busyWindowProof(entering, BLOCK, {
      control: asControl(moving()),
    });
    expect(proof.verdict.failures, proof.summary).toEqual([]);
    expect(proof.onScreenFromMs).toBeGreaterThanOrEqual(20);
  });

  it('throws FrameStarvationError for a run the machine starved: its control moved on too few frames, and no frame came for longer than 50 ms', () => {
    const run = () =>
      busyWindowProof(starvedCast(), BLOCK, {
        control: asControl(starvedCast()),
      });
    expect(run).toThrow(FrameStarvationError);
    expect(run).toThrow(
      /busyWindowProof: the page drew 3 frames while a 700 ms block held the main thread, and the control moved on 3 of them, where the proof needs 4\. No frame came for 2\d\d\.\d ms/,
    );
  });

  it('fails a component hidden inside an on-pace block as the component, not as starvation', () => {
    // Every 60 Hz frame came, and none inside the 90 ms block showed the
    // component: the cast's own frames show it was not starved.
    const block = {from: 1000, to: 1090};
    const hidden = moving().map(f =>
      f.t > block.from && f.t < block.to
        ? ({...f, box: null} as TrackedFrame)
        : f,
    );
    const proof = busyWindowProof(hidden, block, {
      control: asControl(moving()),
    });
    expect(proof.verdict.failures.join('\n')).toMatch(
      /moved on 0 of the 3 frames the control moved/,
    );
  });

  it('names a window in which the control itself presented too little to judge as starvation, though every frame came', () => {
    const still = asControl(
      moving().map(f => ({...f, box: {...f.box!, y: 0}}) as TrackedFrame),
    );
    const run = () => busyWindowProof(moving(), BLOCK, {control: still});
    expect(run).toThrow(FrameStarvationError);
    // It names how starved the cast was: here every frame came, 60 Hz.
    expect(run).toThrow(
      /busyWindowProof: the page drew \d+ frames while a 700 ms block held the main thread, and the control moved on 0 of them, where the proof needs 4\. No frame came for 1[67]\.\d ms: the compositor presented too little in this window to judge/,
    );
  });

  it("names a window under the control's floor as starvation when no frame came for less than 50 ms: a loaded machine's cast, its component on every frame the control moved on", () => {
    // A 152 ms block: the cast delivered 8 frames, none for 44 ms. The control
    // moved on 3 of them, as on a loaded runner.
    const block = {from: 1000, to: 1152};
    const times = [1008, 1028, 1048, 1092, 1104, 1116, 1128, 1146];
    const moves = new Set([1048, 1092, 1128]);
    let y = 0;
    const loaded = [
      ...moving().filter(f => f.t < block.from),
      ...times.map(t => ({t, box: null}) as TrackedFrame),
      ...moving().filter(f => f.t > block.to),
    ].map(f => {
      if (f.t < block.from || f.t > block.to || moves.has(f.t)) {
        y += 3;
      }
      return {...f, box: {x: 0, y, width: 10, height: 10}} as TrackedFrame;
    });
    const run = () =>
      busyWindowProof(loaded, block, {control: asControl(loaded)});
    expect(run).toThrow(FrameStarvationError);
    expect(run).toThrow(
      /busyWindowProof: the page drew 8 frames while a 152 ms block held the main thread, and the control moved on 3 of them, where the proof needs 4\. No frame came for 44\.0 ms: the compositor presented too little in this window to judge/,
    );
  });

  it('still fails a main-thread component under the floor: it misses the frames the control moved on, and the cast kept pace', () => {
    const block = {from: 1000, to: 1090};
    const frozen = moving().map(f =>
      f.t > block.from && f.t < block.to + 20
        ? ({...f, box: {...f.box!, y: 3 * at(block.from)}} as TrackedFrame)
        : f,
    );
    const proof = busyWindowProof(frozen, block, {
      control: asControl(moving()),
    });
    expect(proof.verdict.failures.join('\n')).toMatch(
      /moved on 0 of the 3 frames the control moved/,
    );
  });

  it("names a window under the floor as starvation when only the cast's median interval fails: the median is the cast's pace, not the component", () => {
    const run = () =>
      busyWindowProof(moving(), short(1000), {
        control: asControl(moving()),
        maxMedianFrameMs: 10,
      });
    expect(run).toThrow(FrameStarvationError);
    expect(run).toThrow(
      /the control moved on 3 of them, where the proof needs 4/,
    );
  });

  it("judges a held animation up to its curve's end: after it, the frames show the compositor's fallback to the committed value", () => {
    // The curve ends 520 ms into the block. WebKit then presents the value
    // the main thread last committed, the box at rest, until the block ends.
    const curveEnd = 1520;
    const fallback = moving().map(f =>
      f.t > curveEnd ? ({...f, box: {...f.box!, y: 0}} as TrackedFrame) : f,
    );
    const proof = busyWindowProof(fallback, held(curveEnd), {
      control: asControl(moving()),
    });
    expect(proof.verdict.failures, proof.summary).toEqual([]);
    expect(proof.monotonic).toBe(true);
    expect(proof.judged.to).toBe(curveEnd);
    expect(proof.summary).toMatch(/judged to the held curve's end at \+520 ms/);
  });

  it('still names a starved run as starvation when its held curve also ends inside the block', () => {
    // Three frames in the whole block: too few even before the curve's end.
    const run = () =>
      busyWindowProof(starvedCast(), held(1600), {
        control: asControl(starvedCast()),
      });
    expect(run).toThrow(FrameStarvationError);
  });

  it("keeps a settle bound's end: the held curve's end does not cut a proof that bounds its settle", () => {
    // Arrives at 1530, just after its curve's end at 1520.
    const arrives = moving().map(f =>
      f.t > 1530
        ? ({...f, box: {...f.box!, y: 3 * at(1530)}} as TrackedFrame)
        : f,
    );
    const proof = busyWindowProof(arrives, held(1520), {
      control: asControl(moving()),
      settledWithin: 2,
    });
    expect(proof.judged.to).toBeGreaterThan(1520);
    expect(proof.summary).not.toMatch(/held curve's end/);
  });

  it('judges the whole block when the held animation keeps its end value: a stop at its curve end still fails', () => {
    // A fill that holds the end, or a held tail: the frames after the curve
    // still show the animation, at rest.
    const curveEnd = 1520;
    const stops = moving().map(f =>
      f.t > curveEnd
        ? ({...f, box: {...f.box!, y: 3 * at(curveEnd)}} as TrackedFrame)
        : f,
    );
    const proof = busyWindowProof(stops, held(curveEnd, true), {
      control: asControl(moving()),
    });
    expect(proof.judged.to).toBe(BLOCK.to - 20);
    expect(proof.verdict.failures.join('\n')).toMatch(
      /longest stall [\d.]+ ms, longer than the control's/,
    );
  });

  it('still fails a held animation that stops advancing before its curve ends', () => {
    // Frozen from 300 ms into the block, while its curve runs to 520 ms.
    const frozen = moving().map(f =>
      f.t > 1300
        ? ({...f, box: {...f.box!, y: 3 * (at(1300) - 1)}} as TrackedFrame)
        : f,
    );
    const proof = busyWindowProof(frozen, held(1520), {
      control: asControl(moving()),
    });
    const failures = proof.verdict.failures.join('\n');
    expect(failures).toMatch(
      /moved on \d+ of the \d+ frames the control moved/,
    );
    expect(failures).toMatch(
      /longest stall [\d.]+ ms, longer than the control's/,
    );
  });

  it('throws BusyWindowTooLateError when the held curve ends too soon after the block began for the control to move on enough frames', () => {
    const run = (curveEnd: number) => () =>
      busyWindowProof(moving(), held(curveEnd), {
        control: asControl(moving()),
      });
    expect(run(1060)).toThrow(BusyWindowTooLateError);
    expect(run(1060)).toThrow(
      /busyWindowProof: the held animation's curve ended 60 ms after the block began, so the part judged from 20 ms held 2 of the frames it needs, 4 \(\d+ frames presented in the block\): the block started late for the motion\./,
    );
    // A curve that ended before the judged part began leaves nothing.
    expect(run(1010)).toThrow(
      /curve ended 10 ms after the block began, so the part judged from 20 ms held 0 of the frames it needs/,
    );
    let caught: unknown = null;
    try {
      run(1060)();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BusyWindowTooLateError);
    expect((caught as BusyWindowTooLateError).numbers).toMatchObject({
      curveEndMs: 60,
      judgedFromMs: 20,
    });
  });

  it('throws BusyWindowTooLateError when a settle bound leaves the control too few frames, where judging on would have held enough', () => {
    // It comes within 4 px of its end at +33 ms: the block started late for
    // the motion, while the control moves on every frame.
    const late = moving().map((f, i) => {
      const y = i <= 12 ? 256 - 4 * i : i === 13 ? 206 : i === 14 ? 203 : 200;
      return {...f, box: {...f.box!, y}} as TrackedFrame;
    });
    const run = () =>
      busyWindowProof(late, BLOCK, {
        control: asControl(moving()),
        settledWithin: 4,
      });
    expect(run).toThrow(BusyWindowTooLateError);
    expect(run).toThrow(
      /busyWindowProof: the tracked y came within 4 px of where it ends 33 ms after the block began, so the part judged from 20 ms held 1 of the control's frames, under the 4 it needs, where judging on to 680 ms would have held \d+ \(\d+ frames presented in the block\): the block started late for the motion\./,
    );
    let caught: unknown = null;
    try {
      run();
    } catch (error) {
      caught = error;
    }
    expect((caught as BusyWindowTooLateError).numbers).toMatchObject({
      judgedFromMs: 20,
      controlFrames: 1,
    });
  });
});

/**
 * `BLOCK` as `blockMainThread` holds it with `during`: the held animation
 * started before the block and its curve ends at `curveEnd`. It keeps its end
 * value after that only with `holds`.
 */
function held(curveEnd: number, holds = false) {
  return {...BLOCK, spanMs: 700, animation: {from: 800, to: curveEnd, holds}};
}

/**
 * `moving()` with three frames in `BLOCK`, about 200 ms apart, as a cast the
 * machine starved delivers.
 */
function starvedCast(): TrackedFrame[] {
  const kept = [at(1150), at(1350), at(1550)];
  return moving().filter(
    (f, i) => f.t < BLOCK.from || f.t > BLOCK.to || kept.includes(i),
  );
}

/** The numbers a `FrameStarvationError` from `run` names. */
function starvationNumbers(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (error instanceof FrameStarvationError) {
      return error.numbers;
    }
    throw error;
  }
  throw new Error('no FrameStarvationError');
}

/** A 90 ms block from `from`: its judged part holds three 60 Hz frames. */
const short = (from: number) => ({from, to: from + 90});

describe('pooledBusyProof', () => {
  it('judges a block too short for one run over pooled runs: one run cannot decide, three runs of a component that moves with the control pass', () => {
    const control = asControl(moving());
    const single = () => busyWindowProof(moving(), short(1000), {control});
    expect(single).toThrow(FrameStarvationError);
    expect(single).toThrow(
      /the control moved on 3 of them, where the proof needs 4/,
    );
    const runs = [1000, 1300, 1600].map(from => ({
      tracked: moving(),
      control,
      window: short(from),
    }));
    const pooled = pooledBusyProof(runs);
    expect(pooled.verdict.failures, pooled.summary).toEqual([]);
    expect(pooled.control).toEqual({moved: 9, movedWith: 9});
    expect(pooled.runs).toHaveLength(3);
    expect(pooled.summary).toMatch(
      /^3 runs pooled: moved on 9 of the control's 9 frames; run 1: /,
    );
  });

  it('leaves out a run whose block began after its motion had settled, and names it', () => {
    const control = asControl(moving());
    // Settled 50 ms before the run's block: nothing in it is left to judge.
    const settled = moving().map(f =>
      f.t < 950
        ? f
        : ({...f, box: {...f.box!, y: 3 * at(950)}} as TrackedFrame),
    );
    const pooled = pooledBusyProof(
      [
        {tracked: settled, control, window: short(1000)},
        {tracked: moving(), control, window: short(1300)},
        {tracked: moving(), control, window: short(1600)},
      ],
      {settledWithin: 2},
    );
    expect(pooled.verdict.failures, pooled.summary).toEqual([]);
    expect(pooled.judged).toEqual([false, true, true]);
    expect(pooled.runs[0]).toBeNull();
    expect(pooled.late[0]).toBeInstanceOf(BusyWindowTooLateError);
    expect(pooled.late.slice(1)).toEqual([null, null]);
    // Only the judged runs' frames count toward the pool's floors.
    expect(pooled.control).toEqual({moved: 6, movedWith: 6});
    expect(pooled.summary).toMatch(
      /^3 runs pooled, 2 judged: .*; run 1: too late to judge: busyWindowProof: /,
    );
  });

  it('fails by name a pool left with fewer judged runs than its minimum, however many began too late', () => {
    const control = asControl(moving());
    const settled = moving().map(f =>
      f.t < 950
        ? f
        : ({...f, box: {...f.box!, y: 3 * at(950)}} as TrackedFrame),
    );
    // One long run passes every floor alone, beside two that began too late.
    const pooled = pooledBusyProof(
      [
        {tracked: settled, control, window: short(1000)},
        {tracked: settled, control, window: short(1000)},
        {tracked: moving(), control, window: {from: 1100, to: 1700}},
      ],
      {settledWithin: 2},
    );
    expect(pooled.verdict.pass).toBe(false);
    expect(pooled.verdict.failures).toEqual([
      '1 of 3 runs judged, under 2: 2 began too late for their motion, and the compositor presented too little in any other to judge',
    ]);
    expect(pooled.summary).toMatch(/run 1: too late to judge/);
    expect(pooled.summary).toMatch(/run 2: too late to judge/);
  });

  it('pools a short travel that comes within its settle bound early in an on-time block: each run adds its frames, and only a single window throws', () => {
    // It comes within 4 px of its end at t = 1033, while the block runs on.
    // That is two or three of the control's frames into each judged part.
    const settling = moving().map((f, i) => {
      const y = i <= 12 ? 256 - 4 * i : i === 13 ? 206 : i === 14 ? 203 : 200;
      return {...f, box: {...f.box!, y}} as TrackedFrame;
    });
    const control = asControl(moving());
    const window = {from: 972, to: 1300};
    expect(() =>
      busyWindowProof(settling, window, {control, settledWithin: 4}),
    ).toThrow(BusyWindowTooLateError);
    const pooled = pooledBusyProof(
      [0, 1, 2].map(() => ({tracked: settling, control, window})),
      {settledWithin: 4},
    );
    expect(pooled.verdict.failures, pooled.summary).toEqual([]);
    expect(pooled.late).toEqual([null, null, null]);
    expect(pooled.judged).toEqual([true, true, true]);
  });

  it('still fails a component that is frozen in every run while the control moves', () => {
    const frozen = moving().map(
      f => ({...f, box: {...f.box!, y: 0}}) as TrackedFrame,
    );
    const pooled = pooledBusyProof(
      [1000, 1300, 1600].map(from => ({
        tracked: frozen,
        control: asControl(moving()),
        window: short(from),
      })),
    );
    expect(pooled.verdict.pass).toBe(false);
    expect(pooled.verdict.failures.join('\n')).toMatch(
      /moved on 0 of the 9 frames the control moved over 3 runs/,
    );
    expect(pooled.verdict.failures.join('\n')).toMatch(
      /run 1: longest stall .* longer than the control's/,
    );
  });

  it("judges each run's longest stall against that run's control, never pooled", () => {
    // Two frames in a row present no new position, inside run 2 only.
    const k = at(1320);
    const stalled = moving().map((f, i) =>
      i === k || i === k + 1
        ? ({...f, box: {...f.box!, y: 3 * (k - 1)}} as TrackedFrame)
        : f,
    );
    const pooled = pooledBusyProof(
      [1000, 1300, 1600].map(from => ({
        tracked: stalled,
        control: asControl(moving()),
        window: short(from),
      })),
    );
    const failures = pooled.verdict.failures.join('\n');
    expect(failures).toMatch(
      /run 2: longest stall .* longer than the control's/,
    );
    expect(failures).not.toMatch(/run [13]: longest stall/);
  });

  it('fails a pool in which the component misses a single frame the control moved', () => {
    const pooled = pooledBusyProof(
      [1000, 1300, 1600].map(from => ({
        tracked: repeating([at(1320)]),
        control: asControl(moving()),
        window: short(from),
      })),
    );
    expect(pooled.verdict.failures.join('\n')).toMatch(
      /moved on \d+ of the \d+ frames the control moved over 3 runs/,
    );
    expect(pooled.control.moved - pooled.control.movedWith).toBe(1);
  });

  it("counts a pooled run's unchanged frames under one cast step a frame as moved, as one window does", () => {
    const k = at(1000);
    const tail = moving().map((f, i) =>
      i < k
        ? f
        : ({
            ...f,
            box: {...f.box!, y: 3 * k + Math.floor((i - k) / 2)},
          } as TrackedFrame),
    );
    const pooled = pooledBusyProof(
      [1000, 1300, 1600].map(from => ({
        tracked: tail,
        control: asControl(moving()),
        window: short(from),
      })),
    );
    expect(pooled.verdict.failures, pooled.summary).toEqual([]);
  });

  it('still fails a pooled frame-counted loop that the cast shows moving early in each judged part', () => {
    // Six 70 ms blocks; the cast shows the loop's last frames up to 35 ms into
    // each, then it stands still to the block's end and goes on one step a
    // frame: a 1 px loop's steps are one cast step, and a 2 px loop's read
    // as one when its changes are all 2 px.
    const windows = [1000, 1150, 1300, 1450, 1600, 1750].map(from => ({
      from,
      to: from + 70,
    }));
    for (const step of [1, 2]) {
      const pooled = pooledBusyProof(
        windows.map(window => ({
          tracked: frameCounted(windows, 35, step),
          control: asControl(moving()),
          window,
        })),
      );
      expect(pooled.verdict.failures.join('\n'), `${step} px`).toMatch(
        /moved on \d+ of the \d+ frames the control moved over 6 runs/,
      );
    }
  });

  it('names a pool whose control presented too little in every run as starvation', () => {
    const still = asControl(
      moving().map(f => ({...f, box: {...f.box!, y: 0}}) as TrackedFrame),
    );
    const run = () =>
      pooledBusyProof(
        [1000, 1300].map(from => ({
          tracked: moving(),
          control: still,
          window: short(from),
        })),
      );
    expect(run).toThrow(FrameStarvationError);
    expect(run).toThrow(
      /pooledBusyProof: .*0 of 2 runs judged, under 1, and the control moved on 0 frames over them: the compositor presented too little in the others to judge/,
    );
  });

  /** `frames` held at the position they had at `from`, from `from` to `to`. */
  const held = (frames: TrackedFrame[], from: number, to: number) =>
    frames.map(f =>
      f.t >= from && f.t <= to
        ? ({...f, box: {...f.box!, y: 3 * at(from)}} as TrackedFrame)
        : f,
    );

  it('names a run whose control presented nothing as too little to judge and leaves it out: the other runs decide', () => {
    // The control stands still through run 2's block only, as if the machine
    // starved it there.
    const pooled = pooledBusyProof(
      [1000, 1300, 1600].map(from => ({
        tracked: moving(),
        control: asControl(held(moving(), 1300, 1390)),
        window: short(from),
      })),
    );
    expect(pooled.verdict.failures, pooled.summary).toEqual([]);
    expect(pooled.judged).toEqual([true, false, true]);
    expect(pooled.control).toEqual({moved: 6, movedWith: 6});
    expect(pooled.summary).toMatch(
      /^3 runs pooled, 2 judged: .*; run 2: too little to judge, the control moved on 0 frames, under 1: /,
    );
  });

  it('names a pool in which every run but one was too little to judge as starvation, even when that run holds enough frames', () => {
    const windows = [1000, 1300, 1600].map(from => ({from, to: from + 200}));
    const starved = held(held(moving(), 1300, 1500), 1600, 1800);
    const pool = () =>
      pooledBusyProof(
        windows.map(window => ({
          tracked: moving(),
          control: asControl(starved),
          window,
        })),
      );
    expect(pool).toThrow(FrameStarvationError);
    expect(pool).toThrow(
      /pooledBusyProof: the page drew \d+ frames while 3 blocks held the main thread, and 1 of them had enough control frames to judge, where the proof needs 2\. .*1 of 3 runs judged, under 2, and the control moved on \d+ frames over them: the compositor presented too little in the others to judge/,
    );
  });

  it('names a pool of four runs with one judged as starvation: its component moved on every frame its control moved on', () => {
    const windows = [1000, 1250, 1500, 1750].map(short);
    const control = asControl(
      held(held(held(moving(), 1250, 1340), 1500, 1590), 1750, 1840),
    );
    const pool = () =>
      pooledBusyProof(
        windows.map(window => ({tracked: moving(), control, window})),
      );
    expect(pool).toThrow(FrameStarvationError);
    expect(pool).toThrow(/1 of 4 runs judged, under 2/);
    // Short of judged runs, the error counts every block's frames.
    const numbers = starvationNumbers(pool);
    expect(numbers.frames).toBe(20);
    expect(numbers.longestGapMs).toBeCloseTo(FRAME, 1);
  });

  it('names the longest gap of every block in a pool short of judged runs, where the unjudged blocks drew no frame', () => {
    const windows = [1000, 1250, 1500, 1750].map(short);
    const control = asControl(
      held(held(held(moving(), 1250, 1340), 1500, 1590), 1750, 1840),
    );
    const tracked = moving().filter(
      f => !windows.slice(1).some(w => f.t > w.from && f.t < w.to),
    );
    const numbers = starvationNumbers(() =>
      pooledBusyProof(windows.map(window => ({tracked, control, window}))),
    );
    expect(numbers.frames).toBe(5);
    expect(numbers.longestGapMs).toBeCloseTo(90, 5);
  });

  it("names a pool short of judged runs as starvation when only the runs' median intervals fail", () => {
    const windows = [1000, 1250, 1500, 1750].map(short);
    const control = asControl(
      held(held(held(moving(), 1250, 1340), 1500, 1590), 1750, 1840),
    );
    const pool = () =>
      pooledBusyProof(
        windows.map(window => ({tracked: moving(), control, window})),
        {maxMedianFrameMs: 10},
      );
    expect(pool).toThrow(FrameStarvationError);
    expect(pool).toThrow(/1 of 4 runs judged, under 2/);
  });

  it('still fails a pool short of judged runs when its judged run shows a component red', () => {
    const windows = [1000, 1250, 1500, 1750].map(short);
    const control = asControl(
      held(held(held(moving(), 1250, 1340), 1500, 1590), 1750, 1840),
    );
    const pooled = pooledBusyProof(
      windows.map(window => ({
        tracked: held(moving(), 1000, 1090),
        control,
        window,
      })),
    );
    expect(pooled.judged).toEqual([true, false, false, false]);
    expect(pooled.verdict.failures.join('\n'), pooled.summary).toMatch(
      /run 1: moved on 0 of the 3 frames its control moved/,
    );
  });

  it('judges a run in which the component froze while its control moved: it is never left out, and it fails on its own', () => {
    const pooled = pooledBusyProof(
      [1000, 1300, 1600].map(from => ({
        tracked: held(moving(), 1300, 1390),
        control: asControl(moving()),
        window: short(from),
      })),
    );
    expect(pooled.judged).toEqual([true, true, true]);
    const failures = pooled.verdict.failures.join('\n');
    expect(failures).toMatch(
      /moved on 6 of the 9 frames the control moved over 3 runs/,
    );
    expect(failures).toMatch(
      /run 2: moved on 0 of the 3 frames its control moved/,
    );
    expect(failures).not.toMatch(/run [13]: moved on/);
    expect(failures).toMatch(
      /run 2: longest stall .* longer than the control's/,
    );
  });

  it('throws when it needs more judged runs than it has, or none', () => {
    expect(() =>
      pooledBusyProof(
        [{tracked: moving(), control: asControl(moving()), window: BLOCK}],
        {minJudgedRuns: 2},
      ),
    ).toThrow(/minJudgedRuns 2 is not between 1 and the 1 runs/);
    expect(() =>
      pooledBusyProof(
        [{tracked: moving(), control: asControl(moving()), window: BLOCK}],
        {minJudgedRuns: 0},
      ),
    ).toThrow(/minJudgedRuns 0 is not between 1 and the 1 runs/);
  });

  it('judges one long run as busyWindowProof judges it against the control', () => {
    const control = asControl(moving());
    const pooled = pooledBusyProof([
      {tracked: moving(), control, window: BLOCK},
    ]);
    const single = busyWindowProof(moving(), BLOCK, {control});
    expect(pooled.verdict).toEqual(single.verdict);
    expect(pooled.control).toEqual({
      moved: single.control?.moved,
      movedWith: single.control?.movedWith,
    });
  });

  it('reads a run the machine starved without throwing, and judges it with the others', () => {
    const run = (tracked: TrackedFrame[]) => ({
      tracked,
      control: asControl(tracked),
      window: BLOCK,
    });
    const pooled = pooledBusyProof([
      run(moving()),
      run(moving()),
      run(starvedCast()),
    ]);
    expect(pooled.judged).toEqual([true, true, true]);
    expect(pooled.verdict.failures, pooled.summary).toEqual([]);
  });

  it('throws on no runs', () => {
    expect(() => pooledBusyProof([])).toThrow(/no runs/);
  });
});

describe('a hold that starts before the block', () => {
  // A sheet's release in WebKit: moving until 120 ms before the block, held
  // (the just-started animation not presented yet) until 100 ms into it,
  // then moving on every frame.
  const holdFrom = BLOCK.from - 120;
  const holdTo = BLOCK.from + 100;
  const sheet = ({freezeAfterFirst = false} = {}) => {
    let y = 0;
    let changed = false;
    return moving().map(f => {
      if (f.t < holdFrom) {
        y += 3;
      } else if (f.t >= holdTo && (!freezeAfterFirst || !changed)) {
        y += 3;
        changed = true;
      }
      return {...f, box: {...f.box!, y}} as TrackedFrame;
    });
  };
  const control = asControl(moving());
  // The position the page set last, at the release: where the sheet holds.
  const released = sheet()
    .filter(f => f.t < holdFrom)
    .at(-1)!.box!.y;

  it('is judged from its first presented change inside the block when it holds the position the page set', () => {
    const proof = busyWindowProof(sheet(), BLOCK, {
      axis: 'y',
      control,
      setBeforeBlock: released,
    });
    expect(proof.verdict.failures, proof.summary).toEqual([]);
    expect(proof.onScreenFromMs).toBeGreaterThanOrEqual(100);
  });

  it('is not excused without the position the page set', () => {
    const proof = busyWindowProof(sheet(), BLOCK, {axis: 'y', control});
    expect(proof.verdict.pass, proof.summary).toBe(false);
    expect(proof.onScreenFromMs).toBeNull();
  });

  it('is not excused when it holds a position the page did not set', () => {
    const proof = busyWindowProof(sheet(), BLOCK, {
      axis: 'y',
      control,
      setBeforeBlock: released + 6,
    });
    expect(proof.verdict.pass, proof.summary).toBe(false);
    expect(proof.onScreenFromMs).toBeNull();
  });

  it('is excused on a 2 px cast that reads the held position up to a step off', () => {
    // WebKit's cast reads positions on a 2 px grid: a hold at a half pixel
    // reads up to 1.5 px off.
    const grid = sheet().map(f => ({...f, step: {x: 2, y: 2}}));
    const proof = busyWindowProof(grid, BLOCK, {
      axis: 'y',
      control,
      setBeforeBlock: released + 1.5,
    });
    expect(proof.verdict.failures, proof.summary).toEqual([]);
    expect(proof.onScreenFromMs).toBeGreaterThanOrEqual(100);
  });

  it('matches the held position within a pixel on a cast that carries no step', () => {
    const proof = busyWindowProof(sheet(), BLOCK, {
      axis: 'y',
      control,
      setBeforeBlock: released + 1.5,
    });
    expect(proof.verdict.pass, proof.summary).toBe(false);
    expect(proof.onScreenFromMs).toBeNull();
  });

  it('is not excused when the position it holds shows on one frame only', () => {
    // Moving up to the last frame before the block, then not found on any
    // frame until 150 ms in, then moving on. The position the page set
    // shows on one frame only, which is no hold. So the window is judged
    // from the judged part's start.
    let y = 0;
    const frames = moving().map(f => {
      y += 3;
      return (
        f.t >= BLOCK.from && f.t < BLOCK.from + 150
          ? {...f, box: null}
          : {...f, box: {...f.box!, y}}
      ) as TrackedFrame;
    });
    const last = frames.filter(f => f.t < BLOCK.from).at(-1)!.box!.y;
    const proof = busyWindowProof(frames, BLOCK, {
      axis: 'y',
      control,
      setBeforeBlock: last,
    });
    expect(proof.verdict.pass, proof.summary).toBe(false);
    expect(proof.onScreenFromMs).toBeNull();
  });

  it('fails an animation that was moving, freezes from just before the block for 50 ms, then moves on', () => {
    // Moving every frame up to the block, frozen from the frame before it
    // until 50 ms in, then moving on every frame. This is a compositor
    // animation stalled at the block's start, at none of the page's positions.
    let y = 0;
    const frames = moving().map(f => {
      if (f.t < BLOCK.from - 5 || f.t >= BLOCK.from + 50) {
        y += 3;
      }
      return {...f, box: {...f.box!, y}} as TrackedFrame;
    });
    const proof = busyWindowProof(frames, BLOCK, {axis: 'y', control});
    expect(proof.verdict.pass, proof.summary).toBe(false);
    expect(proof.onScreenFromMs).toBeNull();
  });

  it('still fails when the element changes once inside the block and then freezes', () => {
    const proof = busyWindowProof(sheet({freezeAfterFirst: true}), BLOCK, {
      axis: 'y',
      control,
      setBeforeBlock: released,
    });
    expect(proof.verdict.pass, proof.summary).toBe(false);
  });

  it('is not excused when it starts inside the block', () => {
    let y = 0;
    const frames = moving().map(f => {
      if (f.t < BLOCK.from + 50 || f.t >= BLOCK.from + 250) {
        y += 3;
      }
      return {...f, box: {...f.box!, y}} as TrackedFrame;
    });
    // Even at the last position before the judged part, as if the page had
    // set it.
    const proof = busyWindowProof(frames, BLOCK, {
      axis: 'y',
      control,
      setBeforeBlock: frames.filter(f => f.t < BLOCK.from + 20).at(-1)!.box!.y,
    });
    expect(proof.verdict.pass, proof.summary).toBe(false);
    expect(proof.onScreenFromMs).toBeNull();
  });

  it('is not excused when its first held frame is the one at the block start', () => {
    // Moving up to the frame presented as the block starts, then held on it
    // and the frames after until 250 ms in. The hold has two frames before
    // the judged part, at the position the page set, but starts inside the
    // block.
    let y = 0;
    const frames = moving().map(f => {
      if (f.t <= BLOCK.from || f.t >= BLOCK.from + 250) {
        y += 3;
      }
      return {...f, box: {...f.box!, y}} as TrackedFrame;
    });
    const held = frames.find(f => f.t >= BLOCK.from)!.box!.y;
    const proof = busyWindowProof(frames, BLOCK, {
      axis: 'y',
      control,
      setBeforeBlock: held,
    });
    expect(proof.verdict.pass, proof.summary).toBe(false);
    expect(proof.onScreenFromMs).toBeNull();
  });

  // A window that caught the animation (`blockMainThread`'s `during`) knows
  // its start. The position on the cast's last frame before that start then
  // stands for the position the page set.
  const caught = {
    ...BLOCK,
    animation: {from: holdFrom, to: BLOCK.to + 500, holds: true},
  };

  it('takes the position from the last frame before the caught animation starts when no position is given', () => {
    const proof = busyWindowProof(sheet(), caught, {axis: 'y', control});
    const named = busyWindowProof(sheet(), caught, {
      axis: 'y',
      control,
      setBeforeBlock: released,
    });
    expect(proof.verdict.failures, proof.summary).toEqual([]);
    expect(proof.onScreenFromMs).toBeGreaterThanOrEqual(100);
    expect(proof.summary).toBe(named.summary);
  });

  it("keeps the position the page set over the caught animation's start", () => {
    const proof = busyWindowProof(sheet(), caught, {
      axis: 'y',
      control,
      setBeforeBlock: released + 6,
    });
    expect(proof.verdict.pass, proof.summary).toBe(false);
    expect(proof.onScreenFromMs).toBeNull();
  });

  it('still fails a main-thread animation held at its start until after the block', () => {
    let y = 0;
    const frames = moving().map(f => {
      if (f.t < holdFrom || f.t >= BLOCK.to + 50) {
        y += 3;
      }
      return {...f, box: {...f.box!, y}} as TrackedFrame;
    });
    const proof = busyWindowProof(frames, caught, {axis: 'y', control});
    expect(proof.verdict.pass, proof.summary).toBe(false);
    expect(proof.onScreenFromMs).toBeNull();
  });

  it('does not excuse a hold at a position the animation moved to after its start', () => {
    // Moving for 60 ms after the caught animation's start, then held there
    // until 100 ms into the block, then moving on every frame.
    let y = 0;
    const frames = moving().map(f => {
      if (f.t < holdFrom + 60 || f.t >= holdTo) {
        y += 3;
      }
      return {...f, box: {...f.box!, y}} as TrackedFrame;
    });
    const proof = busyWindowProof(frames, caught, {axis: 'y', control});
    expect(proof.verdict.pass, proof.summary).toBe(false);
    expect(proof.onScreenFromMs).toBeNull();
  });

  it("judges a recorded slider coast the same with the caught animation's start as with the position the page set", () => {
    // Recorded in Chromium on a loaded runner: SliderTouch's coast through a
    // 400 ms block, with the busy control. Each row is [ms from the block's
    // start, thumb x, control x] on one cast frame. The thumb holds at its
    // release position, 163 px, from before the coast's start. Here the hold
    // is extended through the second judged frame, as a late hand-off can be.
    const recorded: ReadonlyArray<readonly [number, number, number]> = [
      [-222.1, 156, 130],
      [-188.6, 156, 150],
      [-179, 156, 160],
      [-153.7, 163, 180],
      [-144.6, 163, 190],
      [-122.4, 163, 200],
      [-86.2, 163, 210],
      [-85.6, 163, 220],
      [-45.2, 163, 240],
      [-29.8, 163, 230],
      [-24.1, 163, 220],
      [15.2, 206, 190],
      [42.1, 214, 180],
      [49.2, 220, 170],
      [66.8, 225, 160],
      [93.7, 229, 150],
      [135.3, 232, 140],
      [139, 236, 130],
      [171.4, 241, 100],
      [186.5, 243, 90],
      [210.6, 244, 80],
      [231.8, 245, 60],
      [259.7, 246, 50],
      [279.9, 246, 40],
      [287.7, 247, 30],
      [318.4, 247, 20],
    ];
    const from = 10_000;
    const coastStart = from - 74.7;
    const holdUntil = from + 49.2;
    const thumb = recorded.map(
      ([t, x]) =>
        ({
          t: from + t,
          box: {
            x: from + t > coastStart && from + t <= holdUntil ? 163 : x,
            y: 0,
            width: 28,
            height: 28,
          },
          pixels: 400,
          step: {x: 1, y: 1},
        }) as TrackedFrame,
    );
    const slider = recorded.map(
      ([t, , x]) =>
        ({
          t: from + t,
          box: {x, y: 0, width: 12, height: 12},
          pixels: 100,
        }) as TrackedFrame,
    );
    const window = {
      from,
      to: from + 400,
      animation: {from: coastStart, to: coastStart + 564.3, holds: true},
    };
    const options = {
      axis: 'x',
      settledWithinSteps: 2,
      control: slider,
    } as const;
    const byStart = busyWindowProof(thumb, window, options);
    const named = busyWindowProof(thumb, window, {
      ...options,
      setBeforeBlock: 163,
    });
    const plain = busyWindowProof(thumb, {from, to: from + 400}, options);
    expect(byStart.verdict.failures, byStart.summary).toEqual([]);
    expect(byStart.summary).toBe(named.summary);
    expect(plain.verdict.pass, plain.summary).toBe(false);
  });
});
