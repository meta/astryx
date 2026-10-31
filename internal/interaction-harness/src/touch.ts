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
 *   sends some steps late, and the ones behind them back to back;
 *   `checkPacing` reads what the page received);
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

import type {CDPSession, Page, TestInfo} from '@playwright/test';
import {
  toTouchEvents,
  type Finger,
  type Point,
  type TouchEventStep,
  type TouchScript,
} from './scripts';

export type Engine = 'chromium' | 'webkit';

export interface PlayOptions {
  /**
   * Pace dispatch on the wall clock so each event leaves at its scripted time
   * (default true). Required in WebKit for a velocity to mean anything; in
   * Chromium the page sees the scripted timestamps either way, but native
   * behaviors that run on the compositor clock (a fling) want real pacing.
   */
  readonly realtime?: boolean;
  /**
   * Check, once the gesture is played in real time, that the page received it
   * at the script's pacing, and throw `TouchPacingError` if not (default
   * false). Only WebKit can fail it: its touches carry their real dispatch
   * time. For a proof whose outcome follows a velocity, with
   * `retakeOnTouchPacing` around it.
   */
  readonly checkPacing?: boolean;
  /** Called after each event is dispatched, before the next one (storyboards). */
  readonly onEvent?: (
    step: TouchEventStep,
    index: number,
  ) => Promise<void> | void;
}

export interface PlayedEvent extends TouchEventStep {
  /** Wall-clock milliseconds (epoch) at which the event was dispatched. */
  readonly dispatchedAt: number;
  /** The timestamp handed to the engine, epoch ms (Chromium only). */
  readonly timestamp: number | null;
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
  /**
   * Whether a scripted press and lift in place (`play(tap(at))`) gets the
   * click a finger's tap gets. Playwright's WebKit synthesises that click only
   * from `tap` (its tap gesture), never from a scripted touch sequence. Use
   * `tap` for a tap that must click, or skip with `SCRIPTED_CLICK_SKIP`.
   */
  readonly synthesizesClicks: boolean;
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

/**
 * The skip reason for a proof that needs the click a scripted tap gets, on a
 * driver whose `synthesizesClicks` is false: Playwright's WebKit synthesises
 * the click only from its tap gesture (`driver.tap`), never from touches it
 * is sent one by one.
 */
export const SCRIPTED_CLICK_SKIP =
  'injected WebKit touches synthesise no click, only driver.tap does (README: engine limits); tap with driver.tap, or capture it on the iOS simulator';

/**
 * The most a move interval a release velocity reads may move from the script
 * by the time the page receives it, in ms. WebKit's touches carry their real
 * dispatch time, in whole ms: on one worker, 440 gaps over 40 flicks moved at
 * most 4 ms; a stalled dispatch moves one by 20 ms or more, and the events
 * queued behind it land 1 to 2 ms apart.
 */
export const TOUCH_PACING_TOLERANCE_MS = 4;

/**
 * How long after its last move a lift may reach the page before the release
 * reads as still, in ms: UIKit's measured stillness (`spec:AST-100` FR2).
 */
export const TOUCH_LIFT_STILLNESS_MS = 40;

const formatGaps = (gaps: readonly number[]) =>
  gaps.map(gap => Number(gap.toFixed(1))).join(', ');

/**
 * A gesture the page received off its scripted pacing. WebKit's touch command
 * takes no timestamp, so the page times each event by when it arrives: under
 * load a dispatch can stall and the events behind it arrive at once, and the
 * page measures another velocity than the script's.
 */
export class TouchPacingError extends Error {
  readonly scriptedGaps: readonly number[];
  readonly receivedGaps: readonly number[];
  constructor(
    reason: string,
    scriptedGaps: readonly number[],
    receivedGaps: readonly number[],
  ) {
    super(
      `the page received this gesture off its scripted pacing: ${reason} (scripted gaps ${formatGaps(scriptedGaps)} ms; received ${formatGaps(receivedGaps)} ms)`,
    );
    this.name = 'TouchPacingError';
    this.scriptedGaps = scriptedGaps;
    this.receivedGaps = receivedGaps;
  }
}

/**
 * The page's own handling of touch events explains a gesture's off-pace
 * interval: in WebKit an event waits for the page's main thread, so a handler
 * that blocks widens the gaps after it as a stalled runner does. This is the
 * page's stall, so `retakeOnTouchPacing` never re-takes it.
 */
export class TouchPageStallError extends Error {
  readonly scriptedGaps: readonly number[];
  readonly receivedGaps: readonly number[];
  constructor(
    reason: string,
    scriptedGaps: readonly number[],
    receivedGaps: readonly number[],
  ) {
    super(
      `the page's own handling put this gesture off its scripted pacing: ${reason} (scripted gaps ${formatGaps(scriptedGaps)} ms; received ${formatGaps(receivedGaps)} ms)`,
    );
    this.name = 'TouchPageStallError';
    this.scriptedGaps = scriptedGaps;
    this.receivedGaps = receivedGaps;
  }
}

/**
 * Checks a gesture's pacing at the page where it decides a release: `steps`
 * are its events in the script, with their times, `received` the
 * `timeStamp`s the page saw, in order, and `handledAt` when the page's
 * listeners had run for each of them. One event per scripted one (fewer only when `partial`, the
 * touched element having left the document, which takes its later events
 * with it); the last two move intervals before the lift, which a release
 * velocity reads, each within `TOUCH_PACING_TOLERANCE_MS` of the script's;
 * and the lift within `TOUCH_LIFT_STILLNESS_MS` of the last move. The
 * gesture's first moves and its lift arrive with the page's own handling
 * time in WebKit (a burst after `touchstart`, a lift a frame late), and no
 * release reads them. An interval or a lift off pace by more than the time
 * the page held the event before it explains is the runner's:
 * `TouchPacingError`. One that time explains (a widened gap, or the burst
 * after it) is the page's own stall: `TouchPageStallError`.
 */
export function checkTouchPacing(
  steps: readonly {readonly t: number; readonly type: string}[],
  received: readonly number[],
  {
    partial = false,
    handledAt = [],
  }: {partial?: boolean; handledAt?: readonly number[]} = {},
): void {
  const gapsOf = (times: readonly number[]) =>
    times.slice(1).map((t, i) => t - times[i]);
  const scriptedGaps = gapsOf(steps.map(step => step.t));
  const receivedGaps = gapsOf(received);
  if (
    received.length > steps.length ||
    (received.length < steps.length && !partial)
  ) {
    throw new TouchPacingError(
      `${received.length} touch events arrived for ${steps.length} dispatched`,
      scriptedGaps,
      receivedGaps,
    );
  }
  const lift = steps.length - 1;
  if (received.length < steps.length || steps[lift]?.type !== 'touchEnd') {
    return;
  }
  // How long the page held each event: from its stamp until its listeners had
  // run, waiting for the main thread included.
  const held = (i: number) => {
    const h = (handledAt[i] ?? Number.NaN) - received[i];
    return Number.isFinite(h) && h > 0 ? h : 0;
  };
  // The gap ending at event i runs from event i - 1 to event i. A widened gap
  // is the page's when the page held event i - 1 longer than the tolerance
  // itself, and the gap is on pace without that time. A hold within the
  // tolerance is measurement noise (WebKit stamps to the millisecond), and
  // the rest of the gap is the dispatch's.
  const pageHeld = (i: number) => held(i) > TOUCH_PACING_TOLERANCE_MS;
  const widenedByPage = (i: number) =>
    pageHeld(i - 1) &&
    receivedGaps[i - 1] - held(i - 1) - scriptedGaps[i - 1] <=
      TOUCH_PACING_TOLERANCE_MS;
  const offPace: {reason: string; page: boolean}[] = [];
  const moves = steps.flatMap((step, i) =>
    step.type === 'touchMove' ? [i] : [],
  );
  const lastMove = moves.at(-1);
  if (lastMove == null) {
    return;
  }
  for (const i of moves.slice(-2)) {
    if (i === 0 || steps[i - 1].type !== 'touchMove') {
      continue;
    }
    const off = receivedGaps[i - 1] - scriptedGaps[i - 1];
    if (Math.abs(off) <= TOUCH_PACING_TOLERANCE_MS) {
      continue;
    }
    // A burst comes from the widened gap before it: it is whose that gap is.
    let cause = i;
    while (
      cause > 1 &&
      receivedGaps[cause - 1] - scriptedGaps[cause - 1] <=
        TOUCH_PACING_TOLERANCE_MS
    ) {
      cause -= 1;
    }
    offPace.push({
      reason: `the move interval ending at event ${i + 1}, which a release velocity reads, is ${Math.abs(off).toFixed(1)} ms off, over ${TOUCH_PACING_TOLERANCE_MS} ms`,
      page:
        receivedGaps[cause - 1] - scriptedGaps[cause - 1] >
          TOUCH_PACING_TOLERANCE_MS && widenedByPage(cause),
    });
  }
  const liftAfter = received[lift] - received[lastMove];
  if (liftAfter >= TOUCH_LIFT_STILLNESS_MS) {
    offPace.push({
      reason: `the lift came ${liftAfter.toFixed(1)} ms after the last move, where a release reads as still from ${TOUCH_LIFT_STILLNESS_MS} ms`,
      page:
        pageHeld(lastMove) &&
        liftAfter - held(lastMove) < TOUCH_LIFT_STILLNESS_MS,
    });
  }
  const byPage = offPace.find(o => o.page);
  if (byPage != null) {
    throw new TouchPageStallError(byPage.reason, scriptedGaps, receivedGaps);
  }
  if (offPace.length > 0) {
    throw new TouchPacingError(offPace[0].reason, scriptedGaps, receivedGaps);
  }
}

/**
 * Plays a gesture through `attempt`, and once more when the page received it
 * off its scripted pacing: `attempt` builds the page's state, plays the
 * gesture and makes the spec's assertions, so a re-take starts over. One
 * re-take, two attempts in all, and only on a `TouchPacingError`: any other
 * error, and a second `TouchPacingError`, fail the test with their own
 * cause. Each re-take is listed in the report as a `touch-retake`
 * annotation.
 */
export async function retakeOnTouchPacing<T>(
  testInfo: Pick<TestInfo, 'annotations'>,
  attempt: (n: 1 | 2) => Promise<T>,
): Promise<T> {
  try {
    return await attempt(1);
  } catch (error) {
    if (!(error instanceof TouchPacingError)) {
      throw error;
    }
    testInfo.annotations.push({
      type: 'touch-retake',
      description: error.message,
    });
    return attempt(2);
  }
}

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

/** The clock `playSteps` paces by: real time, or a test's own. */
export interface PlayClock {
  now(): number;
  until(deadline: number): Promise<void>;
}

/**
 * Dispatches a script's events through `dispatch`, paced in real time unless
 * `realtime` is false. Exported for its unit test; specs use `touchDriver`.
 */
export async function playSteps(
  script: TouchScript,
  options: PlayOptions,
  dispatch: (step: TouchEventStep, timestamp: number) => Promise<void>,
  stampFor: (t: number) => number,
  clock: PlayClock = {now: () => performance.now(), until},
): Promise<PlayedEvent[]> {
  const {realtime = true, onEvent} = options;
  const steps = toTouchEvents(script);
  const played: PlayedEvent[] = [];
  const origin = clock.now();
  let previous: {t: number; sentAt: number} | null = null;
  for (const [index, step] of steps.entries()) {
    if (realtime) {
      // At its scripted time, and never sooner after the event before it
      // than the script spaces them: after a stall the rest keep their gaps
      // instead of leaving together.
      await clock.until(
        previous == null
          ? origin + step.t
          : Math.max(origin + step.t, previous.sentAt + (step.t - previous.t)),
      );
    }
    const timestamp = stampFor(step.t);
    const dispatchedAt = Date.now();
    previous = {t: step.t, sentAt: clock.now()};
    await dispatch(step, timestamp);
    played.push({...step, dispatchedAt, timestamp});
    await onEvent?.(step, index);
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
    synthesizesClicks: true,
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

async function webkitDriver(page: Page): Promise<TouchDriver> {
  const session = webkitPageSession(page);
  // WebKit's command takes integer CSS px and applies the event's phase to
  // every point it lists: a start lists only the fingers that land (listing a
  // finger already down presses it again), an end only the fingers that lift
  // (an empty list releases nothing), a move every finger down.
  const points = (fingers: readonly Finger[]) =>
    fingers.map(f => ({x: Math.round(f.x), y: Math.round(f.y), id: f.id}));
  // The page's own record of each touch's `timeStamp`, to check the pacing.
  await page.addInitScript(TOUCH_PACE_SCRIPT);
  await page.evaluate(TOUCH_PACE_SCRIPT);
  return {
    engine: 'webkit',
    scriptedTimestamps: false,
    drivesNativeGestures: false,
    partialLifts: false,
    synthesizesClicks: false,
    async play(script, options = {}) {
      const check =
        (options.checkPacing ?? false) && (options.realtime ?? true);
      const from = check ? await readTouchPace(page, 0) : null;
      if (check) {
        await page.evaluate(() =>
          (
            window as unknown as {__harnessTouchPace?: {rearm(): void}}
          ).__harnessTouchPace?.rearm(),
        );
      }
      const played = await playSteps(
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
      );
      if (from != null) {
        const pace = await readTouchPace(page, from.count);
        checkTouchPacing(played, pace.times, {
          partial: !pace.connected,
          handledAt: pace.handledAt,
        });
      }
      return played.map(p => ({...p, timestamp: null}));
    },
    async tap(at) {
      await page.touchscreen.tap(Math.round(at.x), Math.round(at.y));
    },
  };
}

/**
 * Records the `timeStamp` of every trusted touch event the page receives, and
 * the element the last `touchstart` touched (WebKit's pacing check).
 */
const TOUCH_PACE_SCRIPT = `(() => {
  if (window.__harnessTouchPace) return;
  const pace = (window.__harnessTouchPace = {times: [], handledAt: [], start: null});
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    window.addEventListener(type, event => {
      if (!event.isTrusted) return;
      const index = pace.times.length;
      pace.times.push(event.timeStamp);
      pace.handledAt.push(NaN);
      if (type === 'touchstart') pace.start = event.target;
      // When the page stopped the event's propagation, the next task marks it.
      const later = (window.__harnessTimerGate && window.__harnessTimerGate.timeout) || setTimeout;
      later(() => { if (Number.isNaN(pace.handledAt[index])) pace.handledAt[index] = performance.now(); }, 0);
    }, {capture: true, passive: true});
  }
  // Last on window's bubble phase: rearm() adds it again after the page's own.
  const end = event => {
    if (!event.isTrusted) return;
    const index = pace.handledAt.length - 1;
    if (index >= 0 && Number.isNaN(pace.handledAt[index])) pace.handledAt[index] = performance.now();
  };
  pace.rearm = () => {
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      window.removeEventListener(type, end);
      window.addEventListener(type, end, {passive: true});
    }
  };
  pace.rearm();
})()`;

/** The touch times recorded since `from`, and whether the touched element is still in the document. */
async function readTouchPace(
  page: Page,
  from: number,
): Promise<{
  count: number;
  times: number[];
  handledAt: number[];
  connected: boolean;
}> {
  return page.evaluate(at => {
    const pace = (
      window as unknown as {
        __harnessTouchPace?: {
          times: number[];
          handledAt: number[];
          start: Node | null;
        };
      }
    ).__harnessTouchPace;
    const times = pace?.times ?? [];
    return {
      count: times.length,
      times: times.slice(at),
      handledAt: (pace?.handledAt ?? []).slice(at),
      connected: pace?.start?.isConnected ?? true,
    };
  }, from);
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
