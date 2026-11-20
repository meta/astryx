// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file busy.webkitclock.test.ts
 * @input Synthetic WebKit and Chromium casts, and a recorded Chromium cast
 *   (no browser)
 * @output A busy proof with a control judges each frame at its time on the
 *   controls' clock. A frame stamped late after a delivery gap passes. A
 *   half-rate fade, on a full cast or a sparse one, and a frozen fade still
 *   fail. Near a turn, the control ahead dates a late frame; without it, the
 *   frame keeps its lateness. A frame with no reading takes its time from a
 *   neighbour whose stamp agrees with its reading. A measured cast keeps its
 *   order, no two frames share a time, and its judged part stays on its
 *   stamps. WebKit keeps one frame per display interval and notes that it
 *   judges no 30 Hz cadence; Chromium keeps every frame. A recorded Chromium
 *   coast passes at its display interval, which its uneven stamps misread.
 *   Casts with no control get their stamps' proof.
 * @position Unit test of ./busy's busyWindowProof on casts it dates
 */

import {describe, expect, it} from 'vitest';
import {busyWindowProof, pageTimesOnControls, pooledBusyProof} from './busy';
import {FrameStarvationError, type TrackedFrame} from './frames';

const FRAME = 1000 / 60;
const BLOCK = {from: 1000, to: 1700};

/** The control's x at page time `ms`: 240 px one way every 400 ms, from 0. */
function xAt(ms: number): number {
  const phase = ((ms % 800) + 800) % 800;
  return phase < 400 ? (phase / 400) * 240 : 240 - ((phase - 400) / 400) * 240;
}

/** A frame the compositor drew at `at`, which the cast stamped at `stamp`. */
interface Shot {
  readonly at: number;
  readonly stamp: number;
}

/** Frames one display interval apart, each stamped when it was drawn. */
function onTime(from = 800, to = 1900): Shot[] {
  const shots: Shot[] = [];
  for (let i = 0; from + i * FRAME <= to; i += 1) {
    shots.push({at: from + i * FRAME, stamp: from + i * FRAME});
  }
  return shots;
}

/**
 * A delivery gap after frame `k + 1`, as WebKit's cast shows one. The frame
 * after frame `k` carries one frame of motion, and the cast stamps it 60 ms
 * late. Nothing is drawn for 77 ms. The frames after that are one interval
 * apart, each stamped when it was drawn.
 */
function lateAfterGap(k: number): Shot[] {
  const shots = onTime().slice(0, k + 1);
  const drawn = shots[k].at + FRAME;
  shots.push({at: drawn, stamp: drawn + 60});
  return [...shots, ...onTime(drawn + 77)];
}

/**
 * The frames as the busy proof gets them. The component's value is on x, as
 * is each control's position: the first one's, and the one half a leg ahead.
 */
function cast(
  shots: readonly Shot[],
  value: (at: number) => number,
  engine?: 'chromium' | 'webkit',
): {tracked: TrackedFrame[]; control: TrackedFrame[]; ahead: TrackedFrame[]} {
  const frame = (stamp: number, x: number, side: number): TrackedFrame => ({
    t: stamp,
    box: {x: Math.round(x), y: 0, width: side, height: side},
    pixels: side * side,
    ...(engine == null ? {} : {engine}),
  });
  return {
    tracked: shots.map(({at, stamp}) => frame(stamp, value(at), 1)),
    control: shots.map(({at, stamp}) => frame(stamp, xAt(at), 12)),
    ahead: shots.map(({at, stamp}) => frame(stamp, xAt(at + 200), 12)),
  };
}

/**
 * A fade from 212 by `perFrame` units each display interval. At 0.6 no frame
 * lands half-way between two whole units, so no rounding tie decides a step.
 */
const fade =
  (perFrame: number) =>
  (at: number): number =>
    212 - (perFrame * (at - 800)) / FRAME;

/** The busy proof's failures for these frames, on the x axis. */
function failures(frames: ReturnType<typeof cast>): readonly string[] {
  return busyWindowProof(frames.tracked, BLOCK, {
    axis: 'x',
    control: frames.control,
  }).verdict.failures;
}

describe('busyWindowProof on a WebKit cast with a control', () => {
  it("judges a frame stamped late after a delivery gap at its time on the control's clock", () => {
    // The late frame was drawn at the block's start, before the judged part.
    // On its stamps it falls 60 ms into the judged part, and the fade's step
    // there makes a stall that the control does not show.
    const shots = lateAfterGap(11);
    expect(failures(cast(shots, fade(0.6))).join('\n')).toMatch(
      /longest stall 57\.0 ms, longer than the control's 40\.0 ms/,
    );
    const webkit = cast(shots, fade(0.6), 'webkit');
    expect(failures(webkit)).toEqual([]);
    expect(
      busyWindowProof(webkit.tracked, BLOCK, {
        axis: 'x',
        control: webkit.control,
        ahead: webkit.ahead,
      }).verdict.failures,
    ).toEqual([]);
  });

  it('still fails a fade that changes every other frame', () => {
    // An ease-out over 1 s: its late steps are small, so a frame it holds is
    // not one cast step of motion.
    const eased = (at: number) => {
      const progress = Math.min(Math.max((at - 800) / 1000, 0), 1);
      return 212 - 120 * (1 - (1 - progress) ** 2);
    };
    const halfRate = (at: number) =>
      eased(800 + 2 * FRAME * Math.floor((at - 800) / (2 * FRAME) + 1e-6));
    expect(failures(cast(onTime(), eased, 'webkit'))).toEqual([]);
    expect(failures(cast(onTime(), halfRate, 'webkit')).join('\n')).toMatch(
      /moved on \d+ of the 39 frames the control moved.*\n.*longest stall 33\.3 ms, longer than the control's 16\.7 ms/,
    );
  });

  it('still fails a fade that changes every other frame on a sparse cast: pairs of frames 17 ms apart, 75 ms between pairs', () => {
    const sparse: Shot[] = [];
    for (let at = 800, i = 0; at <= 1900; i += 1) {
      sparse.push({at, stamp: at});
      at += i % 2 === 0 ? 17 : 75;
    }
    const halfRate = (at: number) =>
      212 - 6 * Math.floor((at - 800) / (2 * FRAME) + 1e-6);
    expect(failures(cast(sparse, fade(3), 'webkit'))).toEqual([]);
    for (const engine of [undefined, 'webkit'] as const) {
      expect(failures(cast(sparse, halfRate, engine)).join('\n')).toMatch(
        /moved on 10 of the 14 frames the control moved/,
      );
    }
  });

  it('still fails a fade that freezes', () => {
    const frozen = (at: number) => fade(2)(Math.min(at, 1300));
    expect(failures(cast(onTime(), frozen, 'webkit')).join('\n')).toMatch(
      /moved on 17 of the 39 frames the control moved.*\n.*longest stall 380\.0 ms, longer than the control's 16\.7 ms/,
    );
  });

  it("dates a late frame near the first control's turn by the control ahead; without it, the frame keeps its lateness", () => {
    // After frame 21 the first control is at 220 px, within 36 px of its turn,
    // and gives the late frame no time. The control ahead is mid-leg there.
    const shots = lateAfterGap(21);
    const frames = cast(shots, (at: number) => fade(0.6)(at - 10), 'webkit');
    const summary = (control: TrackedFrame[], ahead?: TrackedFrame[]) =>
      busyWindowProof(frames.tracked, BLOCK, {axis: 'x', control, ahead})
        .summary;
    // Without it, the late frame keeps its stamp's distance from the frame
    // after the gap, its nearest dated neighbour: still 60 ms late.
    expect(summary(frames.control)).toMatch(/longest stall 93\.0 ms/);
    expect(summary(frames.control, frames.ahead)).toMatch(
      /longest stall 76\.7 ms/,
    );
  });

  it("dates a frame with no reading from a neighbour whose stamp agrees with its reading, so a late frame's stamp does not hide the gap after it", () => {
    // The frame after frame 41 is read at its time but stamped 60 ms late. The
    // frames after the 77 ms gap fall near the first control's turn, with no
    // reading. Dated from the late frame's stamp, the first of them would come
    // 17 ms after it, and the gap would not show.
    const frames = cast(lateAfterGap(41), fade(0.6), 'webkit');
    const proof = (ahead?: TrackedFrame[]) =>
      busyWindowProof(frames.tracked, BLOCK, {
        axis: 'x',
        control: frames.control,
        ahead,
      });
    // The control ahead reads those frames, so their times are known.
    expect(proof().summary).toBe(proof(frames.ahead).summary);
    expect(proof().verdict.failures.join('\n')).toMatch(
      /longest stall 93\.3 ms, longer than the control's 76\.7 ms/,
    );
  });

  it("keeps a measured cast's order: its dated frames never swap, so a linear motion stays monotonic", () => {
    // One WebKit cast of a 700 ms block over a linear transition, under load.
    // Each row is [stamp in ms from the block's start, control x, box y].
    // Near the control's turns, frames with no reading take their times from
    // agreeing stamps whose lateness differs.
    const measured: readonly (readonly [number, number, number])[] = [
      [-294.1, 5, 40],
      [-276.5, 28, 40],
      [-230.0, 38, 40],
      [-196.5, 66, 40],
      [-179.3, 86, 40],
      [-129.1, 96, 40],
      [-95.2, 126, 58],
      [-77.9, 146, 70],
      [-2.3, 157, 76],
      [14.7, 203, 104],
      [100.6, 213, 110],
      [118.2, 218, 140],
      [170.3, 206, 146],
      [204.5, 176, 164],
      [222.1, 155, 176],
      [270.8, 145, 182],
      [304.4, 114, 198],
      [363.4, 94, 210],
      [400.7, 60, 232],
      [418.4, 38, 244],
      [499.7, 27, 250],
      [516.8, 24, 278],
      [568.9, 34, 284],
      [604.2, 65, 304],
      [621.7, 87, 316],
      [669.9, 97, 322],
      [704.8, 126, 338],
      [765.3, 146, 350],
      [817.6, 204, 384],
      [870.1, 215, 390],
      [904.0, 236, 408],
      [921.6, 216, 420],
      [970.1, 205, 426],
      [1002.0, 176, 444],
      [1018.9, 157, 454],
      [1066.8, 146, 460],
      [1098.7, 118, 478],
      [1116.4, 98, 488],
      [1166.9, 88, 494],
      [1198.5, 58, 512],
      [1216.0, 39, 524],
      [1263.5, 28, 530],
      [1298.4, 2, 546],
      [1315.6, 23, 558],
      [1365.0, 33, 564],
      [1403.0, 62, 582],
      [1419.8, 86, 596],
      [1469.1, 96, 598],
      [1502.2, 125, 598],
      [1519.5, 145, 598],
      [1567.9, 156, 600],
      [1600.8, 185, 600],
    ];
    const measuredCast = (engine?: 'webkit') => ({
      tracked: measured.map(([t, , y]): TrackedFrame => ({
        t,
        box: {x: 20, y, width: 80, height: 80},
        pixels: 6400,
        step: {x: 2, y: 2},
        ...(engine == null ? {} : {engine}),
      })),
      control: measured.map(([t, x]): TrackedFrame => ({
        t,
        box: {x, y: 0, width: 12, height: 12},
        pixels: 144,
        ...(engine == null ? {} : {engine}),
      })),
    });
    const window = {from: 0, to: 700};
    const stamps = measuredCast();
    const onStamps = busyWindowProof(stamps.tracked, window, {
      axis: 'y',
      control: stamps.control,
    });
    expect(onStamps.monotonic, onStamps.summary).toBe(true);
    const webkit = measuredCast('webkit');
    const dated = busyWindowProof(webkit.tracked, window, {
      axis: 'y',
      control: webkit.control,
    });
    expect(dated.monotonic, dated.summary).toBe(true);
    expect(dated.verdict.failures, dated.summary).toEqual([]);
  });

  it('gives each dated frame its own time: a held frame that the order rule moves up to a moved one still reads as a stall', () => {
    // From frame 28 on, the cast stamps every frame 19 ms later. Frames 21 to
    // 27 are near the control's turn, with no reading. Frame 25 takes its time
    // from frame 28's lateness and would come before frame 24, so the order
    // rule moves it up. The component holds on frame 25 while the control moves.
    const shots = onTime().map((shot, i) =>
      i >= 28 ? {...shot, stamp: shot.stamp + 19} : shot,
    );
    const linear = (at: number) => 20 + (6 * (at - 800)) / FRAME;
    const heldAt = 800 + 25 * FRAME;
    const held = (at: number) =>
      linear(Math.abs(at - heldAt) < 1 ? heldAt - FRAME : at);
    expect(failures(cast(shots, linear, 'webkit'))).toEqual([]);
    expect(failures(cast(shots, held))).not.toEqual([]);
    expect(failures(cast(shots, held, 'webkit')).join('\n')).toMatch(
      /moved on 3\d of the 3\d frames the control moved/,
    );
  });

  it('gives two frames of a late burst different times, so a held frame clamped to the next reading still reads as a stall', () => {
    // Frames 27 to 31 come in a burst, stamped 50, 55, 40, 25 and 10 ms late.
    // Frame 27 is the last near the control's turn, with no reading. It takes
    // its time from frame 30, whose stamp agrees with its reading, and would
    // come after frame 28. So the order rule moves it to just before frame 28.
    // The component holds on frame 27 while the control moves.
    const late = [50, 55, 40, 25, 10];
    const shots = onTime().map((shot, i) =>
      i >= 27 && i <= 31 ? {...shot, stamp: shot.stamp + late[i - 27]} : shot,
    );
    const linear = (at: number) => 20 + (6 * (at - 800)) / FRAME;
    const heldAt = 800 + 27 * FRAME;
    const held = (at: number) =>
      linear(Math.abs(at - heldAt) < 1 ? heldAt - FRAME : at);
    expect(failures(cast(shots, linear, 'webkit'))).toEqual([]);
    expect(failures(cast(shots, held, 'webkit'))[0]).toMatch(
      /^moved on 39 of the 40 frames the control moved/,
    );
  });

  it("reports the judged part on the cast's stamps, so a caller's own frames select exactly the frames judged", () => {
    // The late frame was drawn before the judged part, and its stamp falls
    // inside it. The proof leaves it out on the controls' clock, so a
    // selection by the judged part on the stamps must leave it out too.
    const webkit = cast(lateAfterGap(11), fade(0.6), 'webkit');
    const proof = busyWindowProof(webkit.tracked, BLOCK, {
      axis: 'x',
      control: webkit.control,
    });
    const selected = webkit.tracked.filter(
      frame =>
        frame.box != null &&
        frame.t >= proof.judged.from &&
        frame.t <= proof.judged.to,
    );
    expect(proof.summary).toContain(`: ${selected.length} frames presented`);
  });

  it('keeps one frame per display interval: a frame drawn 6.6 to 8.4 ms after another shows no new step and is left out', () => {
    // A curve of 4 px a frame in 2 px steps: two steps, so no early-frame
    // leniency applies. Every fourth frame in the block has a second frame
    // drawn 6.6 or 8.4 ms after it, still at its step.
    const shots = onTime().flatMap((shot, i) => {
      if (shot.at <= 1000 || shot.at >= 1650 || i % 4 !== 0) {
        return [shot];
      }
      const after = i % 8 === 0 ? 6.6 : 8.4;
      return [shot, {at: shot.at + after, stamp: shot.stamp + after}];
    });
    const stepped = (at: number) =>
      20 + 4 * Math.floor((at - 800) / FRAME + 1e-6);
    const frames = cast(shots, stepped, 'webkit');
    const proof = (ahead?: TrackedFrame[]) =>
      busyWindowProof(frames.tracked, BLOCK, {
        axis: 'x',
        control: frames.control,
        ahead,
      }).verdict.failures;
    // The control ahead reads the frames near the first control's turns.
    expect(proof(frames.ahead)).toEqual([]);
    // Without it, the second frame at a turn has no reading. It stays, and
    // still reads as held.
    expect(proof().join('\n')).toMatch(/moved on \d+ of the \d+ frames/);
  });

  it('judges no 30 Hz cadence on a sparse cast and says so: a fade that changes every other interval passes, with the count of pairs in a note', () => {
    // Frames two display intervals apart. A fade that changes every other
    // interval moves on every frame shown, so only the note can tell.
    const sparse = onTime().filter((_, i) => i % 2 === 0);
    const halfRate = (at: number) =>
      212 - 1.2 * Math.floor((at - 800) / (2 * FRAME) + 1e-6);
    const proof = (value: (at: number) => number) => {
      const frames = cast(sparse, value, 'webkit');
      return busyWindowProof(frames.tracked, BLOCK, {
        axis: 'x',
        control: frames.control,
      });
    };
    expect(proof(halfRate).verdict.failures).toEqual([]);
    expect(proof(halfRate).summary).toMatch(
      /; note: cadence not judged: 0 display-interval pairs$/,
    );
    const frozen = proof(at => halfRate(Math.min(at, 1300)));
    expect(frozen.verdict.failures).not.toEqual([]);
    expect(frozen.summary).toMatch(/cadence not judged: 0 display-interval/);
  });

  it('on a dense cast, a fade that changes every other interval still fails in both engines; only WebKit carries the cadence note', () => {
    const eased = (at: number) => {
      const progress = Math.min(Math.max((at - 800) / 1000, 0), 1);
      return 212 - 120 * (1 - (1 - progress) ** 2);
    };
    const halfRate = (at: number) =>
      eased(800 + 2 * FRAME * Math.floor((at - 800) / (2 * FRAME) + 1e-6));
    const proof = (engine?: 'chromium' | 'webkit') => {
      const frames = cast(onTime(), halfRate, engine);
      return busyWindowProof(frames.tracked, BLOCK, {
        axis: 'x',
        control: frames.control,
      });
    };
    expect(proof('webkit').verdict.failures).not.toEqual([]);
    expect(proof('webkit').summary).toMatch(
      /cadence not judged: [1-9]\d* display-interval pairs/,
    );
    for (const engine of [undefined, 'chromium'] as const) {
      expect(proof(engine).verdict.failures).not.toEqual([]);
      expect(proof(engine).summary).not.toContain('cadence not judged');
    }
  });

  it('matches each frame to its control frame by time, and names the pairs that have none', () => {
    const frames = cast(onTime(), fade(0.6), 'webkit');
    const control = frames.control.filter((_, i) => i % 7 !== 3);
    const proof = busyWindowProof(frames.tracked, BLOCK, {axis: 'x', control});
    expect(proof.summary).toMatch(
      /cadence not judged: \d+ display-interval pairs, [1-9]\d* without a control frame at their time$/,
    );
  });

  it("carries the cadence note in each run's own summary in a pooled proof", () => {
    const runs = [0.6, 0.9].map(perFrame => {
      const frames = cast(onTime(), fade(perFrame), 'webkit');
      return {tracked: frames.tracked, control: frames.control, window: BLOCK};
    });
    const pooled = pooledBusyProof(runs, {axis: 'x'});
    expect(pooled.summary).toMatch(
      /; run 1: [^;]*(;[^;]*)*?; note: cadence not judged: \d+ display-interval pairs; run 2: .*; note: cadence not judged: \d+ display-interval pairs$/,
    );
  });

  it('gives each control frame with a reading its own time on the page clock, and none to a frame near a turn', () => {
    // The frame after frame 11 is drawn one interval later, stamped 60 ms
    // late: it reads at its drawn time.
    const gap = cast(lateAfterGap(11), fade(0.6), 'webkit');
    const late = lateAfterGap(11)[12];
    expect(pageTimesOnControls(gap.control).get(late.stamp)).toBeCloseTo(
      late.at,
      0,
    );
    // At 1200 ms the first control turns, and only the one ahead reads it.
    const shots = onTime();
    const frames = cast(shots, fade(0.6), 'webkit');
    const turn = shots[24].stamp;
    expect(pageTimesOnControls(frames.control).has(turn)).toBe(false);
    expect(
      pageTimesOnControls(frames.control, {ahead: frames.ahead}).get(turn),
    ).toBeCloseTo(turn, 0);
  });

  it("dates the frames from the controls' starts as from the origin their stamps agree with", () => {
    const frames = cast(lateAfterGap(11), fade(0.6), 'webkit');
    const proof = (controlStarts?: readonly [number, number?]) =>
      busyWindowProof(frames.tracked, BLOCK, {
        axis: 'x',
        control: frames.control,
        ahead: frames.ahead,
        controlStarts,
      });
    expect(proof([0, -200]).summary).toBe(proof().summary);
    expect(proof([0, -200]).verdict.failures).toEqual([]);
  });

  it('judges a cast with no control on its stamps, in either engine', () => {
    const shots = lateAfterGap(11);
    const stamped = cast(shots, fade(0.6));
    const chromium = cast(shots, fade(0.6), 'chromium');
    const webkit = cast(shots, fade(0.6), 'webkit');
    const proof = (frames: ReturnType<typeof cast>) =>
      busyWindowProof(frames.tracked, BLOCK, {axis: 'x'});
    expect(proof(chromium)).toEqual(proof(stamped));
    expect(proof(webkit)).toEqual(proof(stamped));
  });

  it('measures the cast on every frame it drew, so a frame the display-rate keep leaves out never lengthens its longest gap', () => {
    // In the block, a frame drawn 7 ms after another is left out of the
    // judgment, and then no frame comes for 48 ms. Without that frame, the
    // gap would read 55 ms, over FRAME_STARVATION_MS.
    const shots = [
      ...onTime(800, 990),
      ...[1010, 1017, 1065, 1090].map(at => ({at, stamp: at})),
      ...onTime(1110, 1300),
    ];
    const proof = (value: (at: number) => number) => () => {
      const frames = cast(shots, value, 'webkit');
      return busyWindowProof(
        frames.tracked,
        {from: 1000, to: 1100},
        {axis: 'x', control: frames.control, ahead: frames.ahead},
      );
    };
    // Under the floor, a frozen component failed on frames the compositor
    // presented, and no gap passed 50 ms. So its red stands.
    expect(proof(() => 100)().verdict.failures.join('\n')).toMatch(
      /moved on 0 of the \d+ frames the control moved/,
    );
    // A component that moves with the control is too little to judge. The
    // error counts every frame drawn, the one left out included.
    const moving = proof(xAt);
    expect(moving).toThrow(FrameStarvationError);
    try {
      moving();
    } catch (error) {
      const {numbers} = error as FrameStarvationError;
      expect(numbers.frames).toBe(4);
      expect(numbers.longestGapMs).toBeGreaterThan(45);
      expect(numbers.longestGapMs).toBeLessThanOrEqual(50);
    }
  });
});

describe('busyWindowProof on a Chromium cast with a control', () => {
  it("judges a frame stamped late after a delivery gap at its time on the controls' clock, as in WebKit", () => {
    const shots = lateAfterGap(11);
    expect(failures(cast(shots, fade(0.6))).join('\n')).toMatch(
      /longest stall 57\.0 ms, longer than the control's 40\.0 ms/,
    );
    expect(failures(cast(shots, fade(0.6), 'chromium'))).toEqual([]);
  });

  it('judges a recorded slider coast at its display interval, which its uneven stamps misread', () => {
    // Recorded in Chromium on a loaded runner: SliderTouch's coast through a
    // 400 ms block, with the busy control. Each row is [ms from the block's
    // start, thumb x, control x] on one cast frame. The stamps trail the
    // frames unevenly: +184.8 and +187.0 are a whole control step apart. So
    // the frame interval read from the stamps is 23 ms, where the display
    // drew every 17 ms. At that interval, the slow tail's 2 px catch-up after
    // its held frame at +184.8 reads as over two cast steps a frame. The held
    // frame then reads as a miss. On the controls' clock, the interval is
    // 17 ms. The held frame is then a step that the cast could not show.
    const recorded: ReadonlyArray<readonly [number, number, number]> = [
      [-246.1, 156, 30],
      [-218.9, 156, 20],
      [-209.4, 156, 10],
      [-184.9, 156, 0],
      [-143.1, 163, 20],
      [-142.4, 163, 30],
      [-120.9, 163, 40],
      [-96.5, 163, 60],
      [-61.1, 163, 80],
      [-58, 163, 90],
      [-22.2, 212, 120],
      [10.7, 218, 130],
      [34.3, 224, 140],
      [56.1, 228, 150],
      [63.4, 232, 160],
      [86.6, 235, 170],
      [90.9, 238, 180],
      [126.6, 239, 190],
      [168, 243, 210],
      [184.8, 243, 220],
      [187, 245, 230],
      [220.2, 245, 240],
      [228.5, 246, 220],
      [257.8, 247, 210],
      [278.7, 247, 190],
    ];
    const from = 10_000;
    const frames = (engine?: 'chromium') => ({
      thumb: recorded.map(([t, x]): TrackedFrame => ({
        t: from + t,
        box: {x, y: 0, width: 28, height: 28},
        pixels: 784,
        step: {x: 1, y: 1},
        ...(engine == null ? {} : {engine}),
      })),
      control: recorded.map(([t, , x]): TrackedFrame => ({
        t: from + t,
        box: {x, y: 0, width: 12, height: 12},
        pixels: 144,
        ...(engine == null ? {} : {engine}),
      })),
    });
    const window = {
      from,
      to: from + 400,
      animation: {from: from - 109.6, to: from + 454.9, holds: true},
    };
    const judge = (engine?: 'chromium') => {
      const {thumb, control} = frames(engine);
      return busyWindowProof(thumb, window, {
        axis: 'x',
        settledWithinSteps: 2,
        control,
      });
    };
    const stamped = judge();
    expect(stamped.cadenceMs).toBeGreaterThan(22);
    expect(stamped.verdict.failures).toEqual([
      'moved on 8 of the 9 frames the control moved (89%)',
    ]);
    const dated = judge('chromium');
    expect(dated.cadenceMs).toBeLessThan(17.5);
    expect(dated.verdict.failures).toEqual([]);
    expect(dated.control?.belowStep).toBe(1);
  });
});
