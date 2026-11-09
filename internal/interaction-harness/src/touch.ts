// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touch.ts
 * @input Uses a Playwright `Page` (Chromium or WebKit) and a touch script from
 *   ./scripts
 * @output `touchDriver(page)` — plays touch scripts as REAL browser touch input
 *   — and `installInputLog` / `readInputLog`, the page-side record of what the
 *   page actually received.
 * @position The input half of every interaction proof. Untrusted DOM events
 *   are not input: they never start native scrolling, never claim a gesture,
 *   and a component can tell them apart (`isTrusted`). Both drivers here go
 *   through the engine's own input pipeline instead.
 *
 * Chromium: CDP `Input.dispatchTouchEvent` with an explicit `timestamp` per
 *   event. The page's `event.timeStamp` IS that timestamp, whatever the
 *   dispatch latency, so a velocity profile reaches the page exactly. The
 *   events go through the compositor's gesture detection: native scrolling,
 *   flings (velocity from those timestamps), `touch-action`, pointer events
 *   and `pointercancel` all behave as for a finger.
 *
 * WebKit (Playwright's Linux build): the engine's own inspector command
 *   `Input.dispatchTouchEvent` on the page proxy. Touches and the pointer
 *   events derived from them are trusted and cancelable, multi-touch works.
 *   Limits, measured with WebKit 26.5: no timestamp parameter (the page sees
 *   the real dispatch time, so velocity comes from real-time pacing: within
 *   ~1 ms on an idle runner; after a slow dispatch each step waits for its
 *   gap, less 2 ms, after WebKit answered the step before, so a stall
 *   stretches the gesture instead of bunching it, unless a `'schedule'` play
 *   watches each step, `onEvent`);
 *   integer coordinates only; no native scrolling, fling or pinch-zoom from
 *   these touches; a `touchstart` lists only the fingers that landed in it
 *   (pointer events are exact); no click synthesised from a raw touch sequence (use
 *   `tap`, which dispatches WebKit's tap gesture and does produce the
 *   compatibility mouse events and click). The command is reached through
 *   Playwright's in-process server object, so it needs a locally launched
 *   browser (the default), not a remote `connect()`.
 *
 * SYNC: Keep the engine limits above equal to the README's table and to the
 *   harness self-test (../src/harness.interaction.browser.spec.ts). Keep
 *   `coreRelease` equal to Core's filter
 *   (/packages/core/src/gestures/VelocityTracker.ts); Core's
 *   VelocityTracker.harness.test.ts compares the two.
 */

import type {CDPSession, JSHandle, Page} from '@playwright/test';
import {FRAME_STARVATION_MS} from './frame-starvation';
import {
  toTouchEvents,
  type Finger,
  type Point,
  type TouchEventStep,
  type TouchScript,
} from './scripts';
import {
  armInputRun,
  HELD_BACK_MS,
  installInputStart,
  installInputStartBeforeLoad,
  type InputRun,
} from './webInput';

export type Engine = 'chromium' | 'webkit';

/**
 * How real-time pacing catches up after a slow dispatch (`PlayOptions.pacing`):
 * `'schedule'` sends each event at its scripted time from the start, and
 * `'spacing'` its scripted interval after the event before it left. Under
 * `'spacing'` an event also waits for its interval, less ANSWER_SLACK_MS,
 * after the engine answered the event before. WebKit stamps a touch no later
 * than its answer, so a stall stretches the gesture instead of bunching it.
 * A WebKit `'schedule'` play waits for the answer too.
 */
export type TouchPacing = 'schedule' | 'spacing';

/**
 * The answer time, ms, under which a touch play keeps the script's spacing
 * exactly; a slower answer stretches the next gap. A page that stamps
 * touches on arrival reads no gap shorter than the script's by more than
 * this (see `pacedDeadline`).
 */
export const ANSWER_SLACK_MS = 2;

/**
 * The release filter's stillness interval, 40 ms: a contact that has not
 * moved for longer than this before it lifts releases at 0.
 *
 * SYNC: Keep equal to `UIKIT_VELOCITY.stillness` in
 *   packages/core/src/motion/uikit/gestures.ts.
 */
export const TOUCH_STILLNESS_MS = 40;

/**
 * The newest move's share of the release velocity; the move before it
 * carries the rest.
 *
 * SYNC: Keep equal to `UIKIT_VELOCITY.currentWeight` in
 *   packages/core/src/motion/uikit/gestures.ts.
 */
export const TOUCH_RELEASE_NEWEST_WEIGHT = 0.2;

/**
 * The newest pan value's share of a scrolling surface's release, such as a
 * pager's; the pan value before it carries the rest (`PlayOptions.release`).
 *
 * SYNC: Keep equal to `UIKIT_VELOCITY.scrollReleaseWeight` in
 *   packages/core/src/motion/uikit/gestures.ts.
 */
export const TOUCH_SCROLL_RELEASE_NEWEST_WEIGHT = 0.25;

/**
 * Which of Core's release filters a page reads (`PlayOptions.release`): a
 * dragged surface's (`'pan'`) or a scrolling surface's, such as a pager's
 * (`'scroll'`).
 */
export type TouchReleaseFilter = 'pan' | 'scroll';

export interface PlayOptions {
  /**
   * Pace dispatch on the wall clock so each event leaves at its scripted time
   * (default true). Required in WebKit for a velocity to mean anything; in
   * Chromium the page sees the scripted timestamps either way, but native
   * behaviors that run on the compositor clock (a fling) want real pacing.
   */
  readonly realtime?: boolean;
  /**
   * How real-time pacing catches up after a slow dispatch (default
   * `'schedule'`; see `TouchPacing`). A proof whose result depends on a
   * release velocity (a flick, a coast) passes `'spacing'`: on a driver
   * without scripted timestamps the page reads the velocity from when events
   * arrive, and `'spacing'` keeps each gap from the event before even in a
   * play that watches each step. There, a paced play reads the release as
   * the page did once its last event is out (the lift's
   * `PlayedEvent.release`). It throws when the
   * page read a resting finger where the script moves, a throw where the
   * script rests, or fewer than two moves. Given `releaseTolerance`, it also
   * throws when the page's release strays further than that share. The error
   * is `TouchLiftStallError` when the play's own `onEvent` held the lift back.
   * It is `TouchPageStallError` when the page's own touch and pointer
   * listeners held an event back. It is `TouchStarvationError` when the page
   * drew no frame across the late gap and no page work held the event, else
   * `TouchPacingError` (see `touchPacingFault`). A `'spacing'` play also
   * throws when the page received fewer touch events than it sent; any other
   * play is then not judged.
   */
  readonly pacing?: TouchPacing;
  /**
   * How far the page's release may stray from the script's, as a share of
   * it, before a paced play fails. WebKit delivers touches at its own
   * cadence, so the release a page reads strays widely from a fast script's:
   * a proof that depends on the exact release gives one; a proof that only
   * needs a throw reads the page's release from the lift.
   */
  readonly releaseTolerance?: number;
  /**
   * The proof reads no release from this play's lift, such as a pinch's end
   * (default false). Then the play does not judge the release its page read
   * (see `pacing`).
   */
  readonly releaseUnread?: boolean;
  /**
   * Which release the page reads (default `'pan'`, a dragged surface's). A
   * scrolling surface, such as a pager, reads `'scroll'`: Core's
   * `scrollVelocity` blends the newest pan value with the one before it.
   */
  readonly release?: TouchReleaseFilter;
  /**
   * The thresholds the component under test decides on: a release speed it
   * pages from (`releasePxPerS`), a hold it catches after (`holdMs`). The
   * play fails by name when the page read the release on the other side of
   * a threshold from the script. The first finger's hold from touch-down to
   * lift fails the same way. Then the proof never judges a gesture the page
   * did not receive. Only a driver whose page stamps touches on arrival
   * (WebKit) judges them.
   */
  readonly boundaries?: {
    readonly releasePxPerS?: number;
    readonly holdMs?: number;
  };
  /**
   * Called after each event is dispatched, before the next one (storyboards).
   * The next event waits for it, so page work here delays that event by a
   * round trip. On a page that stamps touches on arrival, that delay before a
   * lift can read as a resting finger. Record what the page did in a listener
   * of its own instead.
   */
  readonly onEvent?: (
    step: TouchEventStep,
    index: number,
  ) => Promise<void> | void;
}

export interface PlayedEvent extends TouchEventStep {
  /** Wall-clock milliseconds (epoch) at which the event was dispatched. */
  readonly dispatchedAt: number;
  /**
   * Wall-clock milliseconds (epoch) at which the dispatch command returned:
   * the page has the event by then.
   */
  readonly returnedAt: number;
  /** The timestamp handed to the engine, epoch ms (Chromium only). */
  readonly timestamp: number | null;
  /**
   * On a paced play's lift, where the page reads arrival times: the release
   * the page read and the script's, px/s.
   */
  readonly release?: {
    readonly pagePxPerS: number;
    readonly scriptPxPerS: number;
  };
}

export interface TouchDriver {
  readonly engine: Engine;
  /** True when the page's `event.timeStamp` follows the script exactly. */
  readonly scriptedTimestamps: boolean;
  /** True when these touches can scroll, fling and pinch-zoom natively. */
  readonly drivesNativeGestures: boolean;
  /**
   * True when lifting one finger while others stay down reaches the page as
   * iOS sends it: a `touchend` whose `touches` still lists the fingers down.
   * Skip such proofs with `PARTIAL_LIFT_SKIP` where it is false.
   */
  readonly partialLifts: boolean;
  /** Plays a script; resolves when its last event has been dispatched. */
  play(script: TouchScript, options?: PlayOptions): Promise<PlayedEvent[]>;
  /** A tap through the engine's tap path (WebKit synthesises click only from this). */
  tap(at: Point): Promise<void>;
  /**
   * Puts a finger down at `at` and keeps it there: only the touch-down is
   * sent, as a play's first step. The finger moves and lifts through the
   * handle, each call one event. Its timing is the caller's, so it is never
   * judged for pacing. A lift that `holdInputUntil` places then races the
   * hold alone, after the page is thawed.
   */
  press(at: Point, options?: {readonly id?: number}): Promise<HeldTouch>;
}

/** A finger that `TouchDriver.press` holds down. */
export interface HeldTouch {
  readonly id: number;
  /** Moves the finger to `to`; every other finger held stays where it is. */
  move(to: Point): Promise<void>;
  /** Lifts the finger: only its touch-up is sent. */
  lift(): Promise<void>;
}

/**
 * The fingers a driver holds down between calls. `dispatch` sends one event
 * with the finger that changed and every finger down after it.
 */
function heldFingers(
  dispatch: (
    type: TouchEventStep['type'],
    changed: Finger,
    down: readonly Finger[],
  ) => Promise<void>,
) {
  const down = new Map<number, Finger>();
  return {
    get size() {
      return down.size;
    },
    async press(at: Point, {id = 0}: {readonly id?: number} = {}) {
      if (down.has(id)) {
        throw new Error(`touchDriver: finger ${id} is already down`);
      }
      const finger = {id, x: at.x, y: at.y};
      down.set(id, finger);
      await dispatch('touchStart', finger, [...down.values()]);
      let lifted = false;
      const live = () => {
        if (lifted) {
          throw new Error(`touchDriver: finger ${id} was lifted`);
        }
      };
      const held: HeldTouch = {
        id,
        async move(to) {
          live();
          const moved = {id, x: to.x, y: to.y};
          down.set(id, moved);
          await dispatch('touchMove', moved, [...down.values()]);
        },
        async lift() {
          live();
          lifted = true;
          const last = down.get(id) ?? finger;
          down.delete(id);
          await dispatch('touchEnd', last, [...down.values()]);
        },
      };
      return held;
    },
  };
}

/** A play or a tap cannot share the screen with fingers `press` holds down. */
function assertNoneHeld(held: {readonly size: number}): void {
  if (held.size > 0) {
    throw new Error(
      `touchDriver: lift the ${held.size} finger${held.size === 1 ? '' : 's'} press holds down before a play or a tap`,
    );
  }
}

/**
 * The skip reason for a proof that lifts one finger while another stays down,
 * on a driver whose `partialLifts` is false: Playwright's WebKit (Linux build)
 * sends that lift's `touchend` with no remaining `touches`, an emulation quirk
 * iOS does not have. Those cases need a simulator capture.
 */
export const PARTIAL_LIFT_SKIP =
  'injected WebKit touches report no remaining touches when one finger of several lifts (README: engine limits); capture it on the iOS simulator';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Waits until `performance.now()` reaches `deadline` with ~0.1 ms precision. */
async function until(deadline: number): Promise<void> {
  const remaining = deadline - performance.now();
  if (remaining > 3) {
    await sleep(remaining - 2);
  }
  while (performance.now() < deadline) {
    // spin: setTimeout alone is ±1-4 ms late
  }
}

/**
 * When event `index` of `steps` goes out, in performance.now() ms. Under
 * `'schedule'` it goes at its scripted time from `origin`. Under `'spacing'`
 * it goes its scripted interval after the event before it left. Under
 * `'spacing'`, or with `keepsGaps`, it also waits for its interval, less
 * ANSWER_SLACK_MS, after the engine answered the event before. WebKit stamps
 * an event no later than it answers, and the next one no sooner than it
 * leaves. So no gap reaches the page more than ANSWER_SLACK_MS short of the
 * script's: a stall stretches the gesture.
 */
export function pacedDeadline(
  pacing: TouchPacing,
  origin: number,
  steps: readonly {readonly t: number}[],
  index: number,
  previous: {readonly sentAt: number; readonly returnedAt: number} | null,
  keepsGaps = false,
): number {
  const scripted = origin + steps[index].t;
  if (index === 0 || previous == null) {
    return scripted;
  }
  const interval = steps[index].t - steps[index - 1].t;
  const afterAnswer = previous.returnedAt + interval - ANSWER_SLACK_MS;
  if (pacing === 'spacing') {
    return Math.max(previous.sentAt + interval, afterAnswer);
  }
  return keepsGaps ? Math.max(scripted, afterAnswer) : scripted;
}

/** What the page saw of one touch event of a paced play. */
export interface TouchArrival {
  /**
   * When the page's gesture host read the step, in WebKit. A move or a lift
   * reads at its pointer event's `timeStamp`, a touch-down at its touch
   * event's. A step with no pointer event reads at its touch event's.
   */
  readonly stamp: number;
  /**
   * The step's earliest `timeStamp`, its pointer event's; `stamp` when the
   * step had none. A touch-down reads later than this when the page's own
   * pointer listeners held its touch event.
   */
  readonly firstStamp?: number;
  /**
   * When the page's own touch and pointer listeners had finished with it;
   * NaN unseen.
   */
  readonly handledAt: number;
  /**
   * When the page's listeners began on the step's first event, NaN unseen.
   * Before it, the step waited for the main thread.
   */
  readonly startedAt?: number;
}

/** Where the release a paced play's page read strays from the script's. */
export interface TouchPacingFault {
  /**
   * `'rest'`: the page read a resting finger; `'throw'`: a throw where the
   * script rests; `'moves'`: fewer than two moves; `'release'`: another
   * speed. `'boundary'` and `'hold'`: a release or a hold on the other side
   * of a play's `boundaries` from the script's.
   */
  readonly kind: 'rest' | 'throw' | 'moves' | 'release' | 'boundary' | 'hold';
  /** The release the page read, px/s (0 for a rest or too few moves). */
  readonly pageReleasePxPerS: number;
  /** The script's release, px/s. */
  readonly scriptReleasePxPerS: number;
  /** The gaps the release reads, as the page received them, ms. */
  readonly gapsMs: readonly number[];
  /** The same gaps as the script spaces them, ms. */
  readonly scriptedGapsMs: readonly number[];
  /**
   * The widest of those gaps when the page's own touch and pointer listeners held its
   * event back (they were still handling the event before), or null.
   */
  readonly heldByPage: {
    readonly gapMs: number;
    readonly handlingMs: number;
  } | null;
  /** For `'boundary'` and `'hold'`: the threshold crossed, px/s or ms. */
  readonly threshold?: number;
  /** For `'hold'`: the first finger's hold as the page read it, and as scripted, ms. */
  readonly holdMs?: {readonly page: number; readonly script: number};
  /**
   * The longest time the page drew no frame during the gesture, ms, or null
   * unread. A gap far past a frame means the renderer was starved: no
   * dispatch can deliver a gesture's timing then.
   */
  readonly frameGapMs?: number | null;
  /**
   * The gap that strays furthest past the script's: the step it ends at, and
   * the gap as the page received it and as scripted, ms.
   */
  readonly late?: {
    readonly index: number;
    readonly gapMs: number;
    readonly scriptedGapMs: number;
  };
  /**
   * The widest gap that an event's wait for the main thread accounts for,
   * when the listeners alone do not, or null. The wait ends when the page's
   * listeners begin. Another page task, or a starved runner, held the event.
   */
  readonly waited?: {
    readonly gapMs: number;
    readonly waitMs: number;
  } | null;
}

/** The lifting finger's release, read from the page's stamps and the script's. */
export interface ReleaseReading {
  readonly pagePxPerS: number;
  readonly scriptPxPerS: number;
  /** The page read a resting finger. */
  readonly rests: boolean;
  /**
   * The script rests before the lift, but the page read a throw: its last
   * move reached the page within the stillness interval of the lift.
   */
  readonly throws: boolean;
  /**
   * The page read fewer than two moves where the script makes more: its
   * moves arrived at one time, so it reads no release.
   */
  readonly fewMoves: boolean;
  /** The page's release strays from the script's by this share of it. */
  readonly strayShare: number;
  /** The events whose gaps the release reads (each gap ends at one). */
  readonly span: readonly number[];
}

/** One sample of the lifting finger: its position and when it was read. */
interface FingerSample {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly time: number;
}

/** What Core's velocity tracker reads from a finger's samples at its lift. */
interface CoreReading {
  readonly x: number;
  readonly y: number;
  /** Moved samples after the touch-down. */
  readonly moves: number;
  /** The finger was still for longer than the stillness interval. */
  readonly rests: boolean;
  /**
   * The moved samples the release reads, oldest first: up to three for a
   * pan's release, four for a scrolling surface's.
   */
  readonly moved: readonly FingerSample[];
}

/**
 * The release Core's velocity tracker reads, px/s. It copies that filter:
 * Core's `VelocityTracker` is internal to the core package, so the harness
 * cannot call it. Keep the two equal (`add`, `releases`, `panVelocity`,
 * `scrollVelocity`): Core's VelocityTracker.harness.test.ts reads the same
 * samples with both. Only a sample that moves
 * counts, and a sample at the newest moved sample's time replaces it. The
 * newest interval weighs 0.2 and the one before it 0.8, and an interval
 * across no time reads 0. A scrolling surface's release blends the newest
 * pan value, 0.25, with the one before it. The release is 0 with fewer than
 * two moves after the touch-down, or after a rest longer than the stillness
 * interval.
 */
function coreRelease(
  samples: readonly FingerSample[],
  liftTime: number,
  filter: TouchReleaseFilter = 'pan',
): CoreReading {
  const moved: FingerSample[] = [];
  let moves = 0;
  let newest = Number.NEGATIVE_INFINITY;
  for (const sample of samples) {
    if (sample.time < newest) {
      continue;
    }
    newest = sample.time;
    const last = moved[moved.length - 1];
    if (last != null && sample.x === last.x && sample.y === last.y) {
      continue;
    }
    if (last != null && sample.time === last.time) {
      moved[moved.length - 1] = sample;
    } else {
      moved.push(sample);
      if (moved.length > 4) {
        moved.shift();
      }
      if (last != null) {
        moves += 1;
      }
    }
  }
  const read = filter === 'scroll' ? moved : moved.slice(-3);
  const last = moved[moved.length - 1];
  const rests = last != null && liftTime - last.time > TOUCH_STILLNESS_MS;
  if (moves < 2 || last == null || rests) {
    return {x: 0, y: 0, moves, rests, moved: read};
  }
  const pair = (a: FingerSample, b: FingerSample) => {
    const seconds = (b.time - a.time) / 1000;
    return seconds > 0
      ? {x: (b.x - a.x) / seconds, y: (b.y - a.y) / seconds}
      : {x: 0, y: 0};
  };
  // The pan's value over the last three of `upTo`, as Core updates it on
  // each moved sample.
  const pan = (upTo: readonly FingerSample[]) => {
    const n = upTo.length;
    if (n < 2) {
      return {x: 0, y: 0};
    }
    const current = pair(upTo[n - 2], upTo[n - 1]);
    const before = n >= 3 ? pair(upTo[n - 3], upTo[n - 2]) : current;
    const w = TOUCH_RELEASE_NEWEST_WEIGHT;
    return {
      x: w * current.x + (1 - w) * before.x,
      y: w * current.y + (1 - w) * before.y,
    };
  };
  const current = pan(moved.slice(-3));
  if (filter === 'pan') {
    return {...current, moves, rests, moved: read};
  }
  const previous = pan(moved.slice(0, -1).slice(-3));
  const w = TOUCH_SCROLL_RELEASE_NEWEST_WEIGHT;
  return {
    x: w * current.x + (1 - w) * previous.x,
    y: w * current.y + (1 - w) * previous.y,
    moves,
    rests,
    moved: read,
  };
}

/**
 * Reads a paced play's release as Core's velocity tracker reads it, from the
 * page's stamps and from the script's times. Both read the same positions,
 * rounded once: WebKit delivers whole pixels. Each reading has its own rest,
 * so a page that does not rest where the script does fails the play.
 */
export function readRelease(
  steps: readonly TouchEventStep[],
  arrivals: readonly TouchArrival[],
  filter: TouchReleaseFilter = 'pan',
): ReleaseReading | null {
  const lift = steps.length - 1;
  const id =
    steps[lift]?.type === 'touchEnd' ? steps[lift].changed[0]?.id : undefined;
  if (id == null || arrivals.length !== steps.length) {
    return null;
  }
  const positions: {index: number; x: number; y: number}[] = [];
  steps.forEach((step, index) => {
    const finger =
      step.type === 'touchStart' || step.type === 'touchMove'
        ? step.changed.find(f => f.id === id)
        : undefined;
    if (finger != null) {
      positions.push({index, x: Math.round(finger.x), y: Math.round(finger.y)});
    }
  });
  if (positions.length === 0) {
    return null;
  }
  const script = coreRelease(
    positions.map(p => ({...p, time: steps[p.index].t})),
    steps[lift].t,
    filter,
  );
  const page = coreRelease(
    positions.map(p => ({...p, time: arrivals[p.index].stamp})),
    arrivals[lift].stamp,
    filter,
  );
  const scriptPxPerS = Math.hypot(script.x, script.y);
  const first = page.moved[0]?.index ?? positions[0].index;
  return {
    pagePxPerS: Math.hypot(page.x, page.y),
    scriptPxPerS,
    // One move releases at 0 for the script and the page alike, so a late
    // lift after it changes nothing.
    rests: script.moves >= 2 && !script.rests && page.rests,
    throws: script.rests && !page.rests && page.moves >= 2,
    fewMoves:
      !script.rests && !page.rests && page.moves < 2 && script.moves >= 2,
    strayShare:
      scriptPxPerS > 0
        ? Math.hypot(page.x - script.x, page.y - script.y) / scriptPxPerS
        : 0,
    span: Array.from({length: lift - first}, (_, k) => first + 1 + k),
  };
}

/**
 * Reads a paced play's release as the page did and returns its fault, or
 * null. The kinds: `rest`, a resting finger where the script moves; `throw`,
 * a throw where the script rests; `moves`, fewer than two moves. Given
 * `tolerance`, `release` is a release that strays further than that share.
 * The release blends the lifting finger's last two move intervals (its
 * touch-down counts as the first event). It is 0 once the finger was still
 * past the stillness interval before it lifts. So only those gaps decide it,
 * and an earlier stall leaves it intact. Each reading keeps its own rest.
 * WebKit dispatches a touch only once the page's main thread is free, so a
 * gap is the page's when the page's listeners spent longer on the event
 * before it than the script's interval to the next, and that handling
 * accounts for the gap's excess over the script within a frame. Under
 * `'spacing'` the harness itself waits out a late answer, so its send
 * spacing cannot tell a page stall from a runner stall, as the wheel path's
 * does (`wheelGapCauses`); the page's handling time can. The fault is the
 * page's when any gap the release reads is.
 */
export function touchPacingFault(
  steps: readonly TouchEventStep[],
  arrivals: readonly TouchArrival[],
  tolerance?: number,
  {
    release = 'pan',
    boundaries = {},
  }: Pick<PlayOptions, 'release' | 'boundaries'> = {},
): TouchPacingFault | null {
  const reading = readRelease(steps, arrivals, release);
  const sides = (threshold: number, page: number, script: number) =>
    page >= threshold !== script >= threshold;
  const releaseBound = boundaries.releasePxPerS;
  const crossesRelease =
    reading != null &&
    releaseBound != null &&
    sides(releaseBound, reading.pagePxPerS, reading.scriptPxPerS);
  const hold =
    arrivals.length === steps.length ? readHold(steps, arrivals) : null;
  const crossesHold =
    hold != null &&
    boundaries.holdMs != null &&
    sides(boundaries.holdMs, hold.page, hold.script);
  const releaseFault =
    reading != null &&
    (reading.rests ||
      reading.throws ||
      reading.fewMoves ||
      (tolerance != null && reading.strayShare > tolerance) ||
      crossesRelease);
  if (!releaseFault && !crossesHold) {
    return null;
  }
  // The gaps the fault reads: the release's, or for a hold every gap from
  // touch-down to the lift.
  const span =
    releaseFault && reading != null
      ? reading.span
      : Array.from({length: steps.length - 1}, (_, k) => k + 1);
  const gapsMs = span.map(i => arrivals[i].stamp - arrivals[i - 1].stamp);
  const scriptedGapsMs = span.map(i => steps[i].t - steps[i - 1].t);
  let heldByPage: TouchPacingFault['heldByPage'] = null;
  let waited: TouchPacingFault['waited'] = null;
  span.forEach((i, k) => {
    const holds = (ms: number) =>
      Number.isFinite(ms) &&
      ms > scriptedGapsMs[k] &&
      ms + HELD_BACK_MS >= gapsMs[k] - scriptedGapsMs[k];
    // The event before held this one back, or this step's own pointer
    // listeners held its touch event (a lift read at its touchend). Each runs
    // from a stamp to the end of the listeners. The part before the
    // listeners began is a wait for the main thread, not listener time.
    const terms = [
      [
        arrivals[i - 1].stamp,
        arrivals[i - 1].startedAt,
        arrivals[i - 1].handledAt,
      ],
      [
        arrivals[i].firstStamp ?? arrivals[i].stamp,
        arrivals[i].startedAt,
        arrivals[i].stamp,
      ],
    ] as const;
    for (const [from, began, to] of terms) {
      const totalMs = to - from;
      const handlingMs =
        began != null && Number.isFinite(began)
          ? to - Math.max(began, from)
          : totalMs;
      if (holds(handlingMs)) {
        if (heldByPage == null || handlingMs > heldByPage.handlingMs) {
          heldByPage = {gapMs: gapsMs[k], handlingMs};
        }
      } else if (holds(totalMs)) {
        const waitMs = totalMs - handlingMs;
        if (waited == null || waitMs > waited.waitMs) {
          waited = {gapMs: gapsMs[k], waitMs};
        }
      }
    }
  });
  const lateK = gapsMs.reduce(
    (best, gap, k) =>
      gap - scriptedGapsMs[k] > gapsMs[best] - scriptedGapsMs[best] ? k : best,
    0,
  );
  const late =
    span.length > 0
      ? {
          index: span[lateK],
          gapMs: gapsMs[lateK],
          scriptedGapMs: scriptedGapsMs[lateK],
        }
      : undefined;
  if (!releaseFault || reading == null) {
    return {
      kind: 'hold',
      pageReleasePxPerS: reading?.pagePxPerS ?? 0,
      scriptReleasePxPerS: reading?.scriptPxPerS ?? 0,
      gapsMs,
      scriptedGapsMs,
      heldByPage,
      waited,
      late,
      threshold: boundaries.holdMs,
      holdMs: hold ?? undefined,
    };
  }
  const strays = tolerance != null && reading.strayShare > tolerance;
  return {
    kind: reading.rests
      ? 'rest'
      : reading.throws
        ? 'throw'
        : reading.fewMoves
          ? 'moves'
          : strays
            ? 'release'
            : 'boundary',
    pageReleasePxPerS: reading.pagePxPerS,
    scriptReleasePxPerS: reading.scriptPxPerS,
    gapsMs,
    scriptedGapsMs,
    heldByPage,
    waited,
    late,
    threshold: strays ? undefined : releaseBound,
  };
}

/**
 * The first finger's hold from touch-down to the lift that ends the play, ms.
 * It gives the page's reading and the script's: a tap's hold, or a drag's
 * whole span.
 */
export function readHold(
  steps: readonly TouchEventStep[],
  arrivals: readonly TouchArrival[],
): {readonly page: number; readonly script: number} | null {
  const lift = steps.length - 1;
  if (
    lift < 1 ||
    steps[0].type !== 'touchStart' ||
    steps[lift].type !== 'touchEnd' ||
    arrivals.length !== steps.length
  ) {
    return null;
  }
  return {
    page: arrivals[lift].stamp - arrivals[0].stamp,
    script: steps[lift].t - steps[0].t,
  };
}

function describeFault(fault: TouchPacingFault): string {
  const frames =
    fault.frameGapMs == null
      ? ''
      : `; the page drew no frame for ${fault.frameGapMs.toFixed(0)} ms during the gesture`;
  return `${describeReading(fault)}${frames}`;
}

function describeReading(fault: TouchPacingFault): string {
  const gaps = `gaps ${fault.gapsMs.map(g => g.toFixed(0)).join(', ')} ms where the script spaces ${fault.scriptedGapsMs.map(g => g.toFixed(0)).join(', ')} ms`;
  if (fault.kind === 'hold' && fault.holdMs != null) {
    return `the page read a hold of ${fault.holdMs.page.toFixed(0)} ms where the script holds ${fault.holdMs.script.toFixed(0)} ms, on the other side of the ${fault.threshold} ms the component decides on`;
  }
  if (fault.kind === 'boundary') {
    return `the page read a release of ${fault.pageReleasePxPerS.toFixed(0)} px/s where the script throws ${fault.scriptReleasePxPerS.toFixed(0)} px/s, on the other side of the ${fault.threshold} px/s the component decides on (${gaps})`;
  }
  if (fault.kind === 'rest') {
    return `the page read a resting finger: the lift reached it more than ${TOUCH_STILLNESS_MS} ms after the last move (${gaps})`;
  }
  if (fault.kind === 'throw') {
    return `the page read a throw of ${fault.pageReleasePxPerS.toFixed(0)} px/s where the script rests more than ${TOUCH_STILLNESS_MS} ms before the lift (${gaps})`;
  }
  if (fault.kind === 'moves') {
    return `the page read fewer than two moves, so no release, where the script throws ${fault.scriptReleasePxPerS.toFixed(0)} px/s: its moves reached it at one time (${gaps})`;
  }
  return `the page read a release of ${fault.pageReleasePxPerS.toFixed(0)} px/s where the script throws ${fault.scriptReleasePxPerS.toFixed(0)} px/s (${gaps})`;
}

/**
 * A paced play's page read a release that is not the script's. Its own touch
 * and pointer listeners did not hold the events back: a dispatch stalled
 * before the page. When an event waited for the main thread before the page's
 * listeners began, the error says how long. Another page task, or a starved
 * runner, held it there. A gap with no wait, across which the page drew no
 * frame, is `TouchStarvationError`.
 */
export class TouchPacingError extends Error {
  constructor(readonly fault: TouchPacingFault) {
    super(
      `touchDriver: ${describeFault(fault)}: ${fault.waited == null ? 'a dispatch stalled before the page' : `an event waited ${fault.waited.waitMs.toFixed(0)} ms for the main thread before the page's listeners began, so the next reached it ${fault.waited.gapMs.toFixed(0)} ms later: another page task held the thread, or the runner starved it`}`,
    );
    this.name = 'TouchPacingError';
  }
}

/**
 * A paced play's page read a release that is not the script's, and its own
 * touch and pointer listeners held an event back. They were still handling
 * the event before, and WebKit dispatches the next touch only once the page
 * is free. The handling time runs from when the listeners began, so a wait
 * for the main thread before them is not counted. It is page wall time,
 * which on a starved runner includes a listener's wait for a CPU. Judge a
 * page stall from a run with CI's CPU limits: there it is the proof's own
 * failure.
 */
export class TouchPageStallError extends Error {
  constructor(
    readonly fault: TouchPacingFault & {
      readonly heldByPage: NonNullable<TouchPacingFault['heldByPage']>;
    },
  ) {
    super(
      `touchDriver: the page's own touch and pointer listeners took ${fault.heldByPage.handlingMs.toFixed(0)} ms of page wall time to handle an event, so the next reached it ${fault.heldByPage.gapMs.toFixed(0)} ms later, and ${describeFault(fault)}. On a starved runner that time includes the page's wait for a CPU: judge a page stall from a run with CI's CPU limits`,
    );
    this.name = 'TouchPageStallError';
  }
}

/**
 * A paced play's page read a release that is not the script's, and the
 * runner starved the page. Across the gap that strays furthest, the page drew
 * no frame for longer than `FRAME_STARVATION_MS`. Neither its own listeners
 * nor a page task held the event before it. No pacing reaches a page that
 * draws nothing, so the play cannot judge the component. It fails by name,
 * as a busy proof's `FrameStarvationError` does. Judge the proof from a run
 * with CI's CPU limits.
 */
export class TouchStarvationError extends Error {
  constructor(
    readonly fault: TouchPacingFault & {
      readonly late: NonNullable<TouchPacingFault['late']>;
      /** The longest time the page drew no frame across that gap, ms. */
      readonly starvedMs: number;
    },
  ) {
    super(
      `touchDriver: the page drew no frame for ${fault.starvedMs.toFixed(0)} ms across a ${fault.late.gapMs.toFixed(0)} ms gap where the script spaces ${fault.late.scriptedGapMs.toFixed(0)} ms, and ${describeReading(fault)}. Neither the page's listeners nor a page task held the event: the runner starved the page. Judge the proof from a run with CI's CPU limits`,
    );
    this.name = 'TouchStarvationError';
  }
}

/**
 * A play's lift reached the page more than the stillness interval after its
 * finger's last move, where the script throws. The scripted gap plus the time
 * the play's own `onEvent` ran passes that interval. Page work there holds the
 * next event back by a round trip. A loaded runner can stretch the
 * gap more, and the error still names `onEvent`. On a page that stamps
 * touches on arrival (WebKit), the page then reads a resting finger and
 * releases at 0.
 */
export class TouchLiftStallError extends Error {
  constructor(
    readonly numbers: {
      /** The gap the script spaces from the last move to the lift, ms. */
      readonly scriptedGapMs: number;
      /** The same gap as the page received it, ms. */
      readonly gapMs: number;
      /** How long `onEvent` ran in that gap, ms. */
      readonly onEventMs: number;
      /** As in `TouchPacingFault`: the longest frame gap, ms, or null unread. */
      readonly frameGapMs?: number | null;
    },
  ) {
    const {scriptedGapMs, gapMs, onEventMs, frameGapMs} = numbers;
    const frames =
      frameGapMs == null
        ? ''
        : `; the page drew no frame for ${frameGapMs.toFixed(0)} ms during the gesture`;
    super(
      `touchDriver: the lift reached the page ${gapMs.toFixed(0)} ms after its finger's last move, where the script spaces ${scriptedGapMs.toFixed(0)} ms: past the ${TOUCH_STILLNESS_MS} ms stillness interval, the page reads a resting finger. onEvent ran ${onEventMs.toFixed(0)} ms in that gap: page work there holds the next event back${frames}. Read the page in a listener of its own, or rest the script before the lift`,
    );
    this.name = 'TouchLiftStallError';
  }
}

/**
 * The `TouchLiftStallError` for a fault the play's own `onEvent` explains. The
 * page read a rest, and the scripted gap plus `onEvent`'s run passes the
 * stillness interval. A loaded runner that stretched the gap more changes
 * nothing: the lift stall is the more specific cause, so it comes before any
 * pacing error. Null for any other fault.
 */
export function liftStallError(
  steps: readonly TouchEventStep[],
  arrivals: readonly TouchArrival[],
  fault: TouchPacingFault,
  onEventMs: readonly number[],
): TouchLiftStallError | null {
  if (fault.kind !== 'rest') {
    return null;
  }
  const lift = steps.length - 1;
  const id = steps[lift].changed[0]?.id;
  let lastMoved = 0;
  let at = '';
  steps.forEach((step, k) => {
    const finger =
      step.type === 'touchStart' || step.type === 'touchMove'
        ? step.changed.find(f => f.id === id)
        : undefined;
    const key =
      finger == null ? at : `${Math.round(finger.x)},${Math.round(finger.y)}`;
    if (key !== at) {
      lastMoved = k;
      at = key;
    }
  });
  const scriptedGapMs = steps[lift].t - steps[lastMoved].t;
  const gapMs = arrivals[lift].stamp - arrivals[lastMoved].stamp;
  const ranMs = onEventMs
    .slice(lastMoved, lift)
    .reduce((sum, ms) => sum + ms, 0);
  return scriptedGapMs + ranMs > TOUCH_STILLNESS_MS
    ? new TouchLiftStallError({
        scriptedGapMs,
        gapMs,
        onEventMs: ranMs,
        frameGapMs: fault.frameGapMs,
      })
    : null;
}

/**
 * The error a paced play's fault throws. The lift stall comes first, since
 * it is the more specific cause. Then a gap the page's own listeners held is
 * the page's. A starved page drew no frame for longer than
 * `FRAME_STARVATION_MS` across the late gap. With no wait for the main
 * thread, that fault is the starved runner's. Any other gap is a dispatch
 * that stalled before the page.
 * `frames` are the times the page drew a frame during the play.
 */
export function touchPlayError(
  steps: readonly TouchEventStep[],
  arrivals: readonly TouchArrival[],
  fault: TouchPacingFault,
  onEventMs: readonly number[],
  frames: readonly number[] = [],
):
  | TouchLiftStallError
  | TouchPageStallError
  | TouchStarvationError
  | TouchPacingError {
  const lift = liftStallError(steps, arrivals, fault, onEventMs);
  if (lift != null) {
    return lift;
  }
  if (fault.heldByPage != null) {
    return new TouchPageStallError({...fault, heldByPage: fault.heldByPage});
  }
  const {late} = fault;
  const starvedMs =
    late == null || late.index < 1 || fault.waited != null
      ? null
      : longestFrameGap(frames, [
          arrivals[late.index - 1],
          arrivals[late.index],
        ]);
  return late != null && starvedMs != null && starvedMs > FRAME_STARVATION_MS
    ? new TouchStarvationError({...fault, late, starvedMs})
    : new TouchPacingError(fault);
}

/** Records what the page saw of a paced play's touches (WebKit). */
interface TouchArrivalProbe {
  arm(): Promise<void>;
  /** Each touch event's arrival, and when the page drew each frame meanwhile. */
  read(): Promise<{arrivals: TouchArrival[]; frames: number[]}>;
}

/**
 * The longest time the page drew no frame while the gesture reached it, ms.
 * The span runs from the last frame before the first touch to the first
 * frame after the lift. With no such frame, the touch or the lift itself
 * bounds it. Null with no frame read.
 */
export function longestFrameGap(
  frames: readonly number[],
  arrivals: readonly TouchArrival[],
): number | null {
  if (frames.length === 0 || arrivals.length === 0) {
    return null;
  }
  const from = arrivals[0].stamp;
  const to = arrivals[arrivals.length - 1].stamp;
  const sorted = [...frames].sort((a, b) => a - b);
  const before = sorted.filter(t => t <= from).at(-1) ?? from;
  const after = sorted.find(t => t >= to) ?? to;
  const edges = [before, ...sorted.filter(t => t > from && t < to), after];
  let longest = 0;
  for (let i = 1; i < edges.length; i += 1) {
    longest = Math.max(longest, edges[i] - edges[i - 1]);
  }
  return longest;
}

async function playSteps(
  script: TouchScript,
  options: PlayOptions,
  dispatch: (step: TouchEventStep, timestamp: number) => Promise<void>,
  stampFor: (t: number) => number,
  probe: TouchArrivalProbe | null,
): Promise<PlayedEvent[]> {
  const {
    realtime = true,
    onEvent,
    pacing = 'schedule',
    releaseTolerance,
    releaseUnread = false,
    release = 'pan',
    boundaries,
  } = options;
  const steps = toTouchEvents(script);
  // Only where the page reads a velocity from arrival times: scripted
  // timestamps carry it. Every real-time play is judged there, unless its
  // proof reads no release.
  const judges = probe != null && realtime && !releaseUnread;
  // A driver gives a probe only where the page stamps touches on arrival.
  // There, a play behind its schedule never shrinks a scripted gap, so page
  // work in `onEvent` cannot eat the rest before a lift.
  const keepsGaps = probe != null;
  if (judges) {
    await probe.arm();
  }
  const played: PlayedEvent[] = [];
  const origin = performance.now();
  let previous: {sentAt: number; returnedAt: number} | null = null;
  const onEventMs: number[] = [];
  for (const [index, step] of steps.entries()) {
    if (realtime) {
      await until(
        pacedDeadline(pacing, origin, steps, index, previous, keepsGaps),
      );
    }
    const timestamp = stampFor(step.t);
    const dispatchedAt = Date.now();
    const sentAt = performance.now();
    await dispatch(step, timestamp);
    previous = {sentAt, returnedAt: performance.now()};
    played.push({...step, dispatchedAt, returnedAt: Date.now(), timestamp});
    const watched = performance.now();
    await onEvent?.(step, index);
    onEventMs.push(performance.now() - watched);
  }
  // Judged once the lift is out, so no finger is left down.
  if (judges) {
    const {arrivals, frames} = await probe.read();
    // A page that lost events, such as a target removed mid-gesture, gives no
    // release to read. Only a `'spacing'` play, which asks for the
    // judgment, fails then.
    if (arrivals.length !== steps.length && pacing === 'spacing') {
      throw new Error(
        `touchDriver: the page received ${arrivals.length} of a paced play's ${steps.length} touch events`,
      );
    }
    const found = touchPacingFault(steps, arrivals, releaseTolerance, {
      release,
      boundaries,
    });
    if (found != null) {
      const fault = {...found, frameGapMs: longestFrameGap(frames, arrivals)};
      throw touchPlayError(steps, arrivals, fault, onEventMs, frames);
    }
    const reading = readRelease(steps, arrivals, release);
    if (reading != null) {
      played[played.length - 1] = {
        ...played[played.length - 1],
        release: {
          pagePxPerS: reading.pagePxPerS,
          scriptPxPerS: reading.scriptPxPerS,
        },
      };
    }
  }
  return played;
}

async function chromiumDriver(page: Page): Promise<TouchDriver> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const touchPoints = (fingers: readonly Finger[]) =>
    fingers.map(f => ({
      x: f.x,
      y: f.y,
      id: f.id,
      radiusX: 1,
      radiusY: 1,
      force: 1,
    }));
  // A start or move lists every finger down. An end lists the finger that
  // lifts while others stay down, and none for the last lift, as play does.
  const held = heldFingers(async (type, changed, down) => {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints:
        type !== 'touchEnd'
          ? touchPoints(down)
          : down.length > 0
            ? touchPoints([changed])
            : [],
      timestamp: Date.now() / 1000,
    });
  });
  return {
    engine: 'chromium',
    scriptedTimestamps: true,
    drivesNativeGestures: true,
    partialLifts: true,
    press: (at, options) => held.press(at, options),
    async play(script, options = {}) {
      assertNoneHeld(held);
      // Stamps follow the wall clock the page's own clock is on: with real-time
      // pacing an event's stamp and its dispatch agree to ~0.1 ms.
      const base = Date.now();
      return playSteps(
        script,
        options,
        async (step, timestamp) => {
          // A start or move lists every finger down (CDP presses the new ones).
          // An end lists the fingers that lift: that releases exactly those
          // while the rest stay down and keep moving; the last lift lists none.
          // (A move that omits a finger does not release it.)
          await cdp.send('Input.dispatchTouchEvent', {
            type: step.type,
            touchPoints:
              step.type !== 'touchEnd'
                ? touchPoints(step.fingers)
                : step.fingers.length > 0
                  ? touchPoints(step.changed)
                  : [],
            timestamp: timestamp / 1000,
          });
        },
        t => base + t,
        null,
      );
    },
    async tap(at) {
      assertNoneHeld(held);
      await page.touchscreen.tap(at.x, at.y);
    },
  };
}

interface WebKitPageProxySession {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  on(event: string, listener: (payload: unknown) => void): unknown;
  off?(event: string, listener: (payload: unknown) => void): unknown;
}

/**
 * Playwright's server-side WebKit page session, reached through the in-process
 * connection. Exported for helpers that use WebKit's own inspector protocol.
 */
export function webkitPageSession(page: Page): WebKitPageProxySession {
  const connection = (
    page as unknown as {_connection?: {toImpl?: (o: unknown) => unknown}}
  )._connection;
  const impl = connection?.toImpl?.(page) as
    {delegate?: {_pageProxySession?: WebKitPageProxySession}} | undefined;
  const session = impl?.delegate?._pageProxySession;
  if (session == null) {
    throw new Error(
      "WebKit touch input needs Playwright's in-process server (a locally launched browser); this page has none.",
    );
  }
  return session;
}

/**
 * The events a paced play's probe records: a gesture host samples a finger
 * from its pointer events, and a page can handle either kind.
 */
const TOUCH_TYPES = [
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
  'touchstart',
  'touchmove',
  'touchend',
  'touchcancel',
];

/**
 * One arrival for each touch event a probe recorded, in dispatch order. WebKit
 * dispatches each step's pointer events just before its touch event, and
 * stamps the touch event only once the page's pointer listeners are done.
 * Core's gesture host reads a finger's moves from its pointer events, and
 * its lift from the pointerup paired with them. It reads the touch-down from
 * its touch event. So a move or a lift arrives at the earliest stamp of its
 * step, and a touch-down at its touch event's own stamp. Each takes the
 * latest handling mark of its step.
 */
export function touchArrivalsFrom(record: {
  readonly eventTypes: readonly string[];
  readonly pointerTypes: readonly string[];
  readonly stamps: readonly number[];
  readonly handledAt: readonly number[];
  readonly receivedAt?: readonly number[];
}): TouchArrival[] {
  const arrivals: TouchArrival[] = [];
  let stamp = Number.POSITIVE_INFINITY;
  let handledAt = Number.NaN;
  let startedAt = Number.POSITIVE_INFINITY;
  record.eventTypes.forEach((type, i) => {
    // A mouse's or a pen's pointer event is not this play's.
    if (!type.startsWith('touch') && record.pointerTypes[i] !== 'touch') {
      return;
    }
    stamp = Math.min(stamp, record.stamps[i]);
    startedAt = Math.min(startedAt, record.receivedAt?.[i] ?? Number.NaN);
    const mark = record.handledAt[i];
    if (Number.isFinite(mark)) {
      handledAt = Number.isNaN(handledAt) ? mark : Math.max(handledAt, mark);
    }
    if (type.startsWith('touch')) {
      arrivals.push({
        stamp: type === 'touchstart' ? record.stamps[i] : stamp,
        firstStamp: stamp,
        handledAt,
        ...(record.receivedAt == null
          ? {}
          : {startedAt: Number.isFinite(startedAt) ? startedAt : Number.NaN}),
      });
      stamp = Number.POSITIVE_INFINITY;
      handledAt = Number.NaN;
      startedAt = Number.POSITIVE_INFINITY;
    }
  });
  return arrivals;
}

/**
 * Records, for each touch event of a paced play, when it reached the page
 * and when the page's own listeners had finished with it. It also records
 * the page's frames (`armInputRun`).
 */
function touchArrivalProbe(page: Page): TouchArrivalProbe {
  let armed: JSHandle<InputRun> | null = null;
  return {
    async arm() {
      await armed?.evaluate(run => run.stop());
      await armed?.dispose();
      armed = await armInputRun(page, TOUCH_TYPES, {frames: true});
      // Waits for the run's first frame, so the frames read one before the
      // gesture. The harness's own frames run on the real timers: a frozen
      // timer gate (story.ts) holds only the page's.
      await armed.evaluate(
        run =>
          new Promise<void>(resolve => {
            const gate = (
              window as unknown as {
                __harnessTimerGate?: {frame?: typeof requestAnimationFrame};
              }
            ).__harnessTimerGate;
            const frame =
              gate?.frame ?? window.requestAnimationFrame.bind(window);
            const check = () =>
              run.frames.length > 0 ? resolve() : frame(check);
            check();
          }),
      );
    },
    async read() {
      if (armed == null) {
        return {arrivals: [], frames: []};
      }
      const run = armed;
      armed = null;
      const {frames, ...record} = await run.evaluate(recorded => {
        recorded.stop();
        return {
          eventTypes: recorded.eventTypes.slice(),
          pointerTypes: recorded.pointerTypes.slice(),
          stamps: recorded.stamps.slice(),
          handledAt: recorded.handledAt.slice(),
          frames: recorded.frames.slice(),
          // Only a mark added before the page's scripts comes before every
          // page listener. Without it, the hold counts from the stamp.
          ...(recorded.startsFirst
            ? {receivedAt: recorded.receivedAt.slice()}
            : {}),
        };
      });
      await run.dispose();
      return {arrivals: touchArrivalsFrom(record), frames};
    },
  };
}

async function webkitDriver(page: Page): Promise<TouchDriver> {
  const session = webkitPageSession(page);
  await installInputStart(page, TOUCH_TYPES);
  // WebKit's command takes integer CSS px and applies the event's phase to
  // every point it lists: a start lists only the fingers that land (listing a
  // finger already down presses it again), an end only the fingers that lift
  // (an empty list releases nothing), a move every finger down.
  const points = (fingers: readonly Finger[]) =>
    fingers.map(f => ({x: Math.round(f.x), y: Math.round(f.y), id: f.id}));
  const held = heldFingers(async (type, changed, down) => {
    await session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points(type === 'touchMove' ? down : [changed]),
    });
  });
  return {
    engine: 'webkit',
    scriptedTimestamps: false,
    drivesNativeGestures: false,
    partialLifts: false,
    press: (at, options) => held.press(at, options),
    async play(script, options = {}) {
      assertNoneHeld(held);
      return playSteps(
        script,
        options,
        async step => {
          await session.send('Input.dispatchTouchEvent', {
            type: step.type,
            touchPoints: points(
              step.type === 'touchMove' ? step.fingers : step.changed,
            ),
          });
        },
        () => Date.now(),
        touchArrivalProbe(page),
      ).then(played => played.map(p => ({...p, timestamp: null})));
    },
    async tap(at) {
      assertNoneHeld(held);
      await page.touchscreen.tap(Math.round(at.x), Math.round(at.y));
    },
  };
}

/**
 * Adds the WebKit driver's listener-start mark to each page the tab loads
 * next, before the page's scripts. A driver created after that load then tells
 * a wait for the main thread from the page's listeners. `openStory` calls it.
 * Other engines read no mark, so it adds none there.
 */
export async function installTouchStartBeforeLoad(page: Page): Promise<void> {
  if (page.context().browser()?.browserType().name() === 'webkit') {
    await installInputStartBeforeLoad(page, TOUCH_TYPES);
  }
}

/** A touch driver for the page's engine. Firefox is not supported (no touch input path). */
export async function touchDriver(page: Page): Promise<TouchDriver> {
  const name = page.context().browser()?.browserType().name();
  if (name === 'chromium') {
    return chromiumDriver(page);
  }
  if (name === 'webkit') {
    return webkitDriver(page);
  }
  throw new Error(
    `touchDriver: no real touch input path for ${name ?? 'this browser'}`,
  );
}

export interface InputRecord {
  readonly type: string;
  /** The event's own `timeStamp`, ms since the page's time origin. */
  readonly timeStamp: number;
  readonly isTrusted: boolean;
  readonly cancelable: boolean;
  readonly defaultPrevented: boolean;
  readonly pointerId?: number;
  readonly pointerType?: string;
  readonly x?: number;
  readonly y?: number;
  readonly touches?: number;
  /** A pointer event's pressure (a pen's, 0–1). */
  readonly pressure?: number;
  /** A wheel step's deltas, mode and Control key (webInput.ts). */
  readonly deltaX?: number;
  readonly deltaY?: number;
  readonly deltaMode?: number;
  readonly ctrlKey?: boolean;
  readonly target: string;
}

const INPUT_LOG_SCRIPT = `(() => {
  if (window.__harnessInput) return;
  const log = [];
  window.__harnessInput = log;
  const describe = node => node instanceof Element
    ? node.tagName.toLowerCase() + (node.id ? '#' + node.id : '') + (node.getAttribute('aria-label') ? '[' + node.getAttribute('aria-label') + ']' : '')
    : String(node && node.nodeName);
  const types = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove',
    'touchend', 'touchcancel', 'click', 'contextmenu', 'gotpointercapture', 'lostpointercapture', 'wheel'];
  for (const type of types) {
    // Bubble phase on window, so defaultPrevented reflects the page's own handlers.
    window.addEventListener(type, event => {
      const record = {type, timeStamp: event.timeStamp, isTrusted: event.isTrusted, cancelable: event.cancelable,
        defaultPrevented: event.defaultPrevented, target: describe(event.target)};
      if ('pointerId' in event) Object.assign(record, {pointerId: event.pointerId, pointerType: event.pointerType, x: event.clientX, y: event.clientY, pressure: event.pressure});
      if (type === 'wheel') Object.assign(record, {deltaX: event.deltaX, deltaY: event.deltaY, deltaMode: event.deltaMode, ctrlKey: event.ctrlKey, x: event.clientX, y: event.clientY});
      if (event.touches) Object.assign(record, {touches: event.touches.length, x: event.changedTouches[0] && event.changedTouches[0].clientX, y: event.changedTouches[0] && event.changedTouches[0].clientY});
      log.push(record);
    }, {passive: true});
  }
})()`;

/** Records every pointer, touch, click and wheel step the page receives (install before navigation). */
export async function installInputLog(page: Page): Promise<void> {
  await page.addInitScript(INPUT_LOG_SCRIPT);
}

/** What the page received since navigation (or since the last `clear`). */
export async function readInputLog(
  page: Page,
  {clear = false}: {clear?: boolean} = {},
): Promise<InputRecord[]> {
  return page.evaluate(shouldClear => {
    const log =
      (window as unknown as {__harnessInput?: InputRecord[]}).__harnessInput ??
      [];
    const copy = log.slice();
    if (shouldClear) {
      log.length = 0;
    }
    return copy;
  }, clear);
}
