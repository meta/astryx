// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file webInput.ts
 * @input Uses a Playwright `Page` (Chromium or WebKit)
 * @output `webInputDriver(page)`: a wheel step (`wheel({x, y, dx, dy, ctrl})`),
 *   a run of wheel steps as one gesture (`wheelBurst({x, y, steps})`) and a
 *   pen stroke (`pen(points)`) as REAL engine input, for proofs that the same
 *   motion works for every pointer, not only a finger (`spec:AST-100` FR4).
 * @position The non-touch half of the input drivers; touch.ts is the touch
 *   half and owns the input log both are read through. Untrusted DOM events
 *   are not input (a component can tell them apart with `isTrusted`), so both
 *   go through the engine's own input pipeline.
 *
 * Chromium: CDP `Input.dispatchMouseEvent`.
 * - A wheel step is a `mouseWheel` event at (x, y). Chromium divides the
 *   deltas it delivers by the device scale factor times the visual viewport's
 *   scale, so the driver multiplies them back: the page receives exactly `dx`
 *   and `dy` CSS px, in pixel mode (`deltaMode` 0). `ctrl` holds Control, as a
 *   trackpad pinch arrives. On a page whose wheel listeners are all passive
 *   (every page with the input log), Chromium answers the dispatch at once
 *   and delivers the step to the page afterwards, so `wheel` waits, through a
 *   one-shot passive listener, until the page has the step.
 * - A pen stroke is pressed at its first point, moved through every point and
 *   released at the last, with `pointerType: 'pen'`, a pressure and an
 *   optional tilt, each event stamped with its scripted time: the page
 *   receives trusted pen pointer events (and the compatibility mouse events)
 *   with those timestamps. The stroke starts once the page has presented two
 *   frames: the press goes out with no page round trip, so right after a
 *   navigation it could carry the previous document's page scale (about:blank
 *   scales a press at 100 px to 41 px in the phone project).
 * - A pen stroke over a native scroller does not pan it: Chromium sends the
 *   pen through its mouse pipeline, so the stroke scrolls nothing, raises no
 *   `pointercancel` and ends in a `click`.
 *
 * WebKit (Playwright's Linux build): `page.mouse.wheel` in a desktop context
 * (`isMobile: false`, `hasTouch: false`), waiting the same way. The step
 * moves the mouse to (x, y) first (a `pointermove`) and holds Control as a key,
 * which Chromium's step does neither. WebKit's mobile emulation has no
 * wheel input, and Playwright has no pen for WebKit: both throw, naming the
 * reason, so a proof skips on the driver's flags instead.
 *
 * SYNC: Keep the engine limits above equal to the README's table and to the
 *   harness self-test (../src/harness.interaction.browser.spec.ts).
 */

import type {CDPSession, JSHandle, Page} from '@playwright/test';
import type {Engine} from './touch';

/** One wheel step: the page receives exactly `dx`, `dy` CSS px. */
export interface WheelInput {
  readonly x: number;
  readonly y: number;
  readonly dx?: number;
  readonly dy?: number;
  /** Hold Control during the step (a trackpad pinch arrives as a ctrl wheel). */
  readonly ctrl?: boolean;
}

/**
 * How long a trackpad scroll may pause before Core's gesture host ends it,
 * ms. It is per axis: vertical for a sheet's pull, horizontal for a pager's
 * or a row's swipe. A burst a component reads as one scroll passes its
 * axis's pause as `maxGapMs`. The harness cannot import Core: Core's
 * wheelEnd.harness.test.ts checks that the gesture host splits a scroll at
 * these gaps.
 */
export const WHEEL_SCROLL_END_MS = {vertical: 180, horizontal: 220} as const;

/** A run of wheel steps at one point: one continuous wheel gesture. */
export interface WheelBurst {
  readonly x: number;
  readonly y: number;
  /** Each step's deltas, in order: the page receives exactly these CSS px. */
  readonly steps: readonly {readonly dx?: number; readonly dy?: number}[];
  /** Ms between the steps' dispatch (default 16, a frame). */
  readonly everyMs?: number;
  /** Hold Control through the run. */
  readonly ctrl?: boolean;
  /**
   * The gap that ends the proof's component's gesture, ms: the page must
   * stamp each step less than this after the one before (see `wheelStamps`).
   * A gap this long or longer splits the run, as Core's gesture host ends a
   * trackpad scroll after `WHEEL_SCROLL_END_MS`. Then `wheelBurst` throws
   * `WheelPageStallError` when the page held the gap, and `WheelPacingError`
   * otherwise. The page holds it while it handles the step before, or while
   * it draws no frame. Without it, no gap is judged.
   */
  readonly maxGapMs?: number;
  /**
   * Judges the release the page reads from the steps' stamps, as Core's
   * gesture host follows a trackpad pan (see `wheelReleaseRead`). A read whose
   * carried travel crosses the proof's bar throws `WheelPacingError`.
   */
  readonly release?: WheelRelease;
}

/**
 * Where a burst's release is read, and the carried travel the proof's own bar
 * allows. Core's gesture host reads the fingers' speed at their last move,
 * `readStep`. It carries that speed until `liftStep`, which defaults to
 * `readStep`. `carryPx` bounds that carried travel, as the proof's bar does.
 * `stepwise` names later steps the host reads one by one, such as the glide
 * after the lift. `to` defaults to the burst's last step.
 */
export interface WheelRelease {
  readonly readStep: number;
  readonly liftStep?: number;
  readonly carryPx: {readonly min?: number; readonly max?: number};
  readonly stepwise?: {readonly from: number; readonly to?: number};
}

/**
 * A wheel stamped this close to the one before reads as merged in Core's
 * gesture host, ms. It joins the reading of the move before it. The harness
 * cannot import Core: Core's wheelEnd.harness.test.ts keeps the two equal.
 */
export const WHEEL_BUNCHED_MS = 1.5;

/**
 * A burst's release as the script throws it, on its schedule, and as the
 * page read it from its stamps (`wheelReleaseRead`). The speeds are what each
 * carries to the lift, in px/s. The page's is 0 when it read none. The carry
 * runs from the fingers' last move to the lift, in ms and px.
 */
export interface WheelReleaseRead {
  readonly readStep: number;
  readonly liftStep: number;
  readonly carryPx: WheelRelease['carryPx'];
  readonly scriptPxPerS: number;
  readonly pagePxPerS: number;
  readonly scriptCarryMs: number;
  readonly pageCarryMs: number;
  readonly scriptCarryPx: number;
  readonly pageCarryPx: number;
  readonly sendGapsMs: readonly number[];
  readonly stampGapsMs: readonly number[];
  /**
   * The first wheel that carried several sent steps between `readStep - 1`
   * and `liftStep`, as those sent steps. Null when none.
   */
  readonly merged: readonly [number, number] | null;
  /**
   * The first merged step beginning in `stepwise` that the host cannot read
   * as a merge: the sent steps it carries and its stamp gap, ms. Null when
   * none.
   */
  readonly stepwiseMerge: {
    readonly steps: readonly [number, number];
    readonly gapMs: number;
  } | null;
}

/**
 * The page received two of a wheel burst's steps `maxGapMs` or more apart.
 * Its wheel listeners did not hold the step back. The step reached the page
 * later than one frame after they finished the one before. Or the gap was no
 * wider than the harness's own spacing of the sends. The page can only widen
 * a gap, so a starved renderer that also held the step lands here. The
 * dispatch stalled before the page, so a loaded runner splits what the
 * driver sent as one gesture. Other work between steps that leaves the
 * page's frames running also lands here. Such a stall is the runner's or that
 * work's, never the wheel listeners'.
 */
export class WheelPacingError extends Error {
  constructor(
    readonly maxGapMs: number | null,
    readonly receivedGapsMs: readonly number[],
    readonly release: WheelReleaseRead | null = null,
  ) {
    super(
      release == null
        ? `webInputDriver: the page stamped the wheel burst with a gap of ${Math.max(...receivedGapsMs).toFixed(0)} ms, at or over its ${maxGapMs} ms (gaps ${receivedGapsMs.map(g => g.toFixed(0)).join(', ')} ms): the dispatch stalled before the page, so the page saw more than one gesture`
        : releaseMessage(release),
    );
    this.name = 'WheelPacingError';
  }
}

function releaseMessage(read: WheelReleaseRead): string {
  const gaps = (values: readonly number[]) =>
    values.map(g => g.toFixed(0)).join(', ');
  const {min, max} = read.carryPx;
  const bar = [
    min == null ? null : `at least ${min} px`,
    max == null ? null : `at most ${max} px`,
  ]
    .filter(Boolean)
    .join(' and ');
  const why = `steps ${read.readStep - 1} to ${read.liftStep} stamped ${gaps(read.stampGapsMs)} ms apart, sent ${gaps(read.sendGapsMs)} ms apart: the dispatch stalled before the page, so the page read another release`;
  if (read.merged != null) {
    return `webInputDriver: the page received sent steps ${read.merged[0]} to ${read.merged[1]} as one wheel, inside the steps the release reads, ${read.readStep - 1} to ${read.liftStep}. The gesture host reads such a merge with its own decay, not as the script throws the steps (${why})`;
  }
  if (read.stepwiseMerge != null) {
    const {steps, gapMs} = read.stepwiseMerge;
    return `webInputDriver: the page received sent steps ${steps[0]} to ${steps[1]} as one wheel, stamped ${gapMs.toFixed(0)} ms after the one before, past the gesture host's ${WHEEL_BUNCHED_MS} ms merge window. The host reads it as one big move where the proof needs each step on its own (${why})`;
  }
  return `webInputDriver: the page read a release of ${read.pagePxPerS.toFixed(0)} px/s where the script throws ${read.scriptPxPerS.toFixed(0)} px/s, and carried it ${read.pageCarryMs.toFixed(0)} ms to the lift where the script carries it ${read.scriptCarryMs.toFixed(0)} ms. That moves ${read.pageCarryPx.toFixed(1)} px where the script moves ${read.scriptCarryPx.toFixed(1)} px, past the proof's bar of ${bar} (${why})`;
}

/**
 * The page received two of a wheel burst's steps `maxGapMs` or more apart
 * while its main thread was held. Its own wheel listeners were
 * still handling the step before, or the page drew no frame across the gap.
 * WebKit dispatches the next step only once the thread is free. Both
 * times are page wall time. On a starved runner they include the page's wait
 * for a CPU, and a renderer held from outside draws no frame either. Judge a
 * page stall from a run with CI's CPU limits: there it is the proof's own
 * failure.
 */
export class WheelPageStallError extends Error {
  constructor(
    readonly maxGapMs: number | null,
    readonly stall: WheelPageStall,
    readonly release: WheelReleaseRead | null = null,
  ) {
    super(
      release != null
        ? releaseHoldMessage(release, stall)
        : stall.frameGapMs == null
          ? `webInputDriver: the page's own wheel listeners took ${stall.handlingMs.toFixed(0)} ms of page wall time to handle a step, so the next reached it ${stall.gapMs.toFixed(0)} ms later, at or over its ${maxGapMs} ms: the page split the run. On a starved runner that time includes the page's wait for a CPU: judge a page stall from a run with CI's CPU limits`
          : `webInputDriver: the page drew no frame for ${stall.frameGapMs.toFixed(0)} ms around a ${stall.gapMs.toFixed(0)} ms gap between two wheel steps, at or over its ${maxGapMs} ms (engine or page work), while its own wheel listeners took ${stall.handlingMs.toFixed(0)} ms: the page split the run. On a starved runner the renderer draws no frame either: judge a page stall from a run with CI's CPU limits`,
    );
    this.name = 'WheelPageStallError';
  }
}

function releaseHoldMessage(
  read: WheelReleaseRead,
  stall: WheelPageStall,
): string {
  const steps = `inside the steps the release reads, ${read.readStep - 1} to ${read.liftStep}`;
  const held =
    stall.frameGapMs == null
      ? `the page's own wheel listeners took ${stall.handlingMs.toFixed(0)} ms of page wall time ${steps}, and held the next step ${stall.gapMs.toFixed(0)} ms`
      : `the page drew no frame for ${stall.frameGapMs.toFixed(0)} ms ${steps}, holding a step ${stall.gapMs.toFixed(0)} ms, while its own wheel listeners took ${stall.handlingMs.toFixed(0)} ms`;
  return `webInputDriver: ${held}: the page, not the runner, changed the release the gesture host read. On a starved runner that time includes the page's wait for a CPU: judge a page stall from a run with CI's CPU limits`;
}

/**
 * A gap the page caused: how long it was, and how long the page spent
 * handling the step before it. `frameGapMs` is set when the page drew no
 * frame across the gap instead.
 */
export interface WheelPageStall {
  readonly gapMs: number;
  readonly handlingMs: number;
  readonly frameGapMs?: number;
}

/**
 * How soon after the page's input listeners finish one event the next must
 * reach the page for the page to have held it back: one frame, with a few ms
 * for the dispatch itself. The wheel and the touch paths both read it.
 */
export const HELD_BACK_MS = 20;

/**
 * Each received step's own `timeStamp`, ms on the page clock. Core's gesture
 * host reads these stamps, so they decide where it splits a scroll. A stamp
 * in epoch ms maps through the page's time origin, as the host maps it.
 * WebKit coalesces the steps it holds while the page's main thread is busy.
 * The coalesced step keeps the stamp of the step before it, and the host
 * reads it there too. So a hold shows in the gap after it.
 */
export function wheelStamps(
  stamps: readonly number[],
  timeOrigin: number,
): number[] {
  return stamps.map(stamp => (stamp > 1e12 ? stamp - timeOrigin : stamp));
}

/**
 * The sent steps each received step carries, `[first, last]`, or `null`
 * where its deltas reach no sent step. WebKit coalesces the steps it holds
 * into one that carries their summed deltas.
 */
function carriedSteps(
  steps: readonly {readonly dx?: number; readonly dy?: number}[],
  deltas: readonly (readonly [number, number])[],
): ([number, number] | null)[] {
  const close = (a: number, b: number) => Math.abs(a - b) < 0.01;
  // What the page has received after each sent step, if it received them all.
  const sentSums: [number, number][] = [];
  let sx = 0;
  let sy = 0;
  for (const {dx = 0, dy = 0} of steps) {
    sx += dx;
    sy += dy;
    sentSums.push([sx, sy]);
  }
  let rx = 0;
  let ry = 0;
  let from = 0;
  return deltas.map(([dx, dy]) => {
    rx += dx;
    ry += dy;
    for (let j = from; j < sentSums.length; j++) {
      if (close(sentSums[j][0], rx) && close(sentSums[j][1], ry)) {
        const carried: [number, number] = [from, j];
        from = j + 1;
        return carried;
      }
    }
    return null;
  });
}

/**
 * How far apart the harness sent the steps behind each received gap, ms
 * (`sendGapsMs[i - 1]` for the gap before received step `i`), or `null` where
 * the received steps cannot be matched to the sent ones. A received step is
 * matched to the sent steps its deltas reach: WebKit coalesces the steps it
 * holds into one that carries their summed deltas. The gap is spaced from the
 * last sent step the step before carried to the first sent step this one
 * carries, the send the page could have held: spacing it by the last carried
 * step would let a late first step lend the gap its delay.
 */
export function wheelSendGaps(
  steps: readonly {readonly dx?: number; readonly dy?: number}[],
  sentAt: readonly number[],
  deltas: readonly (readonly [number, number])[],
): (number | null)[] {
  const lastSent = carriedSteps(steps, deltas).map(
    carried => carried?.[1] ?? null,
  );
  return lastSent.slice(1).map((j, i) => {
    const before = lastSent[i];
    return j == null || before == null || j <= before
      ? null
      : sentAt[before + 1] - sentAt[before];
  });
}

/**
 * Sorts a burst's gaps of `maxGapMs` or more by cause. A gap that long
 * splits the run, as Core's gesture host ends a wheel gesture at a pause of
 * its end window or more. `stamps` are the received steps' own stamps on
 * the page clock (`wheelStamps`). `handledAt` is when the
 * page's wheel listeners had finished with each, NaN unseen. For a step whose
 * propagation the page stopped, it is when a task queued at its arrival ran.
 * `sendGapsMs` is how far apart the harness sent the steps behind each gap
 * (`wheelSendGaps`; `null` where unknown). `receivedAt` is when each step
 * reached the page. WebKit can stamp a step before the page receives it, so
 * the listeners' own time runs from the arrival. WebKit dispatches a step only
 * once the page's main thread is free. There a gap is the page's when the step
 * was stamped within one frame of the listeners finishing the step before.
 * Their own time inside the gap must also account for its excess over the
 * send spacing, within a frame. The step then waited on them. The gap must
 * also be more than a frame wider than the
 * harness's own spacing of those steps. The page can only widen a gap, so one
 * no wider than the send spacing is the dispatch's. That holds even when a
 * starved renderer also held the step, as a runner whose CPU quota holds the
 * page right after its listeners does. A WebKit gap is the page's too when
 * `frames`, the page's frame times, show none across nearly all of it. Then
 * engine or page work held the main thread, or a starved runner held the
 * renderer, not the page's wheel listeners.
 * A gap whose own send spacing already reaches `maxGapMs` is the dispatch's
 * whatever the page added: it was over the bound when the steps left.
 * Every other gap is the dispatch's. In Chromium, which stamps a step with
 * its dispatch time, the page cannot move its stamps, so every gap is. Other
 * work between steps that leaves frames running counts as the dispatch's,
 * unless it ran before a stopped step's marking task.
 */
export function wheelGapCauses(
  engine: Engine,
  stamps: readonly number[],
  handledAt: readonly number[],
  maxGapMs: number,
  sendGapsMs: readonly (number | null)[] = [],
  frames: readonly number[] = [],
  receivedAt: readonly number[] = stamps,
): {pageStalls: WheelPageStall[]; dispatchStalls: number[]} {
  const pageStalls: WheelPageStall[] = [];
  const dispatchStalls: number[] = [];
  for (let i = 1; i < stamps.length; i++) {
    const gapMs = stamps[i] - stamps[i - 1];
    if (gapMs < maxGapMs) {
      continue;
    }
    const sendGapMs = sendGapsMs[i - 1];
    if (sendGapMs != null && sendGapMs >= maxGapMs) {
      dispatchStalls.push(gapMs);
      continue;
    }
    const hold = pageHoldAt(
      engine,
      i,
      stamps,
      handledAt,
      sendGapMs,
      frames,
      receivedAt,
    );
    if (hold != null) {
      pageStalls.push(hold);
    } else {
      dispatchStalls.push(gapMs);
    }
  }
  return {pageStalls, dispatchStalls};
}

/**
 * Whether the page held the gap before received step `i`, whatever its
 * length. WebKit only, as `wheelGapCauses` judges it. The gap must be more
 * than a frame wider than its send spacing. Then either the page's listeners
 * held the step, or the page drew no frame across nearly all of the gap. The
 * page's cause must itself outlast a frame: listeners that ran longer than
 * one, or a stretch without frames longer than two. A frame of slack is the
 * dispatch's, so it never makes a short gap the page's.
 */
function pageHoldAt(
  engine: Engine,
  i: number,
  stamps: readonly number[],
  handledAt: readonly number[],
  sendGapMs: number | null | undefined,
  frames: readonly number[],
  receivedAt: readonly number[],
): WheelPageStall | null {
  const gapMs = stamps[i] - stamps[i - 1];
  const widened = sendGapMs == null || gapMs > sendGapMs + HELD_BACK_MS;
  if (engine !== 'webkit' || !widened) {
    return null;
  }
  const handlingMs = listenerTimeWithin(
    stamps[i - 1],
    stamps[i],
    receivedAt.slice(0, i),
    handledAt.slice(0, i),
  );
  if (
    Number.isFinite(handledAt[i - 1]) &&
    stamps[i] - handledAt[i - 1] <= HELD_BACK_MS &&
    handlingMs > HELD_BACK_MS &&
    handlingMs + HELD_BACK_MS >= gapMs - (sendGapMs ?? 0)
  ) {
    return {gapMs, handlingMs};
  }
  const frameGap = frameGapAcross(frames, stamps[i - 1], stamps[i]);
  if (
    frameGap != null &&
    frameGap.gapMs > 2 * HELD_BACK_MS &&
    frameGap.covered >= gapMs - HELD_BACK_MS
  ) {
    return {gapMs, handlingMs, frameGapMs: frameGap.gapMs};
  }
  return null;
}

/**
 * Whether the page held a step inside the steps a release reads, from
 * `readStep - 1` to `liftStep`. Each gap there gets the page-hold test that
 * splits a burst, whatever its length. A merged step there also gets it over
 * its own wait, from its stamp to its arrival. WebKit holds such steps while
 * the page's main thread is busy, then stamps them like the step before. The
 * first hold found, or null when the page held none. The page's cause must
 * outlast a frame here too, as in `pageHoldAt`.
 */
export function wheelReleaseHold(
  engine: Engine,
  read: Pick<WheelReleaseRead, 'readStep' | 'liftStep'>,
  steps: readonly {readonly dx?: number; readonly dy?: number}[],
  sentAt: readonly number[],
  stamps: readonly number[],
  got: {
    readonly receivedAt: readonly number[];
    readonly handledAt: readonly number[];
    readonly frames: readonly number[];
    readonly deltas: readonly (readonly [number, number])[];
  },
): WheelPageStall | null {
  if (engine !== 'webkit') {
    return null;
  }
  const carried = carriedSteps(steps, got.deltas);
  const sendGapsMs = wheelSendGaps(steps, sentAt, got.deltas);
  for (const [i, range] of carried.entries()) {
    if (
      i === 0 ||
      range == null ||
      range[1] < read.readStep - 1 ||
      range[0] > read.liftStep
    ) {
      continue;
    }
    const hold = pageHoldAt(
      engine,
      i,
      stamps,
      got.handledAt,
      sendGapsMs[i - 1],
      got.frames,
      got.receivedAt,
    );
    if (hold != null) {
      return hold;
    }
    const waitMs = got.receivedAt[i] - stamps[i];
    if (range[1] === range[0] || waitMs <= HELD_BACK_MS) {
      continue;
    }
    const handlingMs = listenerTimeWithin(
      stamps[i],
      got.receivedAt[i],
      got.receivedAt.slice(0, i),
      got.handledAt.slice(0, i),
    );
    if (handlingMs > HELD_BACK_MS && handlingMs + HELD_BACK_MS >= waitMs) {
      return {gapMs: waitMs, handlingMs};
    }
    const frameGap = frameGapAcross(got.frames, stamps[i], got.receivedAt[i]);
    if (
      frameGap != null &&
      frameGap.gapMs > 2 * HELD_BACK_MS &&
      frameGap.covered >= waitMs - HELD_BACK_MS
    ) {
      return {gapMs: waitMs, handlingMs, frameGapMs: frameGap.gapMs};
    }
  }
  return null;
}

/**
 * How long the page's wheel listeners ran inside `from` to `to`, ms: each
 * step's span from its arrival to its handling, merged where they overlap.
 * A step whose handling was never seen adds nothing.
 */
function listenerTimeWithin(
  from: number,
  to: number,
  receivedAt: readonly number[],
  handledAt: readonly number[],
): number {
  const spans = receivedAt
    .map((start, j): [number, number] => [
      Math.max(start, from),
      Math.min(handledAt[j], to),
    ])
    .filter(([start, end]) => Number.isFinite(end) && end > start)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let reached = from;
  for (const [start, end] of spans) {
    if (end > reached) {
      total += end - Math.max(start, reached);
      reached = end;
    }
  }
  return total;
}

/**
 * Reads a burst's release twice: as the script throws it, on its schedule,
 * and as Core's gesture host reads it from the steps' stamps. The host reads
 * the fingers' speed at each move: the travel since the move before, over
 * the time since. A step stamped within `WHEEL_BUNCHED_MS` of the one before
 * has no time of its own, so it joins that reading. A joined reading only
 * raises the speed, and never past the speed before it. After `readStep` the
 * host holds the shrinking steps and carries the speed on. A held step with
 * its own time ends the reading a later bunch could join. At `liftStep` the
 * pan has carried that speed from the last move. A merged wheel between
 * `readStep - 1` and `liftStep` is one the host reads its own way, so the
 * read names it. Null when the release lies outside the burst or the
 * received steps match no sent ones.
 */
export function wheelReleaseRead(
  steps: readonly {readonly dx?: number; readonly dy?: number}[],
  sentAt: readonly number[],
  stamps: readonly number[],
  deltas: readonly (readonly [number, number])[],
  {readStep, liftStep = readStep, carryPx, stepwise}: WheelRelease,
  everyMs = 16,
): WheelReleaseRead | null {
  if (readStep < 1 || liftStep < readStep || liftStep >= steps.length) {
    return null;
  }
  const {from = Infinity, to = steps.length - 1} = stepwise ?? {};
  // The stamp of the received step that carries each sent step.
  const stampOf: number[] = [];
  let merged: WheelReleaseRead['merged'] = null;
  let stepwiseMerge: WheelReleaseRead['stepwiseMerge'] = null;
  // The host's reading, in px and ms: its speed, the speed before it, and
  // the travel and time it was read over.
  let speed = 0;
  let prior = 0;
  let readFrom = 0;
  let readSpan = 0;
  let travel = 0;
  let held = 0;
  let base = 0;
  let lastMove: number | null = null;
  let carry: {ms: number; px: number; speed: number} | null = null;
  const carried = carriedSteps(steps, deltas);
  for (const [i, range] of carried.entries()) {
    if (range == null) {
      return null;
    }
    const [first, last] = range;
    const time = stamps[i];
    for (let j = first; j <= last; j++) {
      stampOf[j] = time;
    }
    const gapMs = i > 0 ? time - stamps[i - 1] : Infinity;
    const isBunched = gapMs <= WHEEL_BUNCHED_MS;
    if (
      merged == null &&
      last > first &&
      last >= readStep - 1 &&
      first <= liftStep
    ) {
      merged = range;
    }
    // A merge stamped past the host's merge window reads as one big move.
    if (
      stepwiseMerge == null &&
      last > first &&
      first >= from &&
      first <= to &&
      !isBunched
    ) {
      stepwiseMerge = {steps: range, gapMs};
    }
    if (carry != null) {
      continue;
    }
    const size = Math.hypot(deltas[i][0], deltas[i][1]);
    if (first <= readStep) {
      // A move of the fingers.
      const next = travel + size;
      if (lastMove != null && isBunched && readSpan > 0) {
        speed = joinedSpeed(speed, (next - readFrom) / readSpan, prior);
      } else if (lastMove != null && !isBunched && time > lastMove) {
        prior = speed;
        readFrom = travel;
        readSpan = time - lastMove;
        speed = (next - travel) / readSpan;
      }
      travel = next;
      lastMove = time;
      held = 0;
      base = 0;
      if (last >= liftStep) {
        carry = {ms: 0, px: 0, speed};
      }
      continue;
    }
    const since = time - (lastMove ?? time);
    if (last >= liftStep) {
      carry = {ms: since, px: base + speed * since, speed};
      continue;
    }
    // A held step.
    held += size;
    if (!isBunched) {
      readSpan = 0;
    } else if (readSpan > 0) {
      const before = speed;
      speed = joinedSpeed(speed, (travel + held - readFrom) / readSpan, prior);
      base += (before - speed) * since;
    }
  }
  const window = Array.from(
    {length: liftStep - readStep + 2},
    (_, k) => readStep - 1 + k,
  );
  // The script throws its steps a schedule apart. A starved send loop strays
  // from it too, which is the runner's.
  const {dx = 0, dy = 0} = steps[readStep];
  const scriptPxPerS = (Math.hypot(dx, dy) / everyMs) * 1000;
  const scriptCarryMs = (liftStep - readStep) * everyMs;
  return {
    readStep,
    liftStep,
    carryPx,
    scriptPxPerS,
    pagePxPerS: (carry?.speed ?? 0) * 1000,
    scriptCarryMs,
    pageCarryMs: carry?.ms ?? 0,
    scriptCarryPx: (scriptPxPerS * scriptCarryMs) / 1000,
    pageCarryPx: carry?.px ?? 0,
    sendGapsMs: window.slice(1).map(j => sentAt[j] - sentAt[j - 1]),
    stampGapsMs: window.slice(1).map(j => stampOf[j] - stampOf[j - 1]),
    merged,
    stepwiseMerge,
  };
}

/**
 * Core's joined reading, held to the speed before the late move. It only
 * ever raises the current speed.
 */
function joinedSpeed(current: number, reading: number, prior: number): number {
  return Math.max(current, Math.min(reading, prior));
}

/**
 * Whether a release read lands on the other side of the proof's bar than the
 * script's, as a touch play's boundaries do. A merge the read names strays
 * too. A script outside its own bar is the proof's mistake, not the
 * dispatch's, so it never strays.
 */
export function wheelReleaseStrays(read: WheelReleaseRead): boolean {
  const {min = -Infinity, max = Infinity} = read.carryPx;
  const inside = (px: number) => px >= min && px <= max;
  if (!inside(read.scriptCarryPx)) {
    return false;
  }
  return (
    read.merged != null ||
    read.stepwiseMerge != null ||
    !inside(read.pageCarryPx)
  );
}

/**
 * The page's longest stretch without a frame inside `from` to `to`. It gives
 * how much of that span the stretch covers, and the whole gap between its two
 * frames. Null with fewer than two frames.
 */
function frameGapAcross(
  frames: readonly number[],
  from: number,
  to: number,
): {covered: number; gapMs: number} | null {
  let best: {covered: number; gapMs: number} | null = null;
  for (let k = 1; k < frames.length; k++) {
    const covered = Math.min(frames[k], to) - Math.max(frames[k - 1], from);
    if (covered > 0 && (best == null || covered > best.covered)) {
      best = {covered, gapMs: frames[k] - frames[k - 1]};
    }
  }
  return best;
}

/** A point of a pen stroke. */
export interface PenPoint {
  readonly x: number;
  readonly y: number;
  /** Ms after the stroke's first point. */
  readonly t: number;
  /** 0–1 (default 0.5) while the pen touches. */
  readonly pressure?: number;
  /** Degrees, -90–90 (default 0). */
  readonly tiltX?: number;
  readonly tiltY?: number;
}

export interface WebInputDriver {
  readonly engine: Engine;
  /** Whether `wheel` works in this page (WebKit's mobile emulation has none). */
  readonly wheels: boolean;
  /** Whether `pen` works in this page (Chromium only). */
  readonly pens: boolean;
  wheel(input: WheelInput): Promise<void>;
  /**
   * Sends a run of steps at one point on its schedule, without waiting for
   * each step's round trip as `wheel` does, and resolves once the page has
   * received the run's whole delta. Awaited steps land as far apart as a
   * round trip takes on a loaded runner (49 to 141 ms in WebKit), past the
   * 100 ms a proof may allow between the steps of one gesture. Where the page still
   * handles one step when the next arrives, the engine coalesces them, as it
   * does a trackpad's: the page can receive fewer, larger steps with the same
   * total. Returns how many steps the page received and the gaps between
   * their stamps (`wheelStamps`), ms. With `maxGapMs`, a gap that long or
   * longer throws `WheelPageStallError` when the page held it, and
   * `WheelPacingError` otherwise. The page holds a gap while it handles the
   * step before, or while it draws no frame. With `release`, a release the
   * page read across the proof's bar throws `WheelPacingError` too.
   */
  wheelBurst(burst: WheelBurst): Promise<{
    readonly receivedSteps: number;
    readonly receivedGapsMs: readonly number[];
  }>;
  /** Presses at the first point, moves through all of them, releases at the last; paced on the wall clock. */
  pen(points: readonly PenPoint[]): Promise<void>;
}

/** Why a proof skips when the driver has no wheel in this page. */
export const WHEEL_SKIP =
  "WebKit's mobile emulation has no wheel input: run wheel proofs in a desktop context";
/** Why a proof skips when the driver has no pen. */
export const PEN_SKIP =
  'Playwright has no pen input for WebKit: pen proofs run in Chromium';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** How long `wheel` waits for the page to receive its step. */
const WHEEL_DELIVERY_MS = 2000;

/**
 * Arms a one-shot passive capture listener for the page's next wheel step,
 * before the step is dispatched. Passive, so the page's own listeners keep
 * deciding whether the engine waits for it. (The promise sits in an object:
 * a handle to a bare promise would wait for it to settle.)
 */
function armWheel(page: Page): Promise<JSHandle<{received: Promise<void>}>> {
  return page.evaluateHandle(() => ({
    received: new Promise<void>(resolve => {
      window.addEventListener('wheel', () => resolve(), {
        capture: true,
        once: true,
        passive: true,
      });
    }),
  }));
}

/** Waits until the armed listener has seen the step; throws past the limit. */
async function untilReceived(
  page: Page,
  armed: JSHandle<{received: Promise<void>}>,
): Promise<void> {
  const received = await page.evaluate(
    ([box, ms]) => {
      // The harness's own wait runs on the real timer: a frozen timer gate
      // (story.ts) holds only the page's.
      const later =
        (
          window as unknown as {
            __harnessTimerGate?: {timeout?: typeof setTimeout};
          }
        ).__harnessTimerGate?.timeout ?? window.setTimeout.bind(window);
      return Promise.race([
        box.received.then(() => true),
        new Promise<boolean>(resolve => later(() => resolve(false), ms)),
      ]);
    },
    [armed, WHEEL_DELIVERY_MS] as const,
  );
  await armed.dispose();
  if (!received) {
    throw new Error(
      `webInputDriver: the page did not receive the wheel step within ${WHEEL_DELIVERY_MS} ms (is the point inside the viewport, over the main document?)`,
    );
  }
}

/** What the page saw of each input event of one run (`armInputRun`). */
export interface InputRun {
  /** The event types the run records. */
  types: string[];
  /** Each event's own `timeStamp`. */
  stamps: number[];
  /** When the page's first listener received each event. */
  receivedAt: number[];
  /** When the page drew each frame during the run, with `frames` asked. */
  frames: number[];
  /**
   * True while every event of the run carries the mark `installInputStart`
   * added before the page's scripts. Then `receivedAt` comes before every
   * page listener.
   */
  startsFirst: boolean;
  /**
   * When the page's own listeners had finished with each event, NaN until
   * seen. An event whose propagation the page stops is marked by a task
   * queued when it arrived, and never later than the next event's arrival.
   * So page work queued before that task, such as a timer, counts as its
   * handling.
   */
  handledAt: number[];
  /** Each event's type. */
  eventTypes: string[];
  /** Each event's pointer type, or '' for an event that has none. */
  pointerTypes: string[];
  /** Each wheel step's deltas, CSS px: a coalesced step carries the sum. */
  deltas: [number, number][];
  dx: number;
  dy: number;
  /** Removes the listeners and settles every handling mark. */
  stop: () => void;
}

/**
 * Marks when the page's listeners begin on each trusted event of `types`,
 * with a passive window capture listener. Added before the page's scripts, it
 * runs before every page listener, a window capture one included, and
 * `armInputRun` uses its mark. A page already loaded gets it too. There it
 * runs after the window capture listeners the page added at load, such as a
 * gesture host's, so its mark is not used.
 */
export async function installInputStart(
  page: Page,
  types: readonly string[],
): Promise<void> {
  await installInputStartBeforeLoad(page, types);
  await page.evaluate(inputStartScript(types, false));
}

/**
 * Adds the `installInputStart` mark to each page the tab loads next, before
 * the page's scripts. The page loaded now gets no mark. A driver created after
 * the next load then uses the mark.
 */
export async function installInputStartBeforeLoad(
  page: Page,
  types: readonly string[],
): Promise<void> {
  await page.addInitScript(inputStartScript(types, true));
}

function inputStartScript(types: readonly string[], first: boolean): string {
  return `(() => {
  if (window.__harnessInputStart) return;
  const starts = new WeakMap();
  window.__harnessInputStart = {starts, first: ${first}};
  for (const type of ${JSON.stringify([...types])}) {
    window.addEventListener(type, event => {
      if (event.isTrusted && !starts.has(event)) starts.set(event, performance.now());
    }, {capture: true, passive: true});
  }
})()`;
}

/**
 * Arms two passive listeners on the window before a run is dispatched. A
 * capture listener stamps each trusted event of `types` before the page's
 * own listeners. A bubble listener, after them, notes when the page has
 * finished with the event. The wheel and touch drivers share it. Where
 * `installInputStart` marked, before the page's scripts, when the page's
 * listeners began on an event, that mark is the event's `receivedAt`.
 */
export function armInputRun(
  page: Page,
  types: readonly string[],
  {frames = false}: {readonly frames?: boolean} = {},
): Promise<JSHandle<InputRun>> {
  return page.evaluateHandle(
    ([eventTypes, recordFrames]) => {
      const first = {capture: true, passive: true};
      const last = {capture: false, passive: true};
      const index = new WeakMap<Event, number>();
      // A message runs as a task of its own, after the dispatch that queued
      // it: it marks an event whose bubble listener never ran.
      const channel = new MessageChannel();
      const mark = (
        window as unknown as {
          __harnessInputStart?: {
            starts: WeakMap<Event, number>;
            first: boolean;
          };
        }
      ).__harnessInputStart;
      let drawing = recordFrames;
      const run = {
        types: [...eventTypes],
        stamps: [] as number[],
        receivedAt: [] as number[],
        startsFirst: mark?.first === true,
        frames: [] as number[],
        handledAt: [] as number[],
        eventTypes: [] as string[],
        pointerTypes: [] as string[],
        deltas: [] as [number, number][],
        dx: 0,
        dy: 0,
        stop: () => {
          drawing = false;
          for (const type of eventTypes) {
            window.removeEventListener(type, received, first);
            window.removeEventListener(type, handled, last);
          }
          channel.port1.onmessage = null;
          channel.port1.close();
          for (let i = 0; i + 1 < run.handledAt.length; i++) {
            run.handledAt[i] = Math.min(
              run.handledAt[i],
              run.receivedAt[i + 1],
            );
          }
        },
      };
      channel.port1.onmessage = (message: MessageEvent<number>) => {
        if (Number.isNaN(run.handledAt[message.data])) {
          run.handledAt[message.data] = performance.now();
        }
      };
      const received = (event: Event) => {
        if (!event.isTrusted) {
          return;
        }
        const i = run.stamps.length;
        index.set(event, i);
        run.stamps.push(event.timeStamp);
        const markedAt = run.startsFirst ? mark?.starts.get(event) : undefined;
        // A page that reopens its document drops the mark's listener but
        // keeps the mark. Its events go unmarked, and the run reads as before.
        if (markedAt == null) {
          run.startsFirst = false;
        }
        run.receivedAt.push(markedAt ?? performance.now());
        run.handledAt.push(Number.NaN);
        run.eventTypes.push(event.type);
        run.pointerTypes.push(
          'pointerType' in event ? String(event.pointerType) : '',
        );
        const wheel = event.type === 'wheel' ? (event as WheelEvent) : null;
        run.deltas.push([wheel?.deltaX ?? 0, wheel?.deltaY ?? 0]);
        run.dx += wheel?.deltaX ?? 0;
        run.dy += wheel?.deltaY ?? 0;
        channel.port2.postMessage(i);
      };
      const handled = (event: Event) => {
        const i = index.get(event);
        if (i != null) {
          run.handledAt[i] = performance.now();
        }
      };
      for (const type of eventTypes) {
        window.addEventListener(type, received, first);
        window.addEventListener(type, handled, last);
      }
      // The page's own frames, on the real frame loop: a frozen timer gate
      // (story.ts) holds only the page's.
      const frame =
        (
          window as unknown as {
            __harnessTimerGate?: {frame?: typeof requestAnimationFrame};
          }
        ).__harnessTimerGate?.frame ??
        window.requestAnimationFrame.bind(window);
      const draw = () => {
        if (drawing) {
          run.frames.push(performance.now());
          frame(draw);
        }
      };
      if (recordFrames) {
        frame(draw);
      }
      return run;
    },
    [[...types], frames] as const,
  );
}

/**
 * Waits until the armed listener has summed the run's whole delta and returns
 * what it received; throws past the limit, naming how much arrived.
 */
async function untilRunReceived(
  page: Page,
  engine: Engine,
  armed: JSHandle<InputRun>,
  {
    steps,
    maxGapMs,
    release,
    everyMs,
  }: Pick<WheelBurst, 'steps' | 'maxGapMs' | 'release' | 'everyMs'>,
  sentAt: readonly number[],
): Promise<{receivedSteps: number; receivedGapsMs: number[]}> {
  const want = steps.reduce<{dx: number; dy: number}>(
    (sum, {dx = 0, dy = 0}) => ({dx: sum.dx + dx, dy: sum.dy + dy}),
    {dx: 0, dy: 0},
  );
  const got = await page.evaluate(
    ([run, total, ms]) =>
      new Promise<{
        stamps: number[];
        timeOrigin: number;
        receivedAt: number[];
        frames: number[];
        handledAt: number[];
        deltas: [number, number][];
        dx: number;
        dy: number;
      }>(resolve => {
        // The harness's own wait runs on the real timer: a frozen timer gate
        // (story.ts) holds only the page's.
        const gate = (
          window as unknown as {
            __harnessTimerGate?: {
              now?: () => number;
              timeout?: typeof setTimeout;
            };
          }
        ).__harnessTimerGate;
        const later = gate?.timeout ?? window.setTimeout.bind(window);
        // The deadline reads the real clock, which a page freeze does not stop.
        const realNow = gate?.now ?? (() => performance.now());
        const deadline = realNow() + ms;
        const whole = () =>
          Math.abs(run.dx - total.dx) < 0.01 &&
          Math.abs(run.dy - total.dy) < 0.01;
        const check = () => {
          if (whole() || realNow() > deadline) {
            run.stop();
            resolve({
              stamps: run.stamps.slice(),
              timeOrigin: performance.timeOrigin,
              receivedAt: run.receivedAt.slice(),
              frames: run.frames.slice(),
              handledAt: run.handledAt.slice(),
              deltas: run.deltas.slice(),
              dx: run.dx,
              dy: run.dy,
            });
          } else {
            later(check, 10);
          }
        };
        check();
      }),
    [armed, want, WHEEL_DELIVERY_MS] as const,
  );
  await armed.dispose();
  if (
    Math.abs(got.dx - want.dx) >= 0.01 ||
    Math.abs(got.dy - want.dy) >= 0.01
  ) {
    throw new Error(
      `webInputDriver: the page received ${got.dx}, ${got.dy} px of the run's ${want.dx}, ${want.dy} px within ${WHEEL_DELIVERY_MS} ms (is the point inside the viewport, over the main document?)`,
    );
  }
  const stamps = wheelStamps(got.stamps, got.timeOrigin);
  const receivedGapsMs = stamps.slice(1).map((t, i) => t - stamps[i]);
  if (maxGapMs != null) {
    const {pageStalls, dispatchStalls} = wheelGapCauses(
      engine,
      stamps,
      got.handledAt,
      maxGapMs,
      wheelSendGaps(steps, sentAt, got.deltas),
      got.frames,
      got.receivedAt,
    );
    if (pageStalls.length > 0) {
      throw new WheelPageStallError(maxGapMs, pageStalls[0]);
    }
    if (dispatchStalls.length > 0) {
      throw new WheelPacingError(maxGapMs, receivedGapsMs);
    }
  }
  if (release != null) {
    const read = wheelReleaseRead(
      steps,
      sentAt,
      stamps,
      got.deltas,
      release,
      everyMs,
    );
    if (read != null && wheelReleaseStrays(read)) {
      const hold = wheelReleaseHold(engine, read, steps, sentAt, stamps, got);
      if (hold != null) {
        throw new WheelPageStallError(maxGapMs ?? null, hold, read);
      }
      throw new WheelPacingError(maxGapMs ?? null, receivedGapsMs, read);
    }
  }
  return {receivedSteps: got.stamps.length, receivedGapsMs};
}

/**
 * Sends each step at its scheduled time without awaiting the one before, then
 * waits until every dispatch is answered. Resolves with when each step left
 * (`Date.now()`, ms).
 */
async function dispatchOnSchedule<T>(
  steps: readonly T[],
  everyMs: number,
  send: (step: T) => Promise<unknown>,
): Promise<number[]> {
  const start = Date.now();
  const sent: Promise<unknown>[] = [];
  const sentAt: number[] = [];
  for (const [i, step] of steps.entries()) {
    const wait = start + i * everyMs - Date.now();
    if (wait > 0) {
      await sleep(wait);
    }
    sentAt.push(Date.now());
    sent.push(send(step));
  }
  await Promise.all(sent);
  return sentAt;
}

async function chromiumWebInput(page: Page): Promise<WebInputDriver> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  return {
    engine: 'chromium',
    wheels: true,
    pens: true,
    async wheel({x, y, dx = 0, dy = 0, ctrl = false}) {
      const scale = await page.evaluate(
        () => window.devicePixelRatio * (window.visualViewport?.scale ?? 1),
      );
      const armed = await armWheel(page);
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x,
        y,
        deltaX: dx * scale,
        deltaY: dy * scale,
        modifiers: ctrl ? 2 : 0,
      });
      await untilReceived(page, armed);
    },
    async wheelBurst({
      x,
      y,
      steps,
      everyMs = 16,
      ctrl = false,
      maxGapMs,
      release,
    }) {
      const scale = await page.evaluate(
        () => window.devicePixelRatio * (window.visualViewport?.scale ?? 1),
      );
      const armed = await armInputRun(page, ['wheel']);
      const sentAt = await dispatchOnSchedule(
        steps,
        everyMs,
        ({dx = 0, dy = 0}) =>
          cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            x,
            y,
            deltaX: dx * scale,
            deltaY: dy * scale,
            modifiers: ctrl ? 2 : 0,
          }),
      );
      return untilRunReceived(
        page,
        'chromium',
        armed,
        {steps, maxGapMs, release, everyMs},
        sentAt,
      );
    },
    async pen(points) {
      if (points.length === 0) {
        return;
      }
      // Two presented frames first: the press reaches the compositor with no
      // page round trip, and right after a navigation it could still carry
      // the previous document's page scale. The harness's own frames, not a
      // frozen timer gate's (story.ts).
      await page.evaluate(
        () =>
          new Promise<void>(resolve => {
            const gate = (
              window as unknown as {
                __harnessTimerGate?: {frame?: typeof requestAnimationFrame};
              }
            ).__harnessTimerGate;
            const frame =
              gate?.frame ?? window.requestAnimationFrame.bind(window);
            frame(() => frame(() => resolve()));
          }),
      );
      const startWall = Date.now();
      const startStamp = Date.now() / 1000;
      const events = [
        {type: 'mousePressed' as const, point: points[0]},
        ...points.slice(1).map(point => ({type: 'mouseMoved' as const, point})),
        {type: 'mouseReleased' as const, point: points[points.length - 1]},
      ];
      for (const {type, point} of events) {
        const wait = startWall + point.t - Date.now();
        if (wait > 0) {
          await sleep(wait);
        }
        await cdp.send('Input.dispatchMouseEvent', {
          type,
          x: point.x,
          y: point.y,
          button: 'left',
          buttons: type === 'mouseReleased' ? 0 : 1,
          clickCount: type === 'mouseMoved' ? 0 : 1,
          pointerType: 'pen',
          force: type === 'mouseReleased' ? 0 : (point.pressure ?? 0.5),
          tiltX: point.tiltX ?? 0,
          tiltY: point.tiltY ?? 0,
          timestamp: startStamp + point.t / 1000,
        });
      }
    },
  };
}

async function webkitWebInput(page: Page): Promise<WebInputDriver> {
  // Playwright refuses a wheel in a WebKit context that emulates a phone: read
  // the option it reads, the context's `isMobile`.
  const mobile =
    (page.context() as unknown as {_options?: {isMobile?: boolean}})._options
      ?.isMobile === true;
  return {
    engine: 'webkit',
    wheels: !mobile,
    pens: false,
    async wheel({x, y, dx = 0, dy = 0, ctrl = false}) {
      if (mobile) {
        throw new Error(`webInputDriver: ${WHEEL_SKIP}`);
      }
      await page.mouse.move(x, y);
      if (ctrl) {
        await page.keyboard.down('Control');
      }
      try {
        const armed = await armWheel(page);
        await page.mouse.wheel(dx, dy);
        await untilReceived(page, armed);
      } finally {
        if (ctrl) {
          await page.keyboard.up('Control');
        }
      }
    },
    async wheelBurst({
      x,
      y,
      steps,
      everyMs = 16,
      ctrl = false,
      maxGapMs,
      release,
    }) {
      if (mobile) {
        throw new Error(`webInputDriver: ${WHEEL_SKIP}`);
      }
      await page.mouse.move(x, y);
      if (ctrl) {
        await page.keyboard.down('Control');
      }
      try {
        const armed = await armInputRun(page, ['wheel'], {frames: true});
        const sentAt = await dispatchOnSchedule(
          steps,
          everyMs,
          ({dx = 0, dy = 0}) => page.mouse.wheel(dx, dy),
        );
        return await untilRunReceived(
          page,
          'webkit',
          armed,
          {steps, maxGapMs, release, everyMs},
          sentAt,
        );
      } finally {
        if (ctrl) {
          await page.keyboard.up('Control');
        }
      }
    },
    async pen() {
      throw new Error(`webInputDriver: ${PEN_SKIP}`);
    },
  };
}

/** Wheel and pen input for the page's engine. Firefox is not supported (no project). */
export async function webInputDriver(page: Page): Promise<WebInputDriver> {
  const name = page.context().browser()?.browserType().name();
  if (name === 'chromium') {
    return chromiumWebInput(page);
  }
  if (name === 'webkit') {
    return webkitWebInput(page);
  }
  throw new Error(
    `webInputDriver: no wheel or pen input path for ${name ?? 'this browser'}`,
  );
}
