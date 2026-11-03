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
 *   ~1 ms on an idle runner, but a runner whose CPU quota stalls the process
 *   sends some steps late, and the ones behind them back to back, unless
 *   the play keeps the script's spacing: `pacing: 'spacing'`);
 *   integer coordinates only; no native scrolling, fling or pinch-zoom from
 *   these touches; a `touchstart` lists only the fingers that landed in it
 *   (pointer events are exact); no click synthesised from a raw touch sequence (use
 *   `tap`, which dispatches WebKit's tap gesture and does produce the
 *   compatibility mouse events and click). The command is reached through
 *   Playwright's in-process server object, so it needs a locally launched
 *   browser (the default), not a remote `connect()`.
 *
 * SYNC: Keep the engine limits above equal to the README's table and to the
 *   harness self-test (../src/harness.interaction.browser.spec.ts).
 */

import type {CDPSession, JSHandle, Page} from '@playwright/test';
import {
  toTouchEvents,
  type Finger,
  type Point,
  type TouchEventStep,
  type TouchScript,
} from './scripts';
import {armInputRun, HELD_BACK_MS, type InputRun} from './webInput';

export type Engine = 'chromium' | 'webkit';

/**
 * How real-time pacing catches up after a slow dispatch (`PlayOptions.pacing`):
 * `'schedule'` sends each event at its scripted time from the start, so the
 * events behind a stalled command go out back to back; `'spacing'` sends each
 * event its scripted interval after the one before it left, or, when that
 * dispatch outlasted the interval (a stall), its interval after that dispatch
 * returned, so a stall shifts the rest of the gesture instead of bunching it.
 */
export type TouchPacing = 'schedule' | 'spacing';

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
   * arrive, and a burst after a stalled command reads as a much faster
   * finger. There, a paced play reads the release as the page did once its
   * last event is out (the lift's `PlayedEvent.release`), and throws when
   * the page read a resting finger, or, given `releaseTolerance`, a release
   * that strays from the script's by more than that share of it:
   * `TouchPageStallError` when the page's own touch listeners held an event
   * back, `TouchPacingError` otherwise (see `touchPacingFault`).
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
  /** Called after each event is dispatched, before the next one (storyboards). */
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
 * When event `index` of `steps` goes out (performance.now() ms): at its
 * scripted time from `origin`; or, under `'spacing'`, its scripted interval
 * after the event before it left, so the page reads the script's pace, unless
 * that dispatch outlasted the interval. WebKit answers a dispatch only once
 * the page has the event, so after such a stall the page may have received it
 * as late as the answer, and the next event leaves its interval after that:
 * never back to back.
 */
export function pacedDeadline(
  pacing: TouchPacing,
  origin: number,
  steps: readonly {readonly t: number}[],
  index: number,
  previous: {readonly sentAt: number; readonly returnedAt: number} | null,
): number {
  if (pacing === 'spacing' && index > 0 && previous != null) {
    const interval = steps[index].t - steps[index - 1].t;
    return previous.returnedAt - previous.sentAt <= interval
      ? previous.sentAt + interval
      : previous.returnedAt + interval;
  }
  return origin + steps[index].t;
}

/** What the page saw of one touch event of a paced play. */
export interface TouchArrival {
  /** The event's own `timeStamp`: when it reached the page, in WebKit. */
  readonly stamp: number;
  /** When the page's own touch listeners had finished with it; NaN unseen. */
  readonly handledAt: number;
}

/** Where the release a paced play's page read strays from the script's. */
export interface TouchPacingFault {
  /** `'rest'`: the page read a resting finger; `'release'`: another speed. */
  readonly kind: 'rest' | 'release';
  /** The release the page read, px/s (0 for a rest). */
  readonly pageReleasePxPerS: number;
  /** The script's release, px/s. */
  readonly scriptReleasePxPerS: number;
  /** The gaps the release reads, as the page received them, ms. */
  readonly gapsMs: readonly number[];
  /** The same gaps as the script spaces them, ms. */
  readonly scriptedGapsMs: readonly number[];
  /**
   * The widest of those gaps when the page's own touch listeners held its
   * event back (they were still handling the event before), or null.
   */
  readonly heldByPage: {
    readonly gapMs: number;
    readonly handlingMs: number;
  } | null;
}

/** The lifting finger's release, read from the page's stamps and the script's. */
interface ReleaseReading {
  readonly pagePxPerS: number;
  readonly scriptPxPerS: number;
  /** The page read a resting finger. */
  readonly rests: boolean;
  /** The page's release strays from the script's by this share of it. */
  readonly strayShare: number;
  /** The events whose gaps the release reads (each gap ends at one). */
  readonly span: readonly number[];
}

function readRelease(
  steps: readonly TouchEventStep[],
  arrivals: readonly TouchArrival[],
): ReleaseReading | null {
  const lift = steps.length - 1;
  const id =
    steps[lift]?.type === 'touchEnd' ? steps[lift].changed[0]?.id : undefined;
  if (id == null || arrivals.length !== steps.length) {
    return null;
  }
  const marks: {index: number; x: number; y: number}[] = [];
  for (let i = lift - 1; i >= 0 && marks.length < 3; i--) {
    const step = steps[i];
    const finger =
      step.type === 'touchStart' || step.type === 'touchMove'
        ? step.changed.find(f => f.id === id)
        : undefined;
    if (finger != null) {
      marks.unshift({index: i, x: finger.x, y: finger.y});
    }
  }
  if (marks.length < 2) {
    return null;
  }
  const releaseFrom = (time: (i: number) => number) => {
    const velocity = (a: (typeof marks)[0], b: (typeof marks)[0]) => {
      const seconds = (time(b.index) - time(a.index)) / 1000;
      return seconds > 0
        ? {x: (b.x - a.x) / seconds, y: (b.y - a.y) / seconds}
        : {x: Infinity, y: Infinity};
    };
    const newest = velocity(marks[marks.length - 2], marks[marks.length - 1]);
    const before =
      marks.length === 3 ? velocity(marks[0], marks[1]) : {x: 0, y: 0};
    const w = TOUCH_RELEASE_NEWEST_WEIGHT;
    return {
      x: w * newest.x + (1 - w) * before.x,
      y: w * newest.y + (1 - w) * before.y,
    };
  };
  const last = marks[marks.length - 1].index;
  const scriptRests = steps[lift].t - steps[last].t > TOUCH_STILLNESS_MS;
  const rests =
    !scriptRests &&
    arrivals[lift].stamp - arrivals[last].stamp > TOUCH_STILLNESS_MS;
  const script = scriptRests ? {x: 0, y: 0} : releaseFrom(i => steps[i].t);
  const page =
    rests || scriptRests ? script : releaseFrom(i => arrivals[i].stamp);
  const scriptPxPerS = Math.hypot(script.x, script.y);
  const pageRead = rests ? {x: 0, y: 0} : page;
  return {
    pagePxPerS: Math.hypot(pageRead.x, pageRead.y),
    scriptPxPerS,
    rests,
    strayShare:
      scriptPxPerS > 0
        ? Math.hypot(pageRead.x - script.x, pageRead.y - script.y) /
          scriptPxPerS
        : 0,
    span: Array.from(
      {length: lift - marks[0].index},
      (_, k) => marks[0].index + 1 + k,
    ),
  };
}

/**
 * Reads a paced play's release as the page did and returns where the page
 * read a resting finger or, given `tolerance`, a release that strays from
 * the script's by more than that share of it; null otherwise. The release
 * blends the lifting finger's last two move intervals (its touch-down counts
 * as the first event) and is 0 once the finger has not moved for longer than
 * the stillness interval before it lifts, so only those gaps decide it: an
 * earlier stall leaves it intact. A rest the script makes is the script's.
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
): TouchPacingFault | null {
  const reading = readRelease(steps, arrivals);
  if (
    reading == null ||
    !(reading.rests || (tolerance != null && reading.strayShare > tolerance))
  ) {
    return null;
  }
  const {span} = reading;
  const gapsMs = span.map(i => arrivals[i].stamp - arrivals[i - 1].stamp);
  const scriptedGapsMs = span.map(i => steps[i].t - steps[i - 1].t);
  let heldByPage: TouchPacingFault['heldByPage'] = null;
  span.forEach((i, k) => {
    const handlingMs = arrivals[i - 1].handledAt - arrivals[i - 1].stamp;
    const held =
      Number.isFinite(handlingMs) &&
      handlingMs > scriptedGapsMs[k] &&
      handlingMs + HELD_BACK_MS >= gapsMs[k] - scriptedGapsMs[k];
    if (held && (heldByPage == null || handlingMs > heldByPage.handlingMs)) {
      heldByPage = {gapMs: gapsMs[k], handlingMs};
    }
  });
  return {
    kind: reading.rests ? 'rest' : 'release',
    pageReleasePxPerS: reading.pagePxPerS,
    scriptReleasePxPerS: reading.scriptPxPerS,
    gapsMs,
    scriptedGapsMs,
    heldByPage,
  };
}

function describeFault(fault: TouchPacingFault): string {
  const gaps = `gaps ${fault.gapsMs.map(g => g.toFixed(0)).join(', ')} ms where the script spaces ${fault.scriptedGapsMs.map(g => g.toFixed(0)).join(', ')} ms`;
  return fault.kind === 'rest'
    ? `the page read a resting finger: the lift reached it more than ${TOUCH_STILLNESS_MS} ms after the last move (${gaps})`
    : `the page read a release of ${fault.pageReleasePxPerS.toFixed(0)} px/s where the script throws ${fault.scriptReleasePxPerS.toFixed(0)} px/s (${gaps})`;
}

/**
 * A paced play's page read a release that is not the script's, and its own
 * touch listeners did not hold the events back: a dispatch stalled before
 * the page. The runner failed, not the component under test.
 */
export class TouchPacingError extends Error {
  constructor(readonly fault: TouchPacingFault) {
    super(
      `touchDriver: ${describeFault(fault)}: a dispatch stalled before the page`,
    );
    this.name = 'TouchPacingError';
  }
}

/**
 * A paced play's page read a release that is not the script's because its
 * own touch listeners held an event back: they were still handling the
 * event before, and WebKit dispatches the next touch only once the page is
 * free. The page changed the release, so this is the proof's own failure.
 */
export class TouchPageStallError extends Error {
  constructor(
    readonly fault: TouchPacingFault & {
      readonly heldByPage: NonNullable<TouchPacingFault['heldByPage']>;
    },
  ) {
    super(
      `touchDriver: the page's own touch listeners took ${fault.heldByPage.handlingMs.toFixed(0)} ms to handle an event, so the next reached it ${fault.heldByPage.gapMs.toFixed(0)} ms later, and ${describeFault(fault)}: the page changed the release, not the runner`,
    );
    this.name = 'TouchPageStallError';
  }
}

/** Records what the page saw of a paced play's touches (WebKit). */
interface TouchArrivalProbe {
  arm(): Promise<void>;
  read(): Promise<TouchArrival[]>;
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
  } = options;
  const steps = toTouchEvents(script);
  // Only where the page reads a velocity from arrival times: scripted
  // timestamps carry it.
  const judges = probe != null && realtime && pacing === 'spacing';
  if (judges) {
    await probe.arm();
  }
  const played: PlayedEvent[] = [];
  const origin = performance.now();
  let previous: {sentAt: number; returnedAt: number} | null = null;
  for (const [index, step] of steps.entries()) {
    if (realtime) {
      await until(pacedDeadline(pacing, origin, steps, index, previous));
    }
    const timestamp = stampFor(step.t);
    const dispatchedAt = Date.now();
    const sentAt = performance.now();
    await dispatch(step, timestamp);
    previous = {sentAt, returnedAt: performance.now()};
    played.push({...step, dispatchedAt, returnedAt: Date.now(), timestamp});
    await onEvent?.(step, index);
  }
  // Judged once the lift is out, so no finger is left down.
  if (judges) {
    const arrivals = await probe.read();
    if (arrivals.length !== steps.length) {
      throw new Error(
        `touchDriver: the page received ${arrivals.length} of a paced play's ${steps.length} touch events`,
      );
    }
    const fault = touchPacingFault(steps, arrivals, releaseTolerance);
    if (fault != null) {
      throw fault.heldByPage == null
        ? new TouchPacingError(fault)
        : new TouchPageStallError({...fault, heldByPage: fault.heldByPage});
    }
    const reading = readRelease(steps, arrivals);
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
  return {
    engine: 'chromium',
    scriptedTimestamps: true,
    drivesNativeGestures: true,
    partialLifts: true,
    async play(script, options = {}) {
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

/** The touch events a paced play's probe records. */
const TOUCH_TYPES = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];

/**
 * Records, for each touch event of a paced play, when it reached the page
 * and when the page's own listeners had finished with it (`armInputRun`).
 */
function touchArrivalProbe(page: Page): TouchArrivalProbe {
  let armed: JSHandle<InputRun> | null = null;
  return {
    async arm() {
      await armed?.evaluate(run => run.stop());
      await armed?.dispose();
      armed = await armInputRun(page, TOUCH_TYPES);
    },
    async read() {
      if (armed == null) {
        return [];
      }
      const run = armed;
      armed = null;
      const record = await run.evaluate(recorded => {
        recorded.stop();
        return {
          stamps: recorded.stamps.slice(),
          handledAt: recorded.handledAt.slice(),
        };
      });
      await run.dispose();
      return record.stamps.map((stamp, i) => ({
        stamp,
        handledAt: record.handledAt[i],
      }));
    },
  };
}

async function webkitDriver(page: Page): Promise<TouchDriver> {
  const session = webkitPageSession(page);
  // WebKit's command takes integer CSS px and applies the event's phase to
  // every point it lists: a start lists only the fingers that land (listing a
  // finger already down presses it again), an end only the fingers that lift
  // (an empty list releases nothing), a move every finger down.
  const points = (fingers: readonly Finger[]) =>
    fingers.map(f => ({x: Math.round(f.x), y: Math.round(f.y), id: f.id}));
  return {
    engine: 'webkit',
    scriptedTimestamps: false,
    drivesNativeGestures: false,
    partialLifts: false,
    async play(script, options = {}) {
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
      await page.touchscreen.tap(Math.round(at.x), Math.round(at.y));
    },
  };
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
