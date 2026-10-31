// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file controlClock.ts
 * @input Screencast frames: each one's timestamp and the harness's control
 *   box's x on it (240 px out in 400 ms, back in 400 ms, repeating)
 * @output Exports controlClock: the control's own time at each usable frame
 * @position Test support for animator.interaction.browser.spec.ts, whose
 *   busy-window proof reads the spring against the control's clock
 */

/** The control's speed, px per ms: 240 px in 400 ms. */
const SPEED = 0.6;
/** One out-and-back, ms. */
const CYCLE = 800;
/**
 * Frames this near a turn are left out: there the two times a position
 * gives are under 80 ms apart.
 */
const EDGE = 24;

export interface ClockFrame {
  readonly t: number;
  readonly x: number | null;
}

/** How far a frame's stamp may run late and still agree with the others, ms. */
const AGREE = 20;

/** The distance between two times on the cycle, ms. */
function onCycle(a: number, b: number): number {
  const d = Math.abs(a - b) % CYCLE;
  return Math.min(d, CYCLE - d);
}

/**
 * The control's time at each usable frame, by index into `frames`. Its
 * position gives two times a cycle, on the way out and on the way back. The
 * cycle's origin is the one the most frames agree with, each within AGREE ms
 * of one of its two times, so no single frame sets it: a frame whose stamp
 * runs late, or one whose direction its neighbors cannot tell (the next
 * usable frame past a turn), moves only its own reading. Each frame's
 * timestamp, measured from that origin, then picks its time.
 */
export function controlClock(
  frames: ReadonlyArray<ClockFrame>,
): {i: number; ms: number}[] {
  const usable = frames.flatMap((f, i) =>
    f.x == null || f.x < EDGE || f.x > 240 - EDGE
      ? []
      : [{i, t: f.t, out: f.x / SPEED, back: CYCLE - f.x / SPEED}],
  );
  if (usable.length === 0) {
    return [];
  }
  let origin = 0;
  let agreeing = -1;
  let spread = Number.POSITIVE_INFINITY;
  for (let candidate = 0; candidate < CYCLE; candidate++) {
    let count = 0;
    let sum = 0;
    for (const u of usable) {
      const phase = u.t - candidate;
      const d = Math.min(onCycle(phase, u.out), onCycle(phase, u.back));
      if (d <= AGREE) {
        count += 1;
        sum += d;
      }
    }
    if (count > agreeing || (count === agreeing && sum < spread)) {
      origin = candidate;
      agreeing = count;
      spread = sum;
    }
  }
  // The same origin a whole number of cycles before the first frame, so the
  // control's times count up from it.
  const first = usable[0].t;
  const anchored = origin + Math.floor((first - origin) / CYCLE) * CYCLE;
  return usable.map(u => {
    const expected = u.t - anchored;
    const cycle = Math.round((expected - u.out) / CYCLE);
    const candidates = [u.out, u.back, u.out + CYCLE, u.back - CYCLE].map(
      ms => ms + cycle * CYCLE,
    );
    const ms = candidates.reduce((best, c) =>
      Math.abs(c - expected) < Math.abs(best - expected) ? c : best,
    );
    return {i: u.i, ms};
  });
}
