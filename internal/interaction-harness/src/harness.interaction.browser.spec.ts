// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file harness.interaction.browser.spec.ts
 * @input Fixture pages written inline (no Storybook), real Chromium/WebKit
 * @output Proof that each harness instrument measures what it claims (the
 *   busy-main-thread proof and the rendering-trace counts with a negative
 *   control beside their positive checks): scripted timestamps reach the
 *   page; a flick flings natively (Chromium); a wheel step arrives as
 *   exactly its deltas, with Control when held, and a pen stroke as trusted
 *   pen pointers with its pressure and times (Chromium); a second finger and
 *   a pinch arrive as distinct pointers; the screencast shows a compositor
 *   animation advancing through a blocked main thread while a rAF animation
 *   freezes; the trace counts zero Layout for a transform animation and one
 *   per frame for a `top` animation, and none from the harness's own
 *   animation recorder while an anchored element's composited animation runs
 *   (a page that asks for a frame every frame lays it out in each); the
 *   long-task log records the page's own long task but not a DevTools
 *   evaluate, which the trace counts; sampled curves
 *   match the oracles, individual transform properties included; a sample at
 *   an end reports the time it was read at; holding takes only running
 *   document-timeline animations, each at its own offset, holds each where it
 *   was read, adds a second hold to the held set without moving the first
 *   hold's times, drops one the page cancels, and releases only them; the
 *   animation-state waits report a running transition and its end, and judge
 *   rest by presented values even while an animation holds its end, and a
 *   watch taken on first contact ignores an animation already running and
 *   keeps the start of one the page cancels when it ends, and the recorder
 *   reads only at CSS starts while a rendering trace runs and catches up
 *   after it;
 *   storyboards write a
 *   sheet and a trace that follows the curve, an endless animation does not
 *   set their length, and a photograph the engine fails throws its error and
 *   records no frame; a touch filmstrip keeps scripted event times while a
 *   handler clock sees its pacing; the timer gate holds a component timer
 *   until the filmstrip is done, drops callbacks the page cancels, stamps held
 *   frames with the time they run, and leaves the harness its own frames; a
 *   cast filmstrip keeps exactly the presented frames of its window, labelled
 *   from its zero, as PNG; a page freeze holds every animation, timer and
 *   clock the page reads and thaws each animation from where it stood (one the
 *   page dated while frozen too), arms on an input ahead of the page's own
 *   listeners, steps by the scene's own clock, and freezes on a condition.
 * @position The harness's own test. A component spec trusts these
 *   instruments; this file is why it may.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  expect,
  keepRequestsLocal,
  test,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import type {CastFrame} from './frames';
import {
  advanceFrozenPage,
  ANSWER_SLACK_MS,
  armHold,
  animationStoryboard,
  castStoryboard,
  blockMainThread,
  BUSY_PROOF_LOOKAROUND_MS,
  busyWindowProof,
  BusyWindowTooLateError,
  castStep,
  compareCurve,
  countBetween,
  cubicBezier,
  CONTROL_RGB,
  CONTROL_SIDE,
  controlClock,
  curveOf,
  drag,
  flick,
  frames,
  FRAME_STARVATION_MS,
  FrameStarvationError,
  freezePage,
  freezePageOn,
  freezePageWhen,
  freezeTimers,
  HARNESS_READ,
  holdAnimations,
  holdInputUntil,
  installInputLog,
  type HeldInput,
  type InputRecord,
  type PlayOptions,
  installLongTaskLog,
  installPageFreeze,
  installTimerGate,
  LiftPlacementError,
  markElement,
  merge,
  parseTransform,
  PARTIAL_LIFT_SKIP,
  pinch,
  pooledBusyProof,
  readInputLog,
  readLongTasks,
  releaseAnimations,
  requireFrames,
  sampleCurve,
  sampleRects,
  seekAnimations,
  settlesAt,
  springStep,
  startCompositorTrace,
  startScreencast,
  startBusyControl,
  Storyboard,
  SUBPIXEL_STEP_PX,
  tap,
  thawPage,
  thawTimers,
  timeline,
  toTouchEvents,
  touchDriver,
  trackBrightness,
  TouchPacingError,
  TouchPageStallError,
  touchStoryboard,
  TouchLiftStallError,
  traceRendering,
  trackControl,
  trackMarker,
  waitForAnimation,
  waitForCastFrame,
  releaseAnimationLog,
  waitForRest,
  watchAnimations,
  webInputDriver,
  WheelPacingError,
  WheelPageStallError,
  PEN_SKIP,
  WHEEL_SKIP,
  withFinger,
  writeEvidence,
} from './index';

// An element positioned against an anchor: a composited animation of it lays
// out in every main-thread frame, so it shows any per-frame main-thread work.
const ANCHORED = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<style>
  body { margin: 0; }
  #anchor { position: absolute; top: 100px; left: 20px; width: 80px; height: 40px; anchor-name: --a; }
  #pop { position: fixed; position-anchor: --a; top: anchor(bottom); left: anchor(left); width: 160px; height: 120px; background: #c33; }
</style>
<button id=anchor>open</button><div id=pop></div>`;

const FIXTURE = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<style>
  body { margin: 0; font: 14px sans-serif; background: #fff; }
  #pad { position: fixed; inset: 0 0 auto 0; height: 300px; background: #eef; touch-action: none; }
  #box { position: absolute; left: 20px; top: 360px; width: 80px; height: 80px; background: #36c; }
  #scroller { position: absolute; top: 460px; left: 0; right: 0; height: 240px; overflow: auto; }
  .row { height: 48px; border-bottom: 1px solid #ccc; }
</style>
<div id=pad aria-label="pad"></div>
<div id=box></div>
<div id=scroller>${Array.from({length: 200}, (_, i) => `<div class=row>row ${i}</div>`).join('')}</div>`;

// The busy-main-thread proofs' page: one box with room to move 560 px down,
// nothing over it. 560 px in 1,600 ms is about 4.8 px a frame, more than two
// of WebKit's 2 px position steps (README: frame evidence), so every frame's
// motion is resolvable.
const BUSY_FIXTURE = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<style>
  body { margin: 0; background: #fff; }
  #box { position: absolute; left: 20px; top: 40px; width: 80px; height: 80px; background: #36c; }
</style>
<div id=box></div>`;

async function busyFixture(page: Page) {
  await page.route('http://busy.test/', route =>
    route.fulfill({contentType: 'text/html', body: BUSY_FIXTURE}),
  );
  await page.goto('http://busy.test/');
}

// A real navigation (not setContent, whose document.open() erases the window
// listeners the input log installs).
async function fixture(page: Page) {
  await installInputLog(page);
  await page.route('http://harness.test/', route =>
    route.fulfill({contentType: 'text/html', body: FIXTURE}),
  );
  await page.goto('http://harness.test/');
}

/**
 * Starts a chain of 4 ms timers in the test process. It records how late each
 * woke, when, and how long the process ran while that timer waited. A runner
 * whose CPU quota stalls the process wakes them late, as it wakes the touch
 * pacer late. The process then runs little in the wait. Harness code that
 * holds the process wakes them late too, but the process runs through the
 * wait.
 */
function startWakeControl(): {
  stop(): {
    readonly at: number;
    readonly lateMs: number;
    readonly ranMs: number;
  }[];
} {
  const wakes: {at: number; lateMs: number; ranMs: number}[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    const due = performance.now() + 4;
    const cpu = process.cpuUsage();
    timer = setTimeout(() => {
      const now = performance.now();
      const ran = process.cpuUsage(cpu);
      wakes.push({
        at: now,
        lateMs: now - due,
        ranMs: (ran.user + ran.system) / 1000,
      });
      arm();
    }, 4);
  };
  arm();
  return {
    stop() {
      clearTimeout(timer);
      return wakes;
    },
  };
}

/**
 * Waits until a cast holds `min` frames. A cast sends a frame only when the
 * screen changes, and a loaded runner sends fewer of them. Past `capMs`
 * with fewer, the run is starved, and fails as such.
 */
async function waitForCastFrames(
  cast: {frameCount(): number},
  min: number,
  during: string,
  capMs = 5000,
): Promise<void> {
  const start = Date.now();
  let frames = cast.frameCount();
  let last = start;
  let longestGapMs = 0;
  while (frames < min) {
    const now = Date.now();
    longestGapMs = Math.max(longestGapMs, now - last);
    if (now - start >= capMs) {
      throw new FrameStarvationError({
        during: `${during} (${now - start} ms)`,
        frames,
        min,
        longestGapMs,
      });
    }
    await new Promise(resolve => setTimeout(resolve, 10));
    const count = cast.frameCount();
    if (count > frames) {
      frames = count;
      last = Date.now();
    }
  }
}

/**
 * Starves the page across a `waitForRest` deadline. A long task runs from
 * 250 ms before the deadline to `endsAfterMs` past it, timed from the wait's
 * first read of `box`. A negative `endsAfterMs` ends it before the deadline.
 * The first frame after the task comes before the wait's own deadline timer
 * looks for starvation.
 */
async function starveAcrossDeadline(
  box: ReturnType<Page['locator']>,
  timeoutMs: number,
  endsAfterMs = 5,
) {
  await box.evaluate(
    (el, [ms, after]) => {
      const read = window.getComputedStyle;
      let isArmed = true;
      window.getComputedStyle = function (
        this: Window,
        element: Element,
        pseudo?: string | null,
      ) {
        if (isArmed && element === el) {
          isArmed = false;
          const from = performance.now();
          setTimeout(() => {
            while (performance.now() < from + ms + after) {
              // the page's main thread is busy
            }
          }, ms - 250);
        }
        return read.call(this, element, pseudo);
      } as typeof window.getComputedStyle;
    },
    [timeoutMs, endsAfterMs] as const,
  );
}

test.describe('touch input', () => {
  test('the page receives trusted touches and pointers at the scripted positions and times', async ({
    page,
    browserName,
  }, testInfo) => {
    const script = drag(
      {x: 100, y: 100},
      {x: 100, y: 220},
      {durationMs: 200, hz: 60, restMs: 120},
    );
    // One take: a fresh page, the script played, and the harness's record of
    // when each step left (`dispatchedAt`) and when its dispatch was answered.
    // A control timer runs in the test process beside it.
    const take = async () => {
      await fixture(page);
      const driver = await touchDriver(page);
      const answeredAt: number[] = [];
      // Taken before the harness reads its own clock to schedule the script.
      const playStart = Date.now();
      const control = startWakeControl();
      const played = await driver.play(script, {
        onEvent: () => {
          answeredAt.push(Date.now());
        },
      });
      const wakes = control.stop();
      const log = await readInputLog(page);
      return {played, answeredAt, playStart, wakes, log};
    };
    const checkInput = (log: readonly InputRecord[]) => {
      const moves = log.filter(r => r.type === 'pointermove');
      const down = log.find(r => r.type === 'pointerdown');
      const up = log.find(r => r.type === 'pointerup');
      expect(down?.isTrusted).toBe(true);
      expect(down?.pointerType).toBe('touch');
      expect(up, JSON.stringify(log.map(r => r.type))).toBeDefined();
      // (Not `cancelable`: with only passive listeners an engine may dispatch
      // touchmove as non-blocking, which reads cancelable false.)
      expect(
        log.filter(r => r.type === 'touchmove').every(r => r.isTrusted),
      ).toBe(true);
      expect(moves.at(-1)?.y).toBe(220);
      return {moves, up};
    };

    if (browserName === 'chromium') {
      const {log} = await take();
      const {moves, up} = checkInput(log);
      // The scripted 16.67 ms spacing arrives exactly, and the 120 ms rest
      // before the lift is in the timestamps too.
      const deltas = moves
        .slice(1)
        .map((m, i) => m.timeStamp - moves[i].timeStamp);
      for (const delta of deltas) {
        expect(delta).toBeCloseTo(1000 / 60, 0);
      }
      expect(
        (up?.timeStamp ?? NaN) - (moves.at(-1)?.timeStamp ?? NaN),
      ).toBeCloseTo(120, 0);
      return;
    }

    // WebKit takes no timestamp: the page stamps each event with the time it
    // is dispatched, so its spacing is the harness's real-time pacing. Every
    // take checks what holds under any load against the harness's own record:
    // no move left before its scripted time, and the page's timestamps follow
    // the sends, in order, never before them and never after WebKit answered
    // the dispatch (it answers only once the page has the event), so a driver
    // that holds the moves and sends them in a burst fails.
    //
    // This take watches every step (`onEvent`), so the test records when
    // WebKit answered each step's dispatch.
    //
    // The pacing is bounded from above too. A WebKit play keeps each gap, less
    // ANSWER_SLACK_MS, after WebKit answered the step before (`pacedDeadline`),
    // so a stall stretches the gesture. A move must leave no more than 2 ms
    // after that paced deadline, and a step's send must not outlast the
    // spacing to the next. A harness that sends each step at twice its time
    // leaves every move later than that. One whose send is that slow stretches
    // the next gap by the send, less ANSWER_SLACK_MS. A runner whose CPU quota
    // stalls the test process also wakes the harness late, or holds a send.
    // A chain of 4 ms control timers then wakes late too: when the harness
    // woke, or while it sent. A control timer wakes no more than 4 ms less
    // late than the harness in the same stall. So a move is the runner's when
    // the control woke more than 2 ms late, and the move was at most 4 ms
    // later. The test names such a move and does not fail. Harness code
    // that holds the process delays the control timers too, but the process
    // runs through that delay. So a control wake counts only when the process
    // ran for less than half of how late the wake was. A take fails when more
    // than half its moves are off pace while the control woke on time.
    const {played, answeredAt, playStart, wakes, log} = await take();
    const {moves} = checkInput(log);
    const sentAt = played.map(step => step.dispatchedAt);
    const moveSteps = played.flatMap((step, i) =>
      step.type === 'touchMove' ? [i] : [],
    );
    expect(moveSteps).toHaveLength(moves.length);
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    for (const [m, i] of moveSteps.entries()) {
      // Against the clock before play() started, not the start event's
      // send, which can itself leave late. Date.now() counts whole
      // milliseconds, hence the 1 ms.
      expect(sentAt[i] - playStart).toBeGreaterThanOrEqual(played[i].t - 1);
      // 2 ms of rounding between the two processes' clocks.
      expect(timeOrigin + moves[m].timeStamp).toBeGreaterThanOrEqual(
        sentAt[i] - 2,
      );
      expect(timeOrigin + moves[m].timeStamp).toBeLessThanOrEqual(
        answeredAt[i] + 2,
      );
      if (m > 0) {
        expect(moves[m].timeStamp).toBeGreaterThanOrEqual(
          moves[m - 1].timeStamp,
        );
      }
    }
    // How late the control woke between two times, ms. With no wake in that
    // span, the first wake after it. A wake whose process ran for half its
    // delay or more counts as on time. The test process itself held it, not
    // the runner.
    const controlLateMs = (from: number, to: number) => {
      const within = wakes.filter(wake => wake.at >= from && wake.at <= to);
      const next = wakes.find(wake => wake.at > to);
      return Math.max(
        0,
        ...(within.length > 0 ? within : next == null ? [] : [next]).map(
          wake => (wake.ranMs < wake.lateMs / 2 ? wake.lateMs : 0),
        ),
      );
    };
    // Each move's paced deadline, from the latest the play clock can have
    // started (the start event's send) and WebKit's answer to the step
    // before. Both come from the clock the play paces on, which reads a
    // fraction of a millisecond, as do the control's wakes.
    const pacedSent = played.map(step => step.pacedSentAt);
    const pacedReturned = played.map(step => step.pacedReturnedAt);
    const offPace = moveSteps.flatMap((i, move) => {
      const spacing = played[i].t - played[i - 1].t;
      const deadline = Math.max(
        pacedSent[0] + played[i].t,
        pacedReturned[i - 1] + spacing - ANSWER_SLACK_MS,
      );
      const lateMs = pacedSent[i] - deadline;
      const sendMs = pacedReturned[i - 1] - pacedSent[i - 1];
      return [
        // The control wakes that a stall ending at the harness's own wake
        // delayed too.
        ...(lateMs > 2
          ? [
              {
                move,
                why: 'left late',
                ms: lateMs,
                runnerMs: controlLateMs(pacedSent[i] - 2, pacedSent[i] + 8),
              },
            ]
          : []),
        ...(sendMs > spacing
          ? [
              {
                move,
                why: 'followed a slow send',
                ms: sendMs - ANSWER_SLACK_MS,
                runnerMs: controlLateMs(
                  pacedSent[i - 1],
                  pacedReturned[i - 1] + 4,
                ),
              },
            ]
          : []),
      ];
    });
    const byRunner = (move: (typeof offPace)[number]) =>
      move.runnerMs > 2 && move.ms <= move.runnerMs + 4;
    const runner = offPace.filter(byRunner);
    const harness = offPace.filter(move => !byRunner(move));
    // A move can be off pace for both reasons: it counts once.
    const countMoves = (list: typeof offPace) =>
      new Set(list.map(entry => entry.move)).size;
    const describe = (list: typeof offPace) =>
      list
        .map(
          move =>
            `${move.why} by ${Math.round(move.ms)} ms (control ${Math.round(move.runnerMs)} ms late)`,
        )
        .join(', ');
    if (runner.length > 0) {
      testInfo.annotations.push({
        type: 'touch-runner-late',
        description: `${countMoves(runner)} of ${moves.length} moves were off pace while the runner woke a control timer as late: ${describe(runner)}`,
      });
    }
    expect(
      countMoves(harness),
      `touch pacing: ${countMoves(harness)} of ${moves.length} moves off pace while the control woke on time: ${describe(harness)}`,
    ).toBeLessThanOrEqual(moves.length / 2);
  });

  test("a page whose pointer listener holds its main thread changes a paced flick's release itself: TouchPageStallError, never the runner's", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'webkit',
      'only WebKit stamps a touch when it arrives; Chromium carries the scripted times',
    );
    // Each pointer move holds the main thread for 60 ms, as a component's
    // pan handler can. A gesture host samples a finger from pointermove.
    // WebKit hands the page the next touch only once it is free.
    await page.route('http://pointer-stalling-page.test/', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><body style="margin:0;height:3000px;touch-action:none"><script>addEventListener("pointermove",()=>{const end=performance.now()+60;while(performance.now()<end){}});</script>',
      }),
    );
    await page.goto('http://pointer-stalling-page.test/');
    const driver = await touchDriver(page);
    const outcome = await driver
      .play(
        drag({x: 200, y: 400}, {x: 200, y: 300}, {durationMs: 100, hz: 60}),
        {pacing: 'spacing'},
      )
      .then(
        () => 'resolved',
        (error: unknown) => error,
      );
    expect(outcome).toBeInstanceOf(TouchPageStallError);
    expect(String(outcome)).toMatch(
      /the page's own touch and pointer listeners took \d+ ms/,
    );
  });

  test('a lift whose page pointerup listener holds its touchend reads at the pointerup, as the gesture host does: the paced flick passes', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'webkit',
      'only WebKit stamps a touch when it arrives; Chromium carries the scripted times',
    );
    // The lift's pointerup listener holds the main thread 50 ms, as a busy
    // app's can. WebKit stamps the touchend after it, but the gesture host
    // reads the lift at the pointerup, paired with the moves.
    await page.route('http://pointerup-stalling-page.test/', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><body style="margin:0;height:3000px;touch-action:none"><script>addEventListener("pointerup",()=>{const end=performance.now()+50;while(performance.now()<end){}});</script>',
      }),
    );
    await page.goto('http://pointerup-stalling-page.test/');
    const driver = await touchDriver(page);
    const played = await driver.play(
      flick(
        {x: 200, y: 400},
        {velocity: {x: 0, y: -1500}, durationMs: 80, hz: 120},
      ),
      {pacing: 'spacing'},
    );
    expect(played.at(-1)?.release).toBeDefined();
  });

  test("a page task that holds the main thread before an event changes a paced flick's release, and the error names the wait, not the page's listeners", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'webkit',
      'only WebKit stamps a touch when it arrives; Chromium carries the scripted times',
    );
    // Each pointer move queues a 60 ms task, as a component's timer can. The
    // listeners themselves return at once, and the next move waits for the
    // task before they begin. The driver comes first, so its mark does too.
    const driver = await touchDriver(page);
    await page.route('http://task-stalling-page.test/', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><body style="margin:0;height:3000px;touch-action:none"><script>addEventListener("pointermove",()=>{setTimeout(()=>{const end=performance.now()+60;while(performance.now()<end){}},0)});</script>',
      }),
    );
    await page.goto('http://task-stalling-page.test/');
    const outcome = await driver
      .play(
        drag({x: 200, y: 400}, {x: 200, y: 300}, {durationMs: 100, hz: 60}),
        {pacing: 'spacing'},
      )
      .then(
        () => 'resolved',
        (error: unknown) => error,
      );
    expect(outcome).toBeInstanceOf(TouchPacingError);
    expect(String(outcome)).toMatch(
      /an event waited \d+ ms for the main thread before the page's listeners began/,
    );
  });

  test("a page's own window capture listener counts as the page's listeners when the driver is created before the page loads", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'webkit',
      'only WebKit stamps a touch when it arrives; Chromium carries the scripted times',
    );
    // The driver marks when the page's listeners begin with a window capture
    // listener of its own, added here before the page's scripts. So it runs
    // before the page's, which the page adds at load on the window's capture
    // phase and which holds each pointer move 60 ms.
    const driver = await touchDriver(page);
    await page.route('http://capture-stalling-page.test/', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><body style="margin:0;height:3000px;touch-action:none"><script>addEventListener("pointermove",()=>{const end=performance.now()+60;while(performance.now()<end){}},{capture:true});</script>',
      }),
    );
    await page.goto('http://capture-stalling-page.test/');
    const outcome = await driver
      .play(
        drag({x: 200, y: 400}, {x: 200, y: 300}, {durationMs: 100, hz: 60}),
        {pacing: 'spacing'},
      )
      .then(
        () => 'resolved',
        (error: unknown) => error,
      );
    expect(outcome).toBeInstanceOf(TouchPageStallError);
    expect(String(outcome)).toMatch(
      /the page's own touch and pointer listeners took \d+ ms/,
    );
  });

  test("a page's window capture listener added before a driver created after load still counts as the page's listeners, as a gesture host's does", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'webkit',
      'only WebKit stamps a touch when it arrives; Chromium carries the scripted times',
    );
    // The page adds its window capture listener at load, as a gesture host
    // does at mount, and the driver comes after. Its mark then runs after
    // that listener, so the hold counts from the event's stamp, as before.
    await page.route('http://late-driver-page.test/', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><body style="margin:0;height:3000px;touch-action:none"><script>addEventListener("pointermove",()=>{const end=performance.now()+60;while(performance.now()<end){}},{capture:true});</script>',
      }),
    );
    await page.goto('http://late-driver-page.test/');
    const driver = await touchDriver(page);
    const outcome = await driver
      .play(
        drag({x: 200, y: 400}, {x: 200, y: 300}, {durationMs: 100, hz: 60}),
        {pacing: 'spacing'},
      )
      .then(
        () => 'resolved',
        (error: unknown) => error,
      );
    expect(outcome).toBeInstanceOf(TouchPageStallError);
    expect(String(outcome)).toMatch(
      /the page's own touch and pointer listeners took \d+ ms/,
    );
  });

  test("a page set by setContent after the driver keeps the old reading: its window capture listener counts as the page's listeners", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'webkit',
      'only WebKit stamps a touch when it arrives; Chromium carries the scripted times',
    );
    // The driver's mark runs first on the blank page it navigates to.
    // setContent then reopens that document, which drops the mark's listener
    // and keeps the mark, and the new page adds its own capture listener.
    const driver = await touchDriver(page);
    await page.goto('about:blank');
    await page.setContent(
      '<!doctype html><body style="margin:0;height:3000px;touch-action:none"><script>addEventListener("pointermove",()=>{const end=performance.now()+60;while(performance.now()<end){}},{capture:true});</script>',
    );
    const outcome = await driver
      .play(
        drag({x: 200, y: 400}, {x: 200, y: 300}, {durationMs: 100, hz: 60}),
        {pacing: 'spacing'},
      )
      .then(
        () => 'resolved',
        (error: unknown) => error,
      );
    expect(outcome).toBeInstanceOf(TouchPageStallError);
    expect(String(outcome)).toMatch(
      /the page's own touch and pointer listeners took \d+ ms/,
    );
  });
  test("a page whose touch listener holds its main thread changes a paced flick's release itself: TouchPageStallError, never the runner's", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'webkit',
      'only WebKit stamps a touch when it arrives; Chromium carries the scripted times',
    );
    // Each move holds the main thread for 40 ms, past the script's 17 ms
    // spacing, and WebKit hands the page the next touch only once it is free.
    await page.route('http://touch-stalling-page.test/', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><body style="margin:0;height:3000px;touch-action:none"><script>addEventListener("touchmove",e=>{e.preventDefault();const end=performance.now()+40;while(performance.now()<end){}},{passive:false});</script>',
      }),
    );
    await page.goto('http://touch-stalling-page.test/');
    const driver = await touchDriver(page);
    const outcome = await driver
      .play(
        drag({x: 200, y: 400}, {x: 200, y: 300}, {durationMs: 100, hz: 60}),
        {
          pacing: 'spacing',
        },
      )
      .then(
        () => 'resolved',
        (error: unknown) => error,
      );
    expect(outcome).toBeInstanceOf(TouchPageStallError);
    expect(String(outcome)).toMatch(
      /the page's own touch and pointer listeners took \d+ ms/,
    );
  });

  /**
   * A flick up a page that takes every touch, its lift right after its last
   * move. The page logs each move and the lift at its pointer event, where
   * Core's gesture host and the play read them.
   */
  async function liftStallPage(page: Page) {
    await page.route('http://lift-stall.test/', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><body style="margin:0;height:3000px;touch-action:none"><script>window.touches=[];for(const type of ["pointermove","pointerup"])addEventListener(type,e=>touches.push([type,e.timeStamp]),{passive:true})</script>',
      }),
    );
    await page.goto('http://lift-stall.test/');
    const script = flick(
      {x: 200, y: 400},
      {velocity: {x: 0, y: -1500}, durationMs: 80, hz: 120},
    );
    const lastMove = toTouchEvents(script).length - 2;
    // Page work at the last move, as a busy runner's round trip.
    const slowRead = async (_: unknown, index: number) => {
      if (index === lastMove) {
        await page.evaluate(
          () => new Promise(resolve => setTimeout(resolve, 60)),
        );
      }
    };
    // The page's own gap from the last move to the lift, ms.
    const pageLiftGap = () =>
      page.evaluate(() => {
        const {touches} = window as unknown as {touches: [string, number][]};
        const lift = touches.findIndex(([type]) => type === 'pointerup');
        return touches[lift][1] - touches[lift - 1][1];
      });
    return {driver: await touchDriver(page), script, slowRead, pageLiftGap};
  }

  test('a play whose onEvent holds its lift back past the stillness interval fails by name, where the page stamps touches on arrival', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'webkit',
      'only WebKit stamps a touch when it arrives; Chromium carries the scripted times',
    );
    const {driver, script, slowRead, pageLiftGap} = await liftStallPage(page);
    const outcome = await driver.play(script, {onEvent: slowRead}).then(
      () => 'resolved',
      (error: unknown) => error,
    );
    expect(outcome).toBeInstanceOf(TouchLiftStallError);
    expect(String(outcome)).toMatch(
      /the lift reached the page \d+ ms after its finger's last move, where the script spaces \d+ ms: .* onEvent ran \d+ ms in that gap/,
    );
    const {numbers} = outcome as TouchLiftStallError;
    expect(numbers.gapMs).toBeGreaterThan(40);
    expect(numbers.scriptedGapMs).toBeLessThanOrEqual(40);
    // Like every pacing error, it names the longest frame gap.
    expect(numbers.frameGapMs).toEqual(expect.any(Number));
    expect(String(outcome)).toMatch(
      /; the page drew no frame for \d+ ms during the gesture\. /,
    );
    // The error gives the gap the page itself read.
    const gap = await pageLiftGap();
    expect(gap).toBeGreaterThan(40);
    expect(Math.abs(numbers.gapMs - gap)).toBeLessThanOrEqual(2);
    // The same flick with a quick onEvent passes.
    await driver.play(script, {onEvent: () => {}});
    // A proof that reads no release from the lift opts out.
    await driver.play(script, {onEvent: slowRead, releaseUnread: true});
  });

  test("a lift stall is named before the page's stall that stretched the lift gap further; with a quick onEvent the page's stall is named", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'webkit',
      'only WebKit stamps a touch when it arrives; Chromium carries the scripted times',
    );
    const {driver, script} = await liftStallPage(page);
    const moves = toTouchEvents(script).filter(
      step => step.type === 'touchMove',
    ).length;
    const lastMove = toTouchEvents(script).length - 2;
    // The page's own listener holds the last move 100 ms, so WebKit hands
    // the page the lift only after that.
    await page.evaluate(count => {
      let seen = 0;
      addEventListener(
        'touchmove',
        () => {
          seen += 1;
          if (seen % count === 0) {
            const end = performance.now() + 100;
            while (performance.now() < end) {
              // the page is busy
            }
          }
        },
        {passive: true},
      );
    }, moves);
    // onEvent waits 60 ms on the runner's own timer at the last move: alone,
    // it carries the lift past the stillness interval.
    const runnerWait = async (_: unknown, index: number) => {
      if (index === lastMove) {
        await new Promise(resolve => setTimeout(resolve, 60));
      }
    };
    const outcome = (onEvent: PlayOptions['onEvent']) =>
      driver.play(script, {onEvent}).then(
        () => 'resolved',
        (error: unknown) => error,
      );
    const stalled = await outcome(runnerWait);
    expect(stalled, String(stalled)).toBeInstanceOf(TouchLiftStallError);
    const held = await outcome(() => {});
    expect(held, String(held)).toBeInstanceOf(TouchPageStallError);
  });

  test('a default-paced play whose page holds its last move fails by name: TouchPageStallError, where the page stamps touches on arrival', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'webkit',
      'only WebKit stamps a touch when it arrives; Chromium carries the scripted times',
    );
    const script = flick(
      {x: 200, y: 400},
      {velocity: {x: 0, y: -1500}, durationMs: 80, hz: 120},
    );
    const moves = toTouchEvents(script).filter(
      step => step.type === 'touchMove',
    ).length;
    // The page's own listener holds its main thread for 80 ms on the last
    // move. WebKit hands the page the lift only once it is free.
    await page.route('http://last-move-hold.test/', route =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><body style="margin:0;height:3000px;touch-action:none"><script>let n=0;addEventListener("touchmove",()=>{if(++n===${moves}){const end=performance.now()+80;while(performance.now()<end){}}},{passive:true})</script>`,
      }),
    );
    await page.goto('http://last-move-hold.test/');
    const driver = await touchDriver(page);
    const outcome = await driver.play(script).then(
      () => 'resolved',
      (error: unknown) => error,
    );
    expect(outcome).toBeInstanceOf(TouchPageStallError);
    expect(String(outcome)).toMatch(/the page read a resting finger/);
  });

  test('a play behind its schedule never shrinks a scripted gap, so page work in onEvent cannot eat the rest before its lift, where the page stamps touches on arrival', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'webkit',
      'only WebKit stamps a touch when it arrives; Chromium carries the scripted times',
    );
    const {driver} = await liftStallPage(page);
    // A slow drag that rests 150 ms before the lift. Page work on every move
    // puts the play behind its schedule by more than that rest.
    const script = drag(
      {x: 200, y: 600},
      {x: 200, y: 300},
      {durationMs: 300, restMs: 150},
    );
    const steps = toTouchEvents(script);
    await driver.play(script, {
      onEvent: async step => {
        if (step.type === 'touchMove') {
          await page.evaluate(
            () => new Promise(resolve => setTimeout(resolve, 30)),
          );
        }
      },
    });
    const stamps = await page.evaluate(() =>
      (window as unknown as {touches: [string, number][]}).touches.map(
        ([, t]) => t,
      ),
    );
    // The page stamps every move and the lift. No gap is more than the
    // answer's slack short of the script's, the rest before the lift too.
    expect(stamps).toHaveLength(steps.length - 1);
    for (let index = 1; index < stamps.length; index++) {
      const scripted = steps[index + 1].t - steps[index].t;
      expect(
        stamps[index] - stamps[index - 1],
        `gap ${index} of ${stamps.length - 1}`,
      ).toBeGreaterThanOrEqual(scripted - ANSWER_SLACK_MS - 1);
    }
  });

  test("a tap the page holds past the component's catch time fails by name, with the time the page drew no frame, where the page stamps touches on arrival", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'webkit',
      'only WebKit stamps a touch when it arrives; Chromium carries the scripted times',
    );
    // The page's own touchstart listener holds its main thread for 120 ms, so
    // WebKit hands it the lift late, and no frame is drawn meanwhile.
    await page.route('http://touch-hold.test/', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><body style="margin:0;height:3000px;touch-action:none"><script>addEventListener("touchstart",()=>{if(window.busy){const end=performance.now()+120;while(performance.now()<end){}}},{passive:true})</script>',
      }),
    );
    await page.goto('http://touch-hold.test/');
    const driver = await touchDriver(page);
    const script = tap({x: 200, y: 300}, {holdMs: 40});
    // On a free page, the 40 ms hold stays under the 85 ms bound.
    await driver.play(script, {boundaries: {holdMs: 85}});
    await page.evaluate(() => {
      (window as unknown as {busy: boolean}).busy = true;
    });
    // Without a bound, a tap's hold is not judged.
    await driver.play(script);
    const outcome = await driver.play(script, {boundaries: {holdMs: 85}}).then(
      () => 'resolved',
      (error: unknown) => error,
    );
    expect(String(outcome)).toMatch(
      /the page read a hold of \d+ ms where the script holds 40 ms, on the other side of the 85 ms the component decides on; the page drew no frame for (\d+) ms during the gesture/,
    );
    const gap = Number(/drew no frame for (\d+) ms/.exec(String(outcome))?.[1]);
    expect(gap).toBeGreaterThan(100);
  });

  test('a Chromium play carries the scripted times, so a slow onEvent before its lift does not fail it', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'Chromium carries the scripted times; WebKit stamps a touch when it arrives',
    );
    const {driver, script, slowRead} = await liftStallPage(page);
    await driver.play(script, {onEvent: slowRead});
  });

  test("a touch play reaches a page that takes touches late with no gap more than 2 ms short of the script's", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'webkit',
      'only WebKit stamps a touch when it arrives; Chromium carries the scripted times',
    );
    // A timer holds the main thread for 6 ms every 9 ms, so WebKit stamps
    // some touches late and answers them soon after. When a touch did not
    // wait for the answer to the one before, it could reach the page 1 to
    // 3 ms after it, where the script spaces them 8.3 ms.
    await installInputLog(page);
    await page.route('http://late-taking-page.test/', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><body style="margin:0;height:3000px;touch-action:none"><script>setInterval(()=>{const end=performance.now()+6;while(performance.now()<end){}},9);</script>',
      }),
    );
    for (const pacing of ['schedule', 'spacing'] as const) {
      await page.goto('http://late-taking-page.test/');
      const driver = await touchDriver(page);
      const played = await driver.play(
        drag({x: 200, y: 400}, {x: 200, y: 300}, {durationMs: 100, hz: 120}),
        {pacing},
      );
      const touches = (await readInputLog(page)).filter(record =>
        record.type.startsWith('touch'),
      );
      expect(touches).toHaveLength(played.length);
      const short = played
        .slice(1)
        .map(
          (step, i) =>
            step.t -
            played[i].t -
            (touches[i + 1].timeStamp - touches[i].timeStamp),
        );
      // WebKit stamps whole milliseconds, hence the 1 ms.
      expect(
        Math.max(...short),
        `${pacing}: each gap's shortfall, ms: ${short.map(s => s.toFixed(1)).join(', ')}`,
      ).toBeLessThanOrEqual(ANSWER_SLACK_MS + 1);
    }
  });

  test('a flick flings a native scroller, farther for a faster finger', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'injected WebKit touches drive no native scrolling (README: engine limits)',
    );
    await fixture(page);
    const driver = await touchDriver(page);
    const scroller = page.locator('#scroller');
    const distanceFor = async (velocity: number) => {
      await scroller.evaluate(el => (el.scrollTop = 0));
      await driver.play(
        flick(
          {x: 200, y: 680},
          {velocity: {x: 0, y: -velocity}, durationMs: 60, hz: 120},
        ),
      );
      await expect
        .poll(
          async () => {
            const a = await scroller.evaluate(el => el.scrollTop);
            await page.waitForTimeout(150);
            return a === (await scroller.evaluate(el => el.scrollTop));
          },
          {timeout: 8_000},
        )
        .toBe(true);
      return scroller.evaluate(el => el.scrollTop);
    };
    const slow = await distanceFor(800);
    const fast = await distanceFor(2400);
    expect(slow).toBeGreaterThan(48); // it coasted past the finger's own travel
    expect(fast).toBeGreaterThan(slow * 1.8);
  });

  test('lifting one of two fingers releases only that finger', async ({
    page,
  }) => {
    await fixture(page);
    const driver = await touchDriver(page);
    test.skip(!driver.partialLifts, PARTIAL_LIFT_SKIP);
    const first = drag(
      {x: 80, y: 80},
      {x: 80, y: 240},
      {durationMs: 400, hz: 60},
    );
    const second = withFinger(tap({x: 300, y: 120}, {holdMs: 100}), 1, 100);
    await driver.play(merge(first, second));
    const log = await readInputLog(page);
    const [stays, lifts] = log.filter(r => r.type === 'pointerdown');
    const upOf = (down?: {pointerId?: number}) =>
      log.find(r => r.type === 'pointerup' && r.pointerId === down?.pointerId);
    const lifted = upOf(lifts);
    const last = upOf(stays);
    if (stays == null || lifted == null || last == null) {
      throw new Error('expected two fingers down, each released');
    }
    // Released when it lifted (~200 ms in), while the first finger was down.
    expect(lifted.timeStamp).toBeLessThan(last.timeStamp - 150);
    expect(
      log.filter(
        r =>
          r.type === 'pointermove' &&
          r.pointerId === stays.pointerId &&
          r.timeStamp > lifted.timeStamp,
      ).length,
      'the other finger keeps moving',
    ).toBeGreaterThan(5);
    // As iOS sends it: the lift's touchend still lists the finger down.
    expect(log.filter(r => r.type === 'touchend').map(r => r.touches)).toEqual([
      1, 0,
    ]);
  });

  test('a second finger and a pinch arrive as distinct touch pointers', async ({
    page,
  }) => {
    await fixture(page);
    const driver = await touchDriver(page);
    const first = drag(
      {x: 80, y: 80},
      {x: 80, y: 200},
      {durationMs: 300, hz: 60},
    );
    const second = withFinger(tap({x: 300, y: 120}, {holdMs: 100}), 1, 120);
    await driver.play(merge(first, second));
    const downs = (await readInputLog(page, {clear: true})).filter(
      r => r.type === 'pointerdown',
    );
    expect(downs).toHaveLength(2);
    expect(new Set(downs.map(d => d.pointerId)).size).toBe(2);

    await driver.play(
      pinch({
        center: {x: 200, y: 150},
        fromDistance: 60,
        toDistance: 200,
        durationMs: 200,
      }),
    );
    const log = await readInputLog(page);
    expect(log.filter(r => r.type === 'pointerdown')).toHaveLength(2);
    expect(
      Math.max(
        ...log.filter(r => r.type === 'touchmove').map(r => r.touches ?? 0),
      ),
    ).toBe(2);
  });
});

test.describe('frame evidence', () => {
  test('a cast reads when its latest frame was presented before it stops, on the page clock, and a wait for a frame on a screen held still fails by name', async ({
    page,
  }) => {
    await busyFixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});
    const cast = await startScreencast(page);
    await box.evaluate(el =>
      el.animate(
        [{transform: 'translateY(0px)'}, {transform: 'translateY(560px)'}],
        {duration: 500},
      ),
    );
    const pageNow = () =>
      page.evaluate(() => performance.timeOrigin + performance.now());
    const after = await pageNow();
    const at = await waitForCastFrame(cast, {after, during: 'the box moved'});
    expect(at).toBeGreaterThan(after);
    // Once the box rests, nothing on screen changes, so the cast sends no
    // frame, and the wait fails at its cap as the cast's starvation. The
    // frame that shows the box at rest can come after the animation ends. The
    // screen is still once the cast has sent nothing for 100 ms.
    await box.evaluate(el =>
      Promise.all(el.getAnimations().map(a => a.finished)),
    );
    await expect
      .poll(async () => (await pageNow()) - (cast.lastFrameAt() ?? 0), {
        message: 'the cast goes quiet once the box rests',
        timeout: 2_000,
      })
      .toBeGreaterThan(100);
    const still = await waitForCastFrame(cast, {
      after: await pageNow(),
      during: 'the screen held still',
      timeoutMs: 300,
    }).catch((error: unknown) => error);
    expect(still).toBeInstanceOf(FrameStarvationError);
    expect(String(still)).toMatch(
      /waitForCastFrame: the page drew 0 frames while the screen held still \(\d+ ms\).*: the screen did not change after \d+\.\d, or the page was starved of frames/,
    );
    // stop() stamps the frame the first wait read with the same time.
    const frames = await cast.stop();
    expect(frames.some(f => f.t === at)).toBe(true);
  });

  test('a compositor animation advances every frame through a blocked main thread; a rAF one freezes, whatever the screencast rate', async ({
    page,
  }, testInfo) => {
    await busyFixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});
    // A loaded runner's compositor skips frames the display-rate bound
    // counts: the component is judged against what the compositor presented
    // in the same window, and the bound's own verdict is recorded beside it.
    const control = await startBusyControl(page);
    // The cast and the page measure the box from different edges. Both read
    // it once at rest, so the frozen check below compares displacements.
    // The control's motion keeps the cast sending frames meanwhile.
    const restCast = await startScreencast(page);
    await frames(page, 3);
    // WebKit's first cast frame can lag several frames on a busy page.
    await expect.poll(() => restCast.frameCount()).toBeGreaterThan(0);
    const [atRest] = await trackMarker(page, (await restCast.stop()).slice(-1));
    expect(atRest?.box, 'the cast shows the box at rest').toBeTruthy();
    const rest = {
      cast: atRest?.box?.y ?? Number.NaN,
      page: await box.evaluate(el => el.getBoundingClientRect().y),
    };

    // The README's order: the cast, then the animation, then the block once
    // it runs (on the compositor, for the compositor's run).
    // 560 px in 1100 ms is two cast steps or more a frame up to 120 Hz.
    // WebKit's headless compositor presents above 60 Hz.
    const run = async (
      driver: 'compositor' | 'raf',
      everyNthFrame = 1,
      blockMs = 700,
      durationMs = 1100,
    ) => {
      const cast = await startScreencast(page, {everyNthFrame});
      await box.evaluate(
        (el, {how, duration}) => {
          el.getAnimations().forEach(a => a.cancel());
          el.style.transform = 'none';
          if (how === 'compositor') {
            el.animate(
              [
                {transform: 'translateY(0px)'},
                {transform: 'translateY(560px)'},
              ],
              {duration, easing: 'linear'},
            );
          } else {
            // Where each frame left the box, on the page's clock.
            const written: Array<{at: number; y: number}> = [];
            (globalThis as unknown as {written: typeof written}).written =
              written;
            const start = performance.now();
            const step = (now: number) => {
              const p = Math.min(1, (now - start) / duration);
              el.style.transform = `translateY(${560 * p}px)`;
              written.push({
                at: performance.timeOrigin + performance.now(),
                y: el.getBoundingClientRect().y,
              });
              if (p < 1) {
                requestAnimationFrame(step);
              }
            };
            requestAnimationFrame(step);
          }
        },
        {how: driver, duration: durationMs},
      );
      // A rendering update first: until one commits the cancel, the
      // compositor keeps playing the previous run's animation into the block.
      await page.evaluate(
        () =>
          new Promise<void>(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const window = await blockMainThread(
        page,
        blockMs,
        driver === 'compositor' ? {during: box} : {},
      );
      await page.waitForTimeout(200);
      const frames = await cast.stop();
      const tracked = await trackMarker(page, frames);
      const controlFrames = await trackMarker(page, frames, {rgb: CONTROL_RGB});
      const alone = busyWindowProof(tracked, window, {axis: 'y'});
      // The last place a frame left the box before the block.
      const written = await page.evaluate(
        () =>
          (globalThis as unknown as {written?: Array<{at: number; y: number}>})
            .written ?? [],
      );
      const leftAt = written.filter(w => w.at < window.from).at(-1)?.y;
      return {
        proof: busyWindowProof(tracked, window, {
          axis: 'y',
          control: controlFrames,
        }),
        alone,
        tracked,
        leftAt,
        // Every place a frame left the box before the block.
        leftBefore: written.filter(w => w.at < window.from).map(w => w.y),
      };
    };

    const {proof: compositor, alone: compositorAlone} = await run('compositor');
    testInfo.annotations.push({
      type: 'busy-main-thread compositor',
      description: `${compositor.summary} | without the control: ${compositorAlone.verdict.failures.join('; ') || 'pass'}`,
    });
    expect(compositor.verdict.failures, compositor.summary).toEqual([]);
    expect(compositor.monotonic).toBe(true);
    // Resolvable on the cast's grid: two position steps or more per frame.
    expect(compositor.pxPerFrame).toBeGreaterThanOrEqual(2 * compositor.stepPx);

    const {
      proof: raf,
      alone: rafAlone,
      tracked: rafTracked,
      leftAt,
      leftBefore,
    } = await run('raf');
    testInfo.annotations.push({
      type: 'busy-main-thread rAF control',
      description: raf.summary,
    });
    // Frozen for the block: every frame inside it shows a place a frame left
    // the box before the block, within a cast step. A starved compositor can
    // present the last frames before the block late, inside it.
    const inBlock = rafTracked.filter(
      f => f.box != null && f.t > raf.judged.from && f.t < raf.judged.to,
    );
    expect(leftAt, 'a frame moved the box before the block').toBeDefined();
    for (const frame of inBlock) {
      const shown = (frame.box?.y ?? Number.NaN) - rest.cast;
      expect(
        leftBefore.some(
          y => Math.abs(y - rest.page - shown) <= compositor.stepPx,
        ),
        `the frame at +${(frame.t - raf.window.from).toFixed(0)} ms shows the box ${shown.toFixed(1)} px down, where no frame left it before the block. ${raf.summary}`,
      ).toBe(true);
    }
    // The block ends where the last frame before it left the box.
    const shown = (inBlock.at(-1)?.box?.y ?? Number.NaN) - rest.cast;
    const left = (leftAt ?? Number.NaN) - rest.page;
    expect(Math.abs(shown - left), raf.summary).toBeLessThanOrEqual(
      compositor.stepPx,
    );
    expect(raf.verdict.failures.join('\n')).toMatch(
      /longest stall .* longer than the control's/,
    );
    expect(rafAlone.verdict.pass).toBe(false);
    expect(rafAlone.verdict.failures.join('\n')).toMatch(/longest stall/);

    // The verdict judges the frames the screencast delivered, not its rate:
    // at one frame in six (a loaded machine's ~100 ms), the compositor
    // animation still passes and the rAF one still fails. A 1.4 s block keeps
    // the control's four frames on a runner that presents half the rate.
    const {proof: slow} = await run('compositor', 6, 1400, 1600);
    expect(slow.cadenceMs, slow.summary).toBeGreaterThan(60);
    expect(slow.verdict.failures, slow.summary).toEqual([]);
    const {proof: slowRaf} = await run('raf', 6, 1400, 1600);
    expect(slowRaf.verdict.pass, slowRaf.summary).toBe(false);
    expect(slowRaf.verdict.failures.join('\n')).toMatch(/longest stall/);
    await control.remove();
  });

  test('a busy proof whose cast the machine starved fails by name: FrameStarvationError', async ({
    page,
  }) => {
    await busyFixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});
    const control = await startBusyControl(page);
    // One presented frame in 40 reaches the proof, as on a starved machine.
    // The block then holds fewer than four of the control's frames, with gaps
    // past FRAME_STARVATION_MS between them.
    const cast = await startScreencast(page, {everyNthFrame: 40});
    await box.evaluate(el =>
      el.animate(
        [{transform: 'translateY(0px)'}, {transform: 'translateY(560px)'}],
        {duration: 1100, easing: 'linear'},
      ),
    );
    const window = await blockMainThread(page, 700, {during: box});
    const frames = await cast.stop();
    const tracked = await trackMarker(page, frames);
    const controlFrames = await trackControl(page, frames);
    const outcome = (() => {
      try {
        return busyWindowProof(tracked, window, {
          axis: 'y',
          control: controlFrames,
        }).summary;
      } catch (error) {
        return error;
      }
    })();
    expect(outcome).toBeInstanceOf(FrameStarvationError);
    const {numbers} = outcome as FrameStarvationError;
    expect(numbers.by).toBe('busyWindowProof');
    expect(numbers.min).toBe(4);
    expect(numbers.frames).toBeLessThan(4);
    expect(numbers.longestGapMs).toBeGreaterThan(FRAME_STARVATION_MS);
    await control.remove();
  });

  test('a sub-pixel read follows a compositor slide under a pixel a frame through a blocked main thread; a rAF slide still fails', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      "WebKit's JPEG cast holds color in 2 by 2 pixel blocks, so it cannot read under a pixel",
    );
    await busyFixture(page);
    const box = page.locator('#box');
    // A chip on the box's plain face: the read takes the background there.
    await markElement(box);
    const control = await startBusyControl(page);
    // At rest between pixels, the read holds still: the control keeps the cast
    // sending frames meanwhile.
    await box.evaluate(el => {
      el.style.transform = 'translateY(10.37px)';
    });
    // The cast's first frame can be the last one the compositor drew: start
    // it once frames have shown the box at its new place.
    await frames(page, 3);
    const restCast = await startScreencast(page);
    await frames(page, 20);
    const atRest = (
      await trackMarker(page, await restCast.stop(), {subpixel: true})
    ).flatMap(f => (f.box == null ? [] : [f.box.y]));
    expect(atRest.length).toBeGreaterThan(5);
    const spread = Math.max(...atRest) - Math.min(...atRest);
    test.info().annotations.push({
      type: 'sub-pixel read at rest',
      description: `${atRest.length} frames, spread ${spread.toFixed(4)} px`,
    });
    expect(spread).toBeLessThan(SUBPIXEL_STEP_PX / 5);
    // 36 px in 2 s is 0.3 px a frame at 60 Hz. A whole-pixel read shows a
    // new position on about one frame in three.
    const run = async (driver: 'compositor' | 'raf') => {
      const cast = await startScreencast(page);
      await box.evaluate((el, how) => {
        el.getAnimations().forEach(a => a.cancel());
        el.style.transform = 'none';
        if (how === 'compositor') {
          el.animate(
            [{transform: 'translateY(0px)'}, {transform: 'translateY(36px)'}],
            {duration: 2000, easing: 'linear'},
          );
        } else {
          const start = performance.now();
          const step = (now: number) => {
            const p = Math.min(1, (now - start) / 2000);
            el.style.transform = `translateY(${36 * p}px)`;
            if (p < 1) {
              requestAnimationFrame(step);
            }
          };
          requestAnimationFrame(step);
        }
      }, driver);
      // A rendering update first commits the cancel of the run before.
      await page.evaluate(
        () =>
          new Promise<void>(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const window = await blockMainThread(
        page,
        600,
        driver === 'compositor' ? {during: box} : {},
      );
      await page.waitForTimeout(200);
      const shown = (await cast.stop()).filter(
        f => f.t <= window.to + BUSY_PROOF_LOOKAROUND_MS,
      );
      const controlFrames = await trackControl(page, shown);
      const judge = async (subpixel: boolean) =>
        busyWindowProof(await trackMarker(page, shown, {subpixel}), window, {
          axis: 'y',
          control: controlFrames,
        });
      return {fine: await judge(true), whole: await judge(false), shown};
    };

    const {fine, whole, shown} = await run('compositor');
    expect(fine.verdict.failures, fine.summary).toEqual([]);
    expect(fine.stepPx).toBe(SUBPIXEL_STEP_PX);
    expect(fine.pxPerFrame, fine.summary).toBeGreaterThan(0.2);
    expect(fine.pxPerFrame, fine.summary).toBeLessThan(0.4);
    // Every frame the read judged shows a new position; the same frames read
    // in whole pixels show one on fewer than half of them.
    expect(fine.moved, fine.summary).toBeGreaterThanOrEqual(
      fine.deliveredFrames - 1,
    );
    expect(whole.changed, whole.summary).toBeLessThan(fine.changed / 2);

    const {fine: raf} = await run('raf');
    expect(raf.verdict.pass, raf.summary).toBe(false);
    // Frozen for the block, it stalls longer than the control. A starved
    // compositor can present the last frames before the block late, inside it.
    expect(raf.verdict.failures.join('\n')).toMatch(
      /longest stall .* longer than the control's/,
    );
    // A JPEG frame hides the marker's edges in its chroma blocks.
    await expect(
      trackMarker(page, [{...shown[0], format: 'jpeg'}], {subpixel: true}),
    ).rejects.toThrow(/needs a PNG cast/);
    await control.remove();
  });

  test('frames the screencast skips while the compositor presents them are not a stall; a frozen animation still fails with the compositor record', async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(
      browserName !== 'chromium',
      'compositor traces are Chromium-only (README: engine limits)',
    );
    await busyFixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});
    const run = async (driver: 'compositor' | 'raf') => {
      // Judged against what the compositor presented in the same window too:
      // a loaded runner's compositor skips frames a display-rate bound counts.
      const control = await startBusyControl(page);
      const cast = await startScreencast(page);
      const compositor = await startCompositorTrace(page);
      // Started once the control, the cast and the trace run, so the whole
      // window lies inside its motion however long they take to start on a
      // loaded runner. The block is long enough to judge a drop of four cast
      // intervals at one frame in six (below).
      await box.evaluate((el, how) => {
        el.getAnimations().forEach(a => a.cancel());
        el.style.transform = 'none';
        if (how === 'compositor') {
          el.animate(
            [{transform: 'translateY(0px)'}, {transform: 'translateY(560px)'}],
            {duration: 3000, easing: 'linear'},
          );
        } else {
          const start = performance.now();
          const step = (now: number) => {
            const p = Math.min(1, (now - start) / 3000);
            el.style.transform = `translateY(${560 * p}px)`;
            if (p < 1) {
              requestAnimationFrame(step);
            }
          };
          requestAnimationFrame(step);
        }
      }, driver);
      await page.waitForTimeout(200);
      const window = await blockMainThread(page, 1200);
      await page.waitForTimeout(200);
      const presented = await compositor.stop();
      const frames = await cast.stop();
      await control.remove();
      const tracked = await trackMarker(page, frames);
      const controlTracked = await trackMarker(page, frames, {
        rgb: CONTROL_RGB,
      });
      return {window, tracked, presented, controlTracked};
    };

    const moving = await run('compositor');
    expect(moving.presented.length).toBeGreaterThan(0);
    // The whole cast, judged with the compositor record: the screencast's and
    // the compositor's own intervals around the block.
    const whole = busyWindowProof(moving.tracked, moving.window, {
      axis: 'y',
      presented: moving.presented,
    });
    const castMs = whole.cadenceMs;
    const drawMs = whole.compositorFrameMs;
    test.skip(drawMs == null, 'no compositor frames recorded around the block');
    // The screencast as a loaded machine delivers it: every frame of four of
    // its own intervals skipped, which the compositor still presented. With
    // the frames either side, a gap of five intervals, over the stall
    // bound's three at the cast's measured rate. The drop sits where the
    // compositor presented steadily (no interval of its own over the stall
    // bound), so the record has frames to excuse it with, and the judged part
    // keeps four of the control's frames outside it.
    const dropMs = 4 * castMs;
    const inner = {from: moving.window.from + 20, to: moving.window.to - 20};
    const draws = [...moving.presented].sort((a, b) => a - b);
    const steady = (from: number, to: number) => {
      const span = draws.filter(t => t >= from && t <= to);
      return (
        span.length >= 2 &&
        span[0] - from <= 3 * (drawMs ?? 0) &&
        to - span[span.length - 1] <= 3 * (drawMs ?? 0) &&
        span.slice(1).every((t, i) => t - span[i] <= 3 * (drawMs ?? 0))
      );
    };
    const middle = (inner.from + inner.to - dropMs) / 2;
    const starts: number[] = [];
    for (
      let t = inner.from + castMs;
      t + dropMs <= inner.to - castMs;
      t += castMs / 2
    ) {
      starts.push(t);
    }
    starts.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle));
    const from = starts.find(t => steady(t, t + dropMs));
    test.skip(
      inner.to - inner.from < dropMs + 4 * castMs || from == null,
      `no ${dropMs.toFixed(0)} ms span of the block to drop: the screencast delivered a frame every ${castMs.toFixed(0)} ms, the compositor every ${(drawMs ?? 0).toFixed(0)} ms`,
    );
    const to = (from ?? 0) + dropMs;
    const kept = (f: {t: number}) => f.t <= (from ?? 0) || f.t > to;
    const skipped = moving.tracked.filter(kept);
    const alone = busyWindowProof(skipped, moving.window, {axis: 'y'});
    expect(alone.verdict.failures.join('\n'), alone.summary).toMatch(
      /longest stall/,
    );
    // Only the compositor record excuses the drop: with it, the frames the
    // compositor presented there count as skipped by the screencast, more of
    // them than the whole cast had.
    const excused = busyWindowProof(skipped, moving.window, {
      axis: 'y',
      presented: moving.presented,
    });
    expect(excused.recorderSkipped, excused.summary).toBeGreaterThan(
      whole.recorderSkipped,
    );
    // Judged against the busy control, read from the same frames, so it
    // misses the same ones, the component passes.
    const proof = busyWindowProof(skipped, moving.window, {
      axis: 'y',
      control: moving.controlTracked.filter(kept),
    });
    testInfo.annotations.push({
      type: 'busy-main-thread compositor record',
      description: `${excused.summary}; against the control: ${proof.summary}`,
    });
    expect(proof.verdict.failures, proof.summary).toEqual([]);

    // A rAF animation presents no change for the whole block: the record
    // excuses nothing, whatever the compositor drew meanwhile.
    const frozen = await run('raf');
    const still = busyWindowProof(frozen.tracked, frozen.window, {
      axis: 'y',
      presented: frozen.presented,
    });
    testInfo.annotations.push({
      type: 'busy-main-thread rAF control, compositor record',
      description: `${still.summary}; compositor frames inside the block: ${frozen.presented.filter(t => t > frozen.window.from && t < frozen.window.to).length}`,
    });
    // The freeze is still a stall with the record: the element presents no
    // change in the block, so no gap there lies between two moved frames,
    // and the record excuses none of it.
    expect(still.verdict.pass).toBe(false);
    expect(still.verdict.failures.join('\n')).toMatch(/longest stall/);
  });

  test('a block that starts during a just-started transition still lets the compositor advance it', async ({
    page,
  }, testInfo) => {
    // `during` blocks in the frame the transition has run 16 ms. In WebKit
    // the transition reaches the compositor in that frame's rendering update,
    // so a loop inside the rAF callback froze it (2 of 29 frames moved).
    // Linear and longer than the block, so every frame of the block moves two
    // position steps or more and the transition is still running when it
    // ends. The cast shows the box at rest first, so a transition that reaches
    // the screen after the block began is judged from there (onScreenFromMs).
    await busyFixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});
    // Judged against what the compositor presented in the same window: a
    // loaded runner's compositor skips frames a display-rate bound counts.
    const control = await startBusyControl(page);
    const cast = await startScreencast(page);
    await expect.poll(() => cast.frameCount()).toBeGreaterThan(0);
    await box.evaluate(el => {
      el.style.transition = 'transform 1600ms linear';
      el.getBoundingClientRect();
      el.style.transform = 'translateY(560px)';
    });
    const window = await blockMainThread(page, 700, {
      during: box,
      minProgressMs: 16,
    });
    await waitForRest(box);
    const frames = await cast.stop();
    await control.remove();
    const tracked = await trackMarker(page, frames);
    const proof = busyWindowProof(tracked, window, {
      axis: 'y',
      control: await trackMarker(page, frames, {rgb: CONTROL_RGB}),
    });
    testInfo.annotations.push({
      type: 'busy-main-thread transition',
      description: proof.summary,
    });
    expect(proof.verdict.failures, proof.summary).toEqual([]);
    expect(proof.monotonic).toBe(true);
  });

  test('against a compositor-only control in the same window, a compositor animation passes and a rAF one fails, whatever the screencast rate', async ({
    page,
  }, testInfo) => {
    const started = Date.now();
    await busyFixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});
    const control = await startBusyControl(page);

    const run = async (
      driver: 'compositor' | 'raf',
      everyNthFrame = 1,
      blockMs = 700,
    ) => {
      // Endless, so the animation still runs when the block starts however
      // long a loaded runner takes to start the cast, and wrapping from 560 px
      // back to 0 rather than turning, so every frame changes: two frames
      // straddling a turnaround evenly would read one position.
      await box.evaluate((el, how) => {
        el.getAnimations().forEach(a => a.cancel());
        el.style.transform = 'none';
        if (how === 'compositor') {
          el.animate(
            [{transform: 'translateY(0px)'}, {transform: 'translateY(560px)'}],
            {duration: 1600, easing: 'linear', iterations: Infinity},
          );
        } else {
          // Each step is logged with its time on the page clock, and when it
          // ran. A frame can then be traced to the step it shows. The first
          // entry is the reset.
          const reset = performance.timeOrigin + performance.now();
          const steps = [{t: reset, ran: reset, y: 0}];
          (window as unknown as {__rafSteps: typeof steps}).__rafSteps = steps;
          const start = performance.now();
          const step = (now: number) => {
            const p = ((now - start) / 1600) % 1;
            el.style.transform = `translateY(${560 * p}px)`;
            steps.push({
              t: performance.timeOrigin + now,
              ran: performance.timeOrigin + performance.now(),
              y: 560 * p,
            });
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      }, driver);
      const cast = await startScreencast(page, {everyNthFrame});
      await page.waitForTimeout(200);
      // The compositor's run is blocked only once it is on the compositor.
      const window = await blockMainThread(
        page,
        blockMs,
        driver === 'compositor' ? {during: box} : {},
      );
      await page.waitForTimeout(200);
      const frames = await cast.stop();
      const tracked = await trackMarker(page, frames);
      const controlFrames = await trackMarker(page, frames, {rgb: CONTROL_RGB});
      const proof = busyWindowProof(tracked, window, {
        axis: 'y',
        control: controlFrames,
      });
      // The judgment without the control, for the record only: on a
      // two-core runner it can fail where the control shows the compositor
      // itself presented no more.
      const alone = busyWindowProof(tracked, window, {axis: 'y'});
      testInfo.annotations.push({
        type: `busy-main-thread ${driver} 1/${everyNthFrame} against the control`,
        description: `${proof.summary} | without the control: ${alone.verdict.failures.join('; ') || 'pass'}`,
      });
      // `before` holds the steps the page set in the 800 ms before the block.
      // `unset` lists the frames in the judged part that show a new position
      // set at none of them. On a starved runner, a late frame showed a step
      // at most 261 ms old. The page runs no step while the block holds the
      // main thread, which its log shows (`inBlock`).
      const steps =
        driver === 'raf'
          ? await page.evaluate(
              () =>
                (
                  window as unknown as {
                    __rafSteps: {t: number; ran: number; y: number}[];
                  }
                ).__rafSteps,
            )
          : [];
      const before = steps
        .filter(s => s.t < window.from && s.t >= window.from - 800)
        .map(s => s.y);
      const top = await box.evaluate(el => (el as HTMLElement).offsetTop);
      // Within one cast step: a position reads up to a step off (2 px in
      // WebKit's cast, 1 px in Chromium's).
      const step = castStep(tracked, 'y');
      let shown = tracked
        .filter(f => f.box != null && f.t < proof.judged.from)
        .at(-1)?.box?.y;
      const unset: {atMs: number; y: number}[] = [];
      for (const f of tracked) {
        const y = f.box?.y;
        if (y == null || f.t < proof.judged.from || f.t > proof.judged.to) {
          continue;
        }
        if (
          shown != null &&
          Math.abs(y - shown) > 0.25 &&
          !before.some(set => Math.abs(top + set - y) <= step)
        ) {
          unset.push({atMs: f.t - window.from, y: y - top});
        }
        shown = y;
      }
      // By when each step ran: Chromium stamps a step with its frame's time,
      // which can fall inside the block though the step ran after it.
      const inBlock = steps.filter(
        s => s.ran > window.from && s.ran < window.to,
      ).length;
      return {proof, unset: driver === 'raf' ? unset : null, inBlock};
    };

    const armStart = Date.now();
    const {proof: compositor} = await run('compositor');
    const armMs = Date.now() - armStart;
    expect(compositor.verdict.failures, compositor.summary).toEqual([]);
    expect(compositor.control?.moved).toBeGreaterThanOrEqual(4);

    // A loaded runner presents fewer frames, so the same block holds fewer of
    // the frames the other arms judge. Each of their blocks is sized from the
    // cadence this arm measured, to hold ten of them, and never shorter
    // than on an idle runner. Each arm also takes at most this arm's work
    // around its block. A machine too slow for them to fit in the test's time
    // fails here, not at its timeout.
    const slowNth = 6;
    const rafMs = Math.max(700, 10 * compositor.cadenceMs);
    const slowMs = Math.max(1400, 10 * slowNth * compositor.cadenceMs);
    const needMs =
      Date.now() - started + rafMs + 2 * slowMs + 3 * (armMs - 700);
    testInfo.annotations.push({
      type: 'busy-main-thread blocks',
      description: `a frame every ${compositor.cadenceMs.toFixed(0)} ms: blocks of ${rafMs.toFixed(0)} and ${slowMs.toFixed(0)} ms, about ${(needMs / 1000).toFixed(0)} s in all`,
    });
    if (
      slowMs > 30_000 ||
      (testInfo.timeout > 0 && needMs > testInfo.timeout - 5000)
    ) {
      throw new Error(
        `a frame every ${compositor.cadenceMs.toFixed(0)} ms needs blocks of ${(slowMs / 1000).toFixed(1)} s, about ${(needMs / 1000).toFixed(0)} s in all, past ${slowMs > 30_000 ? 'the 30 s cap' : `the test's ${(testInfo.timeout / 1000).toFixed(0)} s`}: this machine presents too little to judge in time`,
      );
    }

    // The mutant: a main-thread animation freezes while the control moves.
    // The compositor can still present, inside the block, steps the page set
    // before it. On a loaded runner it showed two such steps, up to 230 ms in.
    // Every new position it shows there is a step set shortly before the
    // block, never a step from inside it. How many frames the verdict counts
    // as moved depends on how many such steps a loaded runner presents.
    const raf = await run('raf', 1, rafMs);
    expect(raf.inBlock, raf.proof.summary).toBe(0);
    expect(raf.proof.verdict.pass, raf.proof.summary).toBe(false);
    expect(raf.proof.verdict.failures.join('\n')).toMatch(
      /longest stall .* longer than the control's/,
    );
    expect(raf.unset, raf.proof.summary).toEqual([]);

    // A slower screencast samples the control and the component alike.
    const {proof: slow} = await run('compositor', slowNth, slowMs);
    expect(slow.verdict.failures, slow.summary).toEqual([]);
    const slowRaf = await run('raf', slowNth, slowMs);
    expect(slowRaf.inBlock, slowRaf.proof.summary).toBe(0);
    expect(slowRaf.proof.verdict.pass, slowRaf.proof.summary).toBe(false);
    await control.remove();
  });

  test("mounted within an open modal dialog, the control leaves the dialog's backdrop animation on the compositor", async ({
    page,
  }) => {
    // A dimming backdrop over a black page: its brightness at a point is the
    // value judged, read from the same frames as the control.
    await page.route('http://backdrop.test/', route =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#000;height:100vh}dialog{width:120px;height:80px;padding:0;border:0;background:#fff}dialog::backdrop{background:rgb(255,255,0);opacity:.2}</style><dialog id="sheet"></dialog>`,
      }),
    );
    await page.goto('http://backdrop.test/');
    const dialog = page.locator('#sheet');
    // The dim runs from the dialog's open, endlessly and wrapping rather than
    // turning, so it is on screen and changing on every frame by the block.
    await dialog.evaluate(el => {
      (el as HTMLDialogElement).showModal();
      el.animate([{opacity: 0.2}, {opacity: 1}], {
        duration: 900,
        easing: 'linear',
        iterations: Infinity,
        pseudoElement: '::backdrop',
      });
    });
    const control = await startBusyControl(page, {within: dialog});
    const cast = await startScreencast(page);
    await page.waitForTimeout(200);
    const window = await blockMainThread(page, 600, {during: dialog});
    await page.waitForTimeout(200);
    const castFrames = await cast.stop();
    await control.remove();
    const controlFrames = await trackMarker(page, castFrames, {
      rgb: CONTROL_RGB,
    });
    const dim = await trackBrightness(page, castFrames, {x: 40, y: 600});
    const proof = busyWindowProof(dim, window, {
      axis: 'x',
      control: controlFrames,
    });
    expect(proof.verdict.failures, proof.summary).toEqual([]);
  });

  test('trackBrightness reads the channel it is given, over a square of the size it is given', async ({
    page,
  }) => {
    const lastFrame = async (html: string) => {
      await page.setContent(html);
      // The cast sends a frame only when the screen changes, and a loaded
      // runner can draw the new page late. So a dot fades in and out in the
      // far corner, clear of every square read below. The cast starts once
      // the page has drawn, so every frame it sends shows the page.
      await page.evaluate(
        () =>
          new Promise<void>(resolve => {
            const dot = document.createElement('div');
            Object.assign(dot.style, {
              position: 'fixed',
              right: '0',
              bottom: '0',
              width: '4px',
              height: '4px',
              background: '#fff',
            });
            document.body.append(dot);
            dot.animate([{opacity: 0}, {opacity: 1}], {
              duration: 200,
              direction: 'alternate',
              iterations: Infinity,
            });
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );
      const cast = await startScreencast(page);
      await waitForCastFrames(cast, 1, 'the cast waited for the drawn page');
      const last = (await cast.stop()).slice(-1);
      expect(last).toHaveLength(1);
      return last;
    };
    const read = async (
      castFrames: readonly CastFrame[],
      at: {x: number; y: number; size: number; channel?: 'r' | 'g' | 'b'},
    ) => (await trackBrightness(page, castFrames, at))[0].box?.x ?? Number.NaN;
    // A flat colour: each channel reads its own value, to within the cast's
    // compression.
    const flat = await lastFrame(
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:rgb(10,200,30)}</style>',
    );
    for (const [channel, value] of [
      ['r', 10],
      ['g', 200],
      ['b', 30],
    ] as const) {
      expect(
        Math.abs((await read(flat, {x: 40, y: 40, size: 16, channel})) - value),
      ).toBeLessThan(6);
    }
    // A 16 px red block on black. A small square inside it reads the block.
    // A large one reads mostly the black around it, at any device scale.
    const block = await lastFrame(
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000}#block{position:absolute;left:40px;top:40px;width:16px;height:16px;background:rgb(200,0,0)}</style><div id="block"></div>',
    );
    expect(await read(block, {x: 44, y: 44, size: 4})).toBeGreaterThan(150);
    expect(await read(block, {x: 44, y: 44, size: 128})).toBeLessThan(60);
  });

  test("waitForAnimation and blockMainThread's during never count the control's own animation inside a dialog", async ({
    page,
  }) => {
    await page.setContent(
      '<dialog id="d" style="width:200px;height:200px">still</dialog>',
    );
    await page.evaluate(() =>
      (document.getElementById('d') as HTMLDialogElement).showModal(),
    );
    const dialog = page.locator('#d');
    const control = await startBusyControl(page, {within: dialog});
    // The dialog animates nothing of its own: both gates keep waiting.
    await expect(
      blockMainThread(page, 100, {during: dialog, timeout: 600}),
    ).rejects.toThrow(/no animation started/);
    await expect(waitForAnimation(dialog, {timeout: 600})).rejects.toThrow();
    // Its own animation answers both.
    await dialog.evaluate(el =>
      el.animate([{opacity: 1}, {opacity: 0.5}], {duration: 2000}),
    );
    await waitForAnimation(dialog);
    await blockMainThread(page, 100, {during: dialog});
    await control.remove();
  });

  test("blockMainThread names a `during` element that left the page before the wait, within the target's wait", async ({
    page,
  }) => {
    await page.setContent(
      '<div id="gone" style="width:100px;height:100px">gone</div>',
    );
    const gone = page.locator('#gone');
    await gone.evaluate(el => el.remove());
    await expect(blockMainThread(page, 100, {during: gone})).rejects.toThrow(
      "blockMainThread: during locator('#gone') is not on the page after 5000 ms: it is gone, or it never came",
    );
  });

  test('blockMainThread names a `during` element that leaves the page while it waits, at the next look', async ({
    page,
  }) => {
    await page.setContent(
      '<div id="leaves" style="width:100px;height:100px">leaves</div>',
    );
    const leaves = page.locator('#leaves');
    // The page removes it on its own, well after the wait starts and well
    // before the wait's 5 s timeout.
    await leaves.evaluate(el => {
      setTimeout(() => el.remove(), 1500);
    });
    const error = await blockMainThread(page, 100, {during: leaves}).then(
      () => null,
      (e: unknown) => e,
    );
    const message = error instanceof Error ? error.message : String(error);
    const left =
      /^blockMainThread: during locator\('#leaves'\) left the page (\d+) ms into the wait, before an animation of it ran: it is gone$/.exec(
        message,
      );
    expect(left, message).not.toBeNull();
    // Seen at a look soon after it left, not at the wait's timeout.
    expect(Number(left?.[1])).toBeLessThan(5_000);
  });

  test('a control started ahead runs half a leg ahead of the first, in the strip below, and the two read every frame', async ({
    page,
  }, testInfo) => {
    await busyFixture(page);
    const first = await startBusyControl(page);
    const ahead = await startBusyControl(page, {ahead: true});
    // Half a leg ahead of the first, on the page clock.
    expect(first.start - ahead.start).toBeCloseTo(200, 0);
    const cast = await startScreencast(page);
    // Five turns of the first control.
    await page.waitForTimeout(2000);
    const castFrames = await cast.stop();
    const one = await trackControl(page, castFrames);
    const two = await trackControl(page, castFrames, {ahead: true});
    // Each box shows on every frame, the one ahead in the strip below.
    expect(one.every(f => f.box != null)).toBe(true);
    expect(two.every(f => f.box != null && f.box.y >= CONTROL_SIDE)).toBe(true);
    // Where the first control reads nothing, within 36 px of a turn, the one
    // ahead reads the frame.
    const clocks = [controlClock(one), controlClock(two)];
    const unread = castFrames.filter(f => clocks.every(c => !c.has(f.t)));
    testInfo.annotations.push({
      type: 'the controls read (frames)',
      description: JSON.stringify({
        frames: castFrames.length,
        firstBlind: castFrames.filter(f => !clocks[0].has(f.t)).length,
        unread: unread.length,
      }),
    });
    expect(unread.map(f => f.t)).toEqual([]);
    await first.remove();
  });

  test('a busy proof given the control ahead judges a compositor animation through a blocked main thread, and a rAF one still freezes', async ({
    page,
  }, testInfo) => {
    await busyFixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});
    // Opted in: the control ahead dates the frames near the first one's turns.
    const first = await startBusyControl(page);
    const ahead = await startBusyControl(page, {ahead: true});
    const run = async (driver: 'compositor' | 'raf') => {
      const cast = await startScreencast(page);
      await box.evaluate((el, how) => {
        el.getAnimations().forEach(a => a.cancel());
        el.style.transform = 'none';
        if (how === 'compositor') {
          el.animate(
            [{transform: 'translateY(0px)'}, {transform: 'translateY(560px)'}],
            {duration: 1100, easing: 'linear'},
          );
          return;
        }
        const start = performance.now();
        const step = (now: number) => {
          const progress = Math.min(1, (now - start) / 1100);
          el.style.transform = `translateY(${560 * progress}px)`;
          if (progress < 1) {
            requestAnimationFrame(step);
          }
        };
        requestAnimationFrame(step);
      }, driver);
      // A rendering update first, so the compositor drops the last run's
      // animation before the block.
      await page.evaluate(
        () =>
          new Promise<void>(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const window = await blockMainThread(
        page,
        700,
        driver === 'compositor' ? {during: box} : {},
      );
      await page.waitForTimeout(200);
      const castFrames = await cast.stop();
      return busyWindowProof(await trackMarker(page, castFrames), window, {
        axis: 'y',
        control: await trackControl(page, castFrames),
        ahead: await trackControl(page, castFrames, {ahead: true}),
        controlStarts: [first.start, ahead.start],
      });
    };
    const compositor = await run('compositor');
    testInfo.annotations.push({
      type: 'busy proof with the control ahead',
      description: compositor.summary,
    });
    expect(compositor.verdict.failures, compositor.summary).toEqual([]);
    const raf = await run('raf');
    expect(raf.verdict.failures, raf.summary).not.toEqual([]);
    await first.remove();
  });

  test('a hold that starts before the block is judged from its first presented change inside it; a single change and then a freeze still fails', async ({
    page,
  }) => {
    await busyFixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});
    const control = await startBusyControl(page);
    // On the compositor: a move, a 300 ms hold (as WebKit holds a sheet's
    // just-started release on screen), then a move; or one jump inside the
    // block and nothing after it. `heldAt` is the hold's offset, the position
    // the page set last.
    const run = async (
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions,
      heldAt?: number,
    ) => {
      const cast = await startScreencast(page);
      await page.waitForTimeout(150);
      await box.evaluate(
        (el, [frames, timing]) => {
          el.getAnimations().forEach(a => a.cancel());
          el.animate(frames, timing);
        },
        [keyframes, options] as const,
      );
      // The block starts inside the hold, which began before it.
      const window = await blockMainThread(page, 600, {
        during: box,
        minProgressMs: 700,
      });
      await page.waitForTimeout(150);
      const frames = await cast.stop();
      const tracked = await trackMarker(page, frames);
      // Where the box sits untransformed: the run starts there.
      const top = Math.min(
        ...tracked.flatMap(f => (f.box == null ? [] : [f.box.y])),
      );
      return busyWindowProof(tracked, window, {
        axis: 'y',
        control: await trackMarker(page, frames, {rgb: CONTROL_RGB}),
        ...(heldAt == null ? {} : {setBeforeBlock: top + heldAt}),
      });
    };
    // Held at a half pixel: WebKit's 2 px cast reads it up to a step off.
    const held = await run(
      [
        {transform: 'translateY(0px)', offset: 0},
        {transform: 'translateY(100.5px)', offset: 0.3},
        {transform: 'translateY(100.5px)', offset: 0.45},
        {transform: 'translateY(560px)', offset: 1},
      ],
      {duration: 2000, easing: 'linear'},
      100.5,
    );
    expect(held.verdict.failures, held.summary).toEqual([]);
    // The freeze is the curve's held tail, so every engine shows it: WebKit
    // on Linux ignores a fill on its compositor.
    const jumpThenFreeze = await run(
      [
        {transform: 'translateY(0px)', offset: 0},
        {transform: 'translateY(0px)', offset: 0.5},
        {transform: 'translateY(50px)', offset: 0.5},
        {transform: 'translateY(50px)', offset: 1},
      ],
      {duration: 1600, easing: 'linear'},
    );
    expect(jumpThenFreeze.verdict.pass, jumpThenFreeze.summary).toBe(false);
    await control.remove();
  });

  test('blockMainThread says a held curve keeps its end value only through a held tail or a fill the compositor honors', async ({
    page,
    browserName,
  }) => {
    await busyFixture(page);
    const box = page.locator('#box');
    const holds = async (
      timing: KeyframeAnimationOptions,
      keyframes: Keyframe[] = [
        {transform: 'translateY(0px)'},
        {transform: 'translateY(200px)'},
      ],
    ) => {
      await box.evaluate(
        (el, [frames, options]) => {
          el.getAnimations().forEach(a => a.cancel());
          el.animate(frames, options);
        },
        [keyframes, timing] as const,
      );
      const window = await blockMainThread(page, 50, {during: box});
      return window.animation?.holds;
    };
    // A held tail: the last keyframes repeat the end value. So the curve ends
    // halfway, and the element keeps that value after it with no fill.
    expect(
      await holds({duration: 1000}, [
        {transform: 'translateY(0px)', offset: 0},
        {transform: 'translateY(200px)', offset: 0.5},
        {transform: 'translateY(200px)', offset: 1},
      ]),
    ).toBe(true);
    // WebKit on Linux ignores `fill` on its compositor (motion/animator.ts,
    // END_HOLD_MS): there a filled move that ends inside a block snaps back.
    expect(await holds({duration: 1000, fill: 'forwards'})).toBe(
      browserName !== 'webkit' || process.platform !== 'linux',
    );
    expect(await holds({duration: 1000})).toBe(false);
    // An end delay shows nothing with no fill: it is no held tail.
    expect(await holds({duration: 1000, endDelay: 500})).toBe(false);
  });

  test('a block too short to judge alone is judged over pooled runs: a compositor animation passes, and a rAF one fails, timed or frame-counted', async ({
    page,
  }, testInfo) => {
    await busyFixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});
    const control = await startBusyControl(page);
    const rest = await box.boundingBox();
    if (rest == null) {
      throw new Error('no box');
    }

    // Six 70 ms blocks: each judged part (20 ms margins, 30 ms) holds at most
    // three frames even at WebKit's 14 ms cast, under the four one window
    // needs, as a short fade's does.
    const runs = async (
      driver: 'compositor' | 'raf' | 'counted 1' | 'counted 2',
    ) => {
      await box.evaluate((el, how) => {
        el.getAnimations().forEach(a => a.cancel());
        el.style.transform = 'none';
        if (how === 'compositor') {
          // Endless, wrapping from 560 px back to 0 rather than turning, so
          // every frame changes: two frames straddling a turnaround evenly
          // would read one position.
          el.animate(
            [{transform: 'translateY(0px)'}, {transform: 'translateY(560px)'}],
            {duration: 1600, easing: 'linear', iterations: Infinity},
          );
        } else if (how === 'raf') {
          const start = performance.now();
          // The same endless run on the main thread.
          const step = (now: number) => {
            const p = ((now - start) / 1600) % 1;
            el.style.transform = `translateY(${560 * p}px)`;
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        } else {
          // A fixed step a frame, counted rather than timed: after a block it
          // goes on from where it stood instead of catching up.
          const px = how === 'counted 1' ? 1 : 2;
          let y = 0;
          let direction = 1;
          const step = () => {
            if (y + direction * px > 560 || y + direction * px < 0) {
              direction = -direction;
            }
            y += direction * px;
            el.style.transform = `translateY(${y}px)`;
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      }, driver);
      const cast = await startScreencast(page);
      await page.waitForTimeout(200);
      const windows = [];
      for (let i = 0; i < 6; i += 1) {
        windows.push(await blockMainThread(page, 70));
        await page.waitForTimeout(150);
      }
      const frames = await cast.stop();
      // Each search reads only the strip its box crosses. On a loaded machine
      // a search of every pixel, four drivers by two tracks, held most of the
      // test's time. The box travels 560 px down from where it rests.
      const tracked = await trackMarker(page, frames, {
        region: {
          x: rest.x - 20,
          y: rest.y - 16,
          width: rest.width + 40,
          height: rest.height + 560 + 32,
        },
      });
      const controlFrames = await trackControl(page, frames);
      return windows.map(window => ({tracked, control: controlFrames, window}));
    };

    const compositor = await runs('compositor');
    // One run is too little to judge, so the proof throws by name.
    const single = (() => {
      try {
        const proof = busyWindowProof(
          compositor[0].tracked,
          compositor[0].window,
          {axis: 'y', control: compositor[0].control},
        );
        return `${proof.verdict.failures.join('\n')} ${proof.summary}`;
      } catch (error) {
        if (!(error instanceof FrameStarvationError)) {
          throw error;
        }
        return String(error);
      }
    })();
    expect(single).toMatch(
      /too little in this window to judge|FrameStarvationError: busyWindowProof/,
    );
    const pooled = pooledBusyProof(compositor, {axis: 'y'});
    testInfo.annotations.push({
      type: 'busy-pooled compositor',
      description: pooled.summary,
    });
    expect(pooled.verdict.failures, pooled.summary).toEqual([]);

    // The same runs with the control taken out of the last blocks. A starved
    // run is named and left out. With too few judged runs, the pool throws by
    // name.
    const starve = (count: number) =>
      pooledBusyProof(
        compositor.map((run, i) =>
          i < compositor.length - count
            ? run
            : {
                ...run,
                control: run.control.map(frame =>
                  frame.t >= run.window.from && frame.t <= run.window.to
                    ? {...frame, box: null}
                    : frame,
                ),
              },
        ),
        {axis: 'y'},
      );
    const lastStarved = starve(1);
    expect(lastStarved.judged[5], lastStarved.summary).toBe(false);
    expect(lastStarved.summary).toMatch(
      /; run 6: too little to judge, the control moved on 0 frames/,
    );
    const oneLeft = () => starve(5);
    expect(oneLeft).toThrow(FrameStarvationError);
    expect(oneLeft).toThrow(/[01] of 6 runs judged, under 3/);

    // The mutant: a main-thread animation freezes in every block.
    const raf = pooledBusyProof(await runs('raf'), {axis: 'y'});
    testInfo.annotations.push({
      type: 'busy-pooled raf',
      description: raf.summary,
    });
    expect(raf.verdict.pass, raf.summary).toBe(false);
    expect(raf.verdict.failures.join('\n')).toMatch(
      /moved on \d+ of the \d+ frames the control moved over (6 runs|the \d judged runs of 6)/,
    );

    // A frame-counted loop stalls in every block too and then steps on, one
    // cast step a frame at 1 px: its stall is longer than its runs before it.
    for (const counted of ['counted 1', 'counted 2'] as const) {
      const proof = pooledBusyProof(await runs(counted), {axis: 'y'});
      testInfo.annotations.push({
        type: `busy-pooled ${counted}`,
        description: proof.summary,
      });
      expect(proof.verdict.pass, `${counted}: ${proof.summary}`).toBe(false);
    }
    await control.remove();
  });

  test('a block never starts on an animation that is not on the compositor yet', async ({
    page,
  }, testInfo) => {
    // An animation created in the frame the helper looks is still pending (not
    // committed to the compositor). A block that started on it then froze it
    // in Chromium: no presented frame moved.
    await busyFixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});
    await box.evaluate(el => {
      el.style.willChange = 'transform';
    });
    // Judged against what the compositor presented in the same window: a
    // loaded runner's compositor skips frames a display-rate bound counts.
    const control = await startBusyControl(page);
    const cast = await startScreencast(page);
    // A rAF loop registered before the helper's tick runs ahead of it in every
    // frame; on its 12th frame it creates the animation, and the helper's tick
    // looks in that same frame.
    await box.evaluate(el => {
      let n = 0;
      const loop = () => {
        n += 1;
        if (n === 12) {
          el.animate(
            [{transform: 'translateY(0px)'}, {transform: 'translateY(560px)'}],
            {duration: 1600, easing: 'linear'},
          );
          return;
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    const window = await blockMainThread(page, 700, {
      during: box,
      minProgressMs: 0,
    });
    await waitForRest(box);
    const frames = await cast.stop();
    await control.remove();
    const tracked = await trackMarker(page, frames);
    const proof = busyWindowProof(tracked, window, {
      axis: 'y',
      control: await trackMarker(page, frames, {rgb: CONTROL_RGB}),
    });
    testInfo.annotations.push({
      type: 'busy-main-thread pending animation',
      description: proof.summary,
    });
    expect(proof.verdict.failures, proof.summary).toEqual([]);
    expect(proof.monotonic).toBe(true);
  });

  test('a block holds the thread for the whole time asked, on a clock that steps back between two reads', async ({
    page,
  }) => {
    await page.setContent('<!doctype html><body></body>');
    // A coarsened clock with jitter, as WebKit's: its second reading is one
    // ms behind its first, then it runs on. So is its time origin, which
    // WebKit floors to the ms.
    await page.evaluate(() => {
      const real = performance.now.bind(performance);
      let reads = 0;
      performance.now = () => {
        reads += 1;
        const t = Math.floor(real());
        return reads === 2 ? t - 1 : t;
      };
      const origin = Math.floor(performance.timeOrigin);
      let originReads = 0;
      Object.defineProperty(performance, 'timeOrigin', {
        configurable: true,
        get: () => {
          originReads += 1;
          return originReads === 2 ? origin - 1 : origin;
        },
      });
    });
    const busy = await blockMainThread(page, 50);
    expect(busy.to - busy.from).toBeGreaterThan(50 - 0.01);
    expect(busy.spanMs).toBeGreaterThanOrEqual(50);
  });

  test('a block holds the thread for the whole time asked, on a clock whose sum of start and length rounds down', async ({
    page,
  }) => {
    await page.setContent('<!doctype html><body></body>');
    // Chromium's clock is microseconds over 1000. Its 1050.1 less 1000.1 is
    // just under 50, so a loop that tests the sum of start and length ends
    // early.
    await page.evaluate(() => {
      const readings = [1000.1, 1050.1];
      let reads = 0;
      performance.now = () => {
        reads += 1;
        return reads <= readings.length ? readings[reads - 1] : 1050.1 + reads;
      };
    });
    const busy = await blockMainThread(page, 50);
    expect(busy.spanMs).toBeGreaterThanOrEqual(50);
  });

  test('in the WebKit container, compiled shaders outlive the run', async ({
    browser,
  }, testInfo) => {
    // Only webkit-container.mjs sets ASTRYX_WEBKIT_CONTAINER, and only it
    // keeps the shader cache on the host.
    test.skip(
      testInfo.project.name !== 'webkit' ||
        process.env.ASTRYX_WEBKIT_CONTAINER !== '1',
      'no host-kept shader cache: runs only under webkit-container.mjs',
    );
    // A cache inside the container dies with it: every run then compiled each
    // shader again, 450–700 ms in the first frame of a blurred layer.
    const dir = process.env.MESA_SHADER_CACHE_DIR;
    expect(dir, 'MESA_SHADER_CACHE_DIR names the host-kept cache').toBeTruthy();
    // Written on the host by the script before the container starts.
    expect(
      fs.readFileSync(path.join(dir ?? '', 'ASTRYX-SHADER-CACHE'), 'utf8'),
    ).toContain('playwright');
    // Mesa writes what it compiles there once a page draws a blurred layer.
    // Earlier runs have filled the cache already, so this run's browser gets
    // an empty directory beside them, in the same host-kept mount, and the
    // test watches its own writes arrive.
    const fresh = fs.mkdtempSync(path.join(dir ?? '', 'self-test-'));
    try {
      const own = await browser.browserType().launch({
        env: {...process.env, MESA_SHADER_CACHE_DIR: fresh},
      });
      try {
        const context = await own.newContext();
        await keepRequestsLocal(context);
        const page = await context.newPage();
        await page.setContent(
          '<div id="glass" style="width:120px;height:80px;backdrop-filter:blur(16px) saturate(180%)"></div>',
        );
        await page.evaluate(
          () =>
            document
              .getElementById('glass')
              ?.animate([{scale: '1'}, {scale: '0.9'}], {duration: 200})
              .finished,
        );
      } finally {
        await own.close();
      }
      expect(fs.readdirSync(fresh, {recursive: true})).not.toEqual([]);
    } finally {
      fs.rmSync(fresh, {recursive: true, force: true});
    }
  });

  test('rect sampling reads one rect per animation frame while the main thread is free', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // The box slides at 1/3 px per ms for a minute, longer than the test may
    // run, so the sampling always reads it mid-slide. The slide starts in this
    // call and the sampling in the next. A loaded machine can take longer
    // between the two than a short slide lasts. The page also reads the box
    // first in each animation frame it draws. The samples are judged against
    // those reads, not against a frame rate the machine may not reach.
    await box.evaluate(el => {
      const animation = el.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(20000px)'}],
        {duration: 60_000, easing: 'linear'},
      );
      const drawn: {t: number; x: number}[] = [];
      (window as unknown as {drawn: typeof drawn}).drawn = drawn;
      const read = (now: number) => {
        drawn.push({
          t: performance.timeOrigin + now,
          x: el.getBoundingClientRect().x,
        });
        if (animation.playState === 'running') {
          requestAnimationFrame(read);
        }
      };
      requestAnimationFrame(read);
    });
    const samples = await sampleRects(box, 400);
    // One frame more, so the page has also read the frame after the last
    // sample.
    const drawn = await page.evaluate(
      () =>
        new Promise<{t: number; x: number}[]>(resolve => {
          requestAnimationFrame(() => {
            const w = window as unknown as {drawn: {t: number; x: number}[]};
            resolve(w.drawn.slice());
          });
        }),
    );
    const times = samples.map(s => s.t);
    expect(times.length).toBeGreaterThanOrEqual(2);
    // One sample on each frame the page drew while sampling, and no other.
    const first = drawn.findIndex(frame => frame.t === times[0]);
    expect(times).toEqual(
      drawn.slice(first, first + times.length).map(frame => frame.t),
    );
    // Each sample is its own frame's rect. It is read after the page's read
    // in that frame and before its read in the next. WebKit reads a rect when
    // it is read, which a loaded machine can put well past the frame's start.
    samples.forEach((sample, i) => {
      const x = sample.box?.x ?? NaN;
      expect(x).toBeGreaterThanOrEqual(drawn[first + i].x);
      expect(x).toBeLessThanOrEqual(drawn[first + i + 1].x);
    });
    expect(samples.at(-1)?.box?.x ?? NaN).toBeGreaterThan(
      samples[0].box?.x ?? NaN,
    );
  });

  test('a proof whose page the machine starves of frames fails by name: FrameStarvationError', async ({
    page,
  }) => {
    await page.setContent(
      '<!doctype html><div id="box" style="width:40px;height:40px;background:#000"></div>',
    );
    const box = page.locator('#box');
    // On pace, a 300 ms sample holds enough frames.
    const onPace = await sampleRects(box, 300);
    expect(requireFrames(onPace, {min: 6, during: 'a 300 ms sample'})).toEqual(
      onPace,
    );
    // Each frame now comes 100 ms after the one before, as on a starved
    // machine.
    await page.evaluate(() => {
      const frame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => {
        setTimeout(() => frame(callback), 100);
        return 0;
      };
    });
    const starved = await sampleRects(box, 300);
    let outcome: unknown = 'resolved';
    try {
      requireFrames(starved, {min: 6, during: 'a 300 ms sample'});
    } catch (error) {
      outcome = error;
    }
    expect(outcome).toBeInstanceOf(FrameStarvationError);
    const {numbers} = outcome as FrameStarvationError;
    expect(numbers.frames).toBeLessThan(6);
    expect(numbers.longestGapMs).toBeGreaterThan(FRAME_STARVATION_MS);
  });

  test('waitForRest on a page starved of frames fails by name, and an element still in motion still says so', async ({
    page,
  }) => {
    await page.setContent(
      '<!doctype html><div id="box" style="width:40px;height:40px;background:#000"></div>',
    );
    const box = page.locator('#box');
    await waitForRest(box, {timeout: 1000});
    // Motion at the deadline, on pace.
    await box.evaluate(el =>
      el.animate(
        [{transform: 'translateX(0)'}, {transform: 'translateX(100px)'}],
        {duration: 3000},
      ),
    );
    await expect(waitForRest(box, {timeout: 500})).rejects.toThrow(
      /waitForRest: still moving \(/,
    );
    await box.evaluate(el => {
      for (const animation of el.getAnimations()) {
        animation.cancel();
      }
    });
    // Script motion every third frame, with one 120 ms long task early in
    // the wait. Still frames between the moves are no starvation, and nor is
    // a gap long before the deadline.
    await box.evaluate(el => {
      let n = 0;
      const step = () => {
        n += 1;
        if (n % 3 === 0) {
          (el as HTMLElement).style.transform = `translateX(${n % 90}px)`;
        }
        if (el.isConnected && el.id === 'box') {
          requestAnimationFrame(step);
        }
      };
      requestAnimationFrame(step);
      setTimeout(() => {
        const end = performance.now() + 120;
        while (performance.now() < end) {
          // the page's main thread is busy
        }
      }, 100);
    });
    await expect(waitForRest(box, {timeout: 900})).rejects.toThrow(
      /waitForRest: still moving \(/,
    );
    // Stops the script motion: the element rests again.
    await box.evaluate(el => {
      el.id = 'rested';
      (el as HTMLElement).style.transform = '';
    });
    await waitForRest(page.locator('#rested'), {timeout: 1000});
    await page.locator('#rested').evaluate(el => {
      el.id = 'box';
    });
    // Each frame now comes 1,000 ms after the one before, as on a starved
    // machine: the element rests, but too few frames come to tell.
    await page.evaluate(() => {
      const frame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => {
        setTimeout(() => frame(callback), 1000);
        return 0;
      };
    });
    const outcome = await waitForRest(box, {timeout: 1500}).then(
      () => 'resolved',
      (error: unknown) => error,
    );
    expect(outcome).toBeInstanceOf(FrameStarvationError);
    const {numbers} = outcome as FrameStarvationError;
    expect(numbers.frames).toBeLessThan(3);
    expect(numbers.longestGapMs).toBeGreaterThan(FRAME_STARVATION_MS);
    expect((outcome as Error).message).toMatch(/^waitForRest: the page drew /);
  });

  test('waitForRest whose frame past the deadline shows motion after a starved gap fails by name, with the last move', async ({
    page,
  }) => {
    await page.setContent(
      '<!doctype html><div id="box" style="width:40px;height:40px;background:#000"></div>',
    );
    const box = page.locator('#box');
    // A move that ends 80 ms past the deadline: the gap outlasts what is left.
    await box.evaluate(el =>
      el.animate(
        [{transform: 'translateX(0)'}, {transform: 'translateX(100px)'}],
        {duration: 580},
      ),
    );
    await starveAcrossDeadline(box, 500);
    const outcome = await waitForRest(box, {timeout: 500}).then(
      () => 'resolved',
      (error: unknown) => error,
    );
    expect(outcome, String((outcome as Error).message)).toBeInstanceOf(
      FrameStarvationError,
    );
    const {numbers} = outcome as FrameStarvationError;
    expect(numbers.longestGapMs).toBeGreaterThan(FRAME_STARVATION_MS);
    expect((outcome as Error).message).toMatch(
      /the element still moved at its last frame \(.+ → .+\)/,
    );
  });

  test('waitForRest on an endless animation still says it is moving, across a starved gap too', async ({
    page,
  }) => {
    await page.setContent(
      '<!doctype html><div id="box" style="width:40px;height:40px;background:#000"></div>',
    );
    const box = page.locator('#box');
    // Its curve never ends, so no gap explains the motion.
    await box.evaluate(el =>
      el.animate(
        [{transform: 'translateX(0)'}, {transform: 'translateX(100px)'}],
        {duration: 400, iterations: Infinity},
      ),
    );
    await starveAcrossDeadline(box, 500);
    await expect(waitForRest(box, {timeout: 500})).rejects.toThrow(
      /waitForRest: still moving \(/,
    );
  });

  test('waitForRest on endless script motion across a starved gap fails by name, and its message gives the last move', async ({
    page,
  }) => {
    await page.setContent(
      '<!doctype html><div id="box" style="width:40px;height:40px;background:#000"></div>',
    );
    const box = page.locator('#box');
    // No animation drives it, so only the message tells it from a stop.
    await box.evaluate(el => {
      let x = 0;
      const step = () => {
        x = (x + 1) % 100;
        (el as HTMLElement).style.transform = `translateX(${x}px)`;
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    await starveAcrossDeadline(box, 500);
    const outcome = await waitForRest(box, {timeout: 500}).then(
      () => 'resolved',
      (error: unknown) => error,
    );
    expect(outcome, String((outcome as Error).message)).toBeInstanceOf(
      FrameStarvationError,
    );
    const [, from, to] =
      /the element still moved at its last frame \((.+?) → (.+?)\), where/.exec(
        (outcome as Error).message,
      ) ?? [];
    expect(from).toBeDefined();
    expect(to).not.toBe(from);
  });

  test('waitForRest on an element that stops in a starved gap ending just before the deadline fails by name', async ({
    page,
  }) => {
    await page.setContent(
      '<!doctype html><div id="box" style="width:40px;height:40px;background:#000"></div>',
    );
    const box = page.locator('#box');
    // The move ends inside the gap, and the gap ends 20 ms before the
    // deadline. Ten still frames cannot come in that time at any frame rate.
    await box.evaluate(el =>
      el.animate(
        [{transform: 'translateX(0)'}, {transform: 'translateX(100px)'}],
        {duration: 400},
      ),
    );
    await starveAcrossDeadline(box, 500, -20);
    const outcome = await waitForRest(box, {timeout: 500, frames: 10}).then(
      () => 'resolved',
      (error: unknown) => error,
    );
    expect(outcome, String((outcome as Error).message)).toBeInstanceOf(
      FrameStarvationError,
    );
    const {numbers} = outcome as FrameStarvationError;
    expect(numbers.longestGapMs).toBeGreaterThan(FRAME_STARVATION_MS);
  });

  test('waitForRest after a page freeze reads each curve on the page clock, so a long curve still says it is moving', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    const box = page.locator('#box');
    // A thaw leaves the page clock behind the real one by the frozen time.
    await freezePage(page);
    await page.waitForTimeout(1500);
    await thawPage(page);
    // Its curve outlasts the starved gap, so the gap explains nothing.
    await box.evaluate(el =>
      el.animate(
        [{transform: 'translateX(0)'}, {transform: 'translateX(100px)'}],
        {duration: 1000},
      ),
    );
    await starveAcrossDeadline(box, 500);
    await expect(waitForRest(box, {timeout: 500})).rejects.toThrow(
      /waitForRest: still moving \(/,
    );
  });

  test('the trace counts no Layout for a transform animation and one per frame for `top`', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'rendering traces are Chromium-only (README: engine limits)',
    );
    await fixture(page);
    const box = page.locator('#box');
    // Count the animation's steady middle: starting and ending it may lay out
    // once each. The page also records when it drew each frame (its rAF
    // times), so the frames are counted in the same window.
    const animate = async (property: 'transform' | 'top') => {
      let started = 0;
      const trace = await traceRendering(page, async () => {
        started = await box.evaluate((el, prop) => {
          const keyframes =
            prop === 'transform'
              ? [
                  {transform: 'translateY(0px)'},
                  {transform: 'translateY(200px)'},
                ]
              : [{top: '360px'}, {top: '560px'}];
          const animation = el.animate(keyframes, {duration: 600});
          const drawn: number[] = [];
          (window as unknown as {drawn: number[]}).drawn = drawn;
          const frame = (time: number) => {
            drawn.push(performance.timeOrigin + time);
            if (animation.playState === 'running') {
              requestAnimationFrame(frame);
            }
          };
          requestAnimationFrame(frame);
          return performance.timeOrigin + performance.now();
        }, property);
        await page.waitForTimeout(700);
      });
      const drawn = await page.evaluate(
        () => (window as unknown as {drawn: number[]}).drawn,
      );
      return {
        counts: countBetween(trace, started + 100, started + 500),
        frames: drawn.filter(t => t >= started + 100 && t <= started + 500)
          .length,
      };
    };
    const transform = await animate('transform');
    const top = await animate('top');
    expect(transform.counts.Layout ?? 0).toBe(0);
    expect(transform.counts.Paint ?? 0).toBe(0);
    // One layout per frame the page drew: 24 in 400 ms at 60 Hz, fewer on a
    // loaded runner, which draws fewer frames; at least 4 to judge. The
    // window's end can fall between a frame's start and its layout.
    expect(top.frames).toBeGreaterThanOrEqual(4);
    expect(top.counts.Layout ?? 0).toBeGreaterThanOrEqual(top.frames - 1);
  });

  test("the recorder's last frame before a trace runs before its start mark: an anchored layer that animates its transform counts no Layout in the whole window", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'rendering traces are Chromium-only (README: engine limits)',
    );
    // An anchored layer lays out again in every frame that runs a frame
    // callback, and the recorder's frame loop requests one each frame.
    await page.setContent(
      `<style>body { margin: 0; } #anchor { anchor-name: --a; position: absolute; left: 40px; top: 40px; width: 80px; height: 40px; } #layer { position: absolute; position-anchor: --a; top: anchor(bottom); left: anchor(left); width: 160px; height: 120px; background: #ddd; }</style><button id="anchor">Anchor</button><div id="layer"></div>`,
    );
    const layer = page.locator('#layer');
    await layer.evaluate(el => {
      el.animate([{transform: 'scale(1)'}, {transform: 'scale(1.2)'}], {
        duration: 3000,
        iterations: Infinity,
        direction: 'alternate',
      });
    });
    // Arms the recorder: from here its frame loop runs.
    await waitForAnimation(layer);
    await frames(page, 3);
    const steady = (trace: Awaited<ReturnType<typeof traceRendering>>) =>
      countBetween(trace, trace.window.from + 100, trace.window.to - 100)
        .Layout ?? 0;
    const quiet = await traceRendering(page, () => page.waitForTimeout(500));
    // None over the whole window: the frame the recorder requested before it
    // stood down runs before the start mark.
    expect(quiet.layout).toBe(0);
    // Control: a frame loop of the page's own makes the layer lay out each
    // frame, and the trace counts it.
    const busy = await traceRendering(page, async () => {
      await page.evaluate(() => {
        const end = performance.now() + 500;
        const frame = () => {
          if (performance.now() < end) {
            requestAnimationFrame(frame);
          }
        };
        requestAnimationFrame(frame);
      });
      await page.waitForTimeout(500);
    });
    expect(steady(busy)).toBeGreaterThan(10);
  });

  test('a traced Paint names the node it painted, and a style recalculation counts the elements it restyled', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'rendering traces are Chromium-only (README: engine limits)',
    );
    await page.setContent(
      `<style>body { margin: 0; }</style><div id="list"><span>a</span><span>b</span><span>c</span><span>d</span><span>e</span></div><div id="patch" style="width: 50px; height: 50px; background: red; will-change: transform"></div>`,
    );
    await frames(page, 3);
    // One frame restyles the five spans; a later one repaints the patch,
    // which has its own layer.
    const trace = await traceRendering(page, async () => {
      await page.evaluate(async () => {
        const twoFrames = () =>
          new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
        for (const span of document.querySelectorAll('#list span')) {
          (span as HTMLElement).style.color = 'blue';
        }
        await twoFrames();
        (document.getElementById('patch') as HTMLElement).style.background =
          'blue';
        await twoFrames();
      });
    });
    const restyled = trace.events
      .filter(e => e.name === 'UpdateLayoutTree')
      .map(e => e.elements);
    expect(restyled).toContain(5);
    expect(restyled).toContain(1);
    const painted = trace.events
      .filter(e => e.name === 'Paint')
      .map(e => e.node);
    expect(painted).toContain("DIV id='patch'");
    // Only those two events carry the fields.
    expect(
      trace.events.filter(
        e =>
          e.name !== 'Paint' &&
          e.name !== 'UpdateLayoutTree' &&
          (e.node != null || e.elements != null),
      ),
    ).toEqual([]);
  });

  test("the trace counts no Layout from the harness's own animation recorder, which stands down while it runs", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'rendering traces are Chromium-only (README: engine limits)',
    );
    await page.route('http://anchored.test/', route =>
      route.fulfill({contentType: 'text/html', body: ANCHORED}),
    );
    await page.goto('http://anchored.test/');
    const pop = page.locator('#pop');
    // The recorder runs, as in any spec that waited for an animation first.
    await waitForRest(pop);
    const watch = await watchAnimations(pop);
    const middle = async (askEveryFrame: boolean) => {
      let started = 0;
      const trace = await traceRendering(page, async () => {
        started = await pop.evaluate((el, every) => {
          const w = window as unknown as {stop?: boolean};
          w.stop = false;
          if (every) {
            const ask = () => {
              if (!w.stop) {
                requestAnimationFrame(ask);
              }
            };
            requestAnimationFrame(ask);
          }
          el.animate(
            [
              {transform: 'translateY(0px)', opacity: 1},
              {transform: 'translateY(100px)', opacity: 0.5},
            ],
            {duration: 600},
          );
          return performance.timeOrigin + performance.now();
        }, askEveryFrame);
        await page.waitForTimeout(700);
        await page.evaluate(() => {
          (window as unknown as {stop?: boolean}).stop = true;
        });
      });
      // The steady middle: starting and ending it may lay out once each.
      return countBetween(trace, started + 100, started + 500);
    };
    expect((await middle(false)).Layout ?? 0).toBe(0);
    // Control: a page that asks for a frame every frame lays it out in each.
    expect((await middle(true)).Layout ?? 0).toBeGreaterThan(18);
    // Nothing the traces ran went unrecorded.
    const started = await watch.started();
    expect(started.map(a => a.durationMs)).toEqual([600, 600]);
  });

  // The page's listener for the end-of-run proofs below, on the anchored
  // fixture. It is a capture listener on the document added after the
  // recorder's, so it runs after the recorder's. It sets a mark the trace
  // records, and a window that ends at that mark compares times on the
  // trace's own clock. `layOutAtEnd` first forces a layout of the target:
  // the control.
  async function markEndListeners(page: Page) {
    await page.evaluate(() => {
      const w = window as unknown as {
        __end: {stamp: number};
        __layOutAtEnd: boolean;
      };
      w.__end = {stamp: 0};
      w.__layOutAtEnd = false;
      document.addEventListener(
        'animationend',
        event => {
          const el = event.target as HTMLElement;
          if (w.__layOutAtEnd) {
            el.style.minWidth = '1px';
            void el.offsetWidth;
            el.style.minWidth = '';
          }
          performance.mark('harness-test-end-listeners-ran');
          w.__end = {stamp: performance.timeOrigin + event.timeStamp};
        },
        true,
      );
    });
  }

  // The time of the last mark named `name` in a trace that kept its events.
  function markIn(
    trace: Awaited<ReturnType<typeof traceRendering>>,
    name: string,
  ): number {
    const marks = (trace.mainThread ?? []).filter(e => e.name === name);
    const mark = marks.at(-1);
    if (mark == null) {
      throw new Error(`the trace kept no ${name} mark`);
    }
    return mark.t;
  }

  test("a CSS animation's end inside a trace costs no Layout from the recorder, with an earlier run of its name cut short, and only the runs that ended are reported, each dated where its start puts its end", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'rendering traces are Chromium-only (README: engine limits)',
    );
    await page.route('http://anchored.test/', route =>
      route.fulfill({contentType: 'text/html', body: ANCHORED}),
    );
    await page.goto('http://anchored.test/');
    const pop = page.locator('#pop');
    // The recorder runs, and its listeners are on the document by now.
    await waitForRest(pop);
    await page.addStyleTag({
      content:
        '@keyframes fade { from { opacity: 0.5 } to { opacity: 1 } } #pop.fade { animation: fade 300ms linear; }',
    });
    await markEndListeners(page);
    const endOnce = async (layOutAtEnd: boolean) => {
      await page.evaluate(layOut => {
        const w = window as unknown as {
          __end: {stamp: number};
          __layOutAtEnd: boolean;
        };
        w.__end = {stamp: 0};
        w.__layOutAtEnd = layOut;
      }, layOutAtEnd);
      const trace = await traceRendering(
        page,
        async () => {
          await pop.evaluate(el => {
            el.classList.add('fade');
          });
          await page.waitForFunction(
            () =>
              (window as unknown as {__end: {stamp: number}}).__end.stamp > 0,
            undefined,
            {polling: 50},
          );
        },
        {keepEvents: true},
      );
      const {stamp} = await page.evaluate(
        () => (window as unknown as {__end: {stamp: number}}).__end,
      );
      await pop.evaluate(el => {
        el.classList.remove('fade');
      });
      // From a millisecond before the end event's coarse time stamp to the
      // mark after the recorder's end listener.
      return (
        countBetween(
          trace,
          stamp - 1,
          markIn(trace, 'harness-test-end-listeners-ran'),
        ).Layout ?? 0
      );
    };
    // An earlier run of the same name, cut short outside any trace, never
    // finishes. It stays unfinished in the recorder's log, so each end below
    // has another run of its name to read.
    const watch = await watchAnimations(pop);
    await pop.evaluate(el => {
      el.classList.add('fade');
    });
    await waitForAnimation(pop);
    await pop.evaluate(el => {
      el.classList.remove('fade');
    });
    for (let run = 0; run < 3; run++) {
      expect(await endOnce(false)).toBe(0);
    }
    // Only the three runs that ended are reported, each where its start puts
    // its end. The run cut short is not reported as finished.
    const ended = await watch.started();
    expect(ended).toHaveLength(3);
    for (const run of ended) {
      expect(run.finishedAt).not.toBeNull();
      expect(Math.abs((run.finishedAt ?? 0) - run.to)).toBeLessThan(1);
    }
    // Control: a layout forced in that span is counted.
    expect(await endOnce(true)).toBeGreaterThan(0);
  });

  test('an end event that comes before its run finishes, inside a trace, costs no Layout, and the recorder dates the run from the start it stored once the trace ends', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'rendering traces are Chromium-only (README: engine limits)',
    );
    await page.route('http://anchored.test/', route =>
      route.fulfill({contentType: 'text/html', body: ANCHORED}),
    );
    await page.goto('http://anchored.test/');
    const pop = page.locator('#pop');
    await waitForRest(pop);
    await page.addStyleTag({
      content:
        '@keyframes fade { from { opacity: 0.5 } to { opacity: 1 } } #pop.fade { animation: fade 300ms linear; }',
    });
    await markEndListeners(page);
    // Chromium can send a CSS run's end event a frame before the run
    // finishes. A page that cancels the run at that end gets no finish event.
    // The proof sends that end event itself, while the run plays, and then
    // cancels the run. A style write first leaves style to restyle, as at a
    // run's real end.
    const early = async (layOutAtEnd: boolean) => {
      const watch = await watchAnimations(pop);
      await pop.evaluate(el => {
        el.classList.add('fade');
      });
      await waitForAnimation(pop);
      await page.evaluate(layOut => {
        (window as unknown as {__layOutAtEnd: boolean}).__layOutAtEnd = layOut;
      }, layOutAtEnd);
      const trace = await traceRendering(
        page,
        () =>
          pop.evaluate(el => {
            performance.mark('harness-test-early-end');
            el.style.minWidth = '1px';
            el.dispatchEvent(
              new AnimationEvent('animationend', {
                animationName: 'fade',
                elapsedTime: 0.1,
              }),
            );
            el.style.minWidth = '';
            el.classList.remove('fade');
          }),
        {keepEvents: true},
      );
      const layouts =
        countBetween(
          trace,
          markIn(trace, 'harness-test-early-end'),
          markIn(trace, 'harness-test-end-listeners-ran'),
        ).Layout ?? 0;
      return {layouts, watch};
    };
    const first = await early(false);
    expect(first.layouts).toBe(0);
    // The recorder kept that end, and dated the run once the trace ended,
    // from the start it stored and the run's timing.
    const runs = await first.watch.started();
    expect(runs).toHaveLength(1);
    expect(runs[0].finishedAt).not.toBeNull();
    expect(Math.abs((runs[0].finishedAt ?? 0) - runs[0].to)).toBeLessThan(1);
    // Control: a layout forced in that span is counted.
    expect((await early(true)).layouts).toBeGreaterThan(0);
  });

  test('a waitForRest awaited inside a traced body stands down too, so the trace counts no Layout from it', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'rendering traces are Chromium-only (README: engine limits)',
    );
    await page.route('http://anchored.test/', route =>
      route.fulfill({contentType: 'text/html', body: ANCHORED}),
    );
    await page.goto('http://anchored.test/');
    const pop = page.locator('#pop');
    await waitForRest(pop);
    let started = 0;
    const trace = await traceRendering(page, async () => {
      started = await pop.evaluate(el => {
        el.animate(
          [
            {transform: 'translateY(0px)', opacity: 1},
            {transform: 'translateY(100px)', opacity: 0.5},
          ],
          {duration: 600},
        );
        return performance.timeOrigin + performance.now();
      });
      // A per-frame wait here would make every frame a main-thread frame.
      await waitForRest(pop);
    });
    expect(countBetween(trace, started + 100, started + 500).Layout ?? 0).toBe(
      0,
    );
    // It still waited for the curve to end.
    expect(trace.window.to - started).toBeGreaterThanOrEqual(590);
  });

  test('a waitForAnimation or watch.started() awaited inside a traced body stands down too, so the trace counts no Layout from it', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'rendering traces are Chromium-only (README: engine limits)',
    );
    await page.route('http://anchored.test/', route =>
      route.fulfill({contentType: 'text/html', body: ANCHORED}),
    );
    await page.goto('http://anchored.test/');
    const pop = page.locator('#pop');
    await waitForRest(pop);
    const watch = await watchAnimations(pop);
    let started = 0;
    let waited: {durationMs: number}[] = [];
    let watched: {durationMs: number}[] = [];
    const trace = await traceRendering(page, async () => {
      started = await pop.evaluate(el => {
        el.animate(
          [
            {transform: 'translateY(0px)', opacity: 1},
            {transform: 'translateY(100px)', opacity: 0.5},
          ],
          {duration: 600},
        );
        return performance.timeOrigin + performance.now();
      });
      // Both poll until 450 ms of the curve has played, across the steady
      // middle; a read of the page's animations each time would lay it out.
      waited = await waitForAnimation(pop, {minProgressMs: 450});
      watched = await watch.started({minProgressMs: 450});
      await page.waitForTimeout(200);
    });
    expect(countBetween(trace, started + 100, started + 500).Layout ?? 0).toBe(
      0,
    );
    // Each still answered with the animation once 450 ms of it had played.
    expect(waited.map(a => a.durationMs)).toEqual([600]);
    expect(watched.map(a => a.durationMs)).toEqual([600]);
    expect(trace.window.to - started).toBeGreaterThanOrEqual(590);
  });

  test('a waitForRest awaited inside a traced body waits for an animation the action starts two frames later', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'rendering traces are Chromium-only (README: engine limits)',
    );
    await page.route('http://anchored.test/', route =>
      route.fulfill({contentType: 'text/html', body: ANCHORED}),
    );
    await page.goto('http://anchored.test/');
    const pop = page.locator('#pop');
    await waitForRest(pop);
    const trace = await traceRendering(page, async () => {
      // The action starts the animation two frames later, as a component's
      // effect often does.
      await pop.evaluate(el => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            (window as unknown as {__started: number}).__started =
              performance.timeOrigin + performance.now();
            el.animate(
              [
                {transform: 'translateY(0px)'},
                {transform: 'translateY(100px)'},
              ],
              {duration: 600},
            );
          }),
        );
      });
      await waitForRest(pop);
    });
    const started = await page.evaluate(
      () => (window as unknown as {__started?: number}).__started ?? null,
    );
    // The traced window holds the whole animation.
    expect(started).not.toBeNull();
    expect(trace.window.to - (started as number)).toBeGreaterThanOrEqual(590);
  });

  test('a waitForRest awaited inside a traced body waits for a run going backward to its end, and no longer', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'rendering traces are Chromium-only (README: engine limits)',
    );
    await page.route('http://anchored.test/', route =>
      route.fulfill({contentType: 'text/html', body: ANCHORED}),
    );
    await page.goto('http://anchored.test/');
    const pop = page.locator('#pop');
    await waitForRest(pop);
    // How long a traced waitForRest holds after a 600 ms move starts.
    const traced = async (reverse: boolean, endDelay = 0) => {
      let started = 0;
      const trace = await traceRendering(page, async () => {
        started = await pop.evaluate(
          (el, {reverse, endDelay}) => {
            const run = el.animate(
              [
                {transform: 'translateY(0px)'},
                {transform: 'translateY(100px)'},
              ],
              {duration: 600, endDelay},
            );
            if (reverse) {
              // Its current time falls from its end time to 0.
              run.reverse();
            }
            return performance.timeOrigin + performance.now();
          },
          {reverse, endDelay},
        );
        await waitForRest(pop);
      });
      await waitForRest(pop);
      return trace.window.to - started;
    };
    // Reversed with a 200 ms end delay: the move plays from 200 to 800 ms.
    expect(await traced(true, 200)).toBeGreaterThanOrEqual(790);
    // A reversed run is waited for as long as the same run forward, not
    // twice as long.
    const forward = await traced(false);
    const backward = await traced(true);
    expect(backward).toBeGreaterThanOrEqual(590);
    expect(backward).toBeLessThan(forward * 1.5);
  });

  test('a waitForRest awaited inside a traced body runs on the real timers, so a frozen timer gate cannot hold it', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'rendering traces are Chromium-only (README: engine limits)',
    );
    await page.route('http://anchored.test/', route =>
      route.fulfill({contentType: 'text/html', body: ANCHORED}),
    );
    await page.goto('http://anchored.test/');
    const pop = page.locator('#pop');
    await waitForRest(pop);
    await installTimerGate(page);
    await freezeTimers(page);
    let outcome = '';
    await traceRendering(page, async () => {
      await pop.evaluate(el => {
        el.animate(
          [{transform: 'translateY(0px)'}, {transform: 'translateY(100px)'}],
          {duration: 300},
        );
      });
      // Held by the gate, the wait would neither resolve nor reach its
      // deadline: the race reads that as "held".
      outcome = await Promise.race([
        waitForRest(pop, {timeout: 2000}).then(
          () => 'rested',
          () => 'rejected',
        ),
        new Promise<string>(resolve => setTimeout(() => resolve('held'), 4000)),
      ]);
    });
    await thawTimers(page);
    expect(outcome).toBe('rested');
  });

  test('inside a trace, waitForRest rests beside a scroll-timeline animation', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'rendering traces are Chromium-only (README: engine limits)',
    );
    await fixture(page);
    const scroller = page.locator('#scroller');
    await waitForRest(scroller);
    let outcome = '';
    await traceRendering(page, async () => {
      // A row driven by its scroller's timeline: it moves only on scroll.
      await scroller.evaluate(el => {
        const row = el.firstElementChild as HTMLElement;
        row.animate([{opacity: 0.5}, {opacity: 1}], {
          timeline: new ScrollTimeline({source: el}),
        });
      });
      outcome = await waitForRest(scroller, {timeout: 2000}).then(
        () => 'rested',
        (error: Error) => error.message,
      );
    });
    expect(outcome).toBe('rested');
  });

  test('a CSS transition and animation that start and end inside a trace are reported, and lay out nothing in between', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'rendering traces are Chromium-only (README: engine limits)',
    );
    await page.route('http://anchored.test/', route =>
      route.fulfill({contentType: 'text/html', body: ANCHORED}),
    );
    await page.goto('http://anchored.test/');
    await page.addStyleTag({
      content:
        '@keyframes harness-fade { from { opacity: 1 } to { opacity: 0.6 } }',
    });
    const pop = page.locator('#pop');
    // The recorder runs, and a watch is taken before the trace.
    await waitForRest(pop);
    const watch = await watchAnimations(pop);
    let started = 0;
    const trace = await traceRendering(page, async () => {
      started = await pop.evaluate(el => {
        const pop = el as HTMLElement;
        pop.style.transition = 'transform 400ms linear';
        void pop.offsetWidth;
        pop.style.transform = 'translateY(100px)';
        pop.style.animation = 'harness-fade 400ms linear';
        return performance.timeOrigin + performance.now();
      });
      await page.waitForTimeout(600);
    });
    // Its reads at the two starts fall before the steady middle.
    expect(countBetween(trace, started + 100, started + 300).Layout ?? 0).toBe(
      0,
    );
    const ended = await watch.started({timeout: 1_000});
    expect(ended.map(a => a.kind).sort()).toEqual([
      'CSSAnimation',
      'CSSTransition',
    ]);
    expect(ended.every(a => a.finishedAt != null)).toBe(true);
  });

  test('the compositor record refuses another open page, whose frames it could not tell apart', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'the compositor record is a Chromium trace (README: engine limits)',
    );
    await fixture(page);
    // Another page animating: its presented frames would be credited to
    // this one, so the record refuses to start.
    const other = await page.context().newPage();
    await other.setContent(
      '<style>@keyframes spin{to{transform:rotate(360deg)}}</style><div style="width:50px;height:50px;background:red;animation:spin 1s linear infinite"></div>',
    );
    await expect(startCompositorTrace(page)).rejects.toThrow(
      /another page is open as the trace starts/,
    );
    await other.close();
    // A page opened mid-trace: stop() refuses too, whether it is still open
    // or closed again before the record stops.
    const record = await startCompositorTrace(page);
    const late = await page.context().newPage();
    await expect(record.stop()).rejects.toThrow(
      /another page opened during the record/,
    );
    await late.close();
    const brief = await startCompositorTrace(page);
    const spinner = await page.context().newPage();
    await spinner.setContent(
      '<style>@keyframes spin{to{transform:rotate(360deg)}}</style><div style="width:50px;height:50px;background:red;animation:spin 1s linear infinite"></div>',
    );
    await page.waitForTimeout(200);
    await spinner.close();
    await expect(brief.stop()).rejects.toThrow(
      /another page opened during the record/,
    );
    // In another context too.
    const browser = page.context().browser();
    if (browser != null) {
      const elsewhere = await startCompositorTrace(page);
      const context = await browser.newContext();
      await (await context.newPage()).close();
      await context.close();
      await expect(elsewhere.stop()).rejects.toThrow(
        /another page opened during the record/,
      );
    }
    // Alone, it records.
    const alone = await startCompositorTrace(page);
    await page.waitForTimeout(100);
    await expect(alone.stop()).resolves.toBeInstanceOf(Array);
  });

  test('the long-task log fails closed when it never ran on the document', async ({
    page,
  }) => {
    // No installLongTaskLog before navigating: an empty answer would read as
    // "no long task", so it throws instead.
    await fixture(page);
    await expect(readLongTasks(page)).rejects.toThrow(
      /not running on this document/,
    );
  });

  test("the long-task log records the page's own long task but not a DevTools evaluate, which the trace reports apart", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'the Long Tasks API and rendering traces are Chromium-only',
    );
    await installLongTaskLog(page);
    await fixture(page);
    // The page's own task: a timer that spins 120 ms.
    const own = await page.evaluate(
      () =>
        new Promise<{from: number; to: number}>(resolve => {
          setTimeout(() => {
            const from = performance.timeOrigin + performance.now();
            const end = performance.now() + 120;
            while (performance.now() < end) {
              // spin
            }
            resolve({from, to: performance.timeOrigin + performance.now()});
          }, 0);
        }),
    );
    await frames(page, 2);
    const recorded = await readLongTasks(page, own);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].durationMs).toBeGreaterThanOrEqual(110);
    // A DevTools evaluate that spins 300 ms: the trace reports it apart from
    // the page's long tasks, and the log never sees it.
    let block = {from: 0, to: 0};
    const trace = await traceRendering(page, async () => {
      block = await blockMainThread(page, 300);
    });
    await frames(page, 2);
    const inBlock = (t: {start: number}) =>
      t.start < block.to && t.start >= block.from - 20;
    expect(
      trace.devtoolsTasks.some(t => t.durationMs >= 290 && inBlock(t)),
    ).toBe(true);
    expect(trace.longTasks.filter(inBlock)).toEqual([]);
    expect(await readLongTasks(page, block)).toEqual([]);
  });

  test("a harness read inside a trace is not the page's long task, while a test's own evaluate is, whether it calls the page directly or sets it off", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'rendering traces are Chromium-only (README: engine limits)',
    );
    // Enough animated rows that describing their keyframes takes a DevTools
    // task over 50 ms.
    const rows = Array.from(
      {length: 1200},
      (_, i) => `<div class="row">row ${i}</div>`,
    ).join('');
    await page.setContent(
      `<style>.row { height: 4px; animation: slide 2s linear infinite; } @keyframes slide { from { transform: translateX(0); } 25% { transform: translateX(4px); } 50% { transform: translateX(0); } 75% { transform: translateX(4px); } to { transform: translateX(0); } }</style><button id="slow">slow</button><div id="list">${rows}</div>`,
    );
    const slow = page.locator('#slow');
    await slow.evaluate(el =>
      el.addEventListener('click', () => {
        const end = performance.now() + 60;
        while (performance.now() < end) {
          // spin
        }
      }),
    );
    // Page code a test can call directly, as through a story's own API.
    await page.evaluate(() => {
      (window as unknown as {pageWork: (ms: number) => void}).pageWork = (
        ms: number,
      ) => {
        const end = performance.now() + ms;
        while (performance.now() < end) {
          // spin
        }
      };
    });
    await frames(page, 3);
    const now = () =>
      page.evaluate(() => performance.timeOrigin + performance.now());
    const read = {from: 0, to: 0};
    const click = {from: 0, to: 0};
    const direct = {from: 0, to: 0};
    let timer = {from: 0, to: 0};
    const trace = await traceRendering(page, async () => {
      read.from = await now();
      await waitForAnimation(page.locator('#list'));
      read.to = await now();
      // On a slow machine each frame of 1,200 running rows is a long task of
      // the page's own; the windows below hold only their own work.
      await page.evaluate(() => document.getElementById('list')?.remove());
      await frames(page, 2);
      // The page's own task: a timer that spins 60 ms.
      timer = await page.evaluate(
        () =>
          new Promise<{from: number; to: number}>(resolve => {
            setTimeout(() => {
              const from = performance.timeOrigin + performance.now();
              const end = performance.now() + 60;
              while (performance.now() < end) {
                // spin
              }
              resolve({from, to: performance.timeOrigin + performance.now()});
            }, 0);
          }),
      );
      // Page script run inside a DevTools evaluate: a 60 ms click handler.
      click.from = await now();
      await slow.evaluate(el => (el as HTMLElement).click());
      click.to = await now();
      // Page code a test's evaluate calls directly: 60 ms of the page's work.
      direct.from = await now();
      await page.evaluate(() =>
        (window as unknown as {pageWork: (ms: number) => void}).pageWork(60),
      );
      direct.to = await now();
    });
    const within = (w: {from: number; to: number}) => (t: {start: number}) =>
      t.start >= w.from - 20 && t.start < w.to;
    // The read itself is set apart. The rows' frames around it may be long
    // tasks too, the page's own: they stay with the page's tasks. A loaded
    // machine can keep a 60 ms spin's thread under 50 ms, so the page's own
    // tasks are its long and its stretched ones.
    expect(trace.devtoolsTasks.some(within(read))).toBe(true);
    const pageTasks = [...trace.longTasks, ...trace.stretchedTasks];
    expect(pageTasks.some(t => within(timer)(t) && t.durationMs >= 55)).toBe(
      true,
    );
    expect(pageTasks.some(t => within(click)(t) && t.durationMs >= 55)).toBe(
      true,
    );
    expect(pageTasks.some(t => within(direct)(t) && t.durationMs >= 55)).toBe(
      true,
    );
    expect(trace.devtoolsTasks.filter(within(direct))).toEqual([]);
  });
});

test.describe('wheel and pen input', () => {
  test("at a device-pixel ratio of 3, a wheel step reaches the page as exactly its delta, where Playwright's own wheel delivers a third of it in Chromium", async ({
    browser,
    browserName,
  }) => {
    // A desktop context at DPR 3: the phone context has no wheel in WebKit.
    const context = await browser.newContext({
      viewport: {width: 402, height: 714},
      deviceScaleFactor: 3,
      isMobile: false,
      hasTouch: false,
    });
    try {
      const page = await context.newPage();
      await page.route('http://wheel.test/', route =>
        route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0;height:3000px"><script>window.__deltas=[];addEventListener('wheel',e=>__deltas.push(e.deltaY),{passive:true});</script>`,
        }),
      );
      await page.goto('http://wheel.test/');
      // Read without draining, so a wrong delta shows in the failure.
      const seen = () =>
        page.evaluate(() =>
          (window as unknown as {__deltas: number[]}).__deltas.slice(),
        );
      expect(await page.evaluate(() => window.devicePixelRatio)).toBe(3);

      const driver = await webInputDriver(page);
      expect(driver.wheels).toBe(true);
      await driver.wheel({x: 200, y: 300, dy: 100});
      // Read once the page has the step, not at a time.
      await expect.poll(seen).toEqual([100]);

      // Playwright's own wheel, pinned: Chromium divides it by the ratio.
      await page.mouse.move(200, 300);
      await page.mouse.wheel(0, 100);
      await expect
        .poll(async () => (await seen())[1])
        .toBeCloseTo(browserName === 'chromium' ? 100 / 3 : 100, 5);
    } finally {
      await context.close();
    }
  });

  test("a wheel step that misses the main document throws its named error within the limit, while a frozen timer gate holds the page's timers too", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: {width: 402, height: 714},
      isMobile: false,
      hasTouch: false,
    });
    try {
      const page = await context.newPage();
      // A frame over the whole page: a step there lands in the frame's
      // document, never the main one.
      await page.route('http://wheel-miss.test/', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><body style="margin:0;height:3000px"><iframe srcdoc="<body style=height:3000px>" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>',
        }),
      );
      await page.goto('http://wheel-miss.test/');
      await installTimerGate(page);
      const driver = await webInputDriver(page);
      test.skip(!driver.wheels, WHEEL_SKIP);
      await freezeTimers(page);
      // Over the frame, the main document receives nothing, and the driver's
      // own limit, not the test's timeout, ends the wait.
      await expect(driver.wheel({x: 200, y: 300, dy: 100})).rejects.toThrow(
        /did not receive the wheel step/,
      );
      await thawTimers(page);
    } finally {
      await context.close();
    }
  });

  test('a wheel burst reaches the page as one run with its whole delta and no gap past the 100 ms a proof allows within a wheel gesture', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: {width: 402, height: 714},
      isMobile: false,
      hasTouch: false,
    });
    try {
      const page = await context.newPage();
      // A gesture's listener: not passive, and it takes every step.
      await page.route('http://wheel-burst.test/', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><body style="margin:0;height:3000px"><script>window.__deltas=[];addEventListener("wheel",e=>{__deltas.push(e.deltaX);e.preventDefault();},{passive:false});</script>',
        }),
      );
      await page.goto('http://wheel-burst.test/');
      const driver = await webInputDriver(page);
      test.skip(!driver.wheels, WHEEL_SKIP);
      // A proof allows 100 ms between the steps of one wheel gesture. Sent on
      // its schedule, the run stays one gesture however long each step's
      // round trip takes. A runner stall past that bound fails as
      // WheelPacingError.
      await page.evaluate(() => {
        (window as unknown as {__deltas: number[]}).__deltas = [];
      });
      const {receivedSteps, receivedGapsMs} = await driver.wheelBurst({
        x: 200,
        y: 300,
        steps: Array.from({length: 20}, () => ({dx: 40})),
        maxGapMs: 100,
      });
      // Every pixel arrives, in steps of 40 px or, where the engine
      // coalesced steps the page was still handling, their sums.
      const deltas = await page.evaluate(
        () => (window as unknown as {__deltas: number[]}).__deltas,
      );
      expect(deltas.reduce((sum, d) => sum + d, 0)).toBe(800);
      expect(
        deltas.every(d => d > 0 && d % 40 === 0),
        String(deltas),
      ).toBe(true);
      expect(receivedSteps).toBe(deltas.length);
      expect(receivedGapsMs).toHaveLength(receivedSteps - 1);
    } finally {
      await context.close();
    }
  });

  test('a wheel burst sent slower than its maxGapMs throws WheelPacingError, in both engines', async ({
    browser,
  }) => {
    // The negative control for the pacing check: steps 180 ms apart, on a page
    // that handles each at once, against a 100 ms bound.
    const context = await browser.newContext({
      viewport: {width: 402, height: 714},
      isMobile: false,
      hasTouch: false,
    });
    try {
      const page = await context.newPage();
      await page.route('http://wheel-slow-burst.test/', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><body style="margin:0;height:3000px"><script>addEventListener("wheel",e=>e.preventDefault(),{passive:false});</script>',
        }),
      );
      await page.goto('http://wheel-slow-burst.test/');
      const driver = await webInputDriver(page);
      test.skip(!driver.wheels, WHEEL_SKIP);
      await expect(
        driver.wheelBurst({
          x: 200,
          y: 300,
          steps: Array.from({length: 4}, () => ({dx: 10})),
          everyMs: 180,
          maxGapMs: 100,
        }),
      ).rejects.toBeInstanceOf(WheelPacingError);
    } finally {
      await context.close();
    }
  });

  test('a burst whose steps the dispatch spaces past maxGapMs throws WheelPacingError over a page whose listener takes 30 ms, in both engines', async ({
    browser,
  }) => {
    // The page is free well before each next step arrives, so the gap is the
    // dispatch's, not the page's. The steps leave 400 ms apart, four times
    // the 100 ms bound with the 30 ms listener long done when the next one
    // arrives, so the case still has to throw: a runner whose CPU quota holds
    // the engine for 100-300 ms could deliver steps 125 ms apart back to back,
    // leaving no gap past the bound to classify.
    const context = await browser.newContext({
      viewport: {width: 402, height: 714},
      isMobile: false,
      hasTouch: false,
    });
    try {
      const page = await context.newPage();
      await page.route('http://wheel-busy-listener.test/', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><body style="margin:0;height:3000px"><script>addEventListener("wheel",e=>{e.preventDefault();const end=performance.now()+30;while(performance.now()<end){}},{passive:false});</script>',
        }),
      );
      await page.goto('http://wheel-busy-listener.test/');
      const driver = await webInputDriver(page);
      test.skip(!driver.wheels, WHEEL_SKIP);
      await expect(
        driver.wheelBurst({
          x: 200,
          y: 300,
          steps: Array.from({length: 4}, () => ({dx: 10})),
          everyMs: 400,
          maxGapMs: 100,
        }),
      ).rejects.toBeInstanceOf(WheelPacingError);
    } finally {
      await context.close();
    }
  });

  test('a page whose wheel listener holds its main thread splits a burst itself: never a runner stall', async ({
    browser,
    browserName,
  }) => {
    const context = await browser.newContext({
      viewport: {width: 402, height: 714},
      isMobile: false,
      hasTouch: false,
    });
    try {
      const page = await context.newPage();
      // Each step blocks the main thread for 150 ms, past the 100 ms bound.
      await page.route('http://wheel-stalling-page.test/', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><body style="margin:0;height:3000px"><script>addEventListener("wheel",e=>{e.preventDefault();const end=performance.now()+150;while(performance.now()<end){}},{passive:false});</script>',
        }),
      );
      await page.goto('http://wheel-stalling-page.test/');
      const driver = await webInputDriver(page);
      test.skip(!driver.wheels, WHEEL_SKIP);
      const outcome = await driver
        .wheelBurst({
          x: 200,
          y: 300,
          steps: Array.from({length: 4}, () => ({dx: 10})),
          maxGapMs: 100,
        })
        .then(
          () => 'resolved',
          (error: unknown) => error,
        );
      expect(outcome).not.toBeInstanceOf(WheelPacingError);
      if (browserName === 'webkit') {
        // WebKit dispatches the next step only once the page is free, so the
        // page's stall widens the gaps, and the error names it.
        expect(outcome).toBeInstanceOf(WheelPageStallError);
        expect(String(outcome)).toMatch(/the page split the run/);
      }
    } finally {
      await context.close();
    }
  });

  test("a page that draws no frame across a burst's gap splits it itself, with its listeners idle: WheelPageStallError names the frame gap", async ({
    browser,
    browserName,
  }) => {
    test.skip(
      browserName !== 'webkit',
      'only WebKit dispatches a wheel step once the page is free',
    );
    const context = await browser.newContext({
      viewport: {width: 402, height: 714},
      isMobile: false,
      hasTouch: false,
    });
    try {
      const page = await context.newPage();
      // The first step queues a 150 ms task, as engine or page work can hold
      // the main thread. The listener itself returns at once, and the page
      // draws no frame until the task ends.
      await page.route('http://wheel-task-page.test/', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><body style="margin:0;height:3000px"><script>let queued=false;addEventListener("wheel",()=>{if(queued)return;queued=true;setTimeout(()=>{const end=performance.now()+150;while(performance.now()<end){}},0)},{passive:true});</script>',
        }),
      );
      await page.goto('http://wheel-task-page.test/');
      const driver = await webInputDriver(page);
      test.skip(!driver.wheels, WHEEL_SKIP);
      const outcome = await driver
        .wheelBurst({
          x: 200,
          y: 300,
          steps: Array.from({length: 6}, () => ({dx: 10})),
          maxGapMs: 100,
        })
        .then(
          () => 'resolved',
          (error: unknown) => error,
        );
      expect(outcome).toBeInstanceOf(WheelPageStallError);
      const {stall} = outcome as WheelPageStallError;
      expect(stall.frameGapMs).toBeGreaterThan(100);
      expect(stall.handlingMs).toBeLessThan(stall.gapMs);
      expect(String(outcome)).toMatch(
        /the page drew no frame for \d+ ms around a \d+ ms gap between two wheel steps, at or over its 100 ms \(engine or page work\)/,
      );
      // A starved runner's renderer draws no frame either, and the error
      // says so.
      expect(String(outcome)).toMatch(
        /On a starved runner the renderer draws no frame either/,
      );
    } finally {
      await context.close();
    }
  });

  test('a page whose wheel listener stops the step and holds its main thread still splits a burst itself', async ({
    browser,
    browserName,
  }) => {
    const context = await browser.newContext({
      viewport: {width: 402, height: 714},
      isMobile: false,
      hasTouch: false,
    });
    try {
      const page = await context.newPage();
      // The body's listener stops each step before it reaches the window,
      // and blocks the main thread for 150 ms, past the 100 ms bound.
      await page.route('http://wheel-stopping-page.test/', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><body style="margin:0;height:3000px"><script>document.body.addEventListener("wheel",e=>{e.preventDefault();e.stopPropagation();const end=performance.now()+150;while(performance.now()<end){}},{passive:false});</script>',
        }),
      );
      await page.goto('http://wheel-stopping-page.test/');
      const driver = await webInputDriver(page);
      test.skip(!driver.wheels, WHEEL_SKIP);
      const outcome = await driver
        .wheelBurst({
          x: 200,
          y: 300,
          steps: Array.from({length: 4}, () => ({dx: 10})),
          maxGapMs: 100,
        })
        .then(
          () => 'resolved',
          (error: unknown) => error,
        );
      expect(outcome).not.toBeInstanceOf(WheelPacingError);
      if (browserName === 'webkit') {
        // The queued task marks the stopped step's handling, so the stall is
        // the page's.
        expect(outcome).toBeInstanceOf(WheelPageStallError);
      }
    } finally {
      await context.close();
    }
  });

  /** A non-passive wheel listener: Chromium then waits for the page itself. */
  const listenNonPassively = (page: Page) =>
    page.evaluate(() =>
      window.addEventListener('wheel', () => {}, {passive: false}),
    );
  /** The wheel steps the page received. */
  const wheelsOf = async (page: Page) =>
    (await readInputLog(page)).filter(r => r.type === 'wheel');

  test('a wheel step reaches the page as exactly its deltas, trusted, with Control when held, by the time wheel() resolves on a page whose wheel listeners are all passive', async ({
    page,
  }) => {
    await fixture(page);
    const driver = await webInputDriver(page);
    test.skip(!driver.wheels, WHEEL_SKIP);
    await driver.wheel({x: 60, y: 520, dy: 120});
    // The input log listens passively, so Chromium answers the dispatch
    // before the page has the step: read right after the call.
    expect(await wheelsOf(page)).toHaveLength(1);
    await driver.wheel({x: 60, y: 520, dx: 30, dy: -40, ctrl: true});
    const wheels = await wheelsOf(page);
    expect(wheels).toHaveLength(2);
    // Chromium's phone context has a device scale factor of 3: the driver
    // multiplies back what Chromium divides by, so the page sees CSS px.
    expect(wheels[0]).toMatchObject({
      isTrusted: true,
      deltaX: 0,
      deltaY: 120,
      deltaMode: 0,
      ctrlKey: false,
      x: 60,
      y: 520,
    });
    expect(wheels[1]).toMatchObject({
      isTrusted: true,
      deltaX: 30,
      deltaY: -40,
      deltaMode: 0,
      ctrlKey: true,
    });
  });

  test('a wheel step reaches the page by the time wheel() resolves with a non-passive wheel listener too', async ({
    page,
  }) => {
    await fixture(page);
    const driver = await webInputDriver(page);
    test.skip(!driver.wheels, WHEEL_SKIP);
    await listenNonPassively(page);
    await driver.wheel({x: 60, y: 520, dy: 80});
    expect(await wheelsOf(page)).toHaveLength(1);
    await driver.wheel({x: 60, y: 520, dy: -20, ctrl: true});
    const wheels = await wheelsOf(page);
    expect(wheels).toHaveLength(2);
    expect(wheels[0]).toMatchObject({
      isTrusted: true,
      deltaY: 80,
      ctrlKey: false,
    });
    expect(wheels[1]).toMatchObject({
      isTrusted: true,
      deltaY: -20,
      ctrlKey: true,
    });
  });

  test('a pen stroke reaches the page as trusted pen pointers, with its pressure, at its scripted times', async ({
    page,
  }) => {
    await fixture(page);
    const driver = await webInputDriver(page);
    test.skip(!driver.pens, PEN_SKIP);
    await driver.pen([
      {x: 100, y: 100, t: 0, pressure: 0.3},
      {x: 100, y: 140, t: 50, pressure: 0.6},
      {x: 100, y: 180, t: 100, pressure: 0.6},
    ]);
    const log = await readInputLog(page);
    const down = log.find(r => r.type === 'pointerdown');
    const moves = log.filter(r => r.type === 'pointermove');
    const up = log.find(r => r.type === 'pointerup');
    expect(down).toMatchObject({
      isTrusted: true,
      pointerType: 'pen',
      x: 100,
      y: 100,
    });
    expect(down?.pressure).toBeCloseTo(0.3, 2);
    expect(moves.at(-1)).toMatchObject({pointerType: 'pen', y: 180});
    expect(moves.at(-1)?.pressure).toBeCloseTo(0.6, 2);
    expect(up).toMatchObject({isTrusted: true, pointerType: 'pen'});
    // The scripted 100 ms between the first and last points reach the page.
    expect(
      (moves.at(-1)?.timeStamp ?? NaN) - (down?.timeStamp ?? NaN),
    ).toBeCloseTo(100, 0);
  });

  test('a stroke sent right after a navigation presses where it is scripted', async ({
    page,
  }) => {
    // The driver exists before the page navigates, and the stroke goes out
    // the moment the page has loaded: the press must not take the previous
    // document's page scale (about:blank's, in the phone project).
    const driver = await webInputDriver(page);
    test.skip(!driver.pens, PEN_SKIP);
    await fixture(page);
    await driver.pen([
      {x: 100, y: 100, t: 0, pressure: 0.5},
      {x: 100, y: 120, t: 30, pressure: 0.5},
    ]);
    const down = (await readInputLog(page)).find(r => r.type === 'pointerdown');
    expect(down).toMatchObject({pointerType: 'pen', x: 100, y: 100});
  });

  test('says which inputs it has: WebKit in a phone context has no wheel and no pen', async ({
    page,
    browserName,
  }) => {
    await fixture(page);
    const driver = await webInputDriver(page);
    if (browserName === 'chromium') {
      expect({wheels: driver.wheels, pens: driver.pens}).toEqual({
        wheels: true,
        pens: true,
      });
      return;
    }
    expect({wheels: driver.wheels, pens: driver.pens}).toEqual({
      wheels: false,
      pens: false,
    });
    await expect(driver.wheel({x: 60, y: 520, dy: 120})).rejects.toThrow(
      WHEEL_SKIP,
    );
    await expect(driver.pen([{x: 100, y: 100, t: 0}])).rejects.toThrow(
      PEN_SKIP,
    );
  });

  test.describe('in a desktop context', () => {
    test.use({isMobile: false, hasTouch: false, deviceScaleFactor: 1});

    test('a wheel step reaches the page as exactly its deltas in both engines', async ({
      page,
    }) => {
      await fixture(page);
      const driver = await webInputDriver(page);
      expect(driver.wheels).toBe(true);
      await driver.wheel({x: 60, y: 520, dy: 120});
      expect(await wheelsOf(page)).toHaveLength(1);
      await driver.wheel({x: 60, y: 520, dx: -25, dy: 0, ctrl: true});
      const wheels = await wheelsOf(page);
      expect(wheels).toHaveLength(2);
      expect(wheels[0]).toMatchObject({
        isTrusted: true,
        deltaX: 0,
        deltaY: 120,
        deltaMode: 0,
        ctrlKey: false,
      });
      expect(wheels[1]).toMatchObject({
        isTrusted: true,
        deltaX: -25,
        deltaY: 0,
        deltaMode: 0,
        ctrlKey: true,
      });
    });
  });
});

test.describe('curve sampling', () => {
  test('a CSS transition samples onto its cubic-bezier to 0.05 px', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // Armed before the 400 ms transition starts, so a busy runner cannot end
    // it before the hold.
    const hold = await armHold(page, box, {
      judges: {target: box, property: 'transform'},
    });
    await box.evaluate(el => {
      el.style.transition = 'transform 400ms cubic-bezier(0.24, 1, 0.4, 1)';
      void (el as HTMLElement).offsetWidth;
      el.style.transform = 'translateY(200px)';
    });
    const held = await hold.held();
    expect(held).toHaveLength(1);
    expect(held[0].kind).toBe('CSSTransition');
    const samples = curveOf(
      await sampleCurve(box, timeline(400)),
      'translateY',
    );
    const ease = cubicBezier(0.24, 1, 0.4, 1);
    const result = compareCurve(samples, t => 200 * ease(t / 400), 0.05);
    expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
      0.05,
    );
  });

  test('a spring baked into linear() matches the SwiftUI spring oracle', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    const spring = {response: 0.4, dampingFraction: 0.75};
    const duration = 1200;
    // Armed before the run starts, so a busy runner cannot end it before the
    // hold.
    const hold = await armHold(page, box, {
      judges: {target: box, property: 'transform'},
    });
    await box.evaluate(
      (el, {stops, ms}) => {
        el.animate(
          [{transform: 'translateX(0px)'}, {transform: 'translateX(200px)'}],
          {duration: ms, easing: `linear(${stops})`},
        );
      },
      {
        stops: timeline(duration, 4)
          .map(t => springStep(spring, t).toFixed(6))
          .join(', '),
        ms: duration,
      },
    );
    await hold.held();
    const samples = curveOf(
      await sampleCurve(box, timeline(duration, 1000 / 60)),
      'translateX',
    );
    // linear() draws chords between the 4 ms stops: at most h²/8 · |x''| =
    // 0.004² / 8 · 200 · (2π / 0.4)² ≈ 0.1 px off the exact oracle.
    const result = compareCurve(
      samples,
      t => 200 * springStep(spring, t),
      0.15,
    );
    expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
      0.15,
    );
    expect(Math.max(...samples.map(s => s.value))).toBeGreaterThan(200); // the overshoot is presented
  });
});

// A full-size veil on the fixture's box, drawn by its ::before.
const VEIL_STYLE =
  "#box::before { content: ''; position: absolute; inset: 0; background: #000; opacity: 0; }";

test.describe('pseudo-element animations', () => {
  test('sampleCurve reads a ::before animation when given its pseudo-element', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    await box.evaluate((el, veil) => {
      const style = document.createElement('style');
      style.textContent = veil;
      document.head.append(style);
      el.animate(
        [
          {opacity: 0, transform: 'translateY(0px)'},
          {opacity: 1, transform: 'translateY(40px)'},
        ],
        {duration: 300, easing: 'linear', pseudoElement: '::before'},
      );
    }, VEIL_STYLE);
    await holdAnimations(page, box, {
      judges: {target: box, property: 'opacity', pseudoElement: '::before'},
    });
    const samples = await sampleCurve(box, [0, 75, 150, 225, 300], {
      pseudoElement: '::before',
    });
    // Labelled by the veil's own clock: the last read just inside its end.
    expect(samples.at(-1)).toMatchObject({t: 300, presentedAt: 299.5});
    const fade = compareCurve(curveOf(samples, 'opacity'), t => t / 300, 0.005);
    expect(fade.maxError, JSON.stringify(fade.worst)).toBeLessThanOrEqual(
      0.005,
    );
    const move = compareCurve(
      curveOf(samples, 'translateY'),
      t => (40 * t) / 300,
      0.05,
    );
    expect(move.maxError, JSON.stringify(move.worst)).toBeLessThanOrEqual(0.05);
    // Without it, the box itself, which does not move.
    const [boxAt150] = await sampleCurve(box, [150]);
    expect(boxAt150.opacity).toBe(1);
    expect(boxAt150.transform.translateY).toBe(0);
  });

  test('waitForRest waits out a ::before animation', async ({page}) => {
    await fixture(page);
    const box = page.locator('#box');
    await box.evaluate((el, veil) => {
      const style = document.createElement('style');
      style.textContent = veil;
      document.head.append(style);
      (window as unknown as {__veil: Animation}).__veil = el.animate(
        [{opacity: 0}, {opacity: 1}],
        {
          duration: 600,
          easing: 'linear',
          fill: 'forwards',
          pseudoElement: '::before',
        },
      );
    }, VEIL_STYLE);
    // Its subtree read includes the element's pseudo-elements.
    await waitForRest(box);
    const veil = await box.evaluate(element => {
      const a = (window as unknown as {__veil: Animation}).__veil;
      return {
        playState: a.playState,
        currentTime: Number(a.currentTime),
        opacity: getComputedStyle(element, '::before').opacity,
      };
    });
    expect(veil).toMatchObject({playState: 'finished', opacity: '1'});
  });
});

/**
 * Adds a thumb inside the fixture's box: the box presses, the thumb travels,
 * as in a switch.
 */
async function pressAndTravelFixture(page: Page) {
  await page.locator('#box').evaluate(el => {
    const thumb = document.createElement('div');
    thumb.id = 'thumb';
    thumb.style.cssText = 'width:20px;height:20px;background:#fff';
    el.append(thumb);
  });
  return {box: page.locator('#box'), thumb: page.locator('#thumb')};
}

/**
 * Starts the box's press fade, then the thumb's 2 s travel 150 ms later. The
 * travel is a new animation then, as a release starts its own.
 */
async function startPressThenTravel(page: Page) {
  await page.evaluate(() => {
    document
      .getElementById('box')
      ?.animate([{opacity: 1}, {opacity: 0.6}], {duration: 2_000});
    setTimeout(() => {
      document
        .getElementById('thumb')
        ?.animate([{translate: '0px'}, {translate: '20px'}], {duration: 2_000});
    }, 150);
  });
}

test.describe('holding', () => {
  test('an armed hold takes a short animation on its first frames, from the page itself', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // Armed before the animation starts: the page holds it on the first frame
    // it has run, however late a busy runner would have delivered a hold sent
    // after it (a 120 ms run can end first).
    const hold = await armHold(page, box, {
      judges: {target: box, property: 'transform'},
    });
    await box.evaluate(el =>
      el.animate(
        [{transform: 'translateY(0px)'}, {transform: 'translateY(200px)'}],
        {duration: 120, easing: 'linear'},
      ),
    );
    // Read once the run would have ended: what comes back, the page held
    // itself.
    await page.waitForTimeout(200);
    const held = await hold.held();
    expect(held).toHaveLength(1);
    expect(held[0].heldAtMs ?? Number.POSITIVE_INFINITY).toBeLessThan(120);
    const samples = await sampleCurve(box, [0, 60, 120]);
    const result = compareCurve(
      curveOf(samples, 'translateY'),
      t => (200 * t) / 120,
      0.05,
    );
    expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
      0.05,
    );
    await releaseAnimations(page);
  });

  test('an armed hold with newOnly holds a turn that starts mid-motion, and leaves the motion already running', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // A long motion runs first; the hold is armed during it, so only the
    // 120 ms turn that starts after the arm is held.
    await box.evaluate(el =>
      el.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(100px)'}],
        {duration: 10_000, easing: 'linear'},
      ),
    );
    const hold = await armHold(page, box, {
      judges: {target: box, property: 'opacity'},
      newOnly: true,
    });
    await box.evaluate(el =>
      el.animate([{opacity: 1}, {opacity: 0}], {
        duration: 120,
        easing: 'linear',
      }),
    );
    // Read once the turn would have ended: what comes back, the page held
    // itself.
    await page.waitForTimeout(200);
    const held = await hold.held();
    expect(held).toHaveLength(1);
    expect(held[0].keyframes.map(k => k.opacity)).toEqual(['1', '0']);
    expect(held[0].heldAtMs ?? Number.POSITIVE_INFINITY).toBeLessThan(120);
    expect(
      await box.evaluate(el =>
        el.getAnimations().map(animation => animation.playState),
      ),
    ).toEqual(['running', 'paused']);
    await releaseAnimations(page, {finish: true});
  });

  test('a hold whose scope is not on the page fails by name within its wait, not at the test timeout', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // The scope's element is gone before either hold resolves it, as a
    // viewer the page has closed is.
    await box.evaluate(el => el.remove());
    await expect(armHold(page, box, {judges: 'count-only'})).rejects.toThrow(
      /armHold: the scope .*#box.* is not on the page after 5000 ms: it is gone, or it never came/,
    );
    await expect(
      holdAnimations(page, box, {judges: 'count-only'}),
    ).rejects.toThrow(
      /holdAnimations: the scope .*#box.* is not on the page after 5000 ms/,
    );
  });

  test('an armed hold rejects when nothing under its scope starts', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    const hold = await armHold(page, box, {
      judges: {target: box, property: 'transform'},
      timeout: 200,
    });
    await expect(hold.held()).rejects.toThrow(
      /no animation under the scope ran/,
    );
  });

  test('an armed hold rejects when other animations meet its count before the judged motion starts', async ({
    page,
  }) => {
    await fixture(page);
    const {box, thumb} = await pressAndTravelFixture(page);
    const hold = await armHold(page, box, {
      judges: {target: thumb, property: 'translate'},
    });
    await startPressThenTravel(page);
    await expect(hold.held()).rejects.toThrow(
      /took no animation of the judged motion \(translate on .*#thumb.*\)\. Other animations met its count of 1 first; it took: div#box opacity/,
    );
    // The travel was never held: a film of this hold would show the press.
    await expect
      .poll(() =>
        thumb.evaluate(el => el.getAnimations().map(a => a.playState)),
      )
      .toEqual(['running']);
    await releaseAnimations(page, {finish: true});
  });

  test('an armed hold whose count waits for the judged motion returns it', async ({
    page,
  }) => {
    await fixture(page);
    const {box, thumb} = await pressAndTravelFixture(page);
    const hold = await armHold(page, box, {
      judges: {target: thumb, property: 'translate'},
      count: 2,
    });
    await startPressThenTravel(page);
    const held = await hold.held();
    expect(held.map(a => a.target)).toEqual(['div#box', 'div#thumb']);
    await releaseAnimations(page, {finish: true});
  });

  test("an armed hold with judges: 'count-only' checks what it took against nothing", async ({
    page,
  }) => {
    await fixture(page);
    const {box} = await pressAndTravelFixture(page);
    const hold = await armHold(page, box, {judges: 'count-only'});
    await startPressThenTravel(page);
    expect((await hold.held()).map(a => a.target)).toEqual(['div#box']);
    await releaseAnimations(page, {finish: true});
  });

  test('an armed hold refuses to arm without the motion it judges', async ({
    page,
  }) => {
    await fixture(page);
    await expect(
      // @ts-expect-error -- a caller without types can omit `judges`.
      armHold(page, page.locator('#box'), {count: 1}),
    ).rejects.toThrow(/armHold: name the motion that the test judges/);
  });

  test('a hold sent from the test rejects when the judged motion does not run yet', async ({
    page,
  }) => {
    await fixture(page);
    const {box, thumb} = await pressAndTravelFixture(page);
    await startPressThenTravel(page);
    await expect(
      holdAnimations(page, box, {
        judges: {target: thumb, property: 'translate'},
      }),
    ).rejects.toThrow(
      /holdAnimations: the hold took no animation of the judged motion \(translate on .*#thumb.*\)\. The judged motion did not run when the hold reached the page .*; it took: div#box opacity/,
    );
    // The travel was never held: a film of this hold would show the press.
    await expect
      .poll(() =>
        thumb.evaluate(el => el.getAnimations().map(a => a.playState)),
      )
      .toEqual(['running']);
    await releaseAnimations(page, {finish: true});
  });

  test('a judged custom property is found in its @keyframes rule, inside a layer', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent =
        "@property --harness-strength { syntax: '<number>'; inherits: false; initial-value: 0; }" +
        '@layer harness { @keyframes harness-strength { from { --harness-strength: 1; } to { --harness-strength: 0; } } }' +
        '#box { animation: harness-strength 2s linear; }';
      document.head.append(style);
    });
    const held = await holdAnimations(page, box, {
      judges: {target: box, property: '--harness-strength'},
    });
    expect(held.map(a => a.name)).toEqual(['harness-strength']);
    await releaseAnimations(page, {finish: true});
  });

  test('a film that holds now refuses to start without the motion it shows', async ({
    page,
  }) => {
    await fixture(page);
    await expect(
      // @ts-expect-error -- a caller without types can omit `judges`.
      animationStoryboard(page, {name: 'harness-self-test-no-judges'}),
    ).rejects.toThrow(/holdAnimations: name the motion that the test judges/);
  });

  test('a sample at an end reports the time it was read at', async ({page}) => {
    await fixture(page);
    const box = page.locator('#box');
    // Armed before the 300 ms run starts, so a busy runner cannot end it
    // before the hold.
    const hold = await armHold(page, box, {
      judges: {target: box, property: 'transform'},
    });
    await box.evaluate(el =>
      el.animate(
        [{transform: 'translateY(0px)'}, {transform: 'translateY(200px)'}],
        {duration: 300, easing: 'linear'},
      ),
    );
    await hold.held();
    const samples = await sampleCurve(box, [0, 150, 300]);
    // Read just inside the end, and labelled so.
    expect(samples.at(-1)).toMatchObject({t: 300, presentedAt: 299.5});
    const result = compareCurve(
      curveOf(samples, 'translateY'),
      t => (200 * t) / 300,
      0.05,
    );
    expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
      0.05,
    );
    await releaseAnimations(page);
  });

  test('only running document-timeline animations are held, each at its own offset', async ({
    page,
  }) => {
    await fixture(page);
    // Besides #box: a finished fade, an animation the page paused, one on a
    // scroll timeline, and a second runner started 100 ms after #box's.
    const startGap = await page.evaluate(async () => {
      const make = (id: string) => {
        const el = document.createElement('div');
        el.id = id;
        el.style.cssText =
          'position:absolute;left:0;top:300px;width:40px;height:40px;background:#c63';
        document.body.append(el);
        return el;
      };
      make('finished').animate([{opacity: 0}, {opacity: 1}], {
        duration: 50,
        fill: 'both',
      });
      const paused = make('paused').animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(100px)'}],
        {duration: 1000},
      );
      paused.pause();
      paused.currentTime = 500;
      const timelines = window as unknown as {
        ScrollTimeline?: new (options: object) => AnimationTimeline;
      };
      if (timelines.ScrollTimeline != null) {
        new Animation(
          new KeyframeEffect(make('scrolled'), [{opacity: 0}, {opacity: 1}], {
            duration: 1000,
          }),
          new timelines.ScrollTimeline({source: document.scrollingElement}),
        ).play();
      }
      await new Promise(resolve => setTimeout(resolve, 120));
      // 0.5 px a ms for 6 s: long enough that the hold, sent after the second
      // runner starts (an armed hold would take the first one alone), reaches
      // both on a loaded runner.
      const run = (el: Element | null) =>
        el?.animate(
          [{transform: 'translateX(0px)'}, {transform: 'translateX(3000px)'}],
          {duration: 6000, easing: 'linear'},
        );
      const box = run(document.getElementById('box'));
      const gap = new Promise(resolve => setTimeout(resolve, 100));
      // #box's first frame comes late, as on a loaded machine: its start time
      // resolves then, so the runners' offset is the difference of their start
      // times, not the timer's 100 ms.
      const until = performance.now() + 60;
      while (performance.now() < until) {
        // Busy: no frame runs.
      }
      await gap;
      // Made once #box has started, so the two never share a first frame,
      // however long a loaded engine goes without one.
      await box?.ready;
      const later = run(make('later'));
      await later?.ready;
      return Number(later?.startTime) - Number(box?.startTime);
    });
    const held = await holdAnimations(page, undefined, {
      judges: [
        {target: page.locator('#box'), property: 'transform'},
        {target: page.locator('#later'), property: 'transform'},
      ],
    });
    expect(held.map(a => a.target)).toEqual(['div#box', 'div#later']);
    const [first, later] = held;
    expect(first.offsetMs).toBe(0);
    expect(startGap).toBeGreaterThan(0);
    expect(later.offsetMs).toBeCloseTo(startGap, 0);
    const x = (id: string) =>
      page
        .locator(`#${id}`)
        .evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
    // A seek 150 ms past the second start, however late it came: both runners
    // run there, each at its own time.
    const t = Math.ceil(later.offsetMs) + 150;
    expect(await seekAnimations(page, t)).toBe(t);
    expect(await x('box')).toBeCloseTo((3000 * t) / 6000, 1);
    expect(await x('later')).toBeCloseTo(
      (3000 * (t - later.offsetMs)) / 6000,
      1,
    );
    // The finished fade kept its end value; the paused animation stays put.
    expect(
      await page
        .locator('#finished')
        .evaluate(el => getComputedStyle(el).opacity),
    ).toBe('1');
    await releaseAnimations(page);
    await page.waitForTimeout(100);
    expect(
      await page.evaluate(() => {
        const animation = document.getElementById('paused')?.getAnimations()[0];
        return [animation?.playState, Number(animation?.currentTime)];
      }),
    ).toEqual(['paused', 500]);
  });

  test("a sample is labelled from its own element's animations, per channel", async ({
    page,
  }) => {
    await fixture(page);
    // #box moves for 300 ms and fades for 400 ms; another element runs longer.
    // Armed before they start (all in one task), so a busy runner cannot end
    // the move before the hold.
    const hold = await armHold(page, undefined, {
      judges: [
        {target: page.locator('#box'), property: 'transform'},
        {target: page.locator('#box'), property: 'opacity'},
      ],
    });
    await page.evaluate(() => {
      const box = document.getElementById('box');
      box?.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(300px)'}],
        {duration: 300, easing: 'linear'},
      );
      box?.animate([{opacity: 1}, {opacity: 0}], {
        duration: 400,
        easing: 'linear',
      });
      const other = document.createElement('div');
      other.style.cssText =
        'position:absolute;top:300px;width:40px;height:40px';
      document.body.append(other);
      other.animate([{opacity: 0}, {opacity: 1}], {duration: 600});
    });
    await hold.held();
    const samples = await sampleCurve(page.locator('#box'), [0, 150, 300]);
    // The move is read just inside its end, the fade where it is.
    expect(samples.at(-1)?.presentedAtFor).toEqual({
      transform: 299.5,
      opacity: 300,
    });
    const move = compareCurve(curveOf(samples, 'translateX'), t => t, 0.05);
    expect(move.maxError, JSON.stringify(move.worst)).toBeLessThanOrEqual(0.05);
    const fade = compareCurve(
      curveOf(samples, 'opacity'),
      t => 1 - t / 400,
      0.002,
    );
    expect(fade.maxError, JSON.stringify(fade.worst)).toBeLessThanOrEqual(
      0.002,
    );
    await releaseAnimations(page);
  });

  test("a pseudo-element's animation does not label its element's samples", async ({
    page,
  }) => {
    await fixture(page);
    // #box moves for 300 ms; its ::after fades for 600 ms. Armed before they
    // start, so a busy runner cannot end the move before the hold.
    const hold = await armHold(page, undefined, {
      judges: [
        {target: page.locator('#box'), property: 'transform'},
        {
          target: page.locator('#box'),
          property: 'opacity',
          pseudoElement: '::after',
        },
      ],
    });
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = "#box::after { content: ''; display: block; }";
      document.head.append(style);
      const box = document.getElementById('box');
      box?.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(300px)'}],
        {duration: 300, easing: 'linear'},
      );
      box?.animate([{opacity: 1}, {opacity: 0}], {
        duration: 600,
        pseudoElement: '::after',
      });
    });
    await hold.held();
    const samples = await sampleCurve(page.locator('#box'), [0, 150, 300]);
    // The move is read just inside its own end, not at the ::after's time.
    expect(samples.at(-1)?.presentedAt).toBe(299.5);
    await releaseAnimations(page);
  });

  test('a percentage translate resolves against the unrounded border box, and a calc() is refused', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // Each hold is armed before its 300 ms run starts, so a busy runner
    // cannot end the run before the hold.
    const hold = await armHold(page, box, {
      judges: {target: box, property: 'translate'},
    });
    await box.evaluate(el => {
      el.style.width = '80.6px';
      el.style.height = '40.4px';
      el.animate([{translate: '0% 0%'}, {translate: '100% 50%'}], {
        duration: 300,
        easing: 'linear',
      });
    });
    await hold.held();
    const [mid] = await sampleCurve(box, [150]);
    expect(mid.transform.translateX).toBeCloseTo(40.3, 2);
    expect(mid.transform.translateY).toBeCloseTo(10.1, 2);
    // Finished, so no frame can pass between this release and the next
    // animation with the first one still running.
    await releaseAnimations(page, {finish: true});

    const second = await armHold(page, box, {
      judges: {target: box, property: 'translate'},
    });
    await box.evaluate(el => {
      el.animate(
        [
          {translate: 'calc(10% + 5px) 0px'},
          {translate: 'calc(20% + 5px) 0px'},
        ],
        {duration: 300, easing: 'linear'},
      );
    });
    await second.held();
    await expect(sampleCurve(box, [150])).rejects.toThrow(
      /cannot resolve translate/,
    );
    await releaseAnimations(page);
  });

  test('a reversed run counts its progress from its end, and a faster playback rate is read on the timeline by waits, seeks and samples', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // Reversed, the run starts at its end: progress counts down from there,
    // so a wait for 100 ms of it returns once the run has presented that much.
    // Each run here lasts 10 s, so a busy runner cannot end it before the
    // test's next read.
    const watch = await watchAnimations(box);
    await box.evaluate(el => {
      el.animate([{translate: '0px 0px'}, {translate: '100px 0px'}], {
        duration: 10_000,
        easing: 'linear',
      }).reverse();
    });
    await watch.started({minProgressMs: 100});
    const presented = await box.evaluate(el => {
      const [animation] = el.getAnimations();
      return (
        Number(animation.effect?.getComputedTiming().endTime ?? 0) -
        Number(animation.currentTime ?? 0)
      );
    });
    expect(presented).toBeGreaterThanOrEqual(100);
    await box.evaluate(el => el.getAnimations().forEach(a => a.finish()));

    // At playback rate 2 a 10,000 ms curve runs 5,000 ms: its interval, and
    // a seek or sample at t reads the curve at 2t.
    const fast = await watchAnimations(box);
    await box.evaluate(el => {
      const animation = el.animate(
        [{translate: '0px 0px'}, {translate: '1000px 0px'}],
        {duration: 10_000, easing: 'linear'},
      );
      animation.playbackRate = 2;
    });
    const [running] = await fast.started();
    expect(running.to - running.from).toBeCloseTo(5000, 0);
    await holdAnimations(page, box, {
      judges: {target: box, property: 'translate'},
    });
    await seekAnimations(page, 125);
    const x = await box.evaluate(
      el =>
        new DOMMatrix(getComputedStyle(el).transform).m41 +
        Number.parseFloat(getComputedStyle(el).translate || '0'),
    );
    expect(x).toBeCloseTo(25, 0);
    const [sample] = await sampleCurve(box, [250]);
    expect(sample.transform.translateX).toBeCloseTo(50, 0);
    await releaseAnimations(page, {finish: true});
  });

  test('a held end is solved through a cubic-bézier effect easing, a reversed one reads to the full end, and a rotate about x composes on its axis', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // Each run lasts long enough for the hold to reach it while it runs: on a
    // loaded runner the hold read the page as late as 2.4 s after the run was
    // made, past the end of a 1 s run.
    const RUN_MS = 10_000;
    await box.evaluate((el, duration) => {
      el.animate(
        [
          {translate: '0px 0px', offset: 0},
          {translate: '100px 0px', offset: 0.5},
          {translate: '100px 0px', offset: 1},
        ],
        {duration, easing: 'cubic-bezier(0.42, 0, 1, 1)'},
      );
    }, RUN_MS);
    const [held] = await holdAnimations(page, box, {
      judges: {target: box, property: 'translate'},
    });
    // The keyframe offset 0.5 is progress, not half the time: the run starts
    // where the eased progress reaches 0.5.
    const ease = cubicBezier(0.42, 0, 1, 1);
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 60; i += 1) {
      const mid = (lo + hi) / 2;
      if (ease(mid) < 0.5) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    expect(held.curveEndMs).toBeCloseTo(lo * RUN_MS, 0);
    expect(held.curveEndMs).toBeGreaterThan(0.6 * RUN_MS);
    await releaseAnimations(page, {finish: true});

    // Played in reverse, the held run is where the motion starts: the curve
    // runs to the full end.
    await box.evaluate((el, duration) => {
      el.animate(
        [
          {translate: '0px 0px', offset: 0},
          {translate: '100px 0px', offset: 0.5},
          {translate: '100px 0px', offset: 1},
        ],
        {duration, easing: 'linear', direction: 'reverse'},
      );
    }, RUN_MS);
    const [reversed] = await holdAnimations(page, box, {
      judges: {target: box, property: 'translate'},
    });
    expect(reversed.curveEndMs).toBeCloseTo(RUN_MS, 0);
    await releaseAnimations(page, {finish: true});

    // One reversed by `reverse()` (a negative playback rate) is reported as
    // starting when it did, running its whole curve, and is refused by a
    // hold, which seeks curves forward only.
    const watch = await watchAnimations(box);
    const begunAt = await box.evaluate(async (el, duration) => {
      const animation = el.animate(
        [
          {translate: '0px 0px', offset: 0},
          {translate: '100px 0px', offset: 0.5},
          {translate: '100px 0px', offset: 1},
        ],
        {duration, easing: 'linear'},
      );
      animation.reverse();
      await animation.ready;
      // When it began, by its own clock read at one instant: going backward
      // it starts at its end, so its current time has come down from there
      // by as much as the timeline has moved since.
      const end = Number(animation.effect?.getComputedTiming().endTime ?? 0);
      return (
        performance.timeOrigin +
        Number(document.timeline.currentTime) -
        (end - Number(animation.currentTime)) / Math.abs(animation.playbackRate)
      );
    }, RUN_MS);
    const [running] = await watch.started();
    // Both from the engine's own instants: within the timeline's rounding.
    expect(Math.abs(running.from - begunAt)).toBeLessThanOrEqual(1);
    expect(running.to - running.from).toBeCloseTo(RUN_MS, -1);
    await expect(
      holdAnimations(page, box, {judges: 'count-only'}),
    ).rejects.toThrow(/runs backward/);
    await box.evaluate(el => el.getAnimations().forEach(a => a.finish()));

    // A property keyed only before the held run, and a last keyframe short of
    // offset 1, each get an implicit end frame: the curve runs to its end.
    for (const keyframes of [
      [
        {translate: '0px 0px', opacity: 0, offset: 0},
        {translate: '100px 0px', offset: 0.5},
        {translate: '100px 0px', offset: 1},
      ],
      [
        {translate: '0px 0px', offset: 0},
        {translate: '100px 0px', offset: 0.5},
        {translate: '100px 0px', offset: 0.8},
      ],
    ]) {
      await box.evaluate(
        (el, {frames, duration}) => {
          el.animate(frames, {duration, easing: 'linear'});
        },
        {frames: keyframes, duration: RUN_MS},
      );
      const [moving] = await holdAnimations(page, box, {
        judges: {target: box, property: 'translate'},
      });
      expect(moving.curveEndMs).toBeCloseTo(RUN_MS, 0);
      await releaseAnimations(page, {finish: true});
    }

    await box.evaluate((el, duration) => {
      el.animate([{rotate: 'x 0deg'}, {rotate: 'x 60deg'}], {
        duration,
        easing: 'linear',
      });
    }, RUN_MS);
    await holdAnimations(page, box, {
      judges: {target: box, property: 'rotate'},
    });
    const [end] = await sampleCurve(box, [RUN_MS]);
    // About x, nothing turns in the plane: no z rotation, and y shrinks by
    // cos 60°.
    expect(end.transform.rotate).toBeCloseTo(0, 1);
    expect(end.transform.scaleY).toBeCloseTo(0.5, 2);
    await releaseAnimations(page, {finish: true});
  });

  test('a hold stays where it was read, not a frame later', async ({page}) => {
    await fixture(page);
    // 10 s, so the hold sent after the wait reaches the run on a busy runner.
    await page.evaluate(() => {
      document
        .getElementById('box')
        ?.animate(
          [{transform: 'translateX(0px)'}, {transform: 'translateX(3000px)'}],
          {duration: 10_000, easing: 'linear'},
        );
    });
    const box = page.locator('#box');
    await waitForAnimation(box, {minProgressMs: 50});
    const [held] = await holdAnimations(page, box, {
      judges: {target: box, property: 'transform'},
    });
    // Two frames later, the held animation is still where the hold read it.
    const after = await box.evaluate(
      el =>
        new Promise<number>(resolve =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              resolve(Number(el.getAnimations()[0]?.currentTime)),
            ),
          ),
        ),
    );
    expect(held.heldAtMs).not.toBeNull();
    expect(Math.abs(after - (held.heldAtMs ?? 0))).toBeLessThan(0.5);
    await releaseAnimations(page);
  });

  test('a run held while its resume is still pending keeps its place through its playback rate: a seek to the hold leaves it where it was held', async ({
    page,
  }) => {
    await fixture(page);
    // #box runs at rate 1; a second run at rate 2 was paused 400 ms into its
    // curve and is resumed by the hold's own first read of the timeline, so
    // its resume is still pending (no start time yet) when the hold takes it.
    // It covers its 400 ms of curve in 200 ms of timeline. Both run long
    // enough for the hold to reach them on a loaded runner, where a hold can
    // read the page seconds after the runs were made.
    await page.evaluate(async () => {
      const frames = [
        {transform: 'translateX(0px)'},
        {transform: 'translateX(300px)'},
      ];
      document
        .getElementById('box')
        ?.animate(frames, {duration: 60_000, easing: 'linear'});
      const other = document.createElement('div');
      other.id = 'faster';
      other.style.cssText =
        'position:absolute;left:0;top:300px;width:40px;height:40px;background:#c63';
      document.body.append(other);
      const faster = other.animate(frames, {
        duration: 60_000,
        easing: 'linear',
      });
      faster.playbackRate = 2;
      faster.pause();
      faster.currentTime = 400;
      await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      // The hold reads the timeline's time once, just before it lists the
      // page's animations: resumed there, the run is pending when listed. No
      // other read of the timeline's time comes between (the animation
      // recorder reads the clock and the animations, never the timeline).
      // The read is caught on the prototype that defines it, which lives as
      // long as the page: a property set on the timeline object itself is
      // lost when the engine collects and recreates its wrapper.
      let owner: object | null = Object.getPrototypeOf(document.timeline);
      while (
        owner != null &&
        Object.getOwnPropertyDescriptor(owner, 'currentTime') == null
      ) {
        owner = Object.getPrototypeOf(owner);
      }
      const real =
        owner == null
          ? undefined
          : Object.getOwnPropertyDescriptor(owner, 'currentTime');
      if (owner == null || real?.get == null) {
        throw new Error('no currentTime getter on the timeline');
      }
      const prototype = owner;
      const read = real.get;
      Object.defineProperty(prototype, 'currentTime', {
        configurable: true,
        get(this: AnimationTimeline) {
          Object.defineProperty(prototype, 'currentTime', real);
          faster.play();
          return read.call(this);
        },
      });
    });
    const held = await holdAnimations(page, undefined, {
      judges: [
        {target: page.locator('#box'), property: 'transform'},
        {target: page.locator('#faster'), property: 'transform'},
      ],
    });
    expect(held.map(a => a.target)).toEqual(['div#box', 'div#faster']);
    const [box, faster] = held;
    expect(faster.heldAtMs).toBe(400);
    // The moment of the hold, from #box's own place: a seek there leaves
    // every held run where the hold read it.
    await seekAnimations(page, (box.heldAtMs ?? 0) + box.offsetMs);
    const at = await page.evaluate(() =>
      ['box', 'faster'].map(id =>
        Number(document.getElementById(id)?.getAnimations()[0]?.currentTime),
      ),
    );
    expect(Math.abs(at[0] - (box.heldAtMs ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs(at[1] - 400)).toBeLessThanOrEqual(1);
    await releaseAnimations(page);
  });

  test('a second hold adds to the held set, and releasing resumes both', async ({
    page,
  }) => {
    await fixture(page);
    await page.evaluate(() => {
      const other = document.createElement('div');
      other.id = 'other';
      document.body.append(other);
    });
    const box = page.locator('#box');
    // Both holds are armed before the 300 ms runs start, so a busy runner
    // cannot end either before its hold; each adds to the held set.
    const other = page.locator('#other');
    const first = await armHold(page, box, {
      judges: {target: box, property: 'transform'},
    });
    const second = await armHold(page, other, {
      judges: {target: other, property: 'opacity'},
    });
    await page.evaluate(() => {
      document
        .getElementById('box')
        ?.animate(
          [{transform: 'translateX(0px)'}, {transform: 'translateX(300px)'}],
          {duration: 300, easing: 'linear', fill: 'forwards'},
        );
      document.getElementById('other')?.animate([{opacity: 0}, {opacity: 1}], {
        duration: 300,
        fill: 'forwards',
      });
    });
    expect(await first.held()).toHaveLength(1);
    expect(await second.held()).toHaveLength(1);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as {__harnessHeld: Animation[]}).__harnessHeld
            .length,
      ),
    ).toBe(2);
    await releaseAnimations(page);
    // The first hold was released too: the move runs to its end, and rest is
    // its end, not the frame it was held on.
    await waitForRest(box);
    expect(await box.evaluate(el => getComputedStyle(el).transform)).toBe(
      'matrix(1, 0, 0, 1, 300, 0)',
    );
    expect(
      await page.evaluate(
        () =>
          document.getAnimations().filter(a => a.playState === 'paused').length,
      ),
    ).toBe(0);
  });

  test("a later hold of an earlier-started animation keeps the first hold's times", async ({
    page,
  }) => {
    await fixture(page);
    // #early starts before #box's 60 s linear move to 300 px. Each start time
    // resolves at the first frame after its animation is made, which a
    // starved page can hold back past any timer, so #box is made 100 ms after
    // #early's start has resolved, and the gap is read from the two starts.
    // Both run long enough for the holds to reach them on a loaded runner,
    // where a hold read the page as late as 10 s after the runs were made.
    const startGap = await page.evaluate(async () => {
      const early = document.createElement('div');
      early.id = 'early';
      document.body.append(early);
      const fade = early.animate([{opacity: 0}, {opacity: 1}], {
        duration: 120_000,
      });
      await fade.ready;
      await new Promise(resolve => setTimeout(resolve, 100));
      const move = document
        .getElementById('box')
        ?.animate(
          [{transform: 'translateX(0px)'}, {transform: 'translateX(300px)'}],
          {duration: 60_000, easing: 'linear'},
        );
      await move?.ready;
      return Number(fade.startTime) - Number(move?.startTime);
    });
    const box = page.locator('#box');
    await waitForAnimation(box);
    // The later-started element is held first.
    const [first] = await holdAnimations(page, box, {
      judges: {target: box, property: 'transform'},
    });
    const [later] = await holdAnimations(page, page.locator('#early'), {
      judges: {target: page.locator('#early'), property: 'opacity'},
    });
    const samples = await sampleCurve(box, [0, 15_000, 30_000]);
    // Unrounded: at 0.005 px a ms, sampling from an origin shifted by the
    // start gap (over 100 ms) moves a sample by 0.5 px or more, while a seek
    // lands within the engines' time rounding of the requested time.
    [0, 75, 150].forEach((x, i) =>
      expect(samples[i].transform.translateX).toBeCloseTo(x, 1),
    );
    // A later hold's earlier start has a negative offset, the difference of
    // the two starts; the origin stays.
    expect(first.offsetMs).toBe(0);
    expect(startGap).toBeLessThan(-50);
    expect(later.offsetMs).toBeCloseTo(startGap, 0);
    await releaseAnimations(page);
  });

  test('a held transition the page retargets fails a seek or a sample by name, and is dropped, not revived', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // Armed before the 300 ms transition starts, so a busy runner cannot end
    // it before the hold.
    const hold = await armHold(page, box, {
      judges: {target: box, property: 'transform'},
    });
    await box.evaluate(el => {
      el.style.transition = 'transform 300ms linear';
      el.getBoundingClientRect();
      el.style.transform = 'translateX(300px)';
    });
    expect(await hold.held()).toHaveLength(1);
    // The page sends the box back: the held transition is cancelled, and a
    // new one runs from where the box is.
    await box.evaluate(el => {
      const w = window as unknown as {__cancelled: Animation};
      w.__cancelled = el.getAnimations()[0];
      el.style.transform = 'none';
    });
    const state = () =>
      page.evaluate(() => {
        const w = window as unknown as {
          __cancelled: Animation;
          __harnessHeld: Animation[];
        };
        return {
          cancelled: w.__cancelled.playState,
          held: w.__harnessHeld.length,
        };
      });
    // The judged run is gone, so a read would show the run that replaced
    // it: a seek and a sample fail by name.
    await expect(seekAnimations(page, 150)).rejects.toThrow(
      /seekAnimations: the page cancelled the held run of a judged motion \(transform on div#box\) since the hold/,
    );
    await expect(sampleCurve(box, [150])).rejects.toThrow(
      /sampleCurve: the page cancelled the held run of a judged motion \(transform on div#box\) since the hold/,
    );
    expect((await state()).cancelled).toBe('idle');
    await releaseAnimations(page);
    await waitForRest(box);
    expect(await state()).toEqual({cancelled: 'idle', held: 0});
    expect(await box.evaluate(el => getComputedStyle(el).transform)).toBe(
      'none',
    );
  });

  test('finishing resumes an animation that repeats forever and still clears the held set', async ({
    page,
  }) => {
    await fixture(page);
    // Armed before the 300 ms fade starts, so a busy runner cannot end it
    // before the hold.
    const hold = await armHold(page, undefined, {
      judges: [
        {target: page.locator('#box'), property: 'rotate'},
        {target: page.locator('#fade'), property: 'opacity'},
      ],
    });
    await page.evaluate(() => {
      const box = document.getElementById('box');
      box?.animate([{rotate: '0deg'}, {rotate: '360deg'}], {
        duration: 800,
        iterations: Infinity,
      });
      const fade = document.createElement('div');
      fade.id = 'fade';
      document.body.append(fade);
      fade.animate([{opacity: 0}, {opacity: 1}], {duration: 300});
    });
    expect(await hold.held()).toHaveLength(2);
    await releaseAnimations(page, {finish: true});
    expect(
      await page.evaluate(() => ({
        spinner: document.getElementById('box')?.getAnimations()[0]?.playState,
        fade: document.getElementById('fade')?.getAnimations().length,
        held: (window as unknown as {__harnessHeld: Animation[]}).__harnessHeld
          .length,
      })),
    ).toEqual({spinner: 'running', fade: 0, held: 0});
  });
});

test.describe('animation state', () => {
  test("releaseAnimationLog frees what the recorder kept, so a count after it reads the page's own objects", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'forcing a garbage collection needs the DevTools protocol',
    );
    await fixture(page);
    await page.evaluate(() => {
      const el = document.createElement('div');
      el.id = 'released';
      el.style.cssText = 'width:40px;height:40px;background:red';
      document.body.append(el);
    });
    const released = page.locator('#released');
    await released.evaluate(el => {
      (el as HTMLElement).style.transition = 'transform 60ms linear';
      void (el as HTMLElement).offsetWidth;
      (el as HTMLElement).style.transform = 'translateX(40px)';
    });
    await waitForAnimation(released);
    await waitForRest(released);
    // The page drops the element; only the recorder's log still holds it.
    await released.evaluate(el => {
      (window as unknown as {__released: WeakRef<Element>}).__released =
        new WeakRef(el);
      el.remove();
    });
    const cdp = await page.context().newCDPSession(page);
    const alive = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      await cdp.send('HeapProfiler.collectGarbage');
      return page.evaluate(
        () =>
          (
            window as unknown as {__released: WeakRef<Element>}
          ).__released.deref() != null,
      );
    };
    // The control: without the release, the log keeps the removed element.
    expect(await alive()).toBe(true);
    await releaseAnimationLog(page);
    expect(await alive()).toBe(false);
    await cdp.detach();
  });

  test('waitForAnimation reports a running transition and waitForRest resolves after it', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    await box.evaluate(el => {
      el.style.transition = 'transform 300ms linear';
      void (el as HTMLElement).offsetWidth;
      el.style.transform = 'translateY(100px)';
    });
    const [running] = await waitForAnimation(box);
    expect(running.kind).toBe('CSSTransition');
    expect(running.name).toBe('transform');
    expect(running.durationMs).toBe(300);
    expect(running.to - running.from).toBeCloseTo(300, 0);
    await waitForRest(box);
    const settledAt = await page.evaluate(
      () => performance.timeOrigin + performance.now(),
    );
    expect(settledAt).toBeGreaterThanOrEqual(running.to);
    const transform = await box.evaluate(el => getComputedStyle(el).transform);
    expect(parseTransform(transform).translateY).toBeCloseTo(100, 1);
  });

  test('settlesAt waits for the value, which can come after every animation has ended', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // No animation runs: a page timer sets the value 300 ms from now.
    await box.evaluate(el => {
      setTimeout(() => {
        (el as HTMLElement).style.opacity = '0.25';
      }, 300);
    });
    await settlesAt(box, 'opacity', '0.25');
    expect(await box.evaluate(el => getComputedStyle(el).opacity)).toBe('0.25');
  });

  test('settlesAt resolves only once every animation inside the element has finished', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // The box fades for 300 ms, and a child inside it slides for 2 s. The
    // value comes first, and the wait ends with the slide.
    await box.evaluate(el => {
      const child = document.createElement('div');
      el.append(child);
      child.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(40px)'}],
        {duration: 2000},
      );
      const target = el as HTMLElement;
      target.style.transition = 'opacity 300ms linear';
      void target.offsetWidth;
      target.style.opacity = '0.5';
    });
    await settlesAt(box, 'opacity', '0.5');
    const unfinished = await box.evaluate(
      el =>
        el
          .getAnimations({subtree: true})
          .filter(animation => animation.playState !== 'finished').length,
    );
    expect(unfinished).toBe(0);
  });

  test("settlesAt keeps checking while a frozen timer gate holds the page's frames", async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    await installTimerGate(page);
    await freezeTimers(page);
    // Waits for real frames, which the frozen gate does not hold.
    const realFrames = async (count: number) =>
      page.evaluate(
        async n =>
          new Promise<void>(resolve => {
            const {frame} = (
              window as unknown as {
                __harnessTimerGate: {frame: typeof requestAnimationFrame};
              }
            ).__harnessTimerGate;
            let left = n;
            const tick = () => {
              left -= 1;
              if (left <= 0) {
                resolve();
              } else {
                frame(tick);
              }
            };
            frame(tick);
          }),
        count,
      );
    let outcome: unknown = 'waiting';
    const wait = settlesAt(box, 'opacity', '0.75').then(
      () => {
        outcome = 'settled';
      },
      (error: unknown) => {
        outcome = error;
      },
    );
    await realFrames(2);
    await box.evaluate(el => {
      (el as HTMLElement).style.opacity = '0.75';
    });
    // The wait answers on the first real frame after the change. That
    // answer comes back before the answer to five more frames.
    await realFrames(5);
    expect(outcome).toBe('settled');
    await wait;
    await thawTimers(page);
  });

  test('settlesAt names the property, the last value and what still runs at its deadline', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    const message = async (wait: Promise<void>) =>
      wait.then(
        () => 'settled',
        (error: unknown) => (error as Error).message,
      );
    // The value never comes. A starved runner can leave the page unwatched
    // before the deadline. Then FrameStarvationError carries the same names,
    // so either error matches.
    expect(
      await message(settlesAt(box, 'opacity', '0.3', {timeout: 300})),
    ).toMatch(
      /^settlesAt: .*opacity read "1" \(not "0\.3"\); no animation under it was unfinished/,
    );
    // The value is there, but a child slides forever, so the box never
    // settles.
    await box.evaluate(el => {
      const child = document.createElement('div');
      child.id = 'slider';
      el.append(child);
      child.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(40px)'}],
        {duration: 400, iterations: Infinity},
      );
    });
    expect(
      await message(settlesAt(box, 'opacity', '1', {timeout: 300})),
    ).toMatch(
      /^settlesAt: .*opacity read "1"; unfinished under it: Animation on div#slider, running at \d+ of forever/,
    );
  });

  test('settlesAt on a page starved of frames fails by name, with what it last read', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // Each frame now comes 1,000 ms after the one before, as on a starved
    // machine.
    await page.evaluate(() => {
      const frame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => {
        setTimeout(() => frame(callback), 1000);
        return 0;
      };
    });
    const outcome = await settlesAt(box, 'opacity', '0.3', {
      timeout: 1500,
    }).then(
      () => 'settled',
      (error: unknown) => error,
    );
    expect(outcome).toBeInstanceOf(FrameStarvationError);
    const {numbers} = outcome as FrameStarvationError;
    expect(numbers.frames).toBe(0);
    expect(numbers.longestGapMs).toBeGreaterThan(FRAME_STARVATION_MS);
    expect((outcome as Error).message).toMatch(
      /^settlesAt: the page drew 0 frames while it looked for opacity to settle at 0\.3 in the \d+ ms up to its deadline \(opacity read "1" \(not "0\.3"\)/,
    );
  });

  test('settlesAt does not name a stall that starts after its deadline as starvation', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    const stallMs = 500;
    // Frames come on pace until the wait's deadline, 300 ms after its first
    // frame request. The first frame after that then holds the main thread
    // for 500 ms before the wait's check runs.
    await page.evaluate(
      ({timeoutMs, holdMs}) => {
        const frame = window.requestAnimationFrame.bind(window);
        let firstAt: number | null = null;
        let stalled = false;
        window.requestAnimationFrame = callback => {
          firstAt ??= performance.now();
          const stallAfter = firstAt + timeoutMs;
          return frame(time => {
            if (!stalled && performance.now() > stallAfter) {
              stalled = true;
              const end = performance.now() + holdMs;
              while (performance.now() < end) {
                // the page's main thread is busy
              }
            }
            callback(time);
          });
        };
      },
      {timeoutMs: 300, holdMs: stallMs},
    );
    const outcome = await settlesAt(box, 'opacity', '0.3', {
      timeout: 300,
    }).then(
      () => 'settled',
      (error: unknown) => error,
    );
    // A starved runner can also leave the page unwatched before the
    // deadline. That run proves nothing, so it fails by name.
    if (
      outcome instanceof FrameStarvationError &&
      outcome.numbers.longestGapMs < stallMs
    ) {
      throw outcome;
    }
    expect(outcome).not.toBeInstanceOf(FrameStarvationError);
    expect((outcome as Error).message).toMatch(
      /^settlesAt: not settled \d+ ms after it began: opacity read "1" \(not "0\.3"\)/,
    );
  });

  test("waitForAnimation's progress starts after a transition's delay", async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    await box.evaluate((el, read) => {
      // The transition's time at each of the wait's own reads (it marks
      // them), so the check reads what the wait judged, not a later frame.
      const w = window as unknown as {__reads: (number | null)[]};
      w.__reads = [];
      const timeStamp = console.timeStamp.bind(console);
      console.timeStamp = (label?: string) => {
        if (label === read) {
          const run = el.getAnimations()[0];
          w.__reads.push(run == null ? null : Number(run.currentTime));
        }
        timeStamp(label);
      };
      // It runs for the whole test, so the wait finds it running however
      // late it first looks: the claim is about its 200 ms delay.
      el.style.transition = 'transform 60s linear 200ms';
      void (el as HTMLElement).offsetWidth;
      el.style.transform = 'translateY(100px)';
    }, HARNESS_READ);
    const [found] = await waitForAnimation(box, {minProgressMs: 50});
    expect(found.finishedAt).toBeNull();
    // 50 ms along the curve at the read the wait answered on: past the
    // 200 ms delay, not inside it.
    const reads = await page.evaluate(
      () => (window as unknown as {__reads: (number | null)[]}).__reads,
    );
    expect(reads.at(-1)).toBeGreaterThanOrEqual(250);
    await box.evaluate(el => {
      for (const run of el.getAnimations()) {
        run.finish();
      }
    });
    await waitForRest(box);
  });

  test('waitForAnimation reports a short animation that ended before it looked', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    await waitForRest(box);
    await box.evaluate(el => {
      el.style.transition = 'transform 60ms linear';
      void (el as HTMLElement).offsetWidth;
      el.style.transform = 'translateY(40px)';
    });
    // A cold page answers late: the transition is over before the first look.
    await page.waitForTimeout(250);
    const [ended] = await waitForAnimation(box);
    expect(ended.kind).toBe('CSSTransition');
    expect(ended.durationMs).toBe(60);
    expect(ended.finishedAt).not.toBeNull();
    expect(ended.finishedAt ?? 0).toBeGreaterThanOrEqual(ended.to - 1);
  });

  test("a watch taken before the action catches an entrance on the page's first contact", async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    const watch = await watchAnimations(box);
    await box.evaluate(el =>
      el.animate([{opacity: 0}, {opacity: 1}], {duration: 50}),
    );
    await page.waitForTimeout(250);
    const [entrance] = await watch.started();
    expect(entrance.kind).toBe('Animation');
    expect(entrance.durationMs).toBe(50);
    expect(entrance.finishedAt).not.toBeNull();
  });

  test("a watch taken on the page's first contact ignores an animation already running", async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // An endless spinner, started before the harness has touched the page.
    await box.evaluate(el =>
      el.animate([{rotate: '0deg'}, {rotate: '360deg'}], {
        duration: 1000,
        iterations: Infinity,
      }),
    );
    const watch = await watchAnimations(box);
    await expect(watch.started({timeout: 300})).rejects.toThrow(
      /no animation started/,
    );
    await box.evaluate(el =>
      el.animate([{opacity: 1}, {opacity: 0.5}], {duration: 300}),
    );
    const started = await watch.started();
    expect(started.map(a => a.durationMs)).toEqual([300]);
  });

  test('while a rendering trace runs the recorder reads only at CSS starts, and catches up after it', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    const watch = await watchAnimations(box);
    // Counts the recorder's reads of the page's animations (each one flushes
    // style): the whole document's, and one element's. Then flags a trace, as
    // traceRendering does.
    await page.evaluate(() => {
      const w = window as unknown as {
        __reads: number;
        __elementReads: number;
        __harnessRenderingTrace?: boolean;
      };
      w.__reads = 0;
      w.__elementReads = 0;
      const read = document.getAnimations.bind(document);
      document.getAnimations = () => {
        w.__reads += 1;
        return read();
      };
      const readElement = Element.prototype.getAnimations;
      Element.prototype.getAnimations = function (
        this: Element,
        ...args: Parameters<Element['getAnimations']>
      ) {
        w.__elementReads += 1;
        return readElement.apply(this, args);
      };
      w.__harnessRenderingTrace = true;
    });
    // During the trace: a CSS transition and a CSS animation that both end
    // inside it, and a script animation still running after it.
    await page.addStyleTag({
      content:
        '@keyframes harness-fade { from { opacity: 1 } to { opacity: 0.6 } }',
    });
    await box.evaluate(el => {
      const box = el as HTMLElement;
      box.style.transition = 'transform 120ms linear';
      void box.offsetWidth;
      box.style.transform = 'translateX(100px)';
      box.style.animation = 'harness-fade 120ms linear';
      box.animate([{scale: '1'}, {scale: '0.9'}], {duration: 600});
    });
    await page.waitForTimeout(300);
    const reads = () =>
      page.evaluate(() => (window as unknown as {__reads: number}).__reads);
    // No frame loop: no document-wide read. One element read per CSS start
    // event (transitionrun, transitionstart, animationstart), not per frame.
    expect(await reads()).toBe(0);
    expect(
      await page.evaluate(
        () => (window as unknown as {__elementReads: number}).__elementReads,
      ),
    ).toBeLessThanOrEqual(3);
    // The trace ends: traceRendering clears the flag and resumes the recorder,
    // which reads again, every frame.
    await page.evaluate(() => {
      const w = window as unknown as {
        __harnessRenderingTrace?: boolean;
        __harnessAnimations: {resume: () => void};
      };
      w.__harnessRenderingTrace = false;
      w.__harnessAnimations.resume();
    });
    await frames(page, 3);
    expect(await reads()).toBeGreaterThan(2);
    // All three are reported, the two CSS ones that ended inside the trace
    // with the time they finished.
    await waitForRest(box);
    const started = await watch.started();
    expect(started.map(a => a.kind).sort()).toEqual([
      'Animation',
      'CSSAnimation',
      'CSSTransition',
    ]);
    expect(
      started
        .filter(a => a.kind !== 'Animation')
        .map(a => a.finishedAt != null),
    ).toEqual([true, true]);
  });

  test('a wait answers with the animation the action started, not one that finished before it', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    const frames = [{opacity: 0.2}, {opacity: 1}];
    // The recorder runs and is armed from here.
    await waitForRest(box);
    // A short one runs and ends; then the action starts a longer one, still
    // pending when the wait first looks.
    await box.evaluate(
      (el, keyframes) => el.animate(keyframes, {duration: 40}).finished,
      frames,
    );
    await box.evaluate((el, keyframes) => {
      el.animate(keyframes, {duration: 1000});
    }, frames);
    const [found] = await waitForAnimation(box);
    expect(found.durationMs).toBe(1000);
    await box.evaluate(el => el.getAnimations().forEach(a => a.finish()));
  });

  test('a scroll-timeline animation in scope does not hold up a wait', async ({
    page,
  }) => {
    await fixture(page);
    const scroller = page.locator('#scroller');
    await waitForRest(scroller);
    // A row driven by its scroller's timeline (it moves only on scroll), and
    // a short document animation that ends.
    await scroller.evaluate(el => {
      const [row, other] = [...el.children] as HTMLElement[];
      row.animate([{opacity: 0.5}, {opacity: 1}], {
        timeline: new ScrollTimeline({source: el}),
      });
      // Scrolled to its end, the scroll-driven one has finished too: it is
      // not a finished curve either.
      el.scrollTop = el.scrollHeight;
      return other.animate([{opacity: 0.2}, {opacity: 1}], {duration: 40})
        .finished;
    });
    const [found] = await waitForAnimation(scroller, {timeout: 2000});
    expect(found.durationMs).toBe(40);
    expect(found.finishedAt).not.toBeNull();
  });

  test('a watch taken right after a style change does not report that change', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    await waitForRest(box);
    // The step: a transition the next style read creates.
    await box.evaluate(el => {
      el.style.transition = 'opacity 300ms linear';
      el.style.opacity = '0.5';
    });
    const watch = await watchAnimations(box);
    await expect(watch.started({timeout: 200})).rejects.toThrow(
      /waitForAnimation/,
    );
    await box.evaluate(el => el.getAnimations().forEach(a => a.finish()));
  });

  test('inside a rendering trace too, a watch taken right after a style change does not report that change', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
    await fixture(page);
    const box = page.locator('#box');
    await waitForRest(box);
    await traceRendering(page, async () => {
      // The step: a transition the next style read creates.
      await box.evaluate(el => {
        el.style.transition = 'opacity 300ms linear';
        el.style.opacity = '0.5';
      });
      const watch = await watchAnimations(box);
      await expect(watch.started({timeout: 200})).rejects.toThrow(
        /waitForAnimation/,
      );
    });
    await box.evaluate(el => el.getAnimations().forEach(a => a.finish()));
  });

  test('an exit whose element the page removes at its end is still reported', async ({
    page,
  }) => {
    await fixture(page);
    await page.evaluate(() => {
      const wrap = document.createElement('div');
      wrap.id = 'wrap';
      const leaf = document.createElement('div');
      leaf.id = 'leaf';
      leaf.style.cssText = 'width:20px;height:20px;background:#c33';
      wrap.append(leaf);
      document.body.append(wrap);
    });
    const wrap = page.locator('#wrap');
    const watch = await watchAnimations(wrap);
    await page.evaluate(() => {
      const leaf = document.getElementById('leaf') as HTMLElement;
      const exit = leaf.animate([{opacity: 1}, {opacity: 0}], {duration: 60});
      exit.finished.then(() => leaf.remove());
    });
    await expect
      .poll(() => page.evaluate(() => document.getElementById('leaf') == null))
      .toBe(true);
    const [exit] = await watch.started();
    expect(exit.durationMs).toBe(60);
    expect(exit.finishedAt).not.toBeNull();
  });

  test('a wait on an element no longer in the document rejects at its own timeout', async ({
    page,
  }) => {
    await fixture(page);
    await page.evaluate(() => {
      const gone = document.createElement('div');
      gone.id = 'gone';
      document.body.append(gone);
    });
    const gone = page.locator('#gone');
    const watch = await watchAnimations(gone);
    await page.evaluate(() => document.getElementById('gone')?.remove());
    for (const wait of [
      () => watch.started({timeout: 300}),
      () => waitForAnimation(gone, {timeout: 300}),
      () => waitForRest(gone, {timeout: 300}),
    ]) {
      const startedAt = Date.now();
      await expect(wait()).rejects.toThrow(/not in the document/);
      expect(Date.now() - startedAt).toBeLessThan(3_000);
    }
  });

  test('inside a rendering trace too, a wait on an element no longer in the document rejects as missing', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'rendering traces are Chromium-only (README: engine limits)',
    );
    await fixture(page);
    await page.evaluate(() => {
      const gone = document.createElement('div');
      gone.id = 'gone';
      document.body.append(gone);
    });
    const gone = page.locator('#gone');
    const watch = await watchAnimations(gone);
    await page.evaluate(() => document.getElementById('gone')?.remove());
    const outcomes: string[] = [];
    await traceRendering(page, async () => {
      for (const wait of [
        () => watch.started({timeout: 300}),
        () => waitForAnimation(gone, {timeout: 300}),
      ]) {
        outcomes.push(
          await wait().then(
            () => 'resolved',
            (error: Error) => error.message,
          ),
        );
      }
    });
    expect(outcomes).toHaveLength(2);
    for (const outcome of outcomes) {
      expect(outcome).toMatch(/not in the document/);
    }
  });

  test('a watch reports only what started after it', async ({page}) => {
    await fixture(page);
    const box = page.locator('#box');
    await box.evaluate(el =>
      el.animate([{opacity: 0}, {opacity: 1}], {duration: 40}),
    );
    await page.waitForTimeout(150);
    const watch = await watchAnimations(box);
    await expect(watch.started({timeout: 300})).rejects.toThrow(
      /no animation started/,
    );
    await box.evaluate(el =>
      el.animate([{opacity: 1}, {opacity: 0.5}], {duration: 70}),
    );
    const started = await watch.started();
    expect(started.map(a => a.durationMs)).toEqual([70]);
  });

  test('a run that the page cancels while it plays is reported, ended where the page cancelled it', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    const watch = await watchAnimations(box);
    // The page retires the run as Core's motion animator does: it writes the
    // end and cancels the run, so no finish event comes. It cancels on its
    // first frame past 200 ms of play. A starved page gets there late, but it
    // gets there.
    const calledAt = await box.evaluate(el => {
      const run = el.animate([{opacity: 0}, {opacity: 1}], {
        duration: 60_000,
        fill: 'both',
      });
      const retire = () => {
        if (Number(run.currentTime ?? 0) >= 200) {
          (el as HTMLElement).style.opacity = '1';
          run.cancel();
        } else {
          requestAnimationFrame(retire);
        }
      };
      requestAnimationFrame(retire);
      return performance.timeOrigin + performance.now();
    });
    // The first look comes after the cancel.
    await expect
      .poll(() => box.evaluate(el => el.getAnimations().length))
      .toBe(0);
    const [run] = await watch.started();
    expect(run.kind).toBe('Animation');
    expect(run.durationMs).toBe(60_000);
    expect(run.from).toBeGreaterThan(calledAt - 17);
    // It played at least 200 ms, and it ended long before its curve's end.
    expect(run.finishedAt).not.toBeNull();
    expect((run.finishedAt ?? 0) - run.from).toBeGreaterThanOrEqual(199);
    expect(run.finishedAt ?? 0).toBeLessThan(run.to);
  });

  test('a run that the page cancels before it presented minProgressMs, or in its start delay, is not reported', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // Cancelled in the task that made it: it never presented a frame.
    const unstarted = await watchAnimations(box);
    await box.evaluate(el => {
      el.animate([{opacity: 0}, {opacity: 1}], {duration: 60_000}).cancel();
    });
    await expect(unstarted.started({timeout: 300})).rejects.toThrow(
      /no animation started/,
    );
    // Cancelled after 200 ms of play, short of the 5 s that the wait asks for.
    const short = await watchAnimations(box);
    await box.evaluate(el => {
      const run = el.animate([{opacity: 0}, {opacity: 1}], {
        duration: 60_000,
      });
      const retire = () => {
        if (Number(run.currentTime ?? 0) >= 200) {
          run.cancel();
        } else {
          requestAnimationFrame(retire);
        }
      };
      requestAnimationFrame(retire);
    });
    await expect
      .poll(() => box.evaluate(el => el.getAnimations().length))
      .toBe(0);
    await expect(
      short.started({minProgressMs: 5_000, timeout: 300}),
    ).rejects.toThrow(/no animation started/);
    // Cancelled in its 30 s start delay: it has a start, but it presented
    // nothing, even for a wait that asks for no progress.
    const delayed = await watchAnimations(box);
    await box.evaluate(el => {
      const run = el.animate([{opacity: 0}, {opacity: 1}], {
        duration: 60_000,
        delay: 30_000,
      });
      const retire = () => {
        if (run.startTime != null) {
          run.cancel();
        } else {
          requestAnimationFrame(retire);
        }
      };
      requestAnimationFrame(retire);
    });
    await expect
      .poll(() => box.evaluate(el => el.getAnimations().length))
      .toBe(0);
    await expect(
      delayed.started({minProgressMs: 0, timeout: 300}),
    ).rejects.toThrow(/no animation started/);
  });

  test('an entrance the page cancels when it ends keeps its start', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // Long enough to be running at a frame of a starved page, whose frames
    // can come a second apart: a shorter one can start and finish between
    // two of them (the case below).
    await page.addStyleTag({
      content:
        '@keyframes enter { from { opacity: 0 } to { opacity: 1 } }' +
        ' .entering { animation: enter 1500ms linear }',
    });
    const watch = await watchAnimations(box);
    // The page's time origin, where a lost start lands, is well before the
    // trigger.
    await page.waitForTimeout(200);
    // Removing the class on animationend cancels the finished CSS animation,
    // which nulls its startTime.
    const triggeredAt = await box.evaluate(el => {
      el.addEventListener(
        'animationend',
        () => el.classList.remove('entering'),
        {once: true},
      );
      el.classList.add('entering');
      return performance.timeOrigin + performance.now();
    });
    await expect
      .poll(() => box.evaluate(el => el.classList.contains('entering')))
      .toBe(false);
    const removedSeenAt = await page.evaluate(
      () => performance.timeOrigin + performance.now(),
    );
    const [entrance] = await watch.started();
    expect(entrance.kind).toBe('CSSAnimation');
    expect(entrance.finishedAt).not.toBeNull();
    // It started on a frame after the trigger, not at the page's time origin,
    // and ran its whole duration before the page removed the class.
    expect(entrance.from).toBeGreaterThan(triggeredAt - 17);
    expect(entrance.from + 1500).toBeLessThanOrEqual(removedSeenAt + 1);
    expect(entrance.to - entrance.from).toBeCloseTo(1500, 3);
    expect(entrance.finishedAt ?? 0).toBeGreaterThanOrEqual(entrance.to - 1);
  });

  test("a CSS animation that starts and finishes between two of the page's frames is named, not reported as never started", async ({
    page,
    browserName,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    await page.addStyleTag({
      content:
        '@keyframes blink { from { opacity: 0 } to { opacity: 1 } }' +
        ' .blinking { animation: blink 30ms linear }',
    });
    const watch = await watchAnimations(box);
    // The style is read at once, so the animation exists as the class lands,
    // and the main thread then stays busy past its end: no frame runs inside
    // it, as on a starved page whose frames come further apart.
    await box.evaluate(el => {
      el.classList.add('blinking');
      void getComputedStyle(el).opacity;
      const end = performance.now() + 150;
      while (performance.now() < end) {
        // the page's frames wait
      }
    });
    const outcome = await watch.started({timeout: 1_000}).then(
      started => started.map(a => a.name),
      (error: Error) => error.message,
    );
    if (browserName === 'chromium') {
      // Chromium starts a pending animation at the next frame, so it runs
      // then and is recorded.
      expect(outcome).toEqual(['blink']);
      return;
    }
    // WebKit can start it as it was made: its start event then comes at the
    // next frame, after it finished, when no animation is left to read, and
    // the wait names it. When it starts it at the next frame instead, it runs
    // then and is recorded. Either way it is never reported as never started.
    if (Array.isArray(outcome)) {
      expect(outcome).toEqual(['blink']);
    } else {
      expect(outcome).toMatch(
        /the element's blink started and finished between two of the page's frames/,
      );
    }
    test.info().annotations.push({
      type: 'between-frames',
      description: Array.isArray(outcome) ? 'recorded' : 'named',
    });
  });

  test('a start event that finds nothing to read is named for a replay, for an exit the page removed, and once for a transition; a run the document still lists is never named', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    await page.addStyleTag({
      content:
        '@keyframes blink { from { opacity: 0 } to { opacity: 1 } }' +
        ' .blink-long { animation: blink 300ms linear }' +
        ' .blink-paused { animation: blink 300ms linear paused }',
    });
    const betweenFrames =
      "started and finished between two of the page's frames";
    // A run of the animation the page's frames see, recorded and finished:
    // a later run of it on the same element is a new run.
    const first = await watchAnimations(box);
    await box.evaluate(el => el.classList.add('blink-long'));
    expect((await first.started()).map(a => a.name)).toEqual(['blink']);
    await box.evaluate(el => {
      (window as unknown as {__first: Animation}).__first =
        el.getAnimations()[0];
    });
    await waitForRest(box);
    // The same run replayed with play(): still listed, so its start event is
    // never read as one that started and finished between two frames. (The
    // engine's own start event may come too; this one comes at once.)
    const replayed = await watchAnimations(box);
    await box.evaluate(el => {
      (window as unknown as {__first: Animation}).__first.play();
      el.dispatchEvent(
        new AnimationEvent('animationstart', {animationName: 'blink'}),
      );
    });
    expect(
      await replayed.started({timeout: 500}).then(
        started => `recorded ${started.map(a => a.name).join(', ')}`,
        (error: Error) => error.message,
      ),
    ).not.toContain(betweenFrames);
    await waitForRest(box);
    await box.evaluate(el => el.classList.remove('blink-long'));
    // Each case sends the events an engine sends for a run that started and
    // finished between two frames (WebKit sends them at the next frame, when
    // the run is no longer listed), so the recorder has nothing to read.
    const missed = async (
      send: 'replay' | 'removed exit' | 'transition',
    ): Promise<string> => {
      const watch = await watchAnimations(box);
      await box.evaluate((el, which) => {
        if (which === 'replay') {
          el.dispatchEvent(
            new AnimationEvent('animationstart', {animationName: 'blink'}),
          );
          el.dispatchEvent(
            new AnimationEvent('animationend', {animationName: 'blink'}),
          );
        } else if (which === 'removed exit') {
          const child = document.createElement('div');
          el.append(child);
          child.dispatchEvent(
            new AnimationEvent('animationstart', {
              animationName: 'blink',
              bubbles: true,
            }),
          );
          child.dispatchEvent(
            new AnimationEvent('animationend', {
              animationName: 'blink',
              bubbles: true,
            }),
          );
          child.remove();
        } else {
          for (const type of ['transitionrun', 'transitionstart']) {
            el.dispatchEvent(
              new TransitionEvent(type, {propertyName: 'opacity'}),
            );
          }
          el.dispatchEvent(
            new TransitionEvent('transitionend', {propertyName: 'opacity'}),
          );
        }
      }, send);
      return watch.started({timeout: 500}).then(
        started => `recorded ${started.map(a => a.name).join(', ')}`,
        (error: Error) => error.message,
      );
    };
    // A replay of the finished run: the earlier run does not answer for it.
    expect(await missed('replay')).toContain(
      "the element's blink started and finished between two of the page's frames",
    );
    // An exit the page removed, watched through its container.
    expect(await missed('removed exit')).toContain(
      "the element's blink started and finished between two of the page's frames",
    );
    // A transition sends two start events, and is named once.
    expect(await missed('transition')).toContain(
      "the element's opacity started and finished between two of the page's frames",
    );
    // A run that starts paused is listed, never recorded: its start event is
    // not one that found nothing to read.
    const paused = await watchAnimations(box);
    await box.evaluate(el => {
      el.classList.add('blink-paused');
      void getComputedStyle(el).opacity;
      el.dispatchEvent(
        new AnimationEvent('animationstart', {animationName: 'blink'}),
      );
    });
    expect(
      await paused.started({timeout: 500}).then(
        started => `recorded ${started.map(a => a.name).join(', ')}`,
        (error: Error) => error.message,
      ),
    ).not.toContain(betweenFrames);
    await box.evaluate(el => el.classList.remove('blink-paused'));
  });

  test('a CSS animation or transition whose element the page removes at its end is dated from its start', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // A CSS animation is recorded from its start event or a frame that sees
    // it running: one that starts and ends between two frames of a page that
    // has not rendered yet is never seen, so the page renders first and the
    // exit spans several frames.
    await page.evaluate(
      () =>
        new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    for (const kind of ['animation', 'transition'] as const) {
      // Watched through its container: the element is gone when it is read.
      const watch = await watchAnimations(box);
      const startedAt = await box.evaluate(
        async (el, how) =>
          new Promise<number>(resolve => {
            const style = document.createElement('style');
            style.textContent =
              '@keyframes exit-fade { from { opacity: 1 } to { opacity: 0 } }';
            document.head.append(style);
            const child = document.createElement('div');
            child.style.cssText = 'width:20px;height:20px;background:#36c';
            el.append(child);
            if (how === 'animation') {
              child.style.animation = 'exit-fade 200ms linear';
            } else {
              child.style.transition = 'opacity 200ms linear';
              // Resolve the starting value first, so the change transitions.
              child.style.opacity = getComputedStyle(child).opacity;
              void child.offsetWidth;
              child.style.opacity = '0';
            }
            // Its start time as the engine set it, read from the animation
            // itself, held from its creation: at its finish event or at its
            // end event, whichever first has it (WebKit resolves it after the
            // start event, Chromium cancels it once the page removes the
            // element), and before the page removes the element.
            const animation = child.getAnimations()[0];
            let start: number | null = null;
            const note = () => {
              if (start == null && animation?.startTime != null) {
                start = Number(animation.startTime);
              }
            };
            animation?.addEventListener('finish', note);
            child.addEventListener(`${how}end`, () => {
              note();
              child.remove();
              style.remove();
              resolve(
                start == null ? Number.NaN : performance.timeOrigin + start,
              );
            });
          }),
        kind,
      );
      const [exit] = await watch.started();
      expect(exit.finishedAt, kind).not.toBeNull();
      // Both from the engine's own instants: within the timeline's rounding.
      expect(Math.abs(exit.from - startedAt), kind).toBeLessThanOrEqual(1);
      expect(exit.to - exit.from, kind).toBeCloseTo(200, 0);
      expect(
        Math.abs((exit.finishedAt ?? 0) - exit.to),
        kind,
      ).toBeLessThanOrEqual(1);
    }
  });

  // Each change to a CSS exit partway through, then the page removes its
  // element at its end. The harness holds a 10 s exit (one its hold reaches
  // partway however slowly the page answers) and seeks it 300 ms from its end
  // before releasing it; the page changes a 3 s one on the first frame it is
  // 100 ms in (one a starved page still renders partway).
  for (const change of [
    'held, seeked and released',
    'held, then finished',
    'paused, then resumed',
    'paused, then finished',
    'sped up',
    'reversed',
  ] as const) {
    test(`a CSS exit ${change} partway, then removed at its end, is dated from the start it ended on`, async ({
      page,
    }) => {
      await fixture(page);
      const box = page.locator('#box');
      await page.evaluate(
        () =>
          new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const held = change.startsWith('held');
      for (const kind of ['animation', 'transition'] as const) {
        const label = `${kind}, ${change}`;
        const watch = await watchAnimations(box);
        // The page keeps its own dating: the start time the engine set and
        // where that start put the end, read from the animation itself at
        // its finish or end event, whichever first has it, before the page
        // removes the element.
        await box.evaluate(
          (el, {kind, change, durationMs, held}) => {
            const style = document.createElement('style');
            style.textContent =
              '@keyframes exit-fade { from { opacity: 1 } to { opacity: 0 } }';
            document.head.append(style);
            const child = document.createElement('div');
            child.style.cssText = 'width:20px;height:20px;background:#36c';
            el.append(child);
            if (kind === 'animation') {
              child.style.animation = `exit-fade ${durationMs}ms linear`;
            } else {
              child.style.transition = `opacity ${durationMs}ms linear`;
              child.style.opacity = getComputedStyle(child).opacity;
              void child.offsetWidth;
              child.style.opacity = '0';
            }
            const animation = child.getAnimations()[0];
            let dated: {start: number; end: number} | null = null;
            const note = () => {
              if (dated == null && animation?.startTime != null) {
                const rate = animation.playbackRate;
                const end = Number(
                  animation.effect?.getComputedTiming().endTime ?? 0,
                );
                const start =
                  rate < 0
                    ? Number(animation.startTime) - end / Math.abs(rate)
                    : Number(animation.startTime);
                dated = {start, end: start + end / Math.abs(rate || 1)};
              }
            };
            animation?.addEventListener('finish', note);
            const w = window as unknown as {
              __exitDated?: Promise<{start: number; end: number} | null>;
              __exitChanged?: Promise<boolean>;
            };
            w.__exitDated = new Promise(resolve => {
              const ended = () => {
                note();
                child.remove();
                style.remove();
                resolve(
                  dated == null
                    ? null
                    : {
                        start: performance.timeOrigin + dated.start,
                        end: performance.timeOrigin + dated.end,
                      },
                );
              };
              child.addEventListener(`${kind}end`, ended);
              child.addEventListener(`${kind}cancel`, ended);
            });
            // Whether it was changed partway: false once it has stopped
            // running unchanged.
            w.__exitChanged = new Promise(resolve => {
              const look = () => {
                if (animation == null || animation.playState !== 'running') {
                  if (
                    animation == null ||
                    animation.playState === 'finished' ||
                    animation.playState === 'idle'
                  ) {
                    resolve(false);
                    return;
                  }
                  requestAnimationFrame(look);
                  return;
                }
                if (held) {
                  // The harness holds it: running is enough.
                  if (animation.startTime == null) {
                    requestAnimationFrame(look);
                  } else {
                    resolve(true);
                  }
                  return;
                }
                if (
                  animation.startTime == null ||
                  Number(animation.currentTime ?? 0) < 100
                ) {
                  requestAnimationFrame(look);
                  return;
                }
                if (change === 'paused, then resumed') {
                  animation.pause();
                  setTimeout(() => animation.play(), 150);
                } else if (change === 'paused, then finished') {
                  animation.pause();
                  setTimeout(() => animation.finish(), 150);
                } else if (change === 'sped up') {
                  animation.playbackRate = 2;
                } else {
                  animation.reverse();
                }
                resolve(true);
              };
              requestAnimationFrame(look);
            });
          },
          {kind, change, durationMs: held ? 10_000 : 3_000, held},
        );
        const changed = await page.evaluate(
          () =>
            (window as unknown as {__exitChanged: Promise<boolean>})
              .__exitChanged,
        );
        expect(changed, `${label}: changed partway`).toBe(true);
        if (held) {
          const taken = await holdAnimations(page, box, {
            judges: {target: box.locator('div').first(), property: 'opacity'},
          });
          expect(taken.length, `${label}: held partway`).toBe(1);
          await page.waitForTimeout(150);
          if (change === 'held, then finished') {
            await releaseAnimations(page, {finish: true});
          } else {
            await seekAnimations(page, 10_000 - 300);
            await releaseAnimations(page);
          }
        }
        const dated = await page.evaluate(
          () =>
            (
              window as unknown as {
                __exitDated: Promise<{start: number; end: number} | null>;
              }
            ).__exitDated,
        );
        expect(dated, label).not.toBeNull();
        const [exit] = await watch.started();
        expect(exit.finishedAt, label).not.toBeNull();
        // From the engine's own instants: within the timeline's rounding.
        expect
          .soft(Math.abs(exit.from - (dated?.start ?? 0)), `${label}: from`)
          .toBeLessThanOrEqual(1);
        expect
          .soft(
            Math.abs((exit.finishedAt ?? 0) - (dated?.end ?? 0)),
            `${label}: finishedAt`,
          )
          .toBeLessThanOrEqual(1);
      }
    });
  }

  test('a run going backward is dated from when it began: with a delay, ended before the look, or cancelled when it ends', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    const frames = [
      {translate: '0px 0px', offset: 0},
      {translate: '100px 0px', offset: 1},
    ];
    // When a run going backward began, by the engine's own clock. It starts
    // at its end: while it runs, its current time has come down from there
    // by as much as the timeline has moved since, read at one instant (a
    // performance.now() read after `ready` drifts later under load). A
    // starved page can reach `ready` after a short run has already ended,
    // when its current time has stopped at 0: then only its start time,
    // which the engine set a whole run after it began, still says when. Read
    // at the first of `ready` and its finish, before the page can cancel it.
    await page.evaluate(() => {
      Object.assign(window, {
        __dateBackwardRun(animation: Animation) {
          let begun = Number.NaN;
          const byStart = () => {
            if (Number.isNaN(begun) && animation.startTime != null) {
              const end = Number(
                animation.effect?.getComputedTiming().endTime ?? 0,
              );
              begun =
                Number(animation.startTime) -
                end / Math.abs(animation.playbackRate);
            }
          };
          animation.addEventListener('finish', byStart, {once: true});
          return () => {
            if (Number.isNaN(begun) && animation.playState === 'running') {
              const end = Number(
                animation.effect?.getComputedTiming().endTime ?? 0,
              );
              begun =
                Number(document.timeline.currentTime) -
                (end - Number(animation.currentTime)) /
                  Math.abs(animation.playbackRate);
            }
            byStart();
            return performance.timeOrigin + begun;
          };
        },
      });
    });

    // A 300 ms delay plays last when going backward: the curve starts at once.
    let watch = await watchAnimations(box);
    let begunAt = await box.evaluate(async (el, keyframes) => {
      const animation = el.animate(keyframes, {duration: 400, delay: 300});
      const begun = (
        window as unknown as {
          __dateBackwardRun: (animation: Animation) => () => number;
        }
      ).__dateBackwardRun(animation);
      animation.reverse();
      await animation.ready;
      return begun();
    }, frames);
    const [delayed] = await watch.started();
    // Both dates come from the engine's own instants (its start and timeline
    // times), so they agree to the timeline's rounding: a millisecond at most.
    expect(Math.abs(delayed.from - begunAt)).toBeLessThanOrEqual(1);
    expect(delayed.to - delayed.from).toBeCloseTo(400, 0);
    await box.evaluate(el => el.getAnimations().forEach(a => a.finish()));

    // A short one that ended before the look keeps its curve inside its life.
    watch = await watchAnimations(box);
    begunAt = await box.evaluate(async (el, keyframes) => {
      const animation = el.animate(keyframes, {duration: 60});
      const begun = (
        window as unknown as {
          __dateBackwardRun: (animation: Animation) => () => number;
        }
      ).__dateBackwardRun(animation);
      animation.reverse();
      await animation.ready;
      return begun();
    }, frames);
    await page.waitForTimeout(200);
    const [ended] = await watch.started();
    expect(ended.finishedAt).not.toBeNull();
    expect(Math.abs(ended.from - begunAt)).toBeLessThanOrEqual(1);
    // It finished where its curve ends, by the engine's clock: not when its
    // finish event arrived, a frame or so later.
    expect(Math.abs((ended.finishedAt ?? 0) - ended.to)).toBeLessThanOrEqual(1);

    // One the page cancels when it ends keeps its start.
    watch = await watchAnimations(box);
    begunAt = await box.evaluate(async (el, keyframes) => {
      const animation = el.animate(keyframes, {duration: 60});
      // Dated before the page's own finish listener cancels it.
      const begun = (
        window as unknown as {
          __dateBackwardRun: (animation: Animation) => () => number;
        }
      ).__dateBackwardRun(animation);
      animation.addEventListener('finish', () => animation.cancel(), {
        once: true,
      });
      animation.reverse();
      await animation.ready;
      return begun();
    }, frames);
    await page.waitForTimeout(200);
    const [cancelled] = await watch.started();
    expect(Math.abs(cancelled.from - begunAt)).toBeLessThanOrEqual(1);
    expect(cancelled.to - cancelled.from).toBeCloseTo(60, 0);

    // Read right after finish(), before the finish event is delivered: the
    // scheduled end goes through the rate (backward, it is the startTime).
    for (const rate of [-1, 2]) {
      watch = await watchAnimations(box);
      await box.evaluate(
        async (el, [keyframes, playbackRate]) => {
          const animation = el.animate(keyframes as Keyframe[], {
            duration: 1000,
          });
          animation.playbackRate = playbackRate as number;
          await animation.ready;
          animation.finish();
        },
        [frames, rate] as const,
      );
      const [read] = await watch.started();
      expect(read.finishedAt).not.toBeNull();
      // Both from the engine's own instants: within the timeline's rounding.
      expect(Math.abs((read.finishedAt ?? 0) - read.to)).toBeLessThanOrEqual(1);
    }

    // Going backward, an end delay presents nothing: a run still inside it
    // has not progressed.
    await box.evaluate((el, keyframes) => {
      const animation = el.animate(keyframes, {duration: 400, endDelay: 500});
      animation.reverse();
    }, frames);
    await expect(
      waitForAnimation(box, {minProgressMs: 100, timeout: 300}),
    ).rejects.toThrow();
    await box.evaluate(el => el.getAnimations().forEach(a => a.finish()));

    // Nor is it rest: waitForRest waits out the end delay and the curve.
    const restFrom = await box.evaluate((el, keyframes) => {
      el.animate(keyframes, {duration: 600, endDelay: 500}).reverse();
      return performance.now();
    }, frames);
    await waitForRest(box, {timeout: 5_000});
    const restAt = await box.evaluate(() => performance.now());
    expect(restAt - restFrom).toBeGreaterThan(1_000);
  });

  test('an end value held by the keyframes is not part of the curve, and individual transform properties are sampled', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // 300 ms of motion on the individual `translate` and `scale` properties,
    // then 5 s holding the end values: playState stays 'running' throughout.
    await box.evaluate(el => {
      el.animate(
        [
          {translate: '0px 0px', scale: '1', offset: 0},
          {translate: '0px 120px', scale: '1.5', offset: 300 / 5300},
          {translate: '0px 120px', scale: '1.5', offset: 1},
        ],
        {duration: 5300, fill: 'forwards'},
      );
    });
    const startedAt = await page.evaluate(() => performance.now());
    const [active] = await waitForAnimation(box);
    expect(active.to - active.from).toBeCloseTo(300, 0); // the curve, not the hold
    await waitForRest(box, {timeout: 3_000});
    const after = await box.evaluate(el => ({
      at: performance.now(),
      running: el.getAnimations().some(a => a.playState === 'running'),
      translate: getComputedStyle(el).translate,
    }));
    expect(after.running).toBe(true); // still holding its end value
    expect(after.at - startedAt).toBeGreaterThanOrEqual(300);
    expect(after.at - startedAt).toBeLessThan(1_500);
    expect(after.translate).toBe('0px 120px');

    const held = await holdAnimations(page, box, {
      judges: {target: box, property: 'translate'},
    });
    expect(held[0].curveEndMs).toBeCloseTo(300, 0);
    const [mid, end] = await sampleCurve(box, [150, 300]);
    expect(mid.raw.translate).toBe('0px 60px');
    expect(mid.transform.translateY).toBeCloseTo(60, 1);
    expect(mid.transform.scaleX).toBeCloseTo(1.25, 3);
    expect(end.transform.translateY).toBeCloseTo(120, 1);
    expect(end.transform.scaleY).toBeCloseTo(1.5, 3);
  });
});

test.describe('evidence files', () => {
  test('evidence reaches the report with no file copy inside the test', async ({
    browserName: _,
  }, testInfo) => {
    // A file copy that never returns, as one on a loaded runner has waited
    // past a test's whole budget: the evidence must not wait on one inside
    // the test's own time.
    test.setTimeout(15_000);
    const promises = fs.promises as unknown as {copyFile: unknown};
    const copyFile = promises.copyFile;
    let copies = 0;
    promises.copyFile = async () => {
      copies += 1;
      await new Promise(() => {});
    };
    try {
      const written = await writeEvidence(
        'harness-self-test/evidence',
        {'a.json': '{"ok":true}'},
        testInfo,
      );
      expect(copies).toBe(0);
      // The file stays for local paths, and the report has its bytes.
      expect(fs.readFileSync(written['a.json'], 'utf8')).toBe('{"ok":true}');
      const attachment = testInfo.attachments.find(
        a => a.name === 'harness-self-test/evidence/a.json',
      );
      expect(attachment?.contentType).toBe('application/json');
      expect(String(attachment?.body)).toBe('{"ok":true}');
    } finally {
      promises.copyFile = copyFile;
    }
  });
});

test.describe('storyboards', {tag: '@storyboard'}, () => {
  test('an animation filmstrip records every frame and its trace follows the curve', async ({
    page,
  }, testInfo) => {
    await fixture(page);
    const box = page.locator('#box');
    // Armed before the 200 ms run starts, so a busy runner cannot end it
    // before the film holds it.
    const hold = await armHold(page, box, {
      judges: {target: box, property: 'transform'},
    });
    await box.evaluate(el =>
      el.animate(
        [{transform: 'translateX(0)'}, {transform: 'translateX(240px)'}],
        {duration: 200, easing: 'ease-out'},
      ),
    );
    const {storyboard} = await animationStoryboard(page, {
      held: await hold.held(),
      name: 'harness-self-test-animation',
      clip: {x: 0, y: 340, width: 402, height: 120},
      measure: async () => ({
        x: await box.evaluate(el => el.getBoundingClientRect().x),
      }),
      columns: 4,
    });
    const files = await storyboard.write(testInfo);
    const xs = storyboard.frames.map(f => f.data.x as number);
    expect(xs).toHaveLength(13); // t = 0, 16.7 … 200
    expect(xs[0]).toBeCloseTo(20, 1);
    expect(xs.at(-1)).toBeCloseTo(260, 1);
    expect(xs.every((x, i) => i === 0 || x >= xs[i - 1])).toBe(true);
    expect(files['sheet.png']).toMatch(/sheet\.png$/);
  });

  test('a capture the engine fails throws its error and records no frame', async ({
    page,
  }) => {
    await fixture(page);
    // What Chromium answers when its surface copy comes back empty.
    let photographs = 0;
    page.screenshot = (async () => {
      photographs += 1;
      throw new Error(
        'page.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot',
      );
    }) as Page['screenshot'];
    const storyboard = new Storyboard(page, {
      name: 'harness-self-test-capture-error',
      clip: {x: 0, y: 340, width: 402, height: 120},
    });
    await expect(storyboard.capture('t=0 ms', 0)).rejects.toThrow(
      /Unable to capture screenshot/,
    );
    expect(photographs).toBe(1);
    expect(storyboard.frames).toHaveLength(0);
    expect(storyboard.trace()).not.toHaveProperty('recaptures');
  });

  test('a touch filmstrip photographs every scripted event', async ({
    page,
  }, testInfo) => {
    await fixture(page);
    await page.evaluate(() => {
      const pad = document.getElementById('pad');
      if (pad == null) {
        throw new Error('no pad');
      }
      const dot = document.createElement('div');
      dot.id = 'dot';
      dot.style.cssText =
        'position:absolute;width:24px;height:24px;border-radius:12px;background:#c33;left:-30px;top:0';
      pad.append(dot);
      pad.addEventListener('pointermove', e => {
        dot.style.transform = `translate(${e.clientX - 12 + 30}px, ${e.clientY - 12}px)`;
      });
    });
    const driver = await touchDriver(page);
    const storyboard = await touchStoryboard(
      page,
      driver,
      drag({x: 60, y: 60}, {x: 300, y: 240}, {durationMs: 100, hz: 60}),
      {
        name: 'harness-self-test-touch',
        clip: {x: 0, y: 0, width: 402, height: 300},
        measure: async () => ({
          x: await page
            .locator('#dot')
            .evaluate(el => el.getBoundingClientRect().x + 12),
        }),
        columns: 4,
      },
    );
    await storyboard.write(testInfo);
    // before + touchStart + 6 moves + touchEnd
    expect(storyboard.frames).toHaveLength(9);
    expect(storyboard.frames.at(-2)?.data.x).toBeCloseTo(300, 0);
  });

  test('a touch filmstrip keeps the scripted event times, and a handler clock sees its pacing', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'WebKit stamps events with their real dispatch time',
    );
    await fixture(page);
    await page.evaluate(() => {
      const w = window as unknown as {__moves: [number, number][]};
      w.__moves = [];
      document.getElementById('pad')?.addEventListener('pointermove', e => {
        w.__moves.push([e.timeStamp, performance.now()]);
      });
    });
    const driver = await touchDriver(page);
    await touchStoryboard(
      page,
      driver,
      drag({x: 60, y: 60}, {x: 300, y: 240}, {durationMs: 100, hz: 60}),
      {
        name: 'harness-self-test-touch-clock',
        clip: {x: 0, y: 0, width: 402, height: 300},
      },
    );
    const moves = await page.evaluate(
      () => (window as unknown as {__moves: [number, number][]}).__moves,
    );
    const gaps = (column: 0 | 1) =>
      moves.slice(1).map((move, i) => move[column] - moves[i][column]);
    expect(moves.length).toBeGreaterThanOrEqual(5);
    // The events carry the script's 60 Hz times…
    for (const gap of gaps(0)) {
      expect(gap).toBeCloseTo(1000 / 60, 0);
    }
    // …but the clock a handler reads advances by a photograph per event.
    for (const gap of gaps(1)) {
      expect(gap).toBeGreaterThan(2 * (1000 / 60));
    }
  });

  test("the harness's own waits run on the real timers: a frozen timer gate holds neither blockMainThread's block nor sampleRects", async ({
    page,
  }) => {
    await fixture(page);
    await installTimerGate(page);
    const box = page.locator('#box');
    await box.evaluate(el => {
      el.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(200px)'}],
        {duration: 1_500, easing: 'linear'},
      );
    });
    await freezeTimers(page);
    // Settled, or still held after 5 s.
    const within = (work: Promise<unknown>) =>
      Promise.race([
        work.then(() => 'settled'),
        new Promise<string>(resolve =>
          setTimeout(() => resolve('held'), 5_000),
        ),
      ]);
    expect(
      await within(blockMainThread(page, 100, {during: box, timeout: 2_000})),
    ).toBe('settled');
    expect(await within(sampleRects(box, 200))).toBe('settled');
    await thawTimers(page);
  });

  test("blockMainThread with during names a block that would begin in the motion's held tail, and waits past an older run held there", async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // Moves for its first 30%, then holds its end value: its curve ends at
    // 900 ms of 3 s.
    const held = [
      {transform: 'translateX(0px)', offset: 0},
      {transform: 'translateX(200px)', offset: 0.3},
      {transform: 'translateX(200px)', offset: 1},
    ];
    // Started while the page waits, already 1.5 s in: past its curve, so a
    // block now would judge a run that has stopped.
    const late = blockMainThread(page, 100, {during: box, timeout: 2_000}).then(
      () => null,
      (error: unknown) => error,
    );
    await page.waitForTimeout(100);
    await box.evaluate((el, keyframes) => {
      const run = el.animate(keyframes, {duration: 3_000, easing: 'linear'});
      run.currentTime = 1_500;
    }, held);
    const error = await late;
    expect(error).toBeInstanceOf(BusyWindowTooLateError);
    const {numbers} = error as BusyWindowTooLateError;
    expect(numbers.curveEndMs).toBeCloseTo(900, 3);
    expect(numbers.currentTimeMs).toBeGreaterThanOrEqual(1_500);
    expect(numbers.startedWhileWaiting).toBe(1);
    // That run still holds its end when the next wait begins: the page waits
    // for one that moves, and blocks while it does.
    const moving = blockMainThread(page, 100, {during: box, timeout: 2_000});
    await page.waitForTimeout(100);
    const startedAt = await box.evaluate(el => {
      el.animate([{translate: '0 0'}, {translate: '0 100px'}], {
        duration: 1_000,
        easing: 'linear',
      });
      return performance.timeOrigin + performance.now();
    });
    const window = await moving;
    expect(window.from).toBeGreaterThan(startedAt);
  });

  test("blockMainThread with during and a pseudoElement starts on that pseudo-element's animation, not on a child's earlier one", async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // A child, as a switch's thumb, and a fade on the box's ::after, as the
    // switch track's.
    await box.evaluate(el => {
      const style = document.createElement('style');
      style.textContent =
        '#box::after{content:"";position:absolute;inset:0;background:#000;opacity:0}';
      document.head.append(style);
      const child = document.createElement('div');
      child.style.cssText = 'width:20px;height:20px;background:#c33';
      el.append(child);
    });
    const blocking = blockMainThread(page, 100, {
      during: box,
      pseudoElement: '::after',
      minProgressMs: 50,
      timeout: 3_000,
    });
    await page.waitForTimeout(100);
    // The child's press starts first, and the fade 300 ms after it.
    const fadeStartedAt = await box.evaluate(async el => {
      (el.firstElementChild as HTMLElement).animate(
        [{scale: '1'}, {scale: '0.9'}],
        {duration: 1_000, fill: 'forwards'},
      );
      await new Promise(resolve => setTimeout(resolve, 300));
      el.animate([{opacity: 0}, {opacity: 1}], {
        duration: 1_000,
        pseudoElement: '::after',
      });
      return performance.timeOrigin + performance.now();
    });
    const window = await blocking;
    // The block began once the fade had run 50 ms, never on the child.
    expect(window.from).toBeGreaterThanOrEqual(fadeStartedAt + 50);
    // A pseudo-element names a part of `during`, so it needs one.
    await expect(
      blockMainThread(page, 100, {pseudoElement: '::after'}),
    ).rejects.toThrow(/pass `during` too/);
  });

  test('blockMainThread with during waits a frame for an animation rebuilt on its old clock, and names the animation it caught', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // When each of the page's frames ran, page ms.
    await page.evaluate(() => {
      const w = window as unknown as {frameTimes: number[]};
      w.frameTimes = [];
      const count = () => {
        w.frameTimes.push(performance.now());
        requestAnimationFrame(count);
      };
      requestAnimationFrame(count);
    });
    const blocking = blockMainThread(page, 100, {during: box, timeout: 3_000});
    await page.waitForTimeout(100);
    // A travel rebuilt 200 ms into its curve, between two frames: the page
    // first sees it running and not pending.
    const rebuilt = await box.evaluate(
      el =>
        new Promise<{framesBefore: number; startTime: number}>(resolve => {
          setTimeout(() => {
            const run = el.animate(
              [{translate: '0 0'}, {translate: '200px 0'}],
              {duration: 1_000, easing: 'linear'},
            );
            run.startTime = Number(document.timeline.currentTime) - 200;
            resolve({
              framesBefore: (window as unknown as {frameTimes: number[]})
                .frameTimes.length,
              startTime: Number(run.startTime),
            });
          }, 0);
        }),
    );
    const held = await blocking;
    // Frames that ran after the travel was built and up to the block. WebKit
    // reads its clock to the millisecond, so a frame can share the block's
    // start time. That frame still ran before the block, which no frame
    // interrupts.
    const framesBefore = await page.evaluate(
      ([first, from]) =>
        (window as unknown as {frameTimes: number[]}).frameTimes
          .slice(first)
          .filter(t => t <= from - performance.timeOrigin).length,
      [rebuilt.framesBefore, held.from] as const,
    );
    // The frame that first saw it, and the frame after, ran before the block.
    expect(framesBefore).toBeGreaterThanOrEqual(2);
    // The window names that animation: its start, and its curve's end.
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    const caught = held.animation;
    expect(caught).toBeDefined();
    expect(caught?.from).toBeCloseTo(timeOrigin + rebuilt.startTime, 3);
    expect((caught?.to ?? 0) - (caught?.from ?? 0)).toBeCloseTo(1_000, 3);
  });

  test('blockMainThread with during and a property starts on an animation of that property, not on an earlier one of another', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    const blocking = blockMainThread(page, 100, {
      during: box,
      property: 'translate',
      minProgressMs: 50,
      timeout: 3_000,
    });
    await page.waitForTimeout(100);
    // A press scale starts first, and the travel 300 ms after it.
    const travelStartedAt = await box.evaluate(async el => {
      el.animate([{scale: '1'}, {scale: '0.9'}], {
        duration: 1_000,
        fill: 'forwards',
      });
      await new Promise(resolve => setTimeout(resolve, 300));
      el.animate([{translate: '0 0'}, {translate: '200px 0'}], {
        duration: 1_000,
      });
      return performance.timeOrigin + performance.now();
    });
    const held = await blocking;
    // The block began once the travel had run 50 ms, never on the scale.
    expect(held.from).toBeGreaterThanOrEqual(travelStartedAt + 50);
    // A property picks an animation of `during`, so it needs one.
    await expect(
      blockMainThread(page, 100, {property: 'translate'}),
    ).rejects.toThrow(/pass `during` too/);
  });

  test('blockMainThread with during takes a property as CSS names it, a custom property too, and offset names no animation', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    const colour = blockMainThread(page, 50, {
      during: box,
      property: 'background-color',
      minProgressMs: 50,
      timeout: 3_000,
    });
    await box.evaluate(el => {
      el.animate(
        [
          {backgroundColor: 'rgb(255, 0, 0)'},
          {backgroundColor: 'rgb(0, 0, 255)'},
        ],
        {duration: 1_000},
      );
    });
    // The block waits for 50 ms of the colour by the colour's own clock,
    // whether it watches before the animation starts or after.
    const heldColour = await colour;
    expect(heldColour.animation).toBeDefined();
    expect(heldColour.from).toBeGreaterThanOrEqual(
      (heldColour.animation?.from ?? Infinity) + 50,
    );
    // A custom property keeps its CSS name in the keyframes.
    const press = blockMainThread(page, 50, {
      during: box,
      property: '--press-strength',
      minProgressMs: 50,
      timeout: 3_000,
    });
    await box.evaluate(el => {
      el.animate([{'--press-strength': '0'}, {'--press-strength': '1'}], {
        duration: 1_000,
      });
    });
    const heldPress = await press;
    expect(heldPress.animation).toBeDefined();
    expect(heldPress.from).toBeGreaterThanOrEqual(
      (heldPress.animation?.from ?? Infinity) + 50,
    );
    // Every keyframe names its offset, but no animation sets it. A long scale
    // runs for the whole wait.
    await box.evaluate(el => {
      el.animate([{scale: '1'}, {scale: '0.9'}], {duration: 5_000});
    });
    await expect(
      blockMainThread(page, 50, {
        during: box,
        property: 'offset',
        timeout: 500,
      }),
    ).rejects.toThrow(/no animation started/);
  });

  test("blockMainThread with during names the action's run that ended before its wait began, and no other run", async ({
    page,
  }) => {
    await fixture(page);
    // The wait waits on `#box.late`, which matches nothing until the page
    // adds the class. So the wait begins late. The page starts a run after
    // the call and cancels it while it plays, as Core's animator retires a
    // run at its curve's end. Then it adds the class: the run ended before
    // the wait began, as when a late runner delivers the action first.
    const waitAfter = async (
      property: string,
      run?: {target: string; keyframes: Keyframe[]},
    ) => {
      const waited = blockMainThread(page, 50, {
        during: page.locator('#box.late'),
        property,
        timeout: 300,
      }).then(
        () => null,
        (error: unknown) => error,
      );
      await page.evaluate(
        started =>
          new Promise<void>(resolve => {
            const animation =
              started == null
                ? null
                : document
                    .querySelector(started.target)
                    ?.animate(started.keyframes, {duration: 1_000});
            setTimeout(() => {
              animation?.cancel();
              document.getElementById('box')?.classList.add('late');
              resolve();
            }, 100);
          }),
        run ?? null,
      );
      const outcome = await waited;
      await page.evaluate(() =>
        document.getElementById('box')?.classList.remove('late'),
      );
      return outcome;
    };
    const isBare = (outcome: unknown) => {
      expect(outcome).not.toBeInstanceOf(BusyWindowTooLateError);
      expect(String(outcome)).toMatch(/no animation started/);
    };
    const travel = [{translate: '0px'}, {translate: '40px'}];
    // Nothing ran: no start.
    isBare(await waitAfter('translate'));
    // A run outside `during`, and a run of another property: no start.
    isBare(await waitAfter('translate', {target: 'body', keyframes: travel}));
    isBare(
      await waitAfter('translate', {
        target: '#box',
        keyframes: [{opacity: 1}, {opacity: 0.2}],
      }),
    );
    // A travel that began and ended before the call is an earlier action's.
    await page.evaluate(
      keyframes =>
        new Promise<void>(resolve => {
          const run = document
            .getElementById('box')
            ?.animate(keyframes, {duration: 1_000});
          setTimeout(() => {
            run?.cancel();
            resolve();
          }, 100);
        }),
      travel,
    );
    isBare(await waitAfter('translate'));
    // The action's travel began after the call and ended before the wait: the
    // wait names that, with both times.
    const named = await waitAfter('translate', {
      target: '#box',
      keyframes: travel,
    });
    expect(named).toBeInstanceOf(BusyWindowTooLateError);
    const {message, numbers} = named as BusyWindowTooLateError;
    expect(numbers.endedBeforeWaitMs).toBeGreaterThan(0);
    expect(
      numbers.startedBeforeWaitMs - numbers.endedBeforeWaitMs,
    ).toBeGreaterThanOrEqual(50);
    expect(message).toMatch(
      /began \d+ ms before the page began to wait and ended \d+ ms before it/,
    );
  });

  test('a recorder that blockMainThread starts reads nothing per frame, and the first wait adopts it as if it started then', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // Counts the page's document-wide animation reads: each one flushes
    // style, and the recorder's frame loop makes one every frame.
    await page.evaluate(() => {
      const w = window as unknown as {__reads: number};
      w.__reads = 0;
      const read = document.getAnimations.bind(document);
      document.getAnimations = () => {
        w.__reads += 1;
        return read();
      };
    });
    const reads = () =>
      page.evaluate(() => (window as unknown as {__reads: number}).__reads);
    await expect(
      blockMainThread(page, 50, {during: box, timeout: 200}),
    ).rejects.toThrow(/no animation started/);
    // A run plays and finishes over a dozen frames: a passive recorder logs
    // it, with no read.
    await box.evaluate(
      el =>
        new Promise<void>(resolve => {
          el.animate([{scale: '1'}, {scale: '0.9'}], {duration: 200}).onfinish =
            () => resolve();
        }),
    );
    expect(await reads()).toBe(0);
    // The first wait adopts the recorder, and its frame loop starts. The wait
    // counts only what starts from its call, as on a page it touches first.
    await expect(waitForAnimation(box, {timeout: 300})).rejects.toThrow(
      /no animation started/,
    );
    expect(await reads()).toBeGreaterThan(0);
  });

  test('blockMainThread with during names an animation rebuilt at every frame, which it never holds, at its timeout', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // Each frame replaces the travel with a new one on the same clock, as an
    // animator that rebuilds its run while it follows.
    await box.evaluate(el => {
      const w = window as unknown as {stopRebuilding?: boolean};
      let start: number | null = null;
      const rebuild = () => {
        if (w.stopRebuilding === true) {
          return;
        }
        for (const animation of el.getAnimations()) {
          animation.cancel();
        }
        const run = el.animate([{translate: '0 0'}, {translate: '200px 0'}], {
          duration: 5_000,
        });
        start ??= Number(document.timeline.currentTime);
        run.startTime = start;
        requestAnimationFrame(rebuild);
      };
      requestAnimationFrame(rebuild);
    });
    await expect(
      blockMainThread(page, 100, {during: box, timeout: 600}),
    ).rejects.toThrow(/no animation of `during` ran on two frames in a row/);
    await box.evaluate(el => {
      (window as unknown as {stopRebuilding?: boolean}).stopRebuilding = true;
      for (const animation of el.getAnimations()) {
        animation.cancel();
      }
    });
  });

  test('blockMainThread with during names a late block when the run it saw held ends before the wait times out', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // Already in its held tail (its curve ends at 900 ms of 3 s) when the
    // wait begins, then cancelled, as Core's animator cancels a held run
    // once its curve ends: nothing runs when the wait times out.
    await box.evaluate(el => {
      const run = el.animate(
        [
          {transform: 'translateX(0px)', offset: 0},
          {transform: 'translateX(200px)', offset: 0.3},
          {transform: 'translateX(200px)', offset: 1},
        ],
        {duration: 3_000, easing: 'linear'},
      );
      run.currentTime = 1_500;
      (window as unknown as {heldRun: Animation}).heldRun = run;
    });
    await page.waitForTimeout(100);
    const late = blockMainThread(page, 100, {during: box, timeout: 1_000}).then(
      () => null,
      (error: unknown) => error,
    );
    await page.waitForTimeout(300);
    await page.evaluate(() =>
      (window as unknown as {heldRun: Animation}).heldRun.cancel(),
    );
    const error = await late;
    expect(error).toBeInstanceOf(BusyWindowTooLateError);
    const {numbers} = error as BusyWindowTooLateError;
    expect(numbers.curveEndMs).toBeCloseTo(900, 3);
    expect(numbers.currentTimeMs).toBeGreaterThanOrEqual(1_500);
    expect(numbers.startedWhileWaiting).toBe(0);
  });

  test('the timer gate holds a component timer until the filmstrip is done', async ({
    page,
  }, testInfo) => {
    await fixture(page);
    await installTimerGate(page);
    const box = page.locator('#box');
    // The gate is frozen and the hold armed before the component's timer is
    // set and its 300 ms run starts, so on a busy runner neither the timer
    // nor the run's end can come before them.
    await freezeTimers(page);
    const hold = await armHold(page, box, {
      judges: {target: box, property: 'transform'},
    });
    // A component that ends its own animation from a timer (a transitionend
    // backstop): without the gate it would finish behind the held storyboard.
    await box.evaluate(el => {
      const animation = el.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(200px)'}],
        {duration: 300, easing: 'linear'},
      );
      setTimeout(() => {
        animation.finish();
        (window as unknown as {timerRan?: boolean}).timerRan = true;
      }, 40);
    });
    const held = await hold.held();
    await page.waitForTimeout(120); // the timer is due now, and held
    const {storyboard} = await animationStoryboard(page, {
      held,
      name: 'harness-self-test-timer-gate',
      clip: {x: 0, y: 340, width: 402, height: 120},
      measure: async () => ({
        x: await box.evaluate(el => el.getBoundingClientRect().x),
      }),
      columns: 6,
    });
    const timerRan = () =>
      page.evaluate(
        () => (window as unknown as {timerRan?: boolean}).timerRan === true,
      );
    expect(await timerRan()).toBe(false);
    await thawTimers(page);
    expect(await timerRan()).toBe(true);
    await storyboard.write(testInfo);
    const xs = storyboard.frames.map(f => f.data.x as number);
    expect(xs).toHaveLength(19); // t = 0 … 300 ms every 16.7 ms
    expect(xs.every((x, i) => i === 0 || x > xs[i - 1])).toBe(true);
  });

  test('an animation that repeats forever does not set the filmstrip length', async ({
    page,
  }, testInfo) => {
    await fixture(page);
    // Armed before the 200 ms fade starts, so a busy runner cannot end it
    // before the film holds it.
    const hold = await armHold(page, page.locator('#box'), {
      judges: {target: page.locator('#box'), property: 'rotate'},
    });
    await page.locator('#box').evaluate(el => {
      el.animate([{rotate: '0deg'}, {rotate: '360deg'}], {
        duration: 800,
        iterations: Infinity,
      });
      el.animate([{opacity: 1}, {opacity: 0.4}], {duration: 200});
    });
    const {storyboard, held} = await animationStoryboard(page, {
      held: await hold.held(),
      name: 'harness-self-test-endless',
      clip: {x: 0, y: 340, width: 402, height: 120},
      columns: 4,
    });
    expect(held.map(a => Number.isFinite(a.curveEndMs))).toEqual([false, true]);
    expect(storyboard.frames).toHaveLength(13); // t = 0 … 200 ms
    await releaseAnimations(page);
    await storyboard.write(testInfo);
  });

  test('a filmstrip runs from the earliest start to the latest end among the animations that end', async ({
    page,
  }, testInfo) => {
    await fixture(page);
    // A spinner that started a second earlier, a 300 ms move, and a 240 ms
    // move that starts 83 ms after it. The page holds all three once the
    // second move runs, so a busy runner cannot end the first move before the
    // film holds it.
    const hold = await armHold(page, undefined, {
      judges: [
        {target: page.locator('#first'), property: 'transform'},
        {target: page.locator('#second'), property: 'transform'},
      ],
      count: 3,
    });
    await page.evaluate(async () => {
      const make = (id: string, top: number) => {
        const el = document.createElement('div');
        el.id = id;
        el.style.cssText = `position:absolute;left:0;top:${top}px;width:40px;height:40px;background:#36c`;
        document.body.append(el);
        return el;
      };
      document
        .getElementById('box')
        ?.animate([{rotate: '0deg'}, {rotate: '360deg'}], {
          duration: 800,
          iterations: Infinity,
        });
      await new Promise(resolve => setTimeout(resolve, 1000));
      const first = make('first', 360).animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(300px)'}],
        {duration: 300, easing: 'linear'},
      );
      const second = make('second', 410).animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(240px)'}],
        {duration: 240, easing: 'linear'},
      );
      // The second starts 83 ms after the first on the document timeline
      // itself, however late a busy runner would fire a timer between them.
      const now = Number(document.timeline.currentTime);
      first.startTime = now;
      second.startTime = now + 83;
    });
    const x = (id: string) =>
      page
        .locator(`#${id}`)
        .evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
    const {storyboard, held} = await animationStoryboard(page, {
      held: await hold.held(),
      name: 'harness-self-test-offsets',
      clip: {x: 0, y: 340, width: 402, height: 120},
      columns: 6,
      measure: async () => ({
        first: await x('first'),
        second: await x('second'),
      }),
    });
    const second = held.find(a => a.target === 'div#second');
    const first = held.find(a => a.target === 'div#first');
    const lag = (second?.offsetMs ?? 0) - (first?.offsetMs ?? 0);
    const firsts = storyboard.frames.map(f => Number(f.data.first));
    const seconds = storyboard.frames.map(f => Number(f.data.second));
    // The film starts with the first move at its start, the spinner aside...
    expect(firsts[0]).toBeCloseTo(0, 1);
    expect(firsts[6]).toBeCloseTo(100, 0);
    // ...and ends with the second move at its end, not cut off.
    expect(seconds.at(-1)).toBeGreaterThan(239);
    expect(storyboard.frames.at(-1)?.t).toBeCloseTo(lag + 240, 0);
    await releaseAnimations(page);
    await storyboard.write(testInfo);
  });

  test('a filmstrip of endless animations alone asks for its times', async ({
    page,
  }) => {
    await fixture(page);
    await page.locator('#box').evaluate(el =>
      el.animate([{rotate: '0deg'}, {rotate: '360deg'}], {
        duration: 800,
        iterations: Infinity,
      }),
    );
    await expect(
      animationStoryboard(page, {
        name: 'harness-self-test-endless-only',
        judges: {target: page.locator('#box'), property: 'rotate'},
        clip: {x: 0, y: 340, width: 402, height: 120},
      }),
    ).rejects.toThrow(/repeats forever/);
    await releaseAnimations(page);
  });

  test('the timer gate drops callbacks the page cancels and stamps held frames with the time they run', async ({
    page,
  }) => {
    await fixture(page);
    await installTimerGate(page);
    await freezeTimers(page);
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      w.frozenAt = performance.now();
      w.timer = setTimeout(() => {
        w.cancelledTimerRan = true;
      }, 20);
      w.frame = requestAnimationFrame(() => {
        w.cancelledFrameRan = true;
      });
      requestAnimationFrame(time => {
        w.heldFrameTime = time;
      });
    });
    await page.waitForTimeout(150); // both are due now, and held
    // The harness's own frame waits still resolve while the page's are held.
    await Promise.race([
      frames(page, 2),
      page.waitForTimeout(5000).then(() => {
        throw new Error('frames() did not resolve while the gate was frozen');
      }),
    ]);
    await page.evaluate(() => {
      const w = window as unknown as {timer: number; frame: number};
      clearTimeout(w.timer);
      cancelAnimationFrame(w.frame);
    });
    await thawTimers(page);
    const state = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      return {
        timer: w.cancelledTimerRan === true,
        frame: w.cancelledFrameRan === true,
        heldFor: Number(w.heldFrameTime) - Number(w.frozenAt),
      };
    });
    expect(state).toMatchObject({timer: false, frame: false});
    expect(state.heldFor).toBeGreaterThanOrEqual(140);
  });

  test('a cast filmstrip keeps exactly the presented frames of its window, labelled from its zero', async ({
    page,
  }, testInfo) => {
    await fixture(page);
    const box = page.locator('#box');
    // JPEG frames (WebKit's are always JPEG) take the conversion path.
    const cast = await startScreencast(page, {format: 'jpeg'});
    // The slide repeats until the cast holds the nine frames its window needs:
    // a loaded runner presents fewer of them in any fixed time.
    await box.evaluate(el =>
      el.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(200px)'}],
        {duration: 600, iterations: Infinity},
      ),
    );
    await waitForCastFrames(cast, 9, 'the slide repeated');
    const presented = await cast.stop();
    await box.evaluate(el => el.getAnimations().forEach(a => a.cancel()));
    expect(presented.length).toBeGreaterThan(8);
    // A window of the middle frames, zeroed on one of them.
    const zero = presented[2].t;
    const from = presented[3].t;
    const to = presented[presented.length - 3].t;
    const inside = presented.filter(f => f.t >= from && f.t <= to);
    const seen: number[] = [];
    const film = await castStoryboard(page, presented, {
      name: 'harness-self-test-cast',
      zero,
      from,
      to,
      data: t => {
        seen.push(t);
        return {t};
      },
    });
    expect(film.frames.map(f => f.t)).toEqual(inside.map(f => f.t - zero));
    expect(film.frames.map(f => f.label)).toEqual(
      inside.map(f => `t=${(f.t - zero).toFixed(1)} ms`),
    );
    expect(seen).toEqual(inside.map(f => f.t));
    // Every cell is a PNG, whatever the screencast delivered.
    for (const frame of film.frames) {
      expect([...frame.png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
    const files = await film.write(testInfo);
    expect(files['sheet.png']).toMatch(/sheet\.png$/);
    // A window with no presented frame in it films nothing.
    const empty = await castStoryboard(page, presented, {
      name: 'harness-self-test-cast-empty',
      zero,
      from: to + 1,
      to: to + 2,
    });
    expect(empty.frames).toEqual([]);
    await expect(empty.write(testInfo)).rejects.toThrow(/no frames/);
  });
});

const FREEZE_FIXTURE = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<style>body{margin:0} #box{position:absolute;left:0;top:40px;width:40px;height:40px;background:#0a7}</style>
<div id="box"></div>
<script>
  // The page's own key handler, registered at load on the window's capture
  // phase: it records whether a freeze was already on, starts a run and then
  // keeps the main thread busy. The loop counts work, not time: the page's
  // clocks stand still while it is frozen.
  window.addEventListener('keydown', () => {
    window.frozenAtHandler = window.__harnessFreeze?.frozen ?? null;
    document.getElementById('box').animate(
      [{transform: 'translateX(0px)'}, {transform: 'translateX(400px)'}],
      {duration: 2000, easing: 'linear'},
    );
    let work = 0;
    for (let i = 0; i < 4e7; i++) work += i % 7;
    window.work = work;
  }, true);
</script>`;

/** Now on the page's clock, in the epoch ms that run records use. */
async function pageNow(page: Page): Promise<number> {
  return page.evaluate(() => performance.timeOrigin + performance.now());
}

async function freezeFixture(page: Page) {
  await page.route('http://freeze.test/', route =>
    route.fulfill({contentType: 'text/html', body: FREEZE_FIXTURE}),
  );
  await page.goto('http://freeze.test/');
}

/** The box's run as the page reads it, and the page's clocks. */
const readScene = (page: Page) =>
  page.locator('#box').evaluate(el => {
    const animation = el.getAnimations()[0];
    return {
      x: new DOMMatrix(getComputedStyle(el).transform).m41,
      now: performance.now(),
      date: Date.now(),
      timeline: Number(document.timeline.currentTime),
      current: animation == null ? null : Number(animation.currentTime),
      state: animation?.playState ?? null,
    };
  });

/** Starts a 2 s linear run of the box over 400 px. */
const startRun = (page: Page) =>
  page.locator('#box').evaluate(el => {
    el.animate(
      [{transform: 'translateX(0px)'}, {transform: 'translateX(400px)'}],
      {duration: 2_000, easing: 'linear'},
    );
  });

test.describe('page freeze', () => {
  test('a frozen scene stands still and reads no time passing; thawed, it plays on from where it stood, and the frozen span counts for neither its clock nor its animation', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    await startRun(page);
    await waitForAnimation(page.locator('#box'), {minProgressMs: 100});
    await freezePage(page);
    const frozen = await readScene(page);
    const frozenAt = Date.now();
    await page.waitForTimeout(300);
    const still = await readScene(page);
    expect(still).toEqual(frozen);
    expect(still.state).toBe('running');
    // Read in the thaw's own task: the run resumes exactly where it stood.
    const atThaw = await page.locator('#box').evaluate(el => {
      (
        window as unknown as {__harnessFreeze: {thaw(): void}}
      ).__harnessFreeze.thaw();
      return Number(el.getAnimations()[0].currentTime);
    });
    expect(atThaw).toBeCloseTo(frozen.current ?? NaN, 3);
    await thawPage(page);
    await page.waitForTimeout(200);
    const thawed = await readScene(page);
    const elapsed = Date.now() - frozenAt;
    const moved = (thawed.current ?? 0) - (frozen.current ?? 0);
    expect(moved).toBeGreaterThan(100);
    expect(thawed.x).toBeGreaterThan(frozen.x);
    // The 300 ms frozen span counts for neither the run nor the page's clock.
    expect(elapsed - moved).toBeGreaterThan(250);
    expect(elapsed - (thawed.now - frozen.now)).toBeGreaterThan(250);
  });

  test("a held lift reaches the page early, and its handling waits for its time after the thaw: the page's own listener runs then", async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    const driver = await touchDriver(page);
    // The page's own lift listener, added after the install's.
    await page.evaluate(() => {
      const w = window as unknown as {liftHandledAt?: number};
      addEventListener(
        'pointerup',
        () => {
          w.liftHandledAt ??= performance.now();
        },
        {capture: true, passive: true},
      );
    });
    await freezePage(page);
    const hold = await holdInputUntil(page, {afterResumeMs: 200});
    await thawPage(page);
    const resumeMs = await hold.resumed();
    await driver.play([
      {t: 0, fingers: [{id: 0, x: 20, y: 60}]},
      {t: 30, fingers: []},
    ]);
    const held = await hold.landed();
    expect(held.resumeMs).toBe(resumeMs);
    expect(held.intendedMs).toBeCloseTo(resumeMs + 200, 6);
    // It reached the page after the first frame and before its time...
    expect(held.arrivedMs).toBeGreaterThan(resumeMs);
    expect(held.arrivedMs).toBeLessThan(held.intendedMs);
    // ...and the page handled it at its time, late only by as long as its
    // main thread did not run (a floating-point margin).
    expect(held.releasedMs).toBeGreaterThanOrEqual(held.intendedMs);
    expect(held.releasedMs - held.intendedMs).toBeLessThanOrEqual(
      held.stalledMs + 1e-6,
    );
    const handledAt = await page.evaluate(
      () => (window as unknown as {liftHandledAt?: number}).liftHandledAt,
    );
    expect(handledAt).toBeGreaterThanOrEqual(held.intendedMs);
    // A hold takes a positive time and only the inputs the install listens for.
    await expect(holdInputUntil(page, {afterResumeMs: 0})).rejects.toThrow(
      /positive number/,
    );
    await expect(
      holdInputUntil(page, {afterResumeMs: 50, on: ['focus']}),
    ).rejects.toThrow(/takes only/);
    // One hold at a time: a later hold replaces an earlier one, whose handle
    // then fails by name.
    const earlier = await holdInputUntil(page, {afterResumeMs: 50});
    await holdInputUntil(page, {afterResumeMs: 50});
    await expect(earlier.resumed()).rejects.toThrow(/replaced this hold/);
    await expect(earlier.landed()).rejects.toThrow(/replaced this hold/);
  });

  test('a lift that reaches the page more than a frame after its time fails by name, with the numbers', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    const driver = await touchDriver(page);
    await freezePage(page);
    const hold = await holdInputUntil(page, {afterResumeMs: 20});
    await thawPage(page);
    await hold.resumed();
    // Sent well after its time: the page cannot hold back what it has not had.
    await page.waitForTimeout(200);
    await driver.play([
      {t: 0, fingers: [{id: 0, x: 20, y: 60}]},
      {t: 30, fingers: []},
    ]);
    const error = await hold.landed().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LiftPlacementError);
    const {numbers, message} = error as LiftPlacementError;
    expect(message).toMatch(/ms after its time/);
    expect(
      (numbers.arrivedMs ?? 0) - (numbers.intendedMs ?? 0),
    ).toBeGreaterThan(1000 / 60);
  });

  test('a lift that reaches the page before its first frame after the thaw fails by name', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    const driver = await touchDriver(page);
    await freezePage(page);
    const hold = await holdInputUntil(page, {afterResumeMs: 50});
    // Still frozen: the page has drawn no frame unfrozen, so no held run has
    // resumed.
    await driver.play([
      {t: 0, fingers: [{id: 0, x: 20, y: 60}]},
      {t: 30, fingers: []},
    ]);
    const error = await hold.landed().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LiftPlacementError);
    expect((error as Error).message).toMatch(
      /before its first frame after the thaw/,
    );
    // After the thaw, resumed() still reads the first frame drawn unfrozen,
    // and landed() still names the early input.
    await thawPage(page);
    const resumeMs = await hold.resumed();
    const again = await hold.landed().catch((caught: unknown) => caught);
    expect(again).toBeInstanceOf(LiftPlacementError);
    expect((again as LiftPlacementError).numbers.resumeMs).toBe(resumeMs);
  });

  test('a finger held down through a freeze lifts alone after the thaw, and its hold lands mid-travel on a stalled runner', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    const driver = await touchDriver(page);
    // The page's own handlers: the touch-down starts a 400 ms travel, and the
    // lift records how far it had run.
    await page.evaluate(() => {
      const box = document.getElementById('box')!;
      addEventListener(
        'pointerdown',
        () => {
          box.animate(
            [{transform: 'translateX(0px)'}, {transform: 'translateX(400px)'}],
            {duration: 400, easing: 'linear'},
          );
        },
        {passive: true},
      );
      addEventListener(
        'pointerup',
        () => {
          const w = window as unknown as {liftAt?: number | null};
          w.liftAt ??= Number(box.getAnimations()[0]?.currentTime ?? null);
        },
        {passive: true},
      );
    });
    // The finger goes down while the page is frozen, so the travel it starts
    // is held at its start. Only the lift is left to send.
    await freezePage(page);
    const finger = await driver.press({x: 20, y: 60});
    const hold = await holdInputUntil(page, {afterResumeMs: 150});
    await thawPage(page);
    // The runner stalls 40 ms in every 45 from here, as a loaded one does.
    const stall = setInterval(() => {
      const end = Date.now() + 40;
      while (Date.now() < end) {
        // the runner is busy
      }
    }, 45);
    let held: HeldInput;
    try {
      await hold.resumed();
      await finger.lift();
      held = await hold.landed();
    } finally {
      clearInterval(stall);
    }
    expect(held.arrivedMs).toBeLessThan(held.intendedMs);
    const liftAt = await page.evaluate(
      () => (window as unknown as {liftAt?: number | null}).liftAt,
    );
    // The page handled the lift mid-travel: after the travel started, and
    // before it ended.
    expect(liftAt).toBeGreaterThan(0);
    expect(liftAt).toBeLessThan(400);
    // A lifted finger fails by name, and so does a second finger 0, a play or
    // a tap while a finger is held.
    await expect(finger.lift()).rejects.toThrow(/finger 0 was lifted/);
    const again = await driver.press({x: 20, y: 60});
    await expect(driver.press({x: 30, y: 60})).rejects.toThrow(
      /finger 0 is already down/,
    );
    await expect(
      driver.play([
        {t: 0, fingers: [{id: 1, x: 30, y: 60}]},
        {t: 30, fingers: []},
      ]),
    ).rejects.toThrow(/lift the 1 finger press holds down before a play/);
    await expect(driver.tap({x: 30, y: 60})).rejects.toThrow(
      /lift the 1 finger press holds down before a play or a tap/,
    );
    await again.lift();
  });

  test('a lift that reaches the page while it is frozen again after the thaw fails by name, and the page still answers', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    const driver = await touchDriver(page);
    await freezePage(page);
    const hold = await holdInputUntil(page, {afterResumeMs: 200});
    await thawPage(page);
    await hold.resumed();
    // Frozen again before the lift: the page's clock stands still.
    await freezePage(page);
    await driver.play([
      {t: 0, fingers: [{id: 0, x: 20, y: 60}]},
      {t: 30, fingers: []},
    ]);
    const error = await hold.landed().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LiftPlacementError);
    expect((error as Error).message).toMatch(/while it was frozen again/);
    // The hold did not keep the page busy: it answers within a second.
    const answered = await Promise.race([
      page.evaluate(() => true),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 1_000)),
    ]);
    expect(answered).toBe(true);
    await thawPage(page);
  });

  test("a freeze armed on an input lands before the page's own listeners for it, so a slow handler's run is held at its start", async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    await freezePageOn(page, 'keydown');
    await page.keyboard.press('a');
    expect(
      await page.evaluate(
        () => (window as unknown as {frozenAtHandler: unknown}).frozenAtHandler,
      ),
    ).toBe(true);
    const held = await readScene(page);
    expect(held.current).toBe(0);
    await page.waitForTimeout(250);
    expect((await readScene(page)).current).toBe(0);
    await thawPage(page);
    // Only an input the install listens for can arm a freeze.
    await expect(freezePageOn(page, 'focus')).rejects.toThrow(/arms only on/);
  });

  test('without a freeze the same slow handler runs first, and a late read finds its run well along', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    await page.keyboard.press('a');
    expect(
      await page.evaluate(
        () => (window as unknown as {frozenAtHandler: unknown}).frozenAtHandler,
      ),
    ).toBe(false);
    await page.waitForTimeout(250);
    expect((await readScene(page)).current).toBeGreaterThan(150);
  });

  test("an advance moves the page's clock and every held animation on together, while timers stay held", async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    await startRun(page);
    await waitForAnimation(page.locator('#box'), {minProgressMs: 50});
    await freezePage(page);
    await page.evaluate(() => {
      setTimeout(() => {
        (window as unknown as {timerRan?: boolean}).timerRan = true;
      }, 10);
    });
    const before = await readScene(page);
    await advanceFrozenPage(page, 120);
    const after = await readScene(page);
    expect(after.now - before.now).toBeCloseTo(120, 6);
    expect(after.timeline - before.timeline).toBeCloseTo(120, 6);
    expect((after.current ?? 0) - (before.current ?? 0)).toBeCloseTo(120, 6);
    expect(after.x - before.x).toBeCloseTo(24, 1);
    expect(
      await page.evaluate(
        () => (window as unknown as {timerRan?: boolean}).timerRan,
      ),
    ).toBeUndefined();
    await thawPage(page);
    expect(
      await page.evaluate(
        () => (window as unknown as {timerRan?: boolean}).timerRan,
      ),
    ).toBe(true);
  });

  test('a freeze on a condition stops the scene on the first frame it holds, and rejects when it never does', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    const reached = freezePageWhen(
      page,
      (min: number) => {
        const box = document.getElementById('box');
        return (
          box != null &&
          new DOMMatrix(getComputedStyle(box).transform).m41 >= min
        );
      },
      100,
    );
    await startRun(page);
    await reached;
    const frozen = await readScene(page);
    expect(frozen.x).toBeGreaterThanOrEqual(100);
    expect(frozen.x).toBeLessThan(400);
    await page.waitForTimeout(200);
    expect((await readScene(page)).x).toBe(frozen.x);
    // On a frozen page the page's clock stands still: the timeout runs on
    // the real one.
    await expect(
      freezePageWhen(page, () => false, null, {timeout: 300}),
    ).rejects.toThrow(/did not hold within 300 ms/);
    await thawPage(page);
    await expect(
      freezePageWhen(page, () => false, null, {timeout: 300}),
    ).rejects.toThrow(/did not hold within 300 ms/);
  });

  test('a start the page dates while frozen resumes at the thaw from where it held, in the thaw task itself', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    await freezePage(page);
    await page.locator('#box').evaluate(el => {
      const animation = el.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(400px)'}],
        {duration: 2_000, easing: 'linear'},
      );
      animation.startTime = performance.now();
    });
    await advanceFrozenPage(page, 100);
    expect((await readScene(page)).current).toBeCloseTo(100, 6);
    // Read in the thaw's own task, before any frame: the timeline still
    // reads its last frame's time, which trails the page's clock.
    const atThaw = await page.locator('#box').evaluate(el => {
      (
        window as unknown as {__harnessFreeze: {thaw(): void}}
      ).__harnessFreeze.thaw();
      return Number(el.getAnimations()[0].currentTime);
    });
    expect(atThaw).toBeCloseTo(100, 3);
    await thawPage(page);
  });

  test('a timeout pending across a freeze comes due on the page’s clock, not early by the frozen span', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    // A 3 s run and a 1 s timeout started together: they share the page's
    // clock, so the timeout comes due with the run 1 s in.
    await page.locator('#box').evaluate(el => {
      const animation = el.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(400px)'}],
        {duration: 3_000, easing: 'linear'},
      );
      setTimeout(() => {
        (window as unknown as {firedAt?: number}).firedAt = Number(
          animation.currentTime,
        );
      }, 1_000);
    });
    await page.waitForTimeout(100);
    await freezePage(page);
    await page.waitForTimeout(600);
    await thawPage(page);
    const firedAt = () =>
      page.evaluate(
        () => (window as unknown as {firedAt?: number}).firedAt ?? null,
      );
    await expect.poll(firedAt, {timeout: 5_000}).not.toBeNull();
    // On the real clock it would come 600 ms early, the run about 400 ms in.
    // The run's time is its last frame's: up to two frames behind.
    expect(await firedAt()).toBeGreaterThan(1_000 - 34);
    expect(await firedAt()).toBeLessThan(3_000);
  });

  test('a scroll-driven animation is left to its scroller, and the page’s timeline keeps reading time', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    const hasScrollTimeline = await page.evaluate(
      () =>
        typeof (window as {ScrollTimeline?: unknown}).ScrollTimeline ===
        'function',
    );
    test.skip(!hasScrollTimeline, 'this engine has no ScrollTimeline');
    await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.style.height = '4000px';
      document.body.append(spacer);
      const ScrollTimeline = (
        window as unknown as {
          ScrollTimeline: new (options: {source: Element}) => AnimationTimeline;
        }
      ).ScrollTimeline;
      const source = document.scrollingElement ?? document.documentElement;
      const timeline = new ScrollTimeline({source});
      document
        .getElementById('box')
        ?.animate([{opacity: 0}, {opacity: 1}], {timeline});
      // A scroll timeline's time is a percentage, read once here.
      void timeline.currentTime;
    });
    const pageTime = () =>
      page.evaluate(() => Number(document.timeline.currentTime));
    const scrollTime = () =>
      page.evaluate(() => {
        const animation = document
          .getElementById('box')
          ?.getAnimations()
          .find(each => each.timeline !== document.timeline);
        return animation == null ? null : String(animation.currentTime);
      });
    expect(Number.isFinite(await pageTime())).toBe(true);
    await freezePage(page);
    const before = await scrollTime();
    expect(before).not.toBeNull();
    // Frozen, the scroll-driven run still follows its scroller.
    await page.evaluate(() => window.scrollTo(0, 2_000));
    await expect.poll(scrollTime).not.toBe(before);
    expect(Number.isFinite(await pageTime())).toBe(true);
    await thawPage(page);
    expect(Number.isFinite(await pageTime())).toBe(true);
  });

  test('on a frozen page the harness still samples, arms a hold and blocks the main thread, on the real clock', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    await freezePage(page);
    const box = page.locator('#box');
    const samples = await sampleRects(box, 200);
    expect(samples.length).toBeGreaterThan(3);
    const hold = await armHold(page, box, {
      judges: {target: box, property: 'transform'},
      timeout: 300,
    });
    await expect(hold.held()).rejects.toThrow(
      'armHold: no animation under the scope ran within 300 ms',
    );
    const blocked = await blockMainThread(page, 50);
    expect(blocked.spanMs).toBeGreaterThanOrEqual(50);
    await thawPage(page);
  });

  test('a block that thaws the scene starts with the motion the freeze held, which runs on the compositor from its start through the block', async ({
    page,
    browserName,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    await freezePage(page);
    // Started while frozen, the run is held at its start: 200 px/s.
    await startRun(page);
    const cast = await startScreencast(page);
    const block = await blockMainThread(page, 500, {
      thaw: true,
      during: page.locator('#box'),
    });
    await page.waitForTimeout(100);
    const frames = await cast.stop();
    const tracked = await trackMarker(page, frames, {rgb: [0, 170, 119]});
    const trace = JSON.stringify(
      tracked.map(f => [Math.round(f.t - block.from), f.box?.x ?? null]),
    );
    // It names the run it thawed. The run starts at the time of the frame
    // that thaws it. The block starts in the first task after the frame that
    // hands the run to the compositor. That is the thawing frame in Chromium,
    // and the next one in WebKit.
    expect(block.animation, trace).toBeDefined();
    const startedMs = block.from - (block.animation?.from ?? Number.NaN);
    expect(startedMs, trace).toBeGreaterThanOrEqual(0);
    if (browserName === 'webkit') {
      // The run moves while the block waits for that frame. Its rendering
      // update then takes less than a frame, as in Chromium.
      expect(block.handoverWaitMs, trace).toBeDefined();
      expect(startedMs, trace).toBeLessThan(
        (block.handoverWaitMs ?? Number.NaN) + 1000 / 60,
      );
    } else {
      expect(block.handoverWaitMs, trace).toBeUndefined();
      expect(startedMs, trace).toBeLessThan(1000 / 60);
    }
    // The run moves through the block on the compositor, from near its start.
    const inBlock = tracked.filter(
      f => f.box != null && f.t > block.from && f.t < block.to,
    );
    expect(inBlock.length, trace).toBeGreaterThanOrEqual(3);
    const xs = inBlock.map(f => f.box?.x ?? 0);
    expect(xs[0], trace).toBeLessThanOrEqual(12);
    expect(xs[xs.length - 1] - xs[0], trace).toBeGreaterThan(40);
  });

  test('a block that thaws carries the replay of the motion it names, as a block that waits for it does', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    const box = page.locator('#box');
    // The harness marker on the box itself, so its replay predicts the box.
    await markElement(box, {mode: 'outline'});
    await freezePage(page);
    await startRun(page);
    const block = await blockMainThread(page, 300, {thaw: true, during: box});
    const animation = block.animation;
    const trace = JSON.stringify({...animation, geometry: undefined});
    expect(animation?.unpredictable, trace).toBeUndefined();
    expect(animation?.notPredicted, trace).toBeUndefined();
    expect(animation?.check, trace).toBeDefined();
    // The replay runs from before the block to after it, and moves the box.
    const geometry = animation?.geometry ?? [];
    expect(geometry.length, trace).toBeGreaterThan(100);
    expect(geometry[0][0], trace).toBeLessThan(block.from);
    const travel = geometry[geometry.length - 1][1] - geometry[0][1];
    expect(travel, trace).toBeGreaterThan(40);
  });

  test('a block that thaws holds the thread for the whole time asked, on a time origin that steps back between two reads', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    await freezePage(page);
    // WebKit floors its time origin to the ms, so two reads of it can differ
    // by one. This origin steps back a ms at every read.
    await page.evaluate(() => {
      const origin = Math.floor(performance.timeOrigin);
      let reads = 0;
      Object.defineProperty(performance, 'timeOrigin', {
        configurable: true,
        get: () => {
          reads += 1;
          return origin - reads;
        },
      });
    });
    const block = await blockMainThread(page, 50, {thaw: true});
    expect(block.to - block.from).toBeGreaterThan(50 - 0.01);
    expect(block.spanMs).toBeGreaterThanOrEqual(50);
  });

  test('a block that thaws throws by name on a page the freeze does not hold', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    await expect(blockMainThread(page, 50, {thaw: true})).rejects.toThrow(
      '`thaw` starts a frozen scene, and this page is not frozen',
    );
  });

  test('a CSS animation the page resumes while frozen is held where it stands, not at its start', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    // A CSS run paused 500 ms in, before the freeze.
    await page.locator('#box').evaluate(el => {
      const style = document.createElement('style');
      style.textContent =
        '@keyframes slide { to { transform: translateX(400px); } }';
      document.head.append(style);
      (el as HTMLElement).style.animation = 'slide 2s linear paused';
      el.getAnimations()[0].currentTime = 500;
    });
    const at = () =>
      page
        .locator('#box')
        .evaluate(el => Number(el.getAnimations()[0].currentTime));
    expect(await at()).toBeCloseTo(500, 0);
    await freezePage(page);
    // The page resumes it by CSS while frozen.
    await page.locator('#box').evaluate(el => {
      (el as HTMLElement).style.animationPlayState = 'running';
    });
    await page.waitForTimeout(100);
    expect(await at()).toBeCloseTo(500, 0);
    await thawPage(page);
    await page.waitForTimeout(100);
    expect(await at()).toBeGreaterThan(500);
  });

  test('a CSS transition the page reverses while frozen plays the reversal after the thaw, not the old run from its start', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    const box = page.locator('#box');
    await box.evaluate(el => {
      const element = el as HTMLElement;
      element.style.transition = 'transform 1s linear';
      void getComputedStyle(element).transform;
      element.style.transform = 'translateX(400px)';
    });
    // About 160 px along, frozen; the page sends the box back.
    await page.waitForTimeout(400);
    await freezePage(page);
    await box.evaluate(el => {
      (el as HTMLElement).style.transform = 'translateX(0px)';
    });
    const frozenAt = (await box.boundingBox())?.x ?? NaN;
    await thawPage(page);
    await page.waitForTimeout(100);
    const soon = (await box.boundingBox())?.x ?? NaN;
    await page.waitForTimeout(500);
    const later = (await box.boundingBox())?.x ?? NaN;
    // Back toward 0 all along: never past where it stood when frozen.
    expect(soon).toBeLessThanOrEqual(frozenAt + 1);
    expect(later).toBeLessThanOrEqual(soon + 1);
  });

  test('after a thaw, blockMainThread stamps its window on the real clock', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    await freezePage(page);
    await page.waitForTimeout(600);
    await thawPage(page);
    const before = Date.now();
    const blocked = await blockMainThread(page, 50);
    const after = Date.now();
    // The page's own clock trails the real one by the 600 ms frozen span.
    expect(blocked.from).toBeGreaterThan(before - 50);
    expect(blocked.to).toBeLessThan(after + 50);
  });

  test('after a thaw, blockMainThread with during stamps the animation it caught on the real clock', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    await freezePage(page);
    // The frozen span itself, which the page's clock then trails by.
    await page.waitForTimeout(1_000);
    await thawPage(page);
    const box = page.locator('#box');
    // The block catches the animation a frame or two after it starts, whether
    // it watches before the animation starts or after.
    const blocking = blockMainThread(page, 50, {during: box, timeout: 3_000});
    await box.evaluate(el => {
      el.animate([{translate: '0 0'}, {translate: '200px 0'}], {
        duration: 1_000,
      });
    });
    const held = await blocking;
    // The page's own clock trails the real one by the 1 s frozen span. The
    // block starts a frame or two after the animation, on either clock.
    expect(held.animation).toBeDefined();
    const sinceStart = held.from - (held.animation?.from ?? 0);
    expect(sinceStart).toBeGreaterThanOrEqual(0);
    expect(sinceStart).toBeLessThan(500);
  });

  test('after a thaw, waitForAnimation and sampleRects stamp on the real clock', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    await freezePage(page);
    await page.waitForTimeout(600);
    await thawPage(page);
    const box = page.locator('#box');
    const before = Date.now();
    await box.evaluate(el => {
      el.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(100px)'}],
        {duration: 400},
      );
    });
    const [run] = await waitForAnimation(box);
    const samples = await sampleRects(box, 100);
    const after = Date.now();
    // The page's own clock trails the real one by the 600 ms frozen span.
    expect(run.from).toBeGreaterThan(before - 50);
    expect(run.from).toBeLessThan(after + 50);
    expect(samples.length).toBeGreaterThan(0);
    for (const sample of samples) {
      expect(sample.t).toBeGreaterThan(before - 50);
      expect(sample.t).toBeLessThan(after + 50);
    }
  });

  test('a CSS animation the page dates and then removes while frozen stays removed after the thaw', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    const box = page.locator('#box');
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent =
        '@keyframes slide { to { transform: translateX(400px); } }';
      document.head.append(style);
    });
    await freezePage(page);
    // Started, dated and removed, all while frozen.
    await box.evaluate(el => {
      (el as HTMLElement).style.animation = 'slide 2s linear';
    });
    await page.waitForTimeout(100);
    await box.evaluate(el => {
      el.getAnimations()[0].startTime = document.timeline.currentTime;
      (el as HTMLElement).style.animation = 'none';
      // Style is read at once, so the run is cancelled before the thaw.
      void getComputedStyle(el).animationName;
    });
    await page.waitForTimeout(100);
    await thawPage(page);
    await page.waitForTimeout(300);
    expect(await box.evaluate(el => el.getAnimations().length)).toBe(0);
    expect(await box.evaluate(el => getComputedStyle(el).transform)).toBe(
      'none',
    );
  });

  test('a run that finished before a freeze is dated where it ran, read after the thaw', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    const box = page.locator('#box');
    const watch = await watchAnimations(box);
    // The run is dated on the page's clock, so the test reads that clock too.
    // The test process's clock can stand apart from it, and `Date.now()`
    // drops the fraction of a millisecond.
    const startedAt = await pageNow(page);
    // Over before the freeze, and read only after the thaw. The freeze waits
    // for the run's own end. A run starts only at a frame, and a busy machine
    // can draw no frame for longer than any fixed wait.
    await box.evaluate(async el => {
      await el.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(100px)'}],
        {duration: 200},
      ).finished;
    });
    const frozenAt = await pageNow(page);
    await freezePage(page);
    await page.waitForTimeout(600);
    await thawPage(page);
    const [finished] = await watch.started();
    expect(finished.from).toBeGreaterThan(startedAt - 50);
    expect(finished.from).toBeLessThan(frozenAt);
    expect(finished.finishedAt).not.toBeNull();
    // The clock is read after the run's end. Two equal readings come only
    // from the clock's resolution.
    expect(Number(finished.finishedAt)).toBeLessThanOrEqual(frozenAt);
  });

  test('the page’s clock and its runs stay together across ten freeze and thaw cycles', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    await page.locator('#box').evaluate(el => {
      (window as unknown as {run?: Animation}).run = el.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(400px)'}],
        {duration: 60_000, easing: 'linear'},
      );
    });
    // Where the run started, on the page's clock, before any freeze. It has
    // a start time only once a frame starts it, so the read waits for that.
    const startedAt = await page.evaluate(async () => {
      const {run} = window as unknown as {run: Animation};
      await run.ready;
      return Number(run.startTime);
    });
    for (let cycle = 0; cycle < 10; cycle++) {
      await freezePage(page);
      await page.waitForTimeout(50);
      await thawPage(page);
      await page.waitForTimeout(30);
    }
    // In one frame: the run's time against the page's time since it started.
    const drift = await page.evaluate(
      start =>
        new Promise<number>(resolve => {
          requestAnimationFrame(time => {
            const run = (window as unknown as {run: Animation}).run;
            resolve(Number(run.currentTime) - (time - start));
          });
        }),
      startedAt,
    );
    expect(Math.abs(drift)).toBeLessThan(5);
  });

  test('a condition that throws rejects freezePageWhen with its error', async ({
    page,
  }) => {
    await installPageFreeze(page);
    await freezeFixture(page);
    await installTimerGate(page);
    await expect(
      freezePageWhen(
        page,
        () => {
          throw new Error('the condition broke');
        },
        undefined,
        {timeout: 2_000},
      ),
    ).rejects.toThrow('the condition broke');
  });

  test('a page without the freeze keeps its own clock, and a freeze there refuses to start', async ({
    page,
  }) => {
    await freezeFixture(page);
    await installTimerGate(page);
    expect(await page.evaluate(() => '__harnessFreeze' in window)).toBe(false);
    await expect(freezePage(page)).rejects.toThrow(/installPageFreeze/);
    await expect(freezePageOn(page, 'keydown')).rejects.toThrow(
      /installPageFreeze/,
    );
  });
});
