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
 *   all of them, each run's stall against that run's control.
 * @position Unit test of ./busy's control judgment; the frames are
 *   busy.test.ts's fixtures, and the browser proof with a real compositor
 *   control is in harness.interaction.browser.spec.ts.
 */

import {describe, expect, it} from 'vitest';
import {busyWindowProof, pooledBusyProof} from './busy';
import type {TrackedFrame} from './frames';

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
    expect(proof.summary).toMatch(/under one cast step a frame/);
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

  it('fails a window in which the control itself presented too little to judge', () => {
    const still = asControl(
      moving().map(f => ({...f, box: {...f.box!, y: 0}}) as TrackedFrame),
    );
    const proof = busyWindowProof(moving(), BLOCK, {control: still});
    expect(proof.verdict.failures.join('\n')).toMatch(
      /the control moved on 0 frames in the judged part/,
    );
  });
});

/** A 90 ms block from `from`: its judged part holds three 60 Hz frames. */
const short = (from: number) => ({from, to: from + 90});

describe('pooledBusyProof', () => {
  it('judges a block too short for one run over pooled runs: one run cannot decide, three runs of a component that moves with the control pass', () => {
    const control = asControl(moving());
    const single = busyWindowProof(moving(), short(1000), {control});
    expect(single.verdict.failures.join('\n')).toMatch(
      /the control moved on 3 frames in the judged part, under 4/,
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

  it('judges the control over the pool too: runs in which it presented too little fail', () => {
    const still = asControl(
      moving().map(f => ({...f, box: {...f.box!, y: 0}}) as TrackedFrame),
    );
    const pooled = pooledBusyProof(
      [1000, 1300].map(from => ({
        tracked: moving(),
        control: still,
        window: short(from),
      })),
    );
    expect(pooled.verdict.failures.join('\n')).toMatch(
      /the control moved on 0 frames over 2 runs, under 4/,
    );
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

  it('is judged from its first presented change inside the block', () => {
    const proof = busyWindowProof(sheet(), BLOCK, {axis: 'y', control});
    expect(proof.verdict.failures, proof.summary).toEqual([]);
    expect(proof.onScreenFromMs).toBeGreaterThanOrEqual(100);
  });

  it('still fails when the element changes once inside the block and then freezes', () => {
    const proof = busyWindowProof(sheet({freezeAfterFirst: true}), BLOCK, {
      axis: 'y',
      control,
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
    const proof = busyWindowProof(frames, BLOCK, {axis: 'y', control});
    expect(proof.verdict.pass, proof.summary).toBe(false);
    expect(proof.onScreenFromMs).toBeNull();
  });
});
