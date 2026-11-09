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
   * `wheelArrivals`). Past it, the proof's component would treat the run as
   * more than one gesture. Past it `wheelBurst` throws
   * `WheelPageStallError` when the page held the gap, and `WheelPacingError`
   * otherwise. The page holds it while it handles the step before, or while
   * it draws no frame.
   */
  readonly maxGapMs?: number;
}

/**
 * The page received a wheel burst's steps further apart than the proof's
 * `maxGapMs`, and its wheel listeners did not hold the step back: the step
 * reached the page later than one frame after they finished the one before,
 * or the gap was no wider than the harness's own spacing of the sends (the
 * page can only widen a gap, so a starved renderer that also held the step
 * lands here). The dispatch stalled before the page, so a loaded runner
 * splits what the driver sent as one gesture. Other work between steps that
 * leaves the page's frames running also lands here. Such a stall is the
 * runner's or that work's, never the wheel listeners'.
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
 * `maxGapMs` while its main thread was held. Its own wheel listeners were
 * still handling the step before, or the page drew no frame across the gap.
 * WebKit dispatches the next step only once the thread is free. Both
 * times are page wall time. On a starved runner they include the page's wait
 * for a CPU, and a renderer held from outside draws no frame either. Judge a
 * page stall from a run with CI's CPU limits: there it is the proof's own
 * failure.
 */
export class WheelPageStallError extends Error {
  constructor(
    readonly maxGapMs: number,
    readonly stall: WheelPageStall,
  ) {
    super(
      stall.frameGapMs == null
        ? `webInputDriver: the page's own wheel listeners took ${stall.handlingMs.toFixed(0)} ms of page wall time to handle a step, so the next reached it ${stall.gapMs.toFixed(0)} ms later, over its ${maxGapMs} ms: the page split the run. On a starved runner that time includes the page's wait for a CPU: judge a page stall from a run with CI's CPU limits`
        : `webInputDriver: the page drew no frame for ${stall.frameGapMs.toFixed(0)} ms around a ${stall.gapMs.toFixed(0)} ms gap between two wheel steps, over its ${maxGapMs} ms (engine or page work), while its own wheel listeners took ${stall.handlingMs.toFixed(0)} ms: the page split the run. On a starved runner the renderer draws no frame either: judge a page stall from a run with CI's CPU limits`,
    );
    this.name = 'WheelPageStallError';
  }
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
  const lastSent = deltas.map(([dx, dy]) => {
    rx += dx;
    ry += dy;
    for (let j = from; j < sentSums.length; j++) {
      if (close(sentSums[j][0], rx) && close(sentSums[j][1], ry)) {
        from = j + 1;
        return j;
      }
    }
    return null;
  });
  return lastSent.slice(1).map((j, i) => {
    const before = lastSent[i];
    return j == null || before == null || j <= before
      ? null
      : sentAt[before + 1] - sentAt[before];
  });
}

/**
 * Sorts a burst's gaps past `maxGapMs` by cause. `stamps` are when the
 * received steps reached the page (`wheelArrivals`). `handledAt` is when the
 * page's wheel listeners had finished with each, NaN unseen. For a step whose
 * propagation the page stopped, it is when a task queued at its arrival ran.
 * `sendGapsMs` is how far apart the harness sent the steps behind each gap
 * (`wheelSendGaps`; `null` where unknown). WebKit dispatches a step only once
 * the page's main thread is free. There a gap is the page's when the step
 * reached it within one frame of the listeners finishing the step before. It
 * waited on them. The gap must also be more than a frame wider than the
 * harness's own spacing of those steps. The page can only widen a gap, so one
 * no wider than the send spacing is the dispatch's. That holds even when a
 * starved renderer also held the step, as a runner whose CPU quota holds the
 * page right after its listeners does. A WebKit gap is the page's too when
 * `frames`, the page's frame times, show none across nearly all of it. Then
 * engine or page work held the main thread, or a starved runner held the
 * renderer, not the page's wheel listeners.
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
): {pageStalls: WheelPageStall[]; dispatchStalls: number[]} {
  const pageStalls: WheelPageStall[] = [];
  const dispatchStalls: number[] = [];
  for (let i = 1; i < stamps.length; i++) {
    const gapMs = stamps[i] - stamps[i - 1];
    if (gapMs <= maxGapMs) {
      continue;
    }
    const sendGapMs = sendGapsMs[i - 1];
    const widened = sendGapMs == null || gapMs > sendGapMs + HELD_BACK_MS;
    const handlingMs = handledAt[i - 1] - stamps[i - 1];
    const heldBack =
      engine === 'webkit' &&
      Number.isFinite(handledAt[i - 1]) &&
      stamps[i] - handledAt[i - 1] <= HELD_BACK_MS &&
      widened;
    const frameGap =
      engine === 'webkit' && widened
        ? frameGapAcross(frames, stamps[i - 1], stamps[i])
        : null;
    if (heldBack) {
      pageStalls.push({gapMs, handlingMs});
    } else if (frameGap != null && frameGap.covered >= gapMs - HELD_BACK_MS) {
      pageStalls.push({
        gapMs,
        handlingMs: Number.isFinite(handlingMs) ? handlingMs : 0,
        frameGapMs: frameGap.gapMs,
      });
    } else {
      dispatchStalls.push(gapMs);
    }
  }
  return {pageStalls, dispatchStalls};
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
   * their arrivals (`wheelArrivals`), ms. With `maxGapMs`, a longer gap throws
   * `WheelPageStallError` when the page held it, and `WheelPacingError`
   * otherwise. The page holds a gap while it handles the step before, or
   * while it draws no frame.
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
  {steps, maxGapMs}: Pick<WheelBurst, 'steps' | 'maxGapMs'>,
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
  const arrivals = wheelArrivals(engine, got.stamps, got.receivedAt);
  const receivedGapsMs = arrivals.slice(1).map((t, i) => t - arrivals[i]);
  if (maxGapMs != null) {
    const {pageStalls, dispatchStalls} = wheelGapCauses(
      engine,
      arrivals,
      got.handledAt,
      maxGapMs,
      wheelSendGaps(steps, sentAt, got.deltas),
      got.frames,
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
    async wheelBurst({x, y, steps, everyMs = 16, ctrl = false, maxGapMs}) {
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
        {steps, maxGapMs},
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
    async wheelBurst({x, y, steps, everyMs = 16, ctrl = false, maxGapMs}) {
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
          {steps, maxGapMs},
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
