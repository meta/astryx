// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file busy.ts
 * @input Uses a Playwright `Page`
 * @output `blockMainThread`, a synchronous busy loop on the page's main
 *   thread that reports exactly when it ran. `startBusyControl`, a plain
 *   compositor-only control animation recorded in the same window.
 *   `busyWindowProof`, which reads frame evidence for that window, against
 *   the control when it has one. `castStep`, the screencast's position step
 *   read from its frames. `pooledBusyProof`, which judges several short
 *   blocks as one. `BusyWindowTooLateError`, for a block that began too late
 *   for the motion it was meant to catch. `BusyFrameUnjudgedError`, for a
 *   frame the cast could not judge in a proof that judges every frame
 *   (`judgeEveryFrame`).
 *   `BUSY_PROOF_LOOKAROUND_MS` is how far around its judged part a proof
 *   reads frames.
 *   `trackControl` and `controlClock` read the control's box and its own
 *   clock from the screencast, a second control's too (`ahead`).
 * @position The busy-main-thread proof: an animation that runs on the
 *   compositor keeps advancing at display rate while JavaScript holds the main
 *   thread; one driven from the main thread (rAF, style writes, layout
 *   properties) freezes for the whole block. Pair it with ./frames
 *   (`startScreencast` + `trackMarker`), which observes off the main thread.
 *
 * SYNC: Keep the README's busy-main-thread section equal to this contract.
 */

import type {Locator, Page} from '@playwright/test';
import {defineAnimatedProperties} from './animated-properties';
import {defineCurveEnd} from './curve-end';
import {
  FRAME_STARVATION_MS,
  FrameStarvationError,
  frameStats,
  trackMarker,
  type CastFrame,
  type FrameShortfall,
  type FrameStats,
  type TrackedFrame,
} from './frames';

/** The control's colour, apart from the component's marker (`MARKER_RGB`). */
export const CONTROL_RGB: readonly [number, number, number] = [0, 255, 255];

/**
 * The control box's side, CSS px: it crosses the page's top `CONTROL_SIDE` px,
 * where a proof reads nothing of the component.
 */
export const CONTROL_SIDE = 12;
/** How far the control travels along the top edge, CSS px. */
const CONTROL_TRAVEL = 240;
/** How long the control takes to travel `CONTROL_TRAVEL` one way, ms. */
const CONTROL_LEG_MS = 400;
/**
 * The colour of the control ahead (`startBusyControl`'s `ahead`), apart from
 * the first control's and the component's marker.
 */
export const AHEAD_CONTROL_RGB: readonly [number, number, number] = [
  128, 0, 255,
];
/** Where the strip of the control ahead starts, CSS px: below the first's. */
const AHEAD_TOP = CONTROL_SIDE + 4;
/** How far the control ahead runs ahead of the first, ms: half a leg. */
const AHEAD_MS = CONTROL_LEG_MS / 2;

/**
 * The control in each frame (`startBusyControl`'s box): `trackMarker` with
 * `CONTROL_RGB`, searching only the strip the box crosses. With `ahead`, the
 * control ahead, with `AHEAD_CONTROL_RGB` in its own strip.
 */
export async function trackControl(
  page: Page,
  frames: readonly CastFrame[],
  {ahead = false}: {ahead?: boolean} = {},
): Promise<TrackedFrame[]> {
  return trackMarker(page, frames, {
    rgb: ahead ? AHEAD_CONTROL_RGB : CONTROL_RGB,
    region: {
      x: 0,
      y: ahead ? AHEAD_TOP - 2 : 0,
      width: CONTROL_SIDE + CONTROL_TRAVEL + 4,
      height: CONTROL_SIDE + 4,
    },
  });
}

/**
 * Starts a plain compositor-only control animation: a `CONTROL_RGB` box in the
 * page's top-left corner whose transform moves it back and forth along the top
 * edge (`CONTROL_TRAVEL` px every 400 ms, linear) for as long as the page
 * runs. It shows what the compositor presented in a busy window on this
 * machine, so a proof can judge a component against it rather than against a
 * frame rate: track it from the same screencast (`trackMarker(page, frames,
 * {rgb: CONTROL_RGB})`) and pass it to `busyWindowProof` as `control`.
 *
 * The box is a manual popover, so it shows in the top layer, above a modal
 * dialog the page opened before it; `raise()` shows it again on top of one
 * opened after. With `within`, it is mounted inside that element instead (an
 * open modal dialog), as a plain fixed box with no top-layer entry, for a
 * proof of the dialog's `::backdrop`: in WebKit, with the popover above
 * BottomSheet's open modal dialog, the sheet's dim held for 155 to 225 ms
 * into a block while the control moved. `waitForAnimation` and
 * `blockMainThread`'s `during` never count the control's own animation, so
 * they still wait for the dialog's. Start it before the block: it
 * resolves once the animation is running and past its first frame (on the
 * compositor; see `blockMainThread`). Keep the component's marker out of the
 * strip it crosses (the top `CONTROL_SIDE` px, `CONTROL_SIDE +
 * CONTROL_TRAVEL` px wide).
 *
 * It resolves with `start`, the animation's start on the page clock (epoch
 * ms). The control's own time at a frame, past this start, is that frame's
 * time on the page clock (`controlClock`).
 *
 * With `ahead`, it starts a second control after the first: the same box in
 * `AHEAD_CONTROL_RGB`, in the strip below, half a leg (200 ms) ahead.
 * `controlClock` reads no frame within `CONTROL_EDGE` px of a turn. Wherever
 * the first control is there, the one ahead is mid-leg, so the two read
 * every frame. Track it with `trackControl(page, frames, {ahead: true})`, and
 * keep the marker out of its strip too (the top `2 * CONTROL_SIDE + 4` px).
 *
 * A WebKit busy proof dates its frames on the controls' clock. Without the
 * control ahead, a frame stamped late near the first control's turn keeps its
 * lateness. A proof that judges every frame near a turn starts the one ahead
 * too, and passes its frames to `busyWindowProof` as `ahead`.
 */
export async function startBusyControl(
  page: Page,
  {
    ahead = false,
    rgb = ahead ? AHEAD_CONTROL_RGB : CONTROL_RGB,
    within,
  }: {
    ahead?: boolean;
    rgb?: readonly [number, number, number];
    within?: Locator;
  } = {},
): Promise<{
  /** The control's start on the page clock, epoch ms. */
  readonly start: number;
  readonly raise: () => Promise<void>;
  readonly remove: () => Promise<void>;
}> {
  if (within != null) {
    await within.evaluate(host =>
      host.setAttribute('data-harness-control-host', ''),
    );
  }
  const start = await page.evaluate(
    ({color, side, travel, legMs, top, aheadMs}) =>
      new Promise<number>((resolve, reject) => {
        const host = document.querySelector('[data-harness-control-host]');
        host?.removeAttribute('data-harness-control-host');
        const box = document.createElement('div');
        box.setAttribute('data-harness-control', aheadMs > 0 ? 'ahead' : '');
        box.style.cssText = `position:fixed;inset:auto;left:0;top:${top}px;margin:0;padding:0;border:0;overflow:visible;width:${side}px;height:${side}px;background:rgb(${color.join(',')});z-index:2147483647;pointer-events:none;`;
        if (host == null) {
          box.setAttribute('popover', 'manual');
          document.body.appendChild(box);
          box.showPopover();
        } else {
          host.appendChild(box);
        }
        const animation = box.animate(
          [
            {transform: 'translateX(0px)'},
            {transform: `translateX(${travel}px)`},
          ],
          {
            duration: legMs,
            iterations: Infinity,
            direction: 'alternate',
            easing: 'linear',
          },
        );
        // The harness's own waits run on the real timers (see blockMainThread).
        const gate = (
          window as unknown as {
            __harnessTimerGate?: {
              frame?: typeof requestAnimationFrame;
              now?: () => number;
            };
          }
        ).__harnessTimerGate;
        // A frozen page holds the control's own animation.
        if (
          (window as unknown as {__harnessFreeze?: {frozen: boolean}})
            .__harnessFreeze?.frozen === true
        ) {
          reject(
            new Error(
              'startBusyControl: the page is frozen; start the control first',
            ),
          );
          return;
        }
        if (aheadMs > 0) {
          // Half a leg ahead of the first control, on the same timeline.
          const first = [
            ...document.querySelectorAll('[data-harness-control=""]'),
          ]
            .map(el => el.getAnimations()[0])
            .find(running => running?.startTime != null);
          if (first == null) {
            box.remove();
            reject(
              new Error(
                'startBusyControl: start the first control before the one ahead',
              ),
            );
            return;
          }
          animation.startTime = Number(first.startTime) - aheadMs;
        }
        const frame = gate?.frame ?? window.requestAnimationFrame.bind(window);
        const realNow = gate?.now ?? (() => performance.now());
        const deadline = realNow() + 5_000;
        // The one ahead starts running at once: give it a frame on the
        // compositor too.
        let ticks = 0;
        const tick = () => {
          ticks += 1;
          if (
            !animation.pending &&
            Number(animation.currentTime ?? 0) >= 16 &&
            (aheadMs === 0 || ticks >= 2)
          ) {
            resolve(performance.timeOrigin + Number(animation.startTime));
          } else if (realNow() > deadline) {
            reject(new Error('startBusyControl: the control did not start'));
          } else {
            frame(tick);
          }
        };
        frame(tick);
      }),
    {
      color: [...rgb],
      side: CONTROL_SIDE,
      travel: CONTROL_TRAVEL,
      legMs: CONTROL_LEG_MS,
      top: ahead ? AHEAD_TOP : 0,
      aheadMs: ahead ? AHEAD_MS : 0,
    },
  );
  return {
    start,
    raise: () =>
      page.evaluate(() => {
        for (const box of document.querySelectorAll<HTMLElement>(
          '[data-harness-control][popover]',
        )) {
          box.hidePopover();
          box.showPopover();
        }
      }),
    remove: () =>
      page.evaluate(() => {
        for (const box of document.querySelectorAll('[data-harness-control]')) {
          box.remove();
        }
      }),
  };
}

/** How far a frame's stamp may run late and still agree with the others, ms. */
const CONTROL_AGREE_MS = 20;
/**
 * Frames this near a turn get no reading. There the two times that a position
 * gives are under 120 ms apart, and a stamp 60 ms late could pick either.
 */
const CONTROL_EDGE = 36;
/**
 * The least time between two dated frames, ms, far under a frame interval.
 * The proof matches frames by time, so no two may share one.
 */
const DATED_GAP_MS = 0.01;
/** One display interval, ms: the compositor presents at most once in one. */
const DISPLAY_FRAME_MS = 1000 / 60;
/** How close the controls' clock reads a time, ms: one px of travel. */
const CONTROL_READ_MS = CONTROL_LEG_MS / CONTROL_TRAVEL;

/**
 * The compositor's clock in each frame of `control` (`startBusyControl`'s box,
 * tracked with `trackControl`), ms. The compositor samples every animation at
 * one time in a frame. So a component can be judged against this clock, not
 * the screencast's stamps. A loaded machine can stamp a frame late, and
 * `inPresentationOrder` then puts it after frames that it came before.
 *
 * The box's position gives two times a cycle, on the way out and on the way
 * back. The cycle's origin is the one that the most frames agree with, each
 * within `CONTROL_AGREE_MS` of one of its two times. So no single frame sets
 * it. Each frame's stamp, measured from that origin, then picks its own time.
 * A late or reordered frame moves only its own reading, and a gap moves none.
 *
 * A frame without the box gets no reading, and so does a frame within
 * `CONTROL_EDGE` px of a turn. There a control started `ahead` is mid-leg:
 * read it with its own clock. A frame that repeats the position before it
 * shows no new time, so it gets none either. Readings count up from the
 * origin a whole cycle or less before the first reading.
 */
export function controlClock(
  control: readonly TrackedFrame[],
): Map<number, number> {
  return readControlClock(control).readings;
}

/**
 * `controlClock`'s readings, with the origin they count from (epoch ms, the
 * stamps' clock), or a null origin when no frame has a reading.
 */
function readControlClock(control: readonly TrackedFrame[]): {
  readonly readings: Map<number, number>;
  readonly origin: number | null;
} {
  const cycle = 2 * CONTROL_LEG_MS;
  const usable = control.flatMap((frame, i) => {
    const x = frame.box?.x;
    const before = i > 0 ? control[i - 1].box?.x : undefined;
    if (
      x == null ||
      x < CONTROL_EDGE ||
      x > CONTROL_TRAVEL - CONTROL_EDGE ||
      (before != null && Math.abs(x - before) <= 0.25)
    ) {
      return [];
    }
    const out = (x / CONTROL_TRAVEL) * CONTROL_LEG_MS;
    return [{t: frame.t, out, back: cycle - out}];
  });
  const clock = new Map<number, number>();
  if (usable.length === 0) {
    return {readings: clock, origin: null};
  }
  const onCycle = (a: number, b: number) => {
    const d = Math.abs(a - b) % cycle;
    return Math.min(d, cycle - d);
  };
  let origin = 0;
  let agreeing = -1;
  let spread = Number.POSITIVE_INFINITY;
  for (let candidate = 0; candidate < cycle; candidate += 1) {
    let count = 0;
    let sum = 0;
    for (const frame of usable) {
      const phase = frame.t - candidate;
      const d = Math.min(onCycle(phase, frame.out), onCycle(phase, frame.back));
      if (d <= CONTROL_AGREE_MS) {
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
  const first = Math.min(...usable.map(frame => frame.t));
  const anchored = origin + Math.floor((first - origin) / cycle) * cycle;
  for (const frame of usable) {
    const expected = frame.t - anchored;
    const nearest = (ms: number) =>
      ms + Math.round((expected - ms) / cycle) * cycle;
    const out = nearest(frame.out);
    const back = nearest(frame.back);
    clock.set(
      frame.t,
      Math.abs(out - expected) <= Math.abs(back - expected) ? out : back,
    );
  }
  return {readings: clock, origin: anchored};
}

/**
 * Each control frame's time on the page clock, epoch ms, by its cast stamp. It
 * is read from the busy controls' positions: the first control's clock, else
 * the one `ahead`. The stamp only picks the control's cycle, so a stamp that
 * runs late moves no reading. Each control counts from its start
 * (`controlStarts`), or else from the origin that most of its frames' stamps
 * agree with (`controlClock`). A frame with no reading has no time here.
 * Frames tracked from the same screencast share its stamps, so a spec looks
 * their times up here. The busy proofs date their frames from these times.
 */
export function pageTimesOnControls(
  control: readonly TrackedFrame[],
  {
    ahead,
    controlStarts,
  }: {
    /** The control started `ahead`, from the same screencast. */
    readonly ahead?: readonly TrackedFrame[];
    /** When the first control started, then the one ahead (`startBusyControl`). */
    readonly controlStarts?: readonly [number, number?];
  } = {},
): Map<number, number> {
  const cycle = 2 * CONTROL_LEG_MS;
  const readers = [
    {...readControlClock(control), start: controlStarts?.[0]},
    ...(ahead == null
      ? []
      : [{...readControlClock(ahead), start: controlStarts?.[1]}]),
  ].flatMap(({readings, origin, start}) => {
    const from = start ?? origin;
    return from == null ? [] : [{readings, from}];
  });
  const times = new Map<number, number>();
  for (const {t: stamp} of [...control, ...(ahead ?? [])]) {
    if (times.has(stamp)) {
      continue;
    }
    for (const {readings, from} of readers) {
      const ms = readings.get(stamp);
      if (ms != null) {
        times.set(
          stamp,
          from + ms + Math.round((stamp - from - ms) / cycle) * cycle,
        );
        break;
      }
    }
  }
  return times;
}

/**
 * Each stamp's time on the page clock: its own reading where it has one
 * (`pageTimesOnControls`).
 *
 * A stamp with no reading keeps its stamp's distance from the nearest stamp
 * whose reading agrees with it, within `CONTROL_AGREE_MS`. Such a stamp is
 * near a turn, or repeats a position. A late stamp's distance would carry its
 * lateness. Without such a stamp, the nearest stamp with a reading serves.
 * Dropping the frame would thin both series every half cycle.
 *
 * The times keep the stamps' order: a cast delivers frames in the order they
 * were drawn. Two agreeing stamps can differ in lateness by twice
 * `CONTROL_AGREE_MS`, so the stamps without a reading between them could
 * swap. So such a stamp never passes the next stamp with a reading. Each time
 * comes at least `DATED_GAP_MS` after the time of the stamp before it, since
 * the proof matches frames by time. `read` holds the stamps whose time is
 * their own reading. Null when no stamp has a reading.
 */
function controlPageTimes(
  stamps: readonly number[],
  control: readonly TrackedFrame[],
  ahead: readonly TrackedFrame[] | undefined,
  controlStarts: readonly [number, number?] | undefined,
): {times: Map<number, number>; read: ReadonlySet<number>} | null {
  const own = pageTimesOnControls(control, {ahead, controlStarts});
  const read = new Map<number, number>();
  for (const stamp of stamps) {
    const ms = own.get(stamp);
    if (ms != null) {
      read.set(stamp, ms);
    }
  }
  if (read.size === 0) {
    return null;
  }
  const dated = [...read.keys()];
  const agreeing = dated.filter(
    stamp => Math.abs(stamp - (read.get(stamp) ?? stamp)) <= CONTROL_AGREE_MS,
  );
  const anchors = agreeing.length > 0 ? agreeing : dated;
  const times = new Map<number, number>();
  for (const stamp of stamps) {
    const own = read.get(stamp);
    if (own != null) {
      times.set(stamp, own);
      continue;
    }
    let nearest = anchors[0];
    for (const other of anchors) {
      if (Math.abs(other - stamp) < Math.abs(nearest - stamp)) {
        nearest = other;
      }
    }
    times.set(stamp, (read.get(nearest) ?? nearest) + stamp - nearest);
  }
  const order = [...stamps].sort((a, b) => a - b);
  let ceiling = Number.POSITIVE_INFINITY;
  for (const stamp of [...order].reverse()) {
    const own = read.get(stamp);
    if (own == null) {
      times.set(stamp, Math.min(times.get(stamp) ?? stamp, ceiling));
    } else {
      ceiling = own;
    }
  }
  let floor = Number.NEGATIVE_INFINITY;
  for (const stamp of order) {
    floor = Math.max(times.get(stamp) ?? stamp, floor + DATED_GAP_MS);
    times.set(stamp, floor);
  }
  return {times, read: new Set(read.keys())};
}

/**
 * The component's and the control's frames dated on the controls' clock
 * (`controlPageTimes`), in the cast's order, which those times keep. Both
 * series come from one screencast, so each frame takes the same time in both.
 * `stampOf` gives each dated time's stamp, and `readTimes` holds the times
 * that are a frame's own reading. Null when the controls give no reading:
 * the proof then judges the cast's stamps.
 */
function datedOnControlClock(
  tracked: readonly TrackedFrame[],
  control: readonly TrackedFrame[],
  ahead: readonly TrackedFrame[] | undefined,
  controlStarts: readonly [number, number?] | undefined,
): {
  tracked: TrackedFrame[];
  control: TrackedFrame[];
  stampOf: ReadonlyMap<number, number>;
  readTimes: ReadonlySet<number>;
} | null {
  if (control.length === 0) {
    return null;
  }
  const stamps = [...new Set([...tracked, ...control].map(frame => frame.t))];
  const dating = controlPageTimes(stamps, control, ahead, controlStarts);
  if (dating == null) {
    return null;
  }
  const {times, read} = dating;
  const date = (frames: readonly TrackedFrame[]) =>
    [...frames]
      .sort((a, b) => a.t - b.t)
      .map(frame => ({...frame, t: times.get(frame.t) ?? frame.t}));
  return {
    tracked: date(tracked),
    control: date(control),
    stampOf: new Map([...times].map(([stamp, time]) => [time, stamp])),
    readTimes: new Set([...read].map(stamp => times.get(stamp) ?? Number.NaN)),
  };
}

/**
 * The dated frames at display rate: at most one each display interval, read
 * to the px (`CONTROL_READ_MS`). A frame under one interval after the last one
 * kept is left out, and the earlier one stays. WebKit's compositor can draw
 * two frames 6 to 9 ms apart, and a curve then shows no new step between them.
 * Only frames whose time is their own reading count. A frame dated from a
 * neighbour always stays. Its time is too rough to call it early, and leaving
 * it out could hide a held frame. Near a turn without the control ahead, such
 * a frame can then read as held, a false red that `ahead` removes. Both
 * series keep the same frames.
 */
function atDisplayRate<
  T extends {
    readonly tracked: readonly TrackedFrame[];
    readonly control: readonly TrackedFrame[];
    readonly readTimes: ReadonlySet<number>;
  },
>(dated: T): T {
  const times = [
    ...new Set([...dated.tracked, ...dated.control].map(frame => frame.t)),
  ].sort((a, b) => a - b);
  const kept = new Set<number>();
  let last = Number.NEGATIVE_INFINITY;
  for (const t of times) {
    if (!dated.readTimes.has(t)) {
      kept.add(t);
      continue;
    }
    // To a nanosecond, so float error never drops a frame one read early.
    if (t - last + 1e-6 >= DISPLAY_FRAME_MS - CONTROL_READ_MS) {
      kept.add(t);
      last = t;
    }
  }
  return {
    ...dated,
    tracked: dated.tracked.filter(frame => kept.has(frame.t)),
    control: dated.control.filter(frame => kept.has(frame.t)),
  };
}

/**
 * Pairs of judged frames one display interval apart, with the control moved
 * between them. On such a pair, a fade that holds every other frame shows no
 * step. Each frame finds its control frame by time. A pair without both counts
 * as unmatched.
 */
function displayIntervalPairs(
  tracked: readonly TrackedFrame[],
  control: readonly TrackedFrame[],
  judged: {readonly from: number; readonly to: number},
): {pairs: number; unmatched: number} {
  const controlAt = new Map(control.map(frame => [frame.t, frame]));
  const inside = tracked.filter(
    frame => frame.t >= judged.from && frame.t <= judged.to,
  );
  let pairs = 0;
  let unmatched = 0;
  for (let i = 1; i < inside.length; i += 1) {
    const [a, b] = [inside[i - 1], inside[i]];
    if (b.t - a.t >= 2 * DISPLAY_FRAME_MS - CONTROL_READ_MS) {
      continue;
    }
    const [from, to] = [controlAt.get(a.t), controlAt.get(b.t)];
    if (from == null || to == null) {
      unmatched += 1;
    } else if (from.box?.x !== to.box?.x) {
      pairs += 1;
    }
  }
  return {pairs, unmatched};
}

/**
 * The judged part on the cast's own stamps, from the first frame judged to
 * the last. A caller selects the judged frames from its own cast by them.
 */
function judgedOnStamps(
  judged: {readonly from: number; readonly to: number},
  dated: {
    readonly tracked: readonly TrackedFrame[];
    readonly stampOf: ReadonlyMap<number, number>;
  },
): {readonly from: number; readonly to: number} {
  const inside = dated.tracked.filter(
    frame =>
      frame.box != null && frame.t >= judged.from && frame.t <= judged.to,
  );
  const from = dated.stampOf.get(inside.at(0)?.t ?? Number.NaN);
  const to = dated.stampOf.get(inside.at(-1)?.t ?? Number.NaN);
  return from == null || to == null ? judged : {from, to};
}

/** What the control presented in the judged part (see `busyWindowProof`). */
export interface BusyControlRead {
  /** Frames in the judged part that presented a new control position. */
  readonly moved: number;
  /** Of those, the frames that also presented a new component position. */
  readonly movedWith: number;
  /** The control's longest time without a new position, the edges included. */
  readonly longestStallMs: number;
  /**
   * Of `movedWith`, the frames counted as moved where the cast could not show
   * the component's motion: under one cast step per frame, or a frame
   * delivered early under two (see `busyWindowProof`).
   */
  readonly belowStep: number;
  /**
   * The component's longest time without a new position, read the same way:
   * a run of unchanged frames the cast could not show is motion.
   */
  readonly componentStallMs: number;
}

export interface BusyWindow {
  /** Epoch ms when the loop started and ended, on the page's own clock. */
  readonly from: number;
  readonly to: number;
}

/** The window `blockMainThread` held, with the span its loop measured. */
export interface BlockedWindow extends BusyWindow {
  /**
   * How long the loop held the thread, in ms, between the two clock readings
   * it started and ended on. It is never less than the time asked for.
   */
  readonly spanMs: number;
  /**
   * With `during`: the animation the block caught, epoch ms on the page's
   * clock. `from` is its start, and `to` is where its curve ends, its held
   * tail excluded. It is absent when the animation's `playbackRate` is 0 or
   * less, since its curve then has no forward end. `holds` says whether the
   * element keeps the curve's end value after `to`. A held tail keeps it, and
   * so does a fill the engine's compositor honors (not WebKit on Linux). When
   * it does not, `busyWindowProof` judges the block up to `to`.
   */
  readonly animation?: {
    readonly from: number;
    readonly to: number;
    readonly holds: boolean;
  };
}

/**
 * Holds the page's main thread for `ms` (a synchronous loop: no task, frame,
 * rAF, event or microtask runs meanwhile). Resolves with the window it held.
 *
 * Block MID-FLIGHT only: start the gesture or animation first. A touch that
 * starts while the main thread is busy does not scroll or begin a gesture in
 * headless Chromium, even with only passive listeners, and an animation that
 * has not started cannot start (see `waitForAnimation`). Finger tracking
 * under a busy main thread is a simulator proof, not a Playwright one.
 *
 * With `during`, the page itself waits until an animation on that element (or
 * inside it) has run `minProgressMs`, then blocks from a task it queues in
 * that frame. A round trip from the test would start the block later the
 * busier the machine is, leaving less of a short animation to judge. The task
 * runs after the frame's rendering update, which is where WebKit hands a newly
 * started animation to its compositor: a loop inside the rAF callback itself
 * holds that hand-off, and even a compositor animation freezes. To catch a
 * settle near its start, call it before the release that starts the settle and
 * await it after: the page is already waiting when the animation begins. Any
 * animation inside `during` counts but the busy-window control's own
 * (`startBusyControl`, mounted inside a dialog with `within`), so pick an
 * element that runs nothing else meanwhile.
 * With `pseudoElement`, only that pseudo-element's animations on `during`
 * itself count, as `sampleCurve` reads them. A child's animation, such as a
 * switch thumb's press, then does not start the block.
 * With `property`, only animations that set that property count, named as
 * CSS names it (`translate`, `background-color`, `--press-strength`), as a
 * hold's judged motion names it.
 * A thumb's `translate` travel then starts the block, and its press `scale`
 * does not.
 *
 * An animation counts once it is no longer pending and has run at least one
 * frame (`minProgressMs` below 16 ms is raised to 16). One created in the
 * frame the page looks is still pending, not yet on the compositor
 * (Chromium), and in WebKit its start time resolves before its layer is
 * flushed: a block that started on it froze it.
 * It must also be the same animation the page saw at its frame before. A
 * component can rebuild a running animation on its old clock. The page then
 * sees it running and not pending, before the compositor shows a frame of it,
 * so the block waits one frame more. An animation rebuilt at every frame never
 * qualifies: at the timeout the wait rejects and names that.
 *
 * It counts only while it still moves: before its curve's held tail (where
 * its keyframes end in a run of identical values, read as `waitForRest`
 * reads it). A block in that tail would judge an animation that has stopped.
 * When the only animation running there started while the page waited, or
 * the wait times out with only such animations, the page looked too late:
 * that rejects with `BusyWindowTooLateError`, with the numbers.
 *
 * The window it resolves with names the animation it caught (`animation`):
 * when it started and where its curve ends. `holds` says whether the element
 * keeps the curve's end value after it. These times are on the real clock,
 * as the window's own are, after a page freeze too.
 */
/** One display frame, ms: the least progress `blockMainThread` waits for. */
const ONE_FRAME_MS = 16;

/**
 * The block began too late for the motion it was meant to catch. So the
 * window holds too little to judge: when the block ran, not how the component
 * moved. Thrown by `blockMainThread` (with `during`) when the animation under
 * test is already in its curve's held tail where the page first looks. Thrown
 * by `busyWindowProof` when the tracked value had settled before the judged
 * part of the window began. Thrown too when a held curve that keeps no end
 * value ends so soon in the block that too few frames are left
 * (`curveEndMs`). Always a red, with the numbers; never a pass. Start the
 * block earlier: call `blockMainThread` before the action that starts the
 * motion, and await it after.
 */
export class BusyWindowTooLateError extends Error {
  constructor(
    message: string,
    /** The times the error is read from, ms. */
    readonly numbers: Readonly<Record<string, number>>,
  ) {
    super(message);
    this.name = 'BusyWindowTooLateError';
  }
}

/** A frame a busy proof could not judge (see `BusyFrameUnjudgedError`). */
export interface UnjudgedFrame {
  /** When the frame was presented, ms after the window began. */
  readonly atMs: number;
  /**
   * The component's move per frame there, px: the change that ends the run of
   * equal positions that holds the frame, over the run's frames.
   */
  readonly movePx: number;
  /** The cast's position step for the judged value, px. */
  readonly stepPx: number;
}

/**
 * A frame the cast could not show the component's step on, in a busy proof
 * that judges every frame (`judgeEveryFrame`). The control moved on that
 * frame. The component moved under two of the cast's steps a frame, and the
 * frame shows no change. So the run is too little to judge: it fails by name,
 * not as a red on the component. A frozen or main-thread component still
 * fails the verdict, since the cast's step does not explain its hold.
 */
export class BusyFrameUnjudgedError extends Error {
  constructor(
    /** Each frame the proof could not judge. */
    readonly frames: readonly UnjudgedFrame[],
    summary: string,
  ) {
    super(
      `busyWindowProof: too little to judge: ${frames
        .map(
          frame =>
            `at +${frame.atMs.toFixed(1)} ms the component moved about ${frame.movePx.toFixed(2)} px a frame, under two of the cast's ${frame.stepPx} px steps, and the frame shows no step while the control moved`,
        )
        .join('; ')}. ${summary}`,
    );
    this.name = 'BusyFrameUnjudgedError';
  }
}

export async function blockMainThread(
  page: Page,
  ms: number,
  {
    during,
    minProgressMs = 16,
    property,
    pseudoElement,
    timeout = 5_000,
  }: {
    during?: Locator;
    minProgressMs?: number;
    property?: string;
    pseudoElement?: '::before' | '::after';
    timeout?: number;
  } = {},
): Promise<BlockedWindow> {
  const minProgress = Math.max(minProgressMs, ONE_FRAME_MS);
  if (pseudoElement != null && during == null) {
    throw new TypeError(
      'blockMainThread: pseudoElement names a part of `during`; pass `during` too',
    );
  }
  if (property != null && during == null) {
    throw new TypeError(
      'blockMainThread: property picks an animation of `during`; pass `during` too',
    );
  }
  if (during == null) {
    return page.evaluate(duration => {
      // The harness's own work: a trace sets it apart (trace.ts HARNESS_READ).
      console.timeStamp('harness-read');
      // One reading starts the loop and one ends it. A coarsened clock can
      // step back between two reads, so a separate read would end it early.
      // The loop tests the span it returns, which a sum rounded down would not.
      // It reads the timer gate's real clock: a page freeze stops the page's
      // own, which then trails the frames after the thaw.
      const read =
        (
          window as unknown as {
            __harnessTimerGate?: {now?: () => number};
          }
        ).__harnessTimerGate?.now ?? (() => performance.now());
      const start = read();
      let now = start;
      let spins = 0;
      while (now - start < duration) {
        now = read();
        spins += 1;
      }
      return {
        from: performance.timeOrigin + start,
        to: performance.timeOrigin + now,
        spanMs: now - start,
        spins,
      };
    }, ms);
  }
  // The wait reads the curve end and the property match, defined in the page
  // first. Both are sent before the wait and not awaited: the wait starts no
  // later than before.
  const defined = page.evaluate(
    `(${defineCurveEnd.toString()})();(${defineAnimatedProperties.toString()})();`,
  );
  // WebKit on Linux ignores `fill` on its compositor: a filled move that
  // ends during a main-thread block snaps back (motion/animator.ts,
  // END_HOLD_MS). Elsewhere a fill holds the end value. Node's platform is
  // the browser's: no config connects to a remote browser.
  const fillHolds = !(
    page.context().browser()?.browserType().name() === 'webkit' &&
    process.platform === 'linux'
  );
  const waited = during.evaluate(
    (element, {duration, minProgress, prop, pseudo, wait, fillHolds}) =>
      new Promise<BlockedWindow>((resolve, reject) => {
        // The harness's own waits run on the real timers: a frozen timer gate
        // (story.ts) holds only the page's.
        const gate = (
          window as unknown as {
            __harnessTimerGate?: {
              frame?: typeof requestAnimationFrame;
              now?: () => number;
              timeout?: typeof setTimeout;
            };
          }
        ).__harnessTimerGate;
        const frame = gate?.frame ?? window.requestAnimationFrame.bind(window);
        const later = gate?.timeout ?? window.setTimeout.bind(window);
        const realNow = gate?.now ?? (() => performance.now());
        const deadline = realNow() + wait;
        // The busy-window control animates on its own, inside a dialog with
        // `within`: it never stands for the animation under test.
        const isControl = (a: Animation) => {
          const target = (a.effect as KeyframeEffect | null)?.target ?? null;
          return (
            target instanceof Element &&
            target.closest('[data-harness-control]') != null
          );
        };
        // With a pseudo-element, only its own animations on the element; with
        // a property, only animations that set it, matched as a hold's judged
        // motion is.
        const animates = (
          window as unknown as {
            __harnessAnimates: (a: Animation, property: string) => boolean;
          }
        ).__harnessAnimates;
        const counts = (a: Animation) => {
          if (isControl(a)) {
            return false;
          }
          const effect = a.effect as KeyframeEffect | null;
          if (
            pseudo != null &&
            (effect?.target !== element ||
              (effect.pseudoElement ?? null) !== pseudo)
          ) {
            return false;
          }
          return prop == null || animates(a, prop);
        };
        // Where each animation's curve ends, its held tail excluded.
        const curveEnd =
          (
            window as unknown as {
              __harnessCurveEnd?: (animation: Animation) => number;
            }
          ).__harnessCurveEnd ??
          ((a: Animation) => {
            const timing = a.effect?.getComputedTiming();
            return (
              Number(timing?.delay ?? 0) + Number(timing?.activeDuration ?? 0)
            );
          });
        // What already ran when the wait began.
        const before = new Set(
          element.getAnimations({subtree: true}).filter(counts),
        );
        const numbersOf = (a: Animation) => ({
          currentTimeMs: Number(a.currentTime ?? 0),
          curveEndMs: curveEnd(a),
          startedWhileWaiting: before.has(a) ? 0 : 1,
        });
        // The first run the wait saw in its held tail, as it was then: it may
        // finish, or be cancelled once its curve ends, before the wait times
        // out.
        let heldSeen: ReturnType<typeof numbersOf> | null = null;
        const tooLate = (numbers: ReturnType<typeof numbersOf>) =>
          new Error(`BusyWindowTooLate ${JSON.stringify(numbers)}`);
        // The animations that counted at the frame before, pending ones too.
        let seen = new Set<Animation>();
        const tick = () => {
          const present = element.getAnimations({subtree: true}).filter(counts);
          const ran = present.filter(
            a =>
              a.playState === 'running' &&
              !a.pending &&
              Number(a.currentTime ?? 0) >= minProgress,
          );
          // Still moving: before its curve's held tail. One running backward
          // ends at its start, so it moves while it runs.
          const moves = (a: Animation) =>
            a.playbackRate < 0 || Number(a.currentTime ?? 0) < curveEnd(a);
          const running = ran.some(moves);
          // One first seen this frame can be rebuilt on its old clock, and not
          // on the compositor yet: the block waits for the next frame.
          const caught = ran.find(a => moves(a) && seen.has(a));
          seen = new Set(present);
          if (!running && ran.length > 0) {
            heldSeen ??= numbersOf(ran[0]);
          }
          // In its held tail: started while the page waited, or, when the
          // wait times out, what is left there or the first such run it saw.
          const late = ran.find(a => !before.has(a));
          const timedOut = realNow() > deadline;
          const leftover = ran.length > 0 ? numbersOf(ran[0]) : heldSeen;
          if (caught != null) {
            const startTime = caught.startTime;
            // A start time is a page time. It trails the real clock, which the
            // window reads, by every span a page freeze stood still.
            const frozen =
              (window as unknown as {__harnessFreeze?: {offset: number}})
                .__harnessFreeze?.offset ?? 0;
            const from = performance.timeOrigin + Number(startTime) + frozen;
            // Whether the element keeps the curve's end value once it ends. A
            // held tail past the curve keeps it, and so does a fill the
            // compositor honors. An end delay shows nothing.
            const timing = caught.effect?.getComputedTiming();
            const keyframesEnd =
              Number(timing?.delay ?? 0) + Number(timing?.activeDuration ?? 0);
            const holds =
              curveEnd(caught) < keyframesEnd ||
              (fillHolds &&
                (timing?.fill === 'forwards' || timing?.fill === 'both'));
            const animation =
              startTime != null && caught.playbackRate > 0
                ? {
                    from,
                    to: from + curveEnd(caught) / caught.playbackRate,
                    holds,
                  }
                : undefined;
            // The same loop as above, from a task queued in the frame that saw
            // the animation: it runs once that frame's rendering update has
            // handed the animation to the compositor.
            later(() => {
              const read = realNow;
              const start = read();
              let now = start;
              while (now - start < duration) {
                now = read();
              }
              resolve({
                from: performance.timeOrigin + start,
                to: performance.timeOrigin + now,
                spanMs: now - start,
                ...(animation == null ? {} : {animation}),
              });
            }, 0);
          } else if (running) {
            if (timedOut) {
              reject(
                new Error(
                  'blockMainThread: no animation of `during` ran on two frames in a row',
                ),
              );
            } else {
              frame(tick);
            }
          } else if (late != null) {
            reject(tooLate(numbersOf(late)));
          } else if (timedOut && leftover != null) {
            reject(tooLate(leftover));
          } else if (timedOut) {
            reject(new Error('blockMainThread: no animation started'));
          } else {
            frame(tick);
          }
        };
        frame(tick);
      }),
    {
      duration: ms,
      minProgress,
      prop: property ?? null,
      pseudo: pseudoElement ?? null,
      wait: timeout,
      fillHolds,
    },
  );
  try {
    const [, held] = await Promise.all([defined, waited]);
    return held;
  } catch (error) {
    const late = /BusyWindowTooLate (\{.*\})/.exec(
      error instanceof Error ? error.message : String(error),
    );
    if (late == null) {
      throw error;
    }
    const numbers = JSON.parse(late[1]) as {
      currentTimeMs: number;
      curveEndMs: number;
      startedWhileWaiting: number;
    };
    throw new BusyWindowTooLateError(
      `blockMainThread: the animation under test was ${numbers.currentTimeMs.toFixed(0)} ms in, past the end of its curve at ${numbers.curveEndMs.toFixed(0)} ms, when the page ${numbers.startedWhileWaiting ? 'first saw it' : 'gave up waiting for one that moves'}: its motion had ended, so a block now holds nothing to judge. Call blockMainThread before the action that starts the motion, and await it after.`,
      numbers,
    );
  }
}

export interface BusyVerdict {
  readonly pass: boolean;
  /** Each criterion the window missed, with its measured value and limit. */
  readonly failures: readonly string[];
}

export interface BusyProof extends FrameStats {
  readonly window: BusyWindow;
  /**
   * The part of the window judged: inside the margins, up to `settledWithin`,
   * and from `onScreenFromMs` when that is set. On a WebKit cast dated on the
   * controls' clock, it runs from the cast's stamp of the first frame judged
   * to that of the last. So a caller selects the judged part by its stamps.
   * Frames the display-rate keep left out fall inside it too. Only this part
   * moves back to the stamps. The summary's times, its stall and its control
   * read stay on the controls' clock.
   */
  readonly judged: {readonly from: number; readonly to: number};
  /**
   * The ms after the window's start of the tracked value's first presented
   * change inside the block, where judging starts. It is set when the value
   * was seen at rest before the judged part: a frame there, and no change in
   * the `BUSY_PROOF_LOOKAROUND_MS` before it. That is a just-started animation
   * not on screen yet. Otherwise it is null.
   */
  readonly onScreenFromMs: number | null;
  /**
   * The cast's position step, CSS px: the largest of 0.5, 1 and 2 that every
   * change of the tracked value in the judged part is a multiple of, or 0.5
   * when it does not change there (WebKit's casts step 2: see the README).
   * A sub-pixel read (`trackMarker` with `subpixel`) uses its own step.
   */
  readonly stepPx: number;
  /** The tracked value's mean motion per screencast interval in the judged part, px. */
  readonly pxPerFrame: number;
  /** Facts worth reading beside the verdict, which never fail it. */
  readonly notes: readonly string[];
  /**
   * With a compositor record (`presented`): frames the screencast skipped
   * between two moved frames while the compositor presented them, which are
   * neither stalls nor misses; 0 without one.
   */
  readonly recorderSkipped: number;
  /**
   * The compositor's frame interval around the window, ms, from `presented`;
   * null without a usable record (the screencast alone is judged).
   */
  readonly compositorFrameMs: number | null;
  /**
   * The screencast's frame interval, from the frames around the window as well
   * as inside it (a short window has few intervals; a frozen one has none).
   */
  readonly cadenceMs: number;
  /**
   * Whole frame intervals in the judged part at the measured cadence (the
   * compositor's, when recorded): the `minJudgedFrames` floor reads it.
   */
  readonly expectedFrames: number;
  /** Frames the screencast delivered in the judged part, with the marker found. */
  readonly deliveredFrames: number;
  /**
   * Longest time inside the window with no presented change, the window's own
   * edges included. A frozen animation presents no new frame at all (nothing
   * on screen changed, so the compositor sends none): its stall is the whole
   * window.
   */
  readonly longestStallMs: number;
  /** Where the longest stall starts, ms after the window's start. */
  readonly longestStallAtMs: number;
  /**
   * `longestStallMs` in screencast intervals, rounded: 1 is no frame missed,
   * 2 is one dropped frame. Rounding absorbs timestamp jitter.
   */
  readonly longestStallFrames: number;
  /**
   * Frames in the window that presented a new position (the first compared
   * with the last frame before the window).
   */
  readonly moved: number;
  /**
   * `moved` (and `recorderSkipped`) over the frames judged: the frames the
   * screencast delivered in the judged part, or with a compositor record the
   * compositor's frames from the first to the last moved frame;
   * `expectedFrames` when nothing moved, or fewer than `minJudgedFrames`
   * frames were delivered.
   */
  readonly movedFraction: number;
  /** With a `control`: what it presented in the judged part; null without one. */
  readonly control: BusyControlRead | null;
  /** The judgment against the limits (see `busyWindowProof`). */
  readonly verdict: BusyVerdict;
  /** One line with the raw numbers, for an annotation or a failure message. */
  readonly summary: string;
}

/**
 * The stretches of a judged series that move under `limitPx` per frame,
 * read over four frames at a time, merged where they overlap: where the cast
 * cannot show a step on every frame.
 */
function slowStretches(
  values: readonly {t: number; value: number}[],
  cadence: number,
  limitPx: number,
): {from: number; to: number; pxPerFrame: number}[] {
  const SPAN = 4;
  const stretches: {from: number; to: number; pxPerFrame: number}[] = [];
  for (let k = 0; k + SPAN < values.length; k += 1) {
    const a = values[k];
    const b = values[k + SPAN];
    const frames = (b.t - a.t) / cadence;
    const pxPerFrame = frames > 0 ? Math.abs(b.value - a.value) / frames : 0;
    if (pxPerFrame <= 0 || pxPerFrame >= limitPx) {
      continue;
    }
    const last = stretches[stretches.length - 1];
    if (last != null && a.t <= last.to) {
      last.to = b.t;
      last.pxPerFrame = Math.min(last.pxPerFrame, pxPerFrame);
    } else {
      stretches.push({from: a.t, to: b.t, pxPerFrame});
    }
  }
  return stretches;
}

/**
 * The cast's position step along `axis`, CSS px, read from the cast: the
 * coarsest `step` the tracked frames carry (`trackMarker` sets it from each
 * frame's color resolution and scale, for the default marker only), so 2 px
 * in WebKit's 4:2:0 JPEG cast and 1 px in Chromium's PNG cast. Throws when no
 * frame carries one, as for a control tracked by another color: a step read
 * from the motion would take a run whose changes are all even on a 1 px cast
 * for a 2 px cast.
 */
export function castStep(
  tracked: readonly TrackedFrame[],
  axis: 'x' | 'y' | 'width' | 'height',
): number {
  const key = axis === 'x' || axis === 'width' ? 'x' : 'y';
  const steps = tracked.flatMap(f => (f.step == null ? [] : [f.step[key]]));
  if (steps.length === 0) {
    throw new Error(
      "castStep: no tracked frame carries the cast's step (trackMarker sets it)",
    );
  }
  return Math.max(...steps);
}

/**
 * The step a tracked value's changes share: the largest of 2, 1 and 0.5 CSS
 * px that every change between consecutive positions is a multiple of.
 * Changes rather than positions: a position the page commits once a block
 * ends can sit off that grid. With no change to read, the finest step: a
 * coarser one would let a larger jump pass for a single step.
 */
function motionStepPx(values: readonly number[]): number {
  const changes = values
    .slice(1)
    .map((p, i) => Math.abs(p - values[i]))
    .filter(d => d > 0.25);
  return changes.length === 0
    ? 0.5
    : ([2, 1, 0.5].find(step =>
        changes.every(d => Math.abs(d / step - Math.round(d / step)) < 0.01),
      ) ?? 0.5);
}

/**
 * Frame evidence for a busy window: how many frames the screencast presented
 * inside it, how many of them moved the tracked axis, and the longest stall.
 * The window is trimmed by `marginMs` at both ends so the frame the block
 * started on and the one it ended on are not counted.
 *
 * The verdict judges the frames the screencast delivered, whatever its rate
 * (a loaded machine's screencast can deliver one frame in five or six), and
 * tolerates nothing a main-thread animation does (it presents no frame for
 * the whole block). It passes when:
 * - the judged part presented at least one frame, and, only when a proof
 *   claims display rate and passes `maxMedianFrameMs`, their median interval
 *   is at most that;
 * - no stall spans more than `maxStallFrames` screencast intervals;
 * - at least `minMovedFraction` of the frames judged moved the tracked axis
 *   (a short window may still miss one): the frames the screencast delivered
 *   in the judged part, so an irregular cast is judged on what it delivered
 *   and a frame it did not deliver is a gap for the stall check, not a miss
 *   (unless it delivered fewer than `minJudgedFrames` there: then every frame
 *   of the judged part's span counts, so one late frame is not 1/1 moved);
 *   with a compositor record, the compositor's frames from the first to the
 *   last moved frame (the gaps before and after are the stall check's);
 * - the judged part spans at least `minJudgedFrames` frames. Fewer means the
 *   animation under test was not moving during the block (it settled before
 *   the block, or the block caught another animation), so there is nothing to
 *   judge, and that fails rather than passes.
 *
 * With `window.animation` (`blockMainThread`'s `during`), the judged part
 * can end at the held curve's end, when that comes before the block's. It
 * does unless the element keeps the end value (`holds`), or a settle bound
 * (`settledWithin`, `settledWithinSteps`) already ends judging. Once a
 * compositor animation that keeps no end value ends inside a block, WebKit
 * presents the value the main thread last committed, not the animation. If
 * the part left gives the control fewer than `minJudgedFrames` frames, the
 * block started late for the motion. Without a control, the part's span
 * counts. That throws `BusyWindowTooLateError`, as a motion that settled
 * before the block does. A stall before the curve's end is still judged, and
 * fails.
 *
 * A just-started animation can reach the screen after the block began (its
 * hand-off to the compositor lags under load: 50–100 ms in WebKit). The
 * tracked value may be seen at rest before the judged part: a frame there, and
 * no change in the `BUSY_PROOF_LOOKAROUND_MS` before it. Judging then starts at
 * its first presented change inside the block, which the
 * proof reports as `onScreenFromMs`. So does a hold that starts before the
 * block (two frames at least at one position, the first before it) and ends
 * at the first presented change inside it: WebKit presents a just-started
 * compositor animation late (a sheet's release held on screen for 130 to
 * 300 ms while its timeline ran, and the screencast reaches Node about 0.7 s
 * late on a loaded runner, too late to wait on before blocking). Only a hold
 * at `setBeforeBlock`, the value the page itself last set before the block,
 * is excused. Every frame after that first change is judged, so a freeze
 * later in the block fails.
 * An element off screen before the judged part is judged from its first
 * position inside the part, as a card that enters from an edge. The cast's
 * frames before the part must show the screen without it. A main-thread
 * entrance shows no frame during the block, so it still fails.
 * The judged part still ends with the block, or with the held curve. The
 * `minJudgedFrames` floor applies to it, so a start the block itself delays
 * fails. Any other animation that was already moving is judged from the
 * block's start, and a stall there fails as before.
 *
 * `stepPx` and `pxPerFrame` say whether a frame's motion is resolvable at
 * all: under two position steps per frame, a frame delivered early can show
 * no step and read as not moved. The proof notes each stretch of the judged
 * part that moves that slowly, read over four frames at a time so a slow tail
 * inside a fast window shows (never a failure).
 *
 * A loaded machine's screencast can skip frames the compositor still presents
 * (Chromium). Given the compositor's record (`presented`, from
 * `startCompositorTrace`), a gap between two moved frames with no frame
 * delivered inside it is measured between the compositor's own frames: it is
 * a stall only where the compositor presented nothing, and the frames it did
 * present there are neither stalls nor misses (`recorderSkipped`). A gap
 * that opens or closes the judged part, or holds a delivered frame that did
 * not move, is judged from the screencast as before, so a frozen element
 * fails whatever else the compositor draws.
 *
 * With a `control` (`startBusyControl`'s box, tracked from the same
 * screencast), the window is judged against what the compositor presented in
 * it rather than against a frame rate: on a two-core runner the software
 * compositor and the screencast share the core the block spins on, so every
 * compositor animation presents fewer frames there, the control too. The
 * component passes when:
 * - the control moved on at least `minJudgedFrames` frames of the judged part
 *   (fewer: the machine presented too little to judge, which fails);
 * - the component moved on every frame the control moved: both are read from
 *   the same screencast frames, so a compositor animation misses none;
 * - its longest stall is no longer than the control's.
 * A run of frames with no new component position counts as moved when the
 * change that ends it is a single cast step (`stepPx`): the component moves
 * under one step per frame there, as on an easing tail, which the cast cannot
 * show on every frame. Where the component moved under two steps per frame
 * over the frames just before the run, or across the run itself (its
 * catch-up over the frames it spans) where the curve slows faster than those
 * frames show, a frame delivered early can show no step too, so the change
 * may carry the motion of every frame the run held at that pace, to the
 * nearest step. The run also has to read as a slowing
 * curve, at most one frame longer than the component's run before it.
 * Under `settledWithinSteps`, a run under one cast step a frame may instead
 * last ceil(step ÷ travel) frames, whatever the run before it. The travel is
 * the slower moving pace around the run, never less than its own catch-up
 * per frame. The run also lasts at most one frame more than the pace into it
 * allows: ceil(step ÷ max(pace before, catch-up per frame)) + 1. A
 * freeze ends in a larger catch-up, a stall in a frame-counted animation is
 * longer than its runs before it, and a run that no change ends stays a miss.
 * The component still has to show a new position on at least
 * `minJudgedFrames` of the control's frames.
 * A main-thread animation still fails: the control moves and it does not.
 * `maxMedianFrameMs`, when given, still applies; `minMovedFraction` and the
 * absolute stall, frame and motion limits do not.
 *
 * A WebKit cast with a control is judged on the controls' clock, not on its
 * stamps. WebKit stamps the frame after a delivery gap about 60 ms late,
 * carrying one frame of motion. So each frame takes its time from the
 * controls' positions (`controlClock`), the component's and the control's
 * alike. A frame with no reading keeps its stamp's distance from the nearest
 * frame whose stamp agrees with its reading. The dated frames keep the cast's
 * order. Without the control `ahead`, a late frame near the first control's
 * turn keeps its lateness. Chromium casts and casts with no control are
 * judged on their stamps.
 *
 * A WebKit proof keeps one dated frame per display interval, the earlier
 * one. A frame with no reading always stays. The proof judges motion on every
 * kept frame the control moved. Its cast rarely shows two frames one interval
 * apart, so it judges no 30 Hz cadence. A note in the summary says so, with
 * the count of such pairs.
 *
 * With a control, a run the machine starved of frames proves nothing. So it
 * throws `FrameStarvationError` with its numbers and returns no verdict. A
 * starved run has two marks. Its control moved on fewer than
 * `minJudgedFrames` frames, and the cast showed no frame for longer than
 * `FRAME_STARVATION_MS` in the block. Without a control, a block with no
 * frame is a frozen animation's, and it fails the verdict. `pooledBusyProof`
 * reads each run without the throw and judges the runs together.
 *
 * With `judgeEveryFrame`, a frame the cast could not show the component's
 * step on is too little to judge (the frames `belowStep` counts). When the
 * verdict otherwise passes, the proof throws `BusyFrameUnjudgedError` with
 * each such frame, the component's move there and the cast's step. A failed
 * verdict is returned as it is: it is the component's red.
 */
export function busyWindowProof(
  ...args: Parameters<typeof readBusyWindow>
): BusyProof {
  const {proof, starvation, unjudged} = readBusyWindow(...args);
  if (starvation != null) {
    throw new FrameStarvationError(starvation);
  }
  // A failed verdict is the component's red, whatever else the cast hid.
  if (unjudged.length > 0 && proof.verdict.failures.length === 0) {
    throw new BusyFrameUnjudgedError(unjudged, proof.summary);
  }
  return proof;
}

/**
 * How far around its judged part a busy proof reads frames, ms: the rest
 * before it and the frame cadence on both sides. A proof that decodes only
 * part of a cast keeps the frames this far after the window.
 */
export const BUSY_PROOF_LOOKAROUND_MS = 250;

/**
 * The proof `busyWindowProof` returns, and the starvation it throws. A WebKit
 * cast with a control is judged on the controls' clock
 * (`datedOnControlClock`); any other cast on its stamps. WebKit stamps the
 * frame after a delivery gap about 60 ms late, carrying one frame of motion.
 */
function readBusyWindow(
  tracked: readonly TrackedFrame[],
  window: BusyWindow,
  {
    ahead,
    controlStarts,
    ...options
  }: NonNullable<Parameters<typeof judgeBusyWindow>[2]> & {
    /**
     * The control started `ahead` (`startBusyControl`), tracked from the same
     * screencast (`trackControl` with `ahead`). It dates the WebKit frames
     * that fall near the first control's turns, where that control gives no
     * time.
     */
    ahead?: readonly TrackedFrame[];
    /**
     * When the first control started, then the one ahead (each
     * `startBusyControl`'s `start`). Without them, each control counts from
     * the origin that most of its frames' stamps agree with.
     */
    controlStarts?: readonly [number, number?];
  } = {},
): ReturnType<typeof judgeBusyWindow> {
  const {control} = options;
  const dated =
    control != null && control.every(frame => frame.engine === 'webkit')
      ? datedOnControlClock(tracked, control, ahead, controlStarts)
      : null;
  if (dated == null) {
    return judgeBusyWindow(tracked, window, options);
  }
  const shown = atDisplayRate(dated);
  const read = judgeBusyWindow(shown.tracked, window, {
    ...options,
    control: shown.control,
  });
  // A WebKit cast rarely shows two frames one interval apart, so the proof
  // cannot judge a 30 Hz cadence there. It says so, with the count.
  const {pairs, unmatched} = displayIntervalPairs(
    shown.tracked,
    shown.control,
    read.proof.judged,
  );
  const note =
    `cadence not judged: ${pairs} display-interval pairs` +
    (unmatched > 0
      ? `, ${unmatched} without a control frame at their time`
      : '');
  return {
    ...read,
    proof: {
      ...read.proof,
      judged: judgedOnStamps(read.proof.judged, shown),
      notes: [...read.proof.notes, note],
      summary: `${read.proof.summary}; note: ${note}`,
    },
  };
}

/** `readBusyWindow` on the frames it judges, dated. */
function judgeBusyWindow(
  tracked: readonly TrackedFrame[],
  window: BusyWindow,
  {
    axis = 'y',
    marginMs = 20,
    settledWithin,
    settledWithinSteps,
    settledAt,
    setBeforeBlock,
    maxMedianFrameMs = Infinity,
    maxStallFrames = 3,
    minMovedFraction = 0.9,
    minJudgedFrames = 4,
    presented,
    control,
    judgeEveryFrame = false,
  }: {
    axis?: 'x' | 'y' | 'width' | 'height';
    marginMs?: number;
    /**
     * Opt-in, for a proof that claims display rate: the most the median frame
     * interval may be, ms (20 at 60 Hz). Off by default, since it measures the
     * screencast's own rate as much as the animation.
     */
    maxMedianFrameMs?: number;
    /** The most screencast intervals one stall may span (3 = two dropped frames). */
    maxStallFrames?: number;
    /**
     * The least fraction of the expected frames that must move. One missed
     * frame is always allowed, so a window of under ten frames is not judged
     * stricter than a long one.
     */
    minMovedFraction?: number;
    /** The fewest whole frame intervals the judged part of the window may span. */
    minJudgedFrames?: number;
    /**
     * Stop judging once the value is within this many px of where it ends.
     * The screencast reports whole CSS pixels, so an easing tail that still
     * moves shows plateaus (26, 26, 26 against a final 24) that would read
     * as a stall: 2 is the usual value.
     */
    settledWithin?: number;
    /**
     * `settledWithin` counted in the cast's own position steps: stop judging
     * once the value is within this many steps of where it ends, the step
     * read from the cast (`castStep`): 1 px in Chromium's PNG cast, 2 px in
     * WebKit's JPEG cast, whose 4:2:0 chroma holds the marker's color in
     * 2 by 2 pixel blocks. A coarser cast shows an easing tail's last steps as
     * longer plateaus, so a bound in px would read them as a stall in one
     * engine and not the other; a freeze further from the end than that is
     * still judged. Give this or `settledWithin`, not both.
     */
    settledWithinSteps?: number;
    /**
     * Where the value ends, for `settledWithin`: read it from the page once the
     * animation has ended (`waitForRest`). Defaults to the last frame's value,
     * which can be stale: once an accelerated animation ends while the main
     * thread is still blocked, WebKit presents the layer's last committed
     * position until the main thread commits the end state.
     */
    settledAt?: number;
    /**
     * The tracked value the page itself last set before the block, such as a
     * drag's last position at its release. It is in the tracked box's
     * coordinates: where the box sits at rest, plus the offset the page wrote.
     * A hold that starts before the block and ends at its first presented
     * change can be a late hand-off. It is one only when it holds this value,
     * where the animation starts. Without it, or when the hold shows another
     * value, the hold is judged as a stall. An animation can freeze at the
     * block's start.
     */
    setBeforeBlock?: number;
    /**
     * When the compositor presented each frame, epoch ms on the page clock
     * (`startCompositorTrace`; Chromium). Empty or absent, the screencast is
     * judged alone.
     */
    presented?: readonly number[];
    /**
     * The control's frames (`startBusyControl`, tracked from the same
     * screencast with `CONTROL_RGB`): judge the component against them.
     */
    control?: readonly TrackedFrame[];
    /**
     * With a control: judge every frame the control moved on by the
     * component's own step. A frame the cast could not show that step on
     * (`belowStep`) is then too little to judge, and `busyWindowProof` throws
     * `BusyFrameUnjudgedError`. Such a frame is never a pass, and never a red
     * on the component.
     */
    judgeEveryFrame?: boolean;
  } = {},
): {
  proof: BusyProof;
  starvation: FrameShortfall | null;
  unjudged: readonly UnjudgedFrame[];
} {
  let end = window.to - marginMs;
  if (settledWithin != null && settledWithinSteps != null) {
    throw new Error(
      'busyWindowProof: give settledWithin or settledWithinSteps, not both',
    );
  }
  // A sub-pixel read (`trackMarker` with `subpixel`) shows changes far under
  // a pixel. There a change counts from half its step; on a whole-pixel read,
  // from 0.25 px.
  const readStepPx = tracked.some(f => f.step != null)
    ? castStep(tracked, axis)
    : null;
  const subpixelStepPx =
    readStepPx != null && readStepPx < 0.5 ? readStepPx : null;
  const epsilon = subpixelStepPx == null ? 0.25 : subpixelStepPx / 2;
  // The cast's own position step, for a proof that bounds its settle in it.
  const castStepPx =
    settledWithinSteps == null ? null : castStep(tracked, axis);
  const settledWithinPx =
    settledWithinSteps == null || castStepPx == null
      ? settledWithin
      : settledWithinSteps * castStepPx;
  if (settledWithinPx != null) {
    const valued = tracked.flatMap(f =>
      f.box == null ? [] : [{t: f.t, value: f.box[axis]}],
    );
    const final =
      settledAt ?? (valued.length > 0 ? valued[valued.length - 1].value : null);
    const arrived = valued.find(
      f =>
        f.t >= window.from &&
        final != null &&
        Math.abs(f.value - final) <= settledWithinPx,
    );
    if (arrived != null) {
      end = Math.min(end, arrived.t);
    }
    // A sparse screencast can deliver the block's first frame after the
    // judged part begins. Then the frame before the block shows the settle,
    // when it and the block's first frame are both within the bound.
    let before: (typeof valued)[number] | undefined;
    for (const f of valued) {
      if (f.t >= window.from) {
        break;
      }
      before = f;
    }
    const firstInBlock = valued.find(f => f.t >= window.from);
    const settledBy =
      arrived != null && arrived.t <= window.from + marginMs
        ? arrived.t
        : before != null &&
            arrived != null &&
            arrived === firstInBlock &&
            final != null &&
            Math.abs(before.value - final) <= settledWithinPx
          ? before.t
          : null;
    // Within the bound of where it ends before the judged part began: the
    // block started after the motion had settled, so the window holds
    // nothing to judge. That is when the block ran, not how the component
    // moved.
    if (settledBy != null) {
      const presented = tracked.filter(
        f => f.t >= window.from && f.t <= window.to,
      ).length;
      const fromBlock = settledBy - window.from;
      const when =
        fromBlock < 0
          ? `${(-fromBlock).toFixed(0)} ms before`
          : `${fromBlock.toFixed(0)} ms after`;
      throw new BusyWindowTooLateError(
        `busyWindowProof: the tracked ${axis} was within ${settledWithinPx} px of where it ends from ${when} the block began, before the judged part began at ${marginMs} ms (${presented} frames presented in the block): the block started after the motion had settled, so there is nothing in it to judge. Start the block earlier.`,
        {
          settledAtMs: fromBlock,
          judgedFromMs: marginMs,
          presented,
        },
      );
    }
  }
  // A held curve that keeps no end value can end inside the block. WebKit's
  // compositor then presents the value the main thread last committed, not
  // the animation. So the judged part ends at the curve's end, unless a
  // settle bound already ends it where the motion arrives.
  const heldCurve = (window as Partial<BlockedWindow>).animation;
  const curveEnd =
    heldCurve?.holds === false && settledWithinPx == null
      ? heldCurve.to
      : undefined;
  const endsInBlock = curveEnd != null && curveEnd < end;
  const curveTooLate = (framesLeft: number) => {
    const presented = tracked.filter(
      f => f.t >= window.from && f.t <= window.to,
    ).length;
    const curveEndMs = (curveEnd ?? end) - window.from;
    return new BusyWindowTooLateError(
      `busyWindowProof: the held animation's curve ended ${curveEndMs.toFixed(0)} ms after the block began, so the part judged from ${marginMs} ms held ${framesLeft} of the frames it needs, ${minJudgedFrames} (${presented} frames presented in the block): the block started late for the motion. Start the block earlier, or play a longer curve.`,
      {curveEndMs, judgedFromMs: marginMs, presented},
    );
  };
  // Where judging would end without the curve's end.
  const endWithoutCurve = end;
  if (curveEnd != null && endsInBlock) {
    if (curveEnd <= window.from + marginMs) {
      throw curveTooLate(0);
    }
    end = curveEnd;
  }
  const inner = {from: window.from + marginMs, to: end};
  const values = tracked
    .filter(f => f.t >= inner.from && f.t <= inner.to)
    .map(f => ({t: f.t, value: f.box == null ? null : f.box[axis]}));
  const before = [...tracked].reverse().find(f => f.t < inner.from);
  let previous: number | null = before?.box == null ? null : before.box[axis];
  const inWindow: number[] = [];
  for (const v of values) {
    if (
      v.value != null &&
      previous != null &&
      Math.abs(v.value - previous) > epsilon
    ) {
      inWindow.push(v.t);
    }
    if (v.value != null) {
      previous = v.value;
    }
  }
  // Seen at rest before the judged part: a frame there, and no change in the
  // `BUSY_PROOF_LOOKAROUND_MS` before it. The first presented change is then
  // the animation's on-screen start, and judging starts there. With no frame
  // before, nothing is known, and the window is judged from its start.
  const prior = tracked.filter(f => f.box != null && f.t < inner.from);
  let leadFrom = 0;
  prior.forEach((f, i) => {
    if (f.t < inner.from - BUSY_PROOF_LOOKAROUND_MS) {
      leadFrom = i;
    }
  });
  const lead = prior.flatMap(f => (f.box == null ? [] : [f.box[axis]]));
  const movedBefore = lead.some(
    (value, i) => i > leadFrom && Math.abs(value - lead[i - 1]) > epsilon,
  );
  // Held from before the block to its first presented change inside it: in
  // WebKit a just-started compositor animation is presented late (a sheet's
  // release held on screen for 130 to 300 ms while its timeline ran, and the
  // screencast reaches Node about 0.7 s late on a loaded runner, too late to
  // wait on before blocking), so a hold that STARTS before the block is the
  // engine's, and judging starts at that first change. Only such a hold: from
  // that change on every frame is judged, so a freeze later in the block
  // still fails. The hold shows on two frames at least, the first before the
  // block.
  let holdStart = lead.length - 1;
  while (
    holdStart > 0 &&
    Math.abs(lead[holdStart - 1] - lead[lead.length - 1]) <= epsilon
  ) {
    holdStart -= 1;
  }
  const heldFrames =
    lead.length -
    holdStart +
    values.filter(
      v =>
        v.value != null &&
        v.t < (inWindow[0] ?? -Infinity) &&
        Math.abs(v.value - lead[lead.length - 1]) <= epsilon,
    ).length;
  // A late hand-off holds the page's last position. An animation that froze
  // at the block's start holds a position of its own. Within one cast step:
  // WebKit's cast reads positions on a 2 px grid, so a held position can read
  // up to a step off. A cast with no step is read within a pixel, and a
  // sub-pixel read within half a pixel.
  const matchPx = subpixelStepPx != null ? 0.5 : (readStepPx ?? 1);
  const heldFromBeforeBlock =
    setBeforeBlock != null &&
    lead.length > 0 &&
    holdStart > 0 &&
    prior[holdStart].t < window.from &&
    heldFrames >= 2 &&
    Math.abs(lead[lead.length - 1] - setBeforeBlock) <= matchPx;
  // Off screen before the judged part, as a card that enters from an edge:
  // the cast's frames there show the screen without it. Its first position
  // inside the part is then its on-screen start, and judging starts there.
  // With no frame before at all, nothing is known. A main-thread entrance
  // shows no frame during the block, so it has no such position.
  const shownWithout = tracked.some(
    f =>
      f.box == null &&
      f.t < inner.from &&
      f.t >= inner.from - BUSY_PROOF_LOOKAROUND_MS,
  );
  const firstShown = values.find(v => v.value != null);
  const entersAt =
    prior.length === 0 && shownWithout && firstShown != null
      ? firstShown.t
      : null;
  const onScreenFrom =
    prior.length > 0 &&
    (!movedBefore || heldFromBeforeBlock) &&
    inWindow.length > 0
      ? inWindow[0]
      : entersAt;
  const judged = {from: onScreenFrom ?? inner.from, to: inner.to};
  const changes = inWindow.filter(t => t > judged.from || onScreenFrom == null);
  const edges = [judged.from, ...changes, judged.to];
  const around = tracked
    .filter(
      f =>
        f.t >= inner.from - BUSY_PROOF_LOOKAROUND_MS &&
        f.t <= inner.to + BUSY_PROOF_LOOKAROUND_MS,
    )
    .map(f => f.t);
  const intervals = around
    .slice(1)
    .map((t, i) => t - around[i])
    .sort((a, b) => a - b);
  const stats = frameStats(
    tracked.map(f => ({t: f.t, value: f.box == null ? null : f.box[axis]})),
    judged,
    epsilon,
  );
  const cadence =
    intervals.length >= 4
      ? intervals[Math.floor(intervals.length / 2)]
      : stats.medianFrameMs || 1000 / 60;
  // The compositor's own frames, when recorded: its interval, from the frames
  // around the judged part.
  const draws = [...(presented ?? [])]
    .filter(
      t =>
        t >= judged.from - BUSY_PROOF_LOOKAROUND_MS &&
        t <= judged.to + BUSY_PROOF_LOOKAROUND_MS,
    )
    .sort((a, b) => a - b);
  const drawIntervals = draws
    .slice(1)
    .map((t, i) => t - draws[i])
    .sort((a, b) => a - b);
  const compositorFrameMs =
    drawIntervals.length >= 4
      ? drawIntervals[Math.floor(drawIntervals.length / 2)]
      : null;
  const changed = new Set(inWindow);
  const delivered = tracked
    .filter(f => f.box != null && f.t > judged.from && f.t < judged.to)
    .map(f => f.t);
  // Each gap between presented changes, in intervals of the channel that saw
  // it: the screencast's, or, for a gap between two moved frames with no
  // frame delivered inside it, the compositor's own longest interval there.
  const gaps = edges.slice(1).map((to, i) => {
    const from = edges[i];
    const ms = to - from;
    if (
      compositorFrameMs == null ||
      !changed.has(from) ||
      !changed.has(to) ||
      delivered.some(t => t > from && t < to)
    ) {
      return {from, ms, frames: Math.round(ms / cadence), skipped: 0};
    }
    const span = draws.filter(
      t => t > from - compositorFrameMs / 2 && t < to + compositorFrameMs / 2,
    );
    const longest =
      span.length >= 2
        ? Math.min(ms, Math.max(...span.slice(1).map((t, j) => t - span[j])))
        : ms;
    const frames = Math.round(longest / compositorFrameMs);
    return {
      from,
      ms: longest,
      frames,
      skipped: Math.max(0, Math.round(ms / compositorFrameMs) - frames),
    };
  });
  const longestGap = gaps.reduce((a, b) =>
    b.frames > a.frames || (b.frames === a.frames && b.ms > a.ms) ? b : a,
  );
  const longestStallMs = longestGap.ms;
  // Where the longest stall starts, from the start of the window.
  const longestStallAtMs = longestGap.from - window.from;
  const longestStallFrames = longestGap.frames;
  const skips = gaps.filter(g => g.skipped > 0);
  const recorderSkipped = skips.reduce((sum, g) => sum + g.skipped, 0);
  // With a compositor record, frames count in its intervals, and the frames
  // it presented where the screencast skipped are presented frames.
  const expectedFrames = Math.floor(
    (judged.to - judged.from) / (compositorFrameMs ?? cadence),
  );
  const moved = changes.length;
  // The frames judged for motion: the screencast's own frames in the judged
  // part (each `changes` entry is one of them), or, with a compositor record,
  // the compositor's frames from the first to the last moved frame (the gaps
  // before and after them are the stall check's). After an on-screen start
  // they count from the on-screen frame, which `changes` leaves out, so the
  // frames credited as skipped after it are judged too. A part that moved
  // nothing, or delivered fewer than `minJudgedFrames` frames, is judged
  // against its span, so a frozen animation misses here too (one late frame
  // from before the block is not 1/1 moved).
  const deliveredFrames = tracked.filter(
    f =>
      f.box != null &&
      (onScreenFrom == null ? f.t >= judged.from : f.t > judged.from) &&
      f.t <= judged.to,
  ).length;
  const judgedFrames =
    compositorFrameMs != null
      ? changes.length > 0
        ? Math.round(
            (changes[changes.length - 1] - (onScreenFrom ?? changes[0])) /
              compositorFrameMs,
          ) + (onScreenFrom == null ? 1 : 0)
        : expectedFrames
      : deliveredFrames < minJudgedFrames
        ? expectedFrames
        : deliveredFrames;
  const movedFraction = (moved + recorderSkipped) / Math.max(1, judgedFrames);
  // The cast's position step for the tracked value, read from the judged
  // part. A sub-pixel read carries its own.
  const stepPx =
    subpixelStepPx ??
    motionStepPx(
      tracked.flatMap(f =>
        f.box != null && f.t >= judged.from && f.t <= judged.to
          ? [f.box[axis]]
          : [],
      ),
    );
  const judgedValues = tracked.flatMap(f =>
    f.box != null && f.t >= judged.from && f.t <= judged.to
      ? [{t: f.t, value: f.box[axis]}]
      : [],
  );
  const first = judgedValues[0];
  const last = judgedValues[judgedValues.length - 1];
  const pxPerFrame =
    first == null || last == null || last.t <= first.t
      ? 0
      : Math.abs(last.value - first.value) / ((last.t - first.t) / cadence);
  const notes: string[] = [];
  if (presented != null && compositorFrameMs == null) {
    notes.push(
      'no compositor frames recorded around the window: judged from the screencast alone',
    );
  }
  if (recorderSkipped > 0) {
    notes.push(
      `the screencast skipped ${recorderSkipped} frames the compositor presented (at ${skips.map(g => `+${(g.from - window.from).toFixed(0)} ms`).join(', ')})`,
    );
  }
  // Read over a few frames at a time, not the whole part: a fast window can
  // end in a slow tail whose frames the cast cannot all show.
  for (const stretch of slowStretches(judgedValues, cadence, 2 * stepPx)) {
    notes.push(
      `${stretch.pxPerFrame.toFixed(1)} px/frame is under two of the cast's ${stepPx} px position steps from +${(stretch.from - window.from).toFixed(0)} ms to +${(stretch.to - window.from).toFixed(0)} ms: a frame delivered early there can show no step and read as not moved`,
    );
  }
  // The control's own new positions in the judged part, against its frame
  // before the part, and of those the frames the component moved on too:
  // both are tracked from the same screencast frames, so their times match.
  // The times of the control's new positions in the judged part, up to `to`.
  const controlChangesUpTo = (
    frames: readonly TrackedFrame[],
    to: number,
  ): number[] => {
    const baseline = [...frames]
      .reverse()
      .find(f => f.box != null && f.t < inner.from);
    let last: number | null = baseline?.box == null ? null : baseline.box.x;
    const changes: number[] = [];
    for (const f of frames) {
      if (f.box == null || f.t < inner.from || f.t > to) {
        continue;
      }
      if (last != null && Math.abs(f.box.x - last) > 0.25) {
        if (f.t > judged.from || onScreenFrom == null) {
          changes.push(f.t);
        }
      }
      last = f.box.x;
    }
    return changes;
  };
  let controlRead: BusyControlRead | null = null;
  let unjudged: UnjudgedFrame[] = [];
  if (control != null) {
    const controlChanges = controlChangesUpTo(control, judged.to);
    const controlEdges = [judged.from, ...controlChanges, judged.to];
    // A frame with no new component position, in a run of such frames whose
    // next change the cast's step or an early frame explains (`underStep`):
    // the cast cannot show every frame there, so the frame counts as moved.
    // A freeze ends in a larger catch-up, and a run that no change ends stays
    // a miss.
    const series = tracked.flatMap(f =>
      f.box == null ? [] : [{t: f.t, value: f.box[axis]}],
    );
    const seriesIndex = new Map(series.map((f, i) => [f.t, i]));
    const same = (a: number, b: number) =>
      Math.abs(series[a].value - series[b].value) <= epsilon;
    // The first frame of the run of equal positions that holds frame i.
    const runStart = (i: number): number => {
      let s = i;
      while (s > 0 && same(s - 1, i)) {
        s -= 1;
      }
      return s;
    };
    // The first frame after that run: the change that ends it, or the
    // series' length when no change does.
    const runEnd = (i: number): number => {
      let k = i + 1;
      while (k < series.length && same(k, i)) {
        k += 1;
      }
      return k;
    };
    // The component's motion per frame over up to four frames before frame
    // `start`, or null with fewer than two to read.
    const pxPerFrameBefore = (start: number): number | null => {
      const back = Math.min(4, start);
      if (back < 2) {
        return null;
      }
      const frames = (series[start].t - series[start - back].t) / cadence;
      return frames > 0
        ? Math.abs(series[start].value - series[start - back].value) / frames
        : null;
    };
    // The component's motion per frame over up to four frames after frame
    // `end`, or null with fewer than two to read.
    const pxPerFrameAfter = (end: number): number | null => {
      const ahead = Math.min(4, series.length - 1 - end);
      if (ahead < 2) {
        return null;
      }
      const frames = (series[end + ahead].t - series[end].t) / cadence;
      return frames > 0
        ? Math.abs(series[end + ahead].value - series[end].value) / frames
        : null;
    };
    const underStep = (t: number): boolean => {
      const i = seriesIndex.get(t);
      if (i == null || changed.has(t)) {
        return false;
      }
      const start = runStart(i);
      const k = runEnd(i);
      if (k >= series.length) {
        return false;
      }
      const unchanged = k - 1 - start;
      // Under one step a frame the change that ends the run is a single step.
      // Under two, a frame delivered early can also show no step. The change
      // then carries the motion of every frame the run held, to the nearest
      // step, at the pace before the run or across it. An early frame hides
      // one frame's motion. At one step a frame or more, the run is one frame
      // long. Under one step a frame, it adds at most one step to the
      // catch-up.
      const catchUp = Math.abs(series[k].value - series[i].value);
      // Two readings give the pace at the run, and either can explain the
      // run. One is the component's motion over the frames before the run.
      // The other is its catch-up across the run itself, from the run's start
      // to the change. The run's own reading counts where the curve slows
      // faster than the frames before it show. It also counts where a loaded
      // runner stamps those frames unevenly, whatever the settle bound. A
      // freeze still fails. Its run is longer than one frame at a step a frame
      // or more. At a steady pace of two steps a frame, its catch-up carries
      // two frames of that pace.
      const paceBefore = pxPerFrameBefore(start);
      const runFrames = (series[k].t - series[start].t) / cadence;
      const explains = (pace: number | null): boolean =>
        pace != null &&
        pace < 2 * stepPx &&
        (pace < stepPx ? catchUp < 2.5 * stepPx : unchanged <= 1) &&
        catchUp <= (unchanged + 1) * pace + stepPx;
      const shown =
        catchUp < 1.5 * stepPx ||
        explains(paceBefore) ||
        (paceBefore != null && runFrames > 0 && explains(catchUp / runFrames));
      if (!shown) {
        return false;
      }
      // Under one step a frame, a proof that bounds its settle in the cast's
      // own steps reads the run against the cast: the position changes about
      // every step ÷ pace frames, so a run shows one position for at most
      // ceil(step ÷ pace) frames, and a frame delivered early adds one. Only a
      // longer run is a stall, whatever the run before it was.
      // Here the pace is the travel at the run. It is the slower of the moving
      // paces around it, and never less than the run's catch-up per frame. A pace of 0 after the change is the settled plateau, not
      // motion. So a long hold near rest still fails: the motion before it
      // bounds how long one position may show.
      const moving = [paceBefore, pxPerFrameAfter(k)].filter(
        (value): value is number => value != null && value > 0,
      );
      const travel =
        moving.length === 0
          ? null
          : Math.max(
              Math.min(...moving),
              runFrames > 0 ? catchUp / runFrames : 0,
            );
      if (castStepPx != null && travel != null && travel < castStepPx) {
        // The ratio is read to a millionth: a pace of 0.5 that sums to
        // 0.4999… still allows two frames, not three.
        const allowed = Math.ceil(castStepPx / travel - 1e-6);
        // A slow tail after the run sets no allowance of its own. So the run
        // may last at most one frame more than the pace into it allows.
        const into = Math.max(
          paceBefore ?? 0,
          runFrames > 0 ? catchUp / runFrames : 0,
        );
        const cap =
          into > 0
            ? Math.ceil(castStepPx / into - 1e-6) + 1
            : Number.POSITIVE_INFINITY;
        return unchanged <= Math.min(allowed, cap);
      }
      // A slowing curve lengthens its runs a frame at a time: a run more than
      // one frame longer than the one before it is a stall.
      const before = start > 0 ? start - 1 - runStart(start - 1) : 0;
      return unchanged <= before + 1;
    };
    const componentEdges = [
      judged.from,
      ...delivered.filter(t => changed.has(t) || underStep(t)),
      judged.to,
    ];
    const excused = controlChanges.filter(underStep);
    if (judgeEveryFrame) {
      unjudged = excused.map(t => {
        const i = seriesIndex.get(t);
        if (i == null) {
          throw new Error(
            'busyWindowProof: an excused frame is missing from the series',
          );
        }
        const start = runStart(i);
        const k = runEnd(i);
        const runFrames = (series[k].t - series[start].t) / cadence;
        return {
          atMs: t - window.from,
          movePx:
            Math.abs(series[k].value - series[i].value) /
            Math.max(1, runFrames),
          stepPx,
        };
      });
    }
    controlRead = {
      moved: controlChanges.length,
      movedWith: controlChanges.filter(t => changed.has(t) || underStep(t))
        .length,
      belowStep: excused.length,
      longestStallMs: Math.max(
        ...controlEdges.slice(1).map((t, i) => t - controlEdges[i]),
      ),
      componentStallMs: Math.max(
        ...componentEdges.slice(1).map((t, i) => t - componentEdges[i]),
      ),
    };
  }
  // The curve's end left too little to judge only when the part up to the
  // block's end would have held enough. Otherwise the run fails as before,
  // as starvation when the cast was starved.
  if (endsInBlock) {
    const framesLeft = controlRead?.moved ?? expectedFrames;
    const framesWithoutCurve =
      control == null
        ? Math.floor(
            (endWithoutCurve - judged.from) / (compositorFrameMs ?? cadence),
          )
        : controlChangesUpTo(control, endWithoutCurve).length;
    if (framesLeft < minJudgedFrames && framesWithoutCurve >= minJudgedFrames) {
      throw curveTooLate(framesLeft);
    }
  }
  const failures: string[] = [];
  let starvation: FrameShortfall | null = null;
  if (stats.frames === 0 && controlRead == null) {
    failures.push('no frame presented in the judged part');
  } else if (stats.medianFrameMs > maxMedianFrameMs) {
    failures.push(
      `median frame interval ${stats.medianFrameMs.toFixed(1)} ms > ${maxMedianFrameMs} ms (${stats.frames} frames presented)`,
    );
  }
  if (controlRead != null) {
    if (controlRead.moved < minJudgedFrames) {
      // How starved the cast was over the whole block, as the pacing and
      // frame errors say it. Every frame the cast delivered counts, with the
      // component on screen or not.
      const blockFrames = tracked
        .filter(f => f.t > window.from && f.t < window.to)
        .map(f => f.t);
      const castEdges = [window.from, ...blockFrames, window.to];
      const castGapMs = Math.max(
        ...castEdges.slice(1).map((t, k) => t - castEdges[k]),
      );
      // The control is a compositor animation: when it moved too little and
      // no frame came for that long, the machine starved the run.
      if (castGapMs > FRAME_STARVATION_MS) {
        starvation = {
          by: 'busyWindowProof',
          during: `a ${Math.round(window.to - window.from)} ms block held the main thread, and the control moved on ${controlRead.moved} of them`,
          frames: blockFrames.length,
          min: minJudgedFrames,
          longestGapMs: castGapMs,
        };
      }
      failures.push(
        `the control moved on ${controlRead.moved} frames in the judged part, under ${minJudgedFrames}: the compositor presented too little in this window to judge (the cast delivered ${blockFrames.length} frame${blockFrames.length === 1 ? '' : 's'} in the ${Math.round(window.to - window.from)} ms block, none for ${Math.round(castGapMs)} ms)`,
      );
    }
    const visible = controlRead.movedWith - controlRead.belowStep;
    if (visible < minJudgedFrames) {
      failures.push(
        `the component showed a new position on ${visible} of the control's frames, under ${minJudgedFrames}: too little motion in this window to judge`,
      );
    }
    if (controlRead.movedWith < controlRead.moved) {
      failures.push(
        `moved on ${controlRead.movedWith} of the ${controlRead.moved} frames the control moved (${((controlRead.movedWith / Math.max(1, controlRead.moved)) * 100).toFixed(0)}%)`,
      );
    }
    if (controlRead.componentStallMs > controlRead.longestStallMs) {
      failures.push(
        `longest stall ${controlRead.componentStallMs.toFixed(1)} ms, longer than the control's ${controlRead.longestStallMs.toFixed(1)} ms`,
      );
    }
  } else if (longestStallFrames > maxStallFrames) {
    failures.push(
      `longest stall ${longestStallMs.toFixed(1)} ms = ${longestStallFrames} intervals > ${maxStallFrames}`,
    );
  }
  if (controlRead == null && expectedFrames < minJudgedFrames) {
    failures.push(
      `${(judged.to - judged.from).toFixed(0)} ms judged = ${expectedFrames} frames < ${minJudgedFrames}: the animation under test was not moving during the block`,
    );
  }
  const allowedMisses = Math.max(
    1,
    Math.floor((1 - minMovedFraction) * judgedFrames + 1e-9),
  );
  if (
    controlRead == null &&
    judgedFrames - moved - recorderSkipped > allowedMisses
  ) {
    failures.push(
      `${moved} of ${judgedFrames} expected frames moved${recorderSkipped > 0 ? ` (and ${recorderSkipped} the screencast skipped)` : ''} (${(movedFraction * 100).toFixed(0)}% < ${(minMovedFraction * 100).toFixed(0)}%)`,
    );
  }
  const onScreenFromMs =
    onScreenFrom == null ? null : onScreenFrom - window.from;
  const summary =
    `${(judged.to - judged.from).toFixed(0)} ms judged at ${cadence.toFixed(1)} ms/frame: ${stats.frames} frames presented, ` +
    `${moved}/${judgedFrames} moved${recorderSkipped > 0 ? ` and ${recorderSkipped} skipped by the screencast` : ''} (${(movedFraction * 100).toFixed(0)}%), ` +
    `median ${stats.medianFrameMs.toFixed(1)} ms, ` +
    `longest stall ${longestStallMs.toFixed(1)} ms (${longestStallFrames} intervals) at +${longestStallAtMs.toFixed(0)} ms, ` +
    `${stats.monotonic ? 'monotonic' : 'not monotonic'}, ` +
    `${pxPerFrame.toFixed(1)} px/frame in ${stepPx} px steps` +
    (compositorFrameMs == null
      ? ''
      : `, compositor presenting every ${compositorFrameMs.toFixed(1)} ms`) +
    (onScreenFromMs == null
      ? ''
      : `, on screen from +${onScreenFromMs.toFixed(0)} ms (${entersAt == null ? 'nothing moved before the block' : 'off screen before the block'})`) +
    (endsInBlock
      ? `, judged to the held curve's end at +${(end - window.from).toFixed(0)} ms`
      : '') +
    (controlRead == null
      ? ''
      : `; against the control: moved on ${controlRead.movedWith} of its ${controlRead.moved} frames${controlRead.belowStep > 0 ? ` (${controlRead.belowStep} where the cast could not show the step)` : ''}, its longest stall ${controlRead.longestStallMs.toFixed(1)} ms`) +
    notes.map(note => `; note: ${note}`).join('');
  const proof = {
    ...stats,
    window,
    judged,
    onScreenFromMs,
    stepPx,
    pxPerFrame,
    notes,
    recorderSkipped,
    compositorFrameMs,
    cadenceMs: cadence,
    longestStallMs,
    longestStallAtMs,
    expectedFrames,
    deliveredFrames,
    longestStallFrames,
    moved,
    movedFraction,
    control: controlRead,
    verdict: {pass: failures.length === 0, failures},
    summary,
  };
  return {proof, starvation, unjudged};
}

/** One run of a pooled busy proof (see `pooledBusyProof`). */
export interface BusyRun {
  /** The component's frames, tracked from the run's screencast. */
  readonly tracked: readonly TrackedFrame[];
  /** The control's frames (`startBusyControl`), from the same screencast. */
  readonly control: readonly TrackedFrame[];
  /** The run's block (`blockMainThread`). */
  readonly window: BusyWindow;
  /** The control started `ahead`, from the same screencast (see `busyWindowProof`). */
  readonly ahead?: readonly TrackedFrame[];
  /** When the run's controls started (see `busyWindowProof`). */
  readonly controlStarts?: readonly [number, number?];
}

export interface PooledBusyProof {
  /**
   * Each run judged on its own against its control: read its numbers, not its
   * verdict (one short run can hold too few frames to judge).
   */
  readonly runs: readonly (BusyProof | null)[];
  /**
   * For each run, the `BusyWindowTooLateError` its window threw, or null. Such
   * a run's block began after its motion had settled, so its `runs` entry is
   * null: the run holds nothing to judge.
   */
  readonly late: readonly (BusyWindowTooLateError | null)[];
  /**
   * Whether each run was judged. A run whose control moved on fewer than
   * `minRunFrames` frames is too little to judge, and so is a run that began
   * too late (`late`). The pool leaves both out.
   */
  readonly judged: readonly boolean[];
  /**
   * The control's new positions over the judged runs' judged parts, and those
   * the component moved on too.
   */
  readonly control: {readonly moved: number; readonly movedWith: number};
  /** The judgment over the pool (see `pooledBusyProof`). */
  readonly verdict: BusyVerdict;
  /** One line with the pooled numbers, then each run's summary. */
  readonly summary: string;
}

/**
 * A busy proof over several runs of the same short animation, against the
 * control. An animation that lasts a fraction of a second leaves a block only
 * a few frames to judge: in WebKit, or on a loaded machine, the control can
 * present fewer than `minJudgedFrames` in one run, and one run cannot decide.
 * A run whose control moved on fewer than `minRunFrames` frames (1 by
 * default) is too little to judge: the machine starved it. The summary names
 * it, and the pool leaves it out, so it never counts as a pass. A run whose
 * window throws `BusyWindowTooLateError` is left out the same way: its block
 * began after its motion had settled.
 * The judged runs are judged as one long window is:
 * - at least `minJudgedRuns` runs are judged (by default, half the runs,
 *   rounded up);
 * - the control moved on at least `minJudgedFrames` frames over them;
 * - in each judged run, the component moved on every frame its control moved
 *   on, so a freeze fails its run and is never pooled. A run of unchanged
 *   frames counts as motion only where the cast cannot show the motion (see
 *   `busyWindowProof`).
 * - in each judged run, its longest stall is no longer than that run's
 *   control's.
 * `maxMedianFrameMs`, when given, applies to every run. A main-thread
 * animation still fails: in every run the control moves and it does not.
 */
export function pooledBusyProof(
  runs: readonly BusyRun[],
  options: Omit<
    NonNullable<Parameters<typeof busyWindowProof>[2]>,
    | 'control'
    | 'ahead'
    | 'controlStarts'
    | 'minMovedFraction'
    | 'judgeEveryFrame'
  > & {
    /** The fewest frames a run's control must move on for the run to count. */
    minRunFrames?: number;
    /** The fewest judged runs the pool needs. */
    minJudgedRuns?: number;
  } = {},
): PooledBusyProof {
  if (runs.length === 0) {
    throw new Error('pooledBusyProof: no runs to judge');
  }
  const {
    minRunFrames = 1,
    minJudgedRuns = Math.ceil(runs.length / 2),
    ...windowOptions
  } = options;
  const {minJudgedFrames = 4, maxMedianFrameMs = Infinity} = windowOptions;
  if (minJudgedRuns < 1 || minJudgedRuns > runs.length) {
    throw new Error(
      `pooledBusyProof: minJudgedRuns ${minJudgedRuns} is not between 1 and the ${runs.length} runs`,
    );
  }
  const late: (BusyWindowTooLateError | null)[] = [];
  const proofs = runs.map(run => {
    try {
      const {proof} = readBusyWindow(run.tracked, run.window, {
        ...windowOptions,
        control: run.control,
        ahead: run.ahead,
        controlStarts: run.controlStarts,
      });
      late.push(null);
      return proof;
    } catch (error) {
      if (!(error instanceof BusyWindowTooLateError)) {
        throw error;
      }
      late.push(error);
      return null;
    }
  });
  const reads = proofs.map(proof =>
    proof == null ? null : (proof.control as BusyControlRead),
  );
  const judged = reads.map(read => read != null && read.moved >= minRunFrames);
  const judgedReads = reads.filter(
    (read, i): read is BusyControlRead => judged[i] && read != null,
  );
  const lateRuns = late.filter(error => error != null).length;
  const total = (key: 'moved' | 'movedWith' | 'belowStep') =>
    judgedReads.reduce((sum, read) => sum + read[key], 0);
  const moved = total('moved');
  const movedWith = total('movedWith');
  const over =
    judgedReads.length === runs.length
      ? `${runs.length} runs`
      : `the ${judgedReads.length} judged runs of ${runs.length}`;
  const failures: string[] = [];
  if (judgedReads.length < minJudgedRuns) {
    failures.push(
      lateRuns === 0
        ? `${judgedReads.length} of ${runs.length} runs judged, under ${minJudgedRuns}: the compositor presented too little in the others to judge`
        : `${judgedReads.length} of ${runs.length} runs judged, under ${minJudgedRuns}: ${lateRuns} began too late for their motion, and the compositor presented too little in any other to judge`,
    );
  }
  if (judgedReads.length > 0 && moved < minJudgedFrames) {
    failures.push(
      `the control moved on ${moved} frames over ${over}, under ${minJudgedFrames}: the compositor presented too little in these windows to judge`,
    );
  }
  const visible = movedWith - total('belowStep');
  if (judgedReads.length > 0 && visible < minJudgedFrames) {
    failures.push(
      `the component showed a new position on ${visible} of the control's frames over ${over}, under ${minJudgedFrames}: too little motion in these windows to judge`,
    );
  }
  if (movedWith < moved) {
    failures.push(
      `moved on ${movedWith} of the ${moved} frames the control moved over ${over} (${((movedWith / Math.max(1, moved)) * 100).toFixed(0)}%)`,
    );
  }
  proofs.forEach((proof, i) => {
    if (proof == null) {
      return;
    }
    if (proof.frames > 0 && proof.medianFrameMs > maxMedianFrameMs) {
      failures.push(
        `run ${i + 1}: median frame interval ${proof.medianFrameMs.toFixed(1)} ms > ${maxMedianFrameMs} ms`,
      );
    }
    const read = reads[i];
    if (!judged[i] || read == null) {
      return;
    }
    if (read.movedWith < read.moved) {
      failures.push(
        `run ${i + 1}: moved on ${read.movedWith} of the ${read.moved} frames its control moved`,
      );
    }
    if (read.componentStallMs > read.longestStallMs) {
      failures.push(
        `run ${i + 1}: longest stall ${read.componentStallMs.toFixed(1)} ms, longer than the control's ${read.longestStallMs.toFixed(1)} ms`,
      );
    }
  });
  const summary =
    `${runs.length} runs pooled` +
    (judgedReads.length === runs.length
      ? ''
      : `, ${judgedReads.length} judged`) +
    `: moved on ${movedWith} of the control's ${moved} frames` +
    proofs
      .map((proof, i) =>
        proof == null
          ? `; run ${i + 1}: too late to judge: ${late[i]?.message ?? ''}`
          : judged[i]
            ? `; run ${i + 1}: ${proof.summary}`
            : `; run ${i + 1}: too little to judge, the control moved on ${reads[i]?.moved ?? 0} frames, under ${minRunFrames}: ${proof.summary}`,
      )
      .join('');
  return {
    runs: proofs,
    late,
    judged,
    control: {moved, movedWith},
    verdict: {pass: failures.length === 0, failures},
    summary,
  };
}
