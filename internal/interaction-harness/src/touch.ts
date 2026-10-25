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
 *   the real dispatch time, so velocity comes from real-time pacing, ±1 ms);
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

import type {CDPSession, Page} from '@playwright/test';
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

async function playSteps(
  script: TouchScript,
  options: PlayOptions,
  dispatch: (step: TouchEventStep, timestamp: number) => Promise<void>,
  stampFor: (t: number) => number,
): Promise<PlayedEvent[]> {
  const {realtime = true, onEvent} = options;
  const steps = toTouchEvents(script);
  const played: PlayedEvent[] = [];
  const origin = performance.now();
  for (const [index, step] of steps.entries()) {
    if (realtime) {
      await until(origin + step.t);
    }
    const timestamp = stampFor(step.t);
    const dispatchedAt = Date.now();
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
    'touchend', 'touchcancel', 'click', 'contextmenu', 'gotpointercapture', 'lostpointercapture'];
  for (const type of types) {
    // Bubble phase on window, so defaultPrevented reflects the page's own handlers.
    window.addEventListener(type, event => {
      const record = {type, timeStamp: event.timeStamp, isTrusted: event.isTrusted, cancelable: event.cancelable,
        defaultPrevented: event.defaultPrevented, target: describe(event.target)};
      if ('pointerId' in event) Object.assign(record, {pointerId: event.pointerId, pointerType: event.pointerType, x: event.clientX, y: event.clientY});
      if (event.touches) Object.assign(record, {touches: event.touches.length, x: event.changedTouches[0] && event.changedTouches[0].clientX, y: event.changedTouches[0] && event.changedTouches[0].clientY});
      log.push(record);
    }, {passive: true});
  }
})()`;

/** Records every pointer/touch/click the page receives (install before navigation). */
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
