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

import type {CDPSession, JSHandle, Page, TestInfo} from '@playwright/test';
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
   * The longest gap the page may see between two received steps, ms (see
   * `wheelArrivals`): the gap after which the proof's component would treat
   * the run as more than one gesture. Past it `wheelBurst` throws `WheelPageStallError` when the
   * page's own handling of the step before caused the gap, and
   * `WheelPacingError` otherwise.
   */
  readonly maxGapMs?: number;
}

/**
 * The page received a wheel burst's steps further apart than the proof's
 * `maxGapMs`, and its wheel listeners did not hold the step back: the step
 * reached the page later than one frame after they finished the one before.
 * The dispatch stalled before the page, so a loaded runner splits what the
 * driver sent as one gesture. Other work on the page's main
 * thread between steps (timers, frame callbacks) also lands here, so a
 * re-taken run is the runner's or that work's, never the wheel listeners'.
 */
export class WheelPacingError extends Error {
  constructor(
    readonly maxGapMs: number,
    readonly receivedGapsMs: readonly number[],
  ) {
    super(
      `webInputDriver: the page received the wheel burst with a gap of ${Math.max(...receivedGapsMs).toFixed(0)} ms, over its ${maxGapMs} ms (gaps ${receivedGapsMs.map(g => g.toFixed(0)).join(', ')} ms): the dispatch stalled before the page, so the page saw more than one gesture`,
    );
    this.name = 'WheelPacingError';
  }
}

/**
 * The page received a wheel burst's steps further apart than the proof's
 * `maxGapMs` because it was still handling the step before: its own wheel
 * listeners held the main thread, and WebKit dispatches the next step only
 * once it is free. The page split the gesture, so this is the proof's own
 * failure, never re-taken.
 */
export class WheelPageStallError extends Error {
  constructor(
    readonly maxGapMs: number,
    readonly stall: WheelPageStall,
  ) {
    super(
      `webInputDriver: the page's own wheel listeners took ${stall.handlingMs.toFixed(0)} ms to handle a step, so the next reached it ${stall.gapMs.toFixed(0)} ms later, over its ${maxGapMs} ms: the page split the run, not the runner`,
    );
    this.name = 'WheelPageStallError';
  }
}

/** A gap the page caused: how long it was, and how long the page spent handling the step before it. */
export interface WheelPageStall {
  readonly gapMs: number;
  readonly handlingMs: number;
}

/**
 * How soon after the page's wheel listeners finish one step the next must
 * reach the page for the page to have held it back: one frame, with a few ms
 * for the dispatch itself.
 */
const HELD_BACK_MS = 20;

/**
 * When each received step of a burst reached the page, ms on the page clock:
 * its `timeStamp` in Chromium, which stamps a step with its dispatch time; in
 * WebKit, when the page's first listener received it. WebKit coalesces the
 * steps it holds while the page's main thread is busy, and the coalesced step
 * keeps the stamp of the step before it, so its stamp cannot show how long the
 * page made it wait.
 */
export function wheelArrivals(
  engine: Engine,
  stamps: readonly number[],
  receivedAt: readonly number[],
): readonly number[] {
  return engine === 'webkit' ? receivedAt : stamps;
}

/**
 * Sorts a burst's gaps past `maxGapMs` by cause. `stamps` are when the
 * received steps reached the page (`wheelArrivals`); `handledAt` is when the
 * page's wheel listeners had finished with each (NaN where that was not seen). In WebKit, which
 * dispatches a step only once the page's main thread is free, a gap is the
 * page's when the step reached the page within one frame of the listeners
 * finishing the step before: it was waiting on them. Every other gap is the
 * dispatch's, and in Chromium, which stamps a step with its dispatch time, so
 * the page cannot move its stamps, every gap is. Other work on the page's main
 * thread between steps (timers, frame callbacks) counts as the dispatch's.
 */
export function wheelGapCauses(
  engine: Engine,
  stamps: readonly number[],
  handledAt: readonly number[],
  maxGapMs: number,
): {pageStalls: WheelPageStall[]; dispatchStalls: number[]} {
  const pageStalls: WheelPageStall[] = [];
  const dispatchStalls: number[] = [];
  for (let i = 1; i < stamps.length; i++) {
    const gapMs = stamps[i] - stamps[i - 1];
    if (gapMs <= maxGapMs) {
      continue;
    }
    const heldBack =
      engine === 'webkit' &&
      Number.isFinite(handledAt[i - 1]) &&
      stamps[i] - handledAt[i - 1] <= HELD_BACK_MS;
    if (heldBack) {
      pageStalls.push({gapMs, handlingMs: handledAt[i - 1] - stamps[i - 1]});
    } else {
      dispatchStalls.push(gapMs);
    }
  }
  return {pageStalls, dispatchStalls};
}

/**
 * Runs a wheel proof through `attempt`, and once more when the page received
 * its burst off pace: `attempt` builds the page's state, sends the burst with
 * `maxGapMs` and makes the spec's assertions, so a re-take starts over. One
 * re-take, two attempts in all, and only on a `WheelPacingError`: any other
 * error (a `WheelPageStallError`, which the page's wheel listeners caused,
 * among them), and a second `WheelPacingError`, fail the test with their own
 * cause. A `WheelPacingError` is the runner's or other work on the page's main
 * thread between steps, so a re-take does not clear the page of that work.
 * Each re-take is listed in the report as a `wheel-retake` annotation.
 */
export async function retakeOnWheelPacing<T>(
  testInfo: Pick<TestInfo, 'annotations'>,
  attempt: (n: 1 | 2) => Promise<T>,
): Promise<T> {
  try {
    return await attempt(1);
  } catch (error) {
    if (!(error instanceof WheelPacingError)) {
      throw error;
    }
    testInfo.annotations.push({
      type: 'wheel-retake',
      description: error.message,
    });
    return attempt(2);
  }
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
   * their arrivals (`wheelArrivals`), ms; with `maxGapMs`, a longer gap throws
   * `WheelPageStallError` when the page's own handling of the step before
   * caused it, and `WheelPacingError` otherwise.
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

interface WheelRun {
  stamps: number[];
  /** When the page's first listener received each step. */
  receivedAt: number[];
  /** When the page's wheel listeners had finished with each step; NaN until seen. */
  handledAt: number[];
  dx: number;
  dy: number;
  stop: () => void;
}

/**
 * Arms a passive capture listener that stamps every wheel step the page
 * receives and sums its deltas, before a burst is dispatched, and a passive
 * bubble listener on the window, after the page's own, that notes when the
 * page has finished with each step (a step whose propagation the page stops
 * is never noted, and counts as handled at once).
 */
function armWheelRun(page: Page): Promise<JSHandle<WheelRun>> {
  return page.evaluateHandle(() => {
    const first = {capture: true, passive: true};
    const last = {capture: false, passive: true};
    const run = {
      stamps: [] as number[],
      receivedAt: [] as number[],
      handledAt: [] as number[],
      dx: 0,
      dy: 0,
      stop: () => {
        window.removeEventListener('wheel', received, first);
        window.removeEventListener('wheel', handled, last);
      },
    };
    const received = (event: Event) => {
      const wheel = event as WheelEvent;
      run.stamps.push(wheel.timeStamp);
      run.receivedAt.push(performance.now());
      run.handledAt.push(Number.NaN);
      run.dx += wheel.deltaX;
      run.dy += wheel.deltaY;
    };
    const handled = () => {
      run.handledAt[run.handledAt.length - 1] = performance.now();
    };
    window.addEventListener('wheel', received, first);
    window.addEventListener('wheel', handled, last);
    return run;
  });
}

/**
 * Waits until the armed listener has summed the run's whole delta and returns
 * what it received; throws past the limit, naming how much arrived.
 */
async function untilRunReceived(
  page: Page,
  engine: Engine,
  armed: JSHandle<WheelRun>,
  {steps, maxGapMs}: Pick<WheelBurst, 'steps' | 'maxGapMs'>,
): Promise<{receivedSteps: number; receivedGapsMs: number[]}> {
  const want = steps.reduce<{dx: number; dy: number}>(
    (sum, {dx = 0, dy = 0}) => ({dx: sum.dx + dx, dy: sum.dy + dy}),
    {dx: 0, dy: 0},
  );
  const got = await page.evaluate(
    ([run, total, ms]) =>
      new Promise<{
        stamps: number[];
        receivedAt: number[];
        handledAt: number[];
        dx: number;
        dy: number;
      }>(resolve => {
        // The harness's own wait runs on the real timer: a frozen timer gate
        // (story.ts) holds only the page's.
        const later =
          (
            window as unknown as {
              __harnessTimerGate?: {timeout?: typeof setTimeout};
            }
          ).__harnessTimerGate?.timeout ?? window.setTimeout.bind(window);
        const deadline = performance.now() + ms;
        const whole = () =>
          Math.abs(run.dx - total.dx) < 0.01 &&
          Math.abs(run.dy - total.dy) < 0.01;
        const check = () => {
          if (whole() || performance.now() > deadline) {
            run.stop();
            resolve({
              stamps: run.stamps.slice(),
              receivedAt: run.receivedAt.slice(),
              handledAt: run.handledAt.slice(),
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
  const arrivals = wheelArrivals(engine, got.stamps, got.receivedAt);
  const receivedGapsMs = arrivals.slice(1).map((t, i) => t - arrivals[i]);
  if (maxGapMs != null) {
    const {pageStalls, dispatchStalls} = wheelGapCauses(
      engine,
      arrivals,
      got.handledAt,
      maxGapMs,
    );
    if (pageStalls.length > 0) {
      throw new WheelPageStallError(maxGapMs, pageStalls[0]);
    }
    if (dispatchStalls.length > 0) {
      throw new WheelPacingError(maxGapMs, receivedGapsMs);
    }
  }
  return {receivedSteps: got.stamps.length, receivedGapsMs};
}

/**
 * Sends each step at its scheduled time without awaiting the one before, then
 * waits until every dispatch is answered.
 */
async function dispatchOnSchedule<T>(
  steps: readonly T[],
  everyMs: number,
  send: (step: T) => Promise<unknown>,
): Promise<void> {
  const start = Date.now();
  const sent: Promise<unknown>[] = [];
  for (const [i, step] of steps.entries()) {
    const wait = start + i * everyMs - Date.now();
    if (wait > 0) {
      await sleep(wait);
    }
    sent.push(send(step));
  }
  await Promise.all(sent);
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
    async wheelBurst({x, y, steps, everyMs = 16, ctrl = false, maxGapMs}) {
      const scale = await page.evaluate(
        () => window.devicePixelRatio * (window.visualViewport?.scale ?? 1),
      );
      const armed = await armWheelRun(page);
      await dispatchOnSchedule(steps, everyMs, ({dx = 0, dy = 0}) =>
        cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x,
          y,
          deltaX: dx * scale,
          deltaY: dy * scale,
          modifiers: ctrl ? 2 : 0,
        }),
      );
      return untilRunReceived(page, 'chromium', armed, {steps, maxGapMs});
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
    async wheelBurst({x, y, steps, everyMs = 16, ctrl = false, maxGapMs}) {
      if (mobile) {
        throw new Error(`webInputDriver: ${WHEEL_SKIP}`);
      }
      await page.mouse.move(x, y);
      if (ctrl) {
        await page.keyboard.down('Control');
      }
      try {
        const armed = await armWheelRun(page);
        await dispatchOnSchedule(steps, everyMs, ({dx = 0, dy = 0}) =>
          page.mouse.wheel(dx, dy),
        );
        return await untilRunReceived(page, 'webkit', armed, {
          steps,
          maxGapMs,
        });
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
