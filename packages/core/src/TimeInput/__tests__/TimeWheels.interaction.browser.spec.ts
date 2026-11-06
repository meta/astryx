// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TimeWheels.interaction.browser.spec.ts
 * @input The built "Bottom Sheet Wheels" TimeInput story, real touch input
 *   and the interaction harness
 * @output Interaction proofs for the sheet's time wheels under a finger, in
 *   Chromium and WebKit. An hour drag from 11 to 12 turns AM to PM on the
 *   AM/PM column's own spring. The turn advances through a blocked main
 *   thread. It cross-fades under Reduce Motion, and a finger stops it
 *   mid-turn. With a mouse, 11 to 12 stays AM.
 * @position Interaction tests of TimeWheels.tsx, run by
 *   `pnpm test:interaction`
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  blockMainThread,
  busyWindowProof,
  compareCurve,
  drag,
  installTimerGate,
  openStory,
  startBusyControl,
  startScreencast,
  Storyboard,
  tap as press,
  thawTimers,
  timeline,
  touchDriver,
  waitForRest,
  withStorybook,
  trackControl,
  writeEvidence,
  type CastFrame,
  type TouchDriver,
  type TrackedFrame,
} from '@astryxdesign/interaction-harness';
import {bounceCurve, scaleFor} from '../../DateInput/wheelPhysics';
import {springs} from '../../motion/uikit/springs';
import {WHEEL_ROW_HEIGHT} from '../../DateInput/wheelOptions';

const storybook = withStorybook(test);

/**
 * The column turn's oracle: one row on `springs.settle`, from rest. The
 * wheel's main interaction is a gesture, so a turn the program starts springs.
 */
const turn = bounceCurve(
  0,
  0,
  WHEEL_ROW_HEIGHT,
  scaleFor(WHEEL_ROW_HEIGHT),
  springs.settle,
);
const TURN_MS = turn.duration * 1000;
const spin = (t: number) =>
  t >= TURN_MS ? 1 : turn.value(Math.max(t, 0) / 1000) / WHEEL_ROW_HEIGHT;

interface OpenWheels {
  driver: TouchDriver;
  sheet: Locator;
  hour: Locator;
  meridiem: Locator;
}

async function openWheels(page: Page, story: string): Promise<OpenWheels> {
  await openStory(page, storybook(), story);
  const driver = await touchDriver(page);
  const opener = page.getByRole('button', {name: /^Open /}).first();
  const box = await opener.boundingBox();
  if (box == null) {
    throw new Error('no field');
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  const hour = page.getByRole('listbox', {name: 'Hour'});
  await expect(hour).toBeVisible();
  const sheet = page.getByRole('dialog').first();
  await waitForRest(sheet);
  return {
    driver,
    sheet,
    hour,
    meridiem: page.getByRole('listbox', {name: 'AM/PM'}),
  };
}

/** The label of the row at rest under the band. */
async function restingLabel(column: Locator): Promise<string | null> {
  return column.evaluate(element => {
    const id = element.getAttribute('aria-activedescendant');
    return id == null
      ? null
      : (document.getElementById(id)?.textContent ?? null);
  });
}

/** Records, in the page, the touches the hour column receives. */
async function logHourTouches(hour: Locator) {
  await hour.evaluate(column => {
    const seen: [string, number][] = [];
    (window as unknown as {hourTouches: typeof seen}).hourTouches = seen;
    for (const type of ['touchstart', 'touchmove', 'touchend']) {
      column.addEventListener(
        type,
        event => seen.push([type, Math.round(event.timeStamp)]),
        {capture: true, passive: true},
      );
    }
  });
}

/**
 * Waits for the hour to rest and requires it on 12. A drag that did not turn it
 * exactly one row fails here. The failure shows its touches as the page
 * received them. It does not wait for an AM/PM turn that never comes.
 *
 * WebKit's injected touches carry no timestamps. Under a 3-CPU cap with 16
 * workers, a report-only profile, they reach the page in bursts. Three moves
 * come within 2 ms, then none for 60 ms or more. So the release reads as a
 * fling, and the hour turns several rows. It rested on 5 to 8 in 5 of 10 runs.
 * This check names that limit of WebKit's real-time input. The required CI
 * WebKit profile and Chromium pass.
 */
async function expectHourOn12(hour: Locator) {
  await waitForRest(hour);
  // Under Reduce Motion the release lands with no motion for waitForRest to
  // follow, so the rest it sees can come before the commit. Wait for the
  // commit itself.
  const label = await expect
    .poll(async () => restingLabel(hour), {timeout: 2_000})
    .toBe('12')
    .then(
      () => '12',
      async () => restingLabel(hour),
    );
  if (label !== '12') {
    const touches = await hour
      .page()
      .evaluate(
        () =>
          (window as unknown as {hourTouches: [string, number][]}).hourTouches,
      );
    throw new Error(
      `the drag did not turn the hour one row (it rests on ${label}); its touches as the page received them: ${JSON.stringify(touches)}`,
    );
  }
}

/** Turns the hour from 11 to 12 and waits for it to rest there. */
async function turnHourTo12(driver: TouchDriver, hour: Locator) {
  await logHourTouches(hour);
  await turnOneRowDown(driver, hour);
  await expectHourOn12(hour);
}

/** A slow drag that rests before the lift: one row up, no fling. */
async function turnOneRowDown(driver: TouchDriver, column: Locator) {
  const box = await column.boundingBox();
  if (box == null) {
    throw new Error('no column');
  }
  const from = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  // One row plus the pan's hysteresis.
  await driver.play(
    drag(
      from,
      {x: from.x, y: from.y - (WHEEL_ROW_HEIGHT + 10)},
      {durationMs: 300, restMs: 150},
    ),
  );
}

/** The strip holding a column's rows moves by one row pitch per row. */
const stripOf = (column: Locator) => column.locator('[data-wheel-strip]');

/**
 * Resolves once the page has caught `column`'s next turn as it was created. In
 * the task that creates the turn's animations, it holds the gated timers and
 * pauses the animations. The Wheel ends a turn from one of those timers. So a
 * sampler that comes late still finds the turn at its start. Needs
 * installTimerGate first.
 */
async function catchTurn(column: Locator): Promise<void> {
  await column.evaluate(
    async element =>
      new Promise<void>(resolve => {
        const observer = new MutationObserver(() => {
          const animations = element.getAnimations({subtree: true});
          if (animations.length === 0) {
            return;
          }
          observer.disconnect();
          const gate = (
            window as unknown as {__harnessTimerGate?: {frozen: boolean}}
          ).__harnessTimerGate;
          if (gate == null) {
            throw new Error('catchTurn: call installTimerGate first');
          }
          gate.frozen = true;
          for (const animation of animations) {
            animation.pause();
          }
          resolve();
        });
        // The Wheel writes the turn's end offset inline in the task that
        // creates its animations; the callback runs right after that task.
        observer.observe(element, {
          attributes: true,
          attributeFilter: ['style'],
          subtree: true,
        });
      }),
  );
}

test('the AM/PM column follows the hour from 11 to 12 on a spring, from rest', async ({
  page,
}) => {
  const {driver, hour, meridiem} = await openWheels(
    page,
    'core-timeinput--bottom-sheet-wheels',
  );
  expect(await restingLabel(hour)).toBe('11');
  expect(await restingLabel(meridiem)).toBe('AM');

  // The Wheel ends a turn from a timer at the curve's duration: hold it with
  // the animations while they are sampled.
  await installTimerGate(page);
  // The hour commits at rest; the AM/PM column then turns by itself. The
  // page catches that turn as it is created (see catchTurn). So the hold
  // below finds it, however late a loaded machine's round trips are. A wait
  // from the harness found the turn already ended.
  const caught = catchTurn(meridiem);
  await turnHourTo12(driver, hour);
  await caught;
  // Sampled in the page: the turn's animations seek together to each time,
  // and the strip's presented offset is read there.
  const ys = await meridiem.evaluate(
    (column, times) => {
      const strip = column.querySelector('[data-wheel-strip]');
      const animations = column.getAnimations({subtree: true});
      if (strip == null || animations.length === 0) {
        throw new Error('no turn to sample');
      }
      return times.map(t => {
        for (const animation of animations) {
          animation.currentTime = t;
        }
        return {
          t,
          value: strip.getBoundingClientRect().top,
        };
      });
    },
    timeline(TURN_MS, 1000 / 60),
  );
  const start = ys[0].value;
  const end = ys[ys.length - 1].value;
  expect(Math.abs(end - start)).toBeCloseTo(WHEEL_ROW_HEIGHT, 0);
  const progress = ys.map(({t, value}) => ({
    t,
    value: (value - start) / (end - start),
  }));
  const fit = compareCurve(progress, spin, 0.02);
  expect(fit.pass, JSON.stringify(fit.worst)).toBe(true);
  // The held end timer finishes the turn, as it would have at its end.
  await thawTimers(page);
  await waitForRest(meridiem);

  await expect.poll(async () => restingLabel(hour)).toBe('12');
  await expect.poll(async () => restingLabel(meridiem)).toBe('PM');
  await expect(page.getByRole('dialog').first()).toBeVisible();
});

/**
 * The vertical centre of the text in a column's box, per frame. The labels on
 * the drum and in the band move with the column. So this centre moves as the
 * column turns.
 */
async function textCentres(
  page: Page,
  frames: ReadonlyArray<CastFrame>,
  rect: {x: number; y: number; width: number; height: number},
): Promise<TrackedFrame[]> {
  const scratch = await page.context().newPage();
  try {
    const out: TrackedFrame[] = [];
    for (let i = 0; i < frames.length; i += 12) {
      const batch = frames.slice(i, i + 12);
      const centres = await scratch.evaluate(
        async ({items, box}) => {
          const results: (number | null)[] = [];
          for (const item of items) {
            const blob = await (
              await fetch(`data:image/${item.format};base64,${item.data}`)
            ).blob();
            const bitmap = await createImageBitmap(blob);
            const scale = bitmap.width / item.viewportWidth;
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const context = canvas.getContext('2d');
            if (context == null) {
              throw new Error('no 2d context');
            }
            context.drawImage(bitmap, 0, 0);
            const x = Math.round(box.x * scale);
            const y = Math.round(box.y * scale);
            const w = Math.round(box.width * scale);
            const h = Math.round(box.height * scale);
            const {data} = context.getImageData(x, y, w, h);
            let weight = 0;
            let sum = 0;
            for (let row = 0; row < h; row += 1) {
              for (let col = 0; col < w; col += 1) {
                const o = (row * w + col) * 4;
                // Ink: how far below white, summed over the channels.
                const ink = Math.max(
                  0,
                  600 - data[o] - data[o + 1] - data[o + 2],
                );
                weight += ink;
                sum += ink * row;
              }
            }
            results.push(weight === 0 ? null : sum / weight / scale);
          }
          return results;
        },
        {
          items: batch.map(f => ({
            data: f.data,
            format: f.format,
            viewportWidth: f.viewportWidth,
          })),
          box: rect,
        },
      );
      centres.forEach((centre, k) =>
        out.push({
          t: batch[k].t,
          box:
            centre == null ? null : {x: 0, y: centre * 10, width: 0, height: 0},
          pixels: 1,
        }),
      );
    }
    return out;
  } finally {
    await scratch.close();
  }
}

test('the AM/PM turn keeps advancing every frame through a blocked main thread', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName === 'webkit',
    "WebKit's screencast clock is not the page's (frames arrive ~100 ms off), so a turn this short cannot be placed inside the block; Mobile Safari on the iOS simulator is this proof's WebKit evidence",
  );
  const {driver, hour, meridiem} = await openWheels(
    page,
    'core-timeinput--bottom-sheet-wheels',
  );
  const rect = await meridiem.boundingBox();
  if (rect == null) {
    throw new Error('no AM/PM column');
  }
  // The harness's busy-window control: a box the compositor moves along the
  // top edge, in the same screencast. The turn is judged against what the
  // compositor presented, not against a frame rate.
  const control = await startBusyControl(page);
  const cast = await startScreencast(page);
  await page.waitForTimeout(300);
  // Armed before the drag, the page blocks itself once the AM/PM column has
  // turned for 32 ms. Armed after it, the round trip would start the block
  // later the busier the machine is.
  const blocking = blockMainThread(page, 600, {
    during: stripOf(meridiem),
    minProgressMs: 32,
  });
  await turnOneRowDown(driver, hour);
  const busy = await blocking;
  await page.waitForTimeout(500);
  const castFrames = await cast.stop();
  await control.remove();
  const tracked = await textCentres(page, castFrames, rect);
  const controlFrames = await trackControl(
    page,
    castFrames.filter(f => f.t >= busy.from - 300 && f.t <= busy.to + 100),
  );
  // Judged until the turn's end (the text centre in tenths of a px). The turn
  // moves on every frame the control moves on, and it stalls no longer than
  // the control.
  const spanned = {...busy, to: Math.min(busy.to, busy.from + TURN_MS - 32)};
  const proof = busyWindowProof(tracked, spanned, {
    axis: 'y',
    settledWithin: 5,
    control: controlFrames,
  });
  await writeEvidence(
    'busy-main-thread/timewheels-meridiem-turn',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {
          busy,
          proof,
          frames: tracked.map(f => ({
            t: +(f.t - busy.from).toFixed(1),
            y: f.box == null ? null : +(f.box.y / 10).toFixed(2),
          })),
        },
        null,
        1,
      ),
    },
    testInfo,
  );
  testInfo.annotations.push({
    type: 'busy-main-thread',
    description: proof.summary,
  });
  expect(proof.verdict.failures, proof.summary).toEqual([]);
  await expect.poll(async () => restingLabel(meridiem)).toBe('PM');
});

test('Reduced Motion: the AM/PM column cross-fades onto PM instead of turning', async ({
  page,
}) => {
  // design:reduced-motion DR2: nothing travels. The column's drawing dips in
  // opacity for 200 ms or less. Its rows hold where they are until the dip's
  // middle. Then they step onto their rows: the wheel's landing.
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {driver, hour, meridiem} = await openWheels(
    page,
    'core-timeinput--bottom-sheet-wheels',
  );
  // Caught as it is created (catchTurn), because the cross-fade is 200 ms or
  // less. Read after the hour came to rest, it had ended on a loaded machine.
  await installTimerGate(page);
  const caught = catchTurn(meridiem);
  await turnHourTo12(driver, hour);
  await caught;
  const animations = await meridiem.evaluate(root =>
    root.getAnimations({subtree: true}).map(animation => {
      const effect = animation.effect as KeyframeEffect;
      // The animator holds a curve's end state in a long tail after the
      // curve, so the harness reads where the curve itself ends.
      const curveEnd = (
        window as unknown as {__harnessCurveEnd?: (a: Animation) => number}
      ).__harnessCurveEnd;
      return {
        curveMs:
          curveEnd == null
            ? Number(effect.getTiming().duration)
            : curveEnd(animation),
        keyframes: effect.getKeyframes().map(frame => ({
          offset: frame.computedOffset,
          // The animator moves the strip with `translate`; either property
          // is a move.
          motion:
            frame.translate != null
              ? String(frame.translate)
              : frame.transform != null
                ? String(frame.transform)
                : null,
          properties: Object.keys(frame).filter(
            key =>
              !['offset', 'easing', 'composite', 'computedOffset'].includes(
                key,
              ),
          ),
        })),
        duration: Number(effect.getTiming().duration),
      };
    }),
  );
  const fades = animations.filter(animation =>
    animation.keyframes.every(
      frame =>
        !frame.properties.includes('transform') &&
        !frame.properties.includes('translate'),
    ),
  );
  expect(fades.length).toBeGreaterThan(0);
  for (const fade of fades) {
    expect([
      ...new Set(fade.keyframes.flatMap(frame => frame.properties)),
    ]).toEqual(['opacity']);
    expect(fade.curveMs).toBeLessThanOrEqual(200);
  }
  const fadeMs = Math.max(...fades.map(fade => fade.curveMs));
  for (const landing of animations.filter(
    animation => !fades.includes(animation),
  )) {
    // The origin held, then the destination, stepping at the dip's middle.
    expect(landing.keyframes).toHaveLength(4);
    const [origin, held, landed, end] = landing.keyframes;
    expect(held.motion).toBe(origin.motion);
    expect(landed.offset).toBe(held.offset);
    expect(end.motion).toBe(landed.motion);
    expect(held.offset * landing.duration).toBeCloseTo(fadeMs / 2, 0);
  }
  // The held end timer finishes the turn, as it would have.
  await thawTimers(page);
  await expect.poll(async () => restingLabel(meridiem)).toBe('PM');
});

/**
 * A finger lands on the AM/PM column early in its turn. The column stops
 * where it was at the touch's time. The lift rests it on the nearer row.
 *
 * Chromium's injected touches carry the timestamps they are given. The Wheel
 * stops a turn where it was at the touch's time. So the touch lands 100 ms into
 * the turn, however late a loaded machine delivers it. That is before the
 * turn's middle, so AM is the nearer row. The gated timers hold from the turn's
 * start until the touch is in. So the turn cannot end before the touch arrives.
 * A busy device does the same: it holds a touch's event but keeps its time.
 * Dispatched at the moment the harness saw the turn running instead, the touch
 * landed past the turn's end on a loaded machine.
 *
 * WebKit's injected touches carry no timestamps: the page sees the real
 * dispatch time. There the touch lands when the harness sends it, after the
 * turn has run 20 ms. The lift rests on whichever row is nearer. Under a 3-CPU
 * cap with 16 workers, a report-only profile, the press came after the turn
 * ended in 2 of 10 runs. The hour's drag missed its row in more runs (see
 * expectHourOn12). Both are limits of WebKit's real-time input. The required CI
 * WebKit profile and Chromium pass.
 */
test('a finger on the AM/PM column mid-turn stops it; the lift rests it on the nearest row', async ({
  page,
  browserName,
}) => {
  const {driver, hour, meridiem} = await openWheels(
    page,
    'core-timeinput--bottom-sheet-wheels',
  );
  const field = page.locator('input').first();
  const offsetOf = async () =>
    stripOf(meridiem).evaluate(element => element.getBoundingClientRect().top);
  // Where the strip rests on AM, and on PM one row on.
  const restAM = await offsetOf();
  const restPM = restAM - WHEEL_ROW_HEIGHT;
  // Read before the turn: nothing about the column's box moves with it.
  const box = await meridiem.boundingBox();
  if (box == null) {
    throw new Error('no AM/PM column');
  }
  const at = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  // The strip's offset on each of the page's own frames, for 200 ms after a
  // touch arrives on the AM/PM column. The hour's drag does not count, and a
  // held timer gate never holds these frames.
  const caught = meridiem.evaluate(
    async column =>
      new Promise<number[]>(resolve => {
        const element = column.querySelector('[data-wheel-strip]');
        if (element == null) {
          throw new Error('no AM/PM strip');
        }
        const frame =
          (
            window as unknown as {
              __harnessTimerGate?: {frame: typeof requestAnimationFrame};
            }
          ).__harnessTimerGate?.frame ?? requestAnimationFrame;
        column.addEventListener(
          'touchstart',
          () => {
            const ys: number[] = [];
            const t0 = performance.now();
            const tick = () => {
              ys.push(element.getBoundingClientRect().top);
              if (performance.now() - t0 < 200) {
                frame(tick);
              } else {
                resolve(ys);
              }
            };
            frame(tick);
          },
          {capture: true, once: true},
        );
      }),
  );
  if (browserName === 'chromium') {
    await installTimerGate(page);
    // Armed before the drag. As the turn is created, the page holds the gated
    // timers, the turn's end among them. So the turn cannot end before the
    // touch is in. The page reports the turn's start on the epoch clock of the
    // touch's timestamp.
    const turnStart = stripOf(meridiem).evaluate(
      async element =>
        new Promise<number>(resolve => {
          const gate = (
            window as unknown as {
              __harnessTimerGate: {
                frozen: boolean;
                frame?: typeof requestAnimationFrame;
              };
            }
          ).__harnessTimerGate;
          const frame = gate.frame ?? requestAnimationFrame;
          const observer = new MutationObserver(() => {
            if (element.getAnimations().length === 0) {
              return;
            }
            observer.disconnect();
            gate.frozen = true;
            const check = () => {
              const animation = element
                .getAnimations()
                .find(candidate => candidate.startTime != null);
              if (animation == null) {
                frame(check);
                return;
              }
              resolve(performance.timeOrigin + Number(animation.startTime));
            };
            check();
          });
          observer.observe(element, {
            attributes: true,
            attributeFilter: ['style'],
          });
        }),
    );
    await turnHourTo12(driver, hour);
    const startedAt = await turnStart;
    const cdp = await page.context().newCDPSession(page);
    const points = [
      {x: at.x, y: at.y, id: 1, radiusX: 1, radiusY: 1, force: 1},
    ];
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: points,
      timestamp: (startedAt + 100) / 1000,
    });
    await thawTimers(page);
    // Held in place for 250 ms, then the lift.
    await page.waitForTimeout(250);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
      timestamp: Date.now() / 1000,
    });
    await cdp.detach();
  } else {
    await logHourTouches(hour);
    // Early in the turn, while AM is still the nearer row; watched from
    // before the drag.
    const running = stripOf(meridiem).evaluate(
      async element =>
        new Promise<void>(resolve => {
          const check = () => {
            const isRunning = element
              .getAnimations()
              .some(a => Number(a.currentTime ?? 0) >= 20);
            if (isRunning) {
              resolve();
            } else {
              requestAnimationFrame(check);
            }
          };
          check();
        }),
    );
    await turnOneRowDown(driver, hour);
    // The turn starts once the hour rests on 12; a drag that left it on
    // another row fails at once (expectHourOn12).
    await Promise.race([
      running,
      expectHourOn12(hour).then(async () => new Promise<never>(() => {})),
    ]);
    // A press held in place for 250 ms, then the lift.
    await driver.play(press(at, {holdMs: 250}));
  }
  const held = await caught;
  // Stopped where the finger caught it: still at most 1 px of drift.
  const tail = held.slice(Math.floor(held.length / 2));
  expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(1);
  // Caught mid-turn, strictly between the two rows.
  const caughtAt = tail[tail.length - 1];
  const context = JSON.stringify({restAM, restPM, held});
  expect(caughtAt, context).toBeLessThan(restAM - 0.1);
  expect(caughtAt, context).toBeGreaterThan(restPM + 0.1);
  const nearer =
    Math.abs(caughtAt - restAM) <= Math.abs(caughtAt - restPM) ? 'AM' : 'PM';
  if (browserName === 'chromium') {
    // 100 ms into the turn, before its middle.
    expect(nearer, context).toBe('AM');
  }
  await waitForRest(meridiem);
  await expect.poll(async () => restingLabel(meridiem)).toBe(nearer);
  await expect(field).toHaveValue(`12:58 ${nearer}`);
});

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test('with a mouse each column turns on its own: 11 to 12 stays AM', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-timeinput--bottom-sheet-wheels');
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    await page
      .getByRole('button', {name: /^Open /})
      .first()
      .click();
    const hour = page.getByRole('listbox', {name: 'Hour'});
    await expect(hour).toBeVisible();
    // In time order no AM hour follows 11 AM, so a click turns the column.
    await hour.getByRole('option', {name: '12'}).click();
    await expect(page.locator('input').first()).toHaveValue('12:58 AM');
    expect(await restingLabel(page.getByRole('listbox', {name: 'AM/PM'}))).toBe(
      'AM',
    );
  });
});

test(
  'storyboard: the AM/PM column turns after the hour',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const {driver, sheet, hour, meridiem} = await openWheels(
      page,
      'core-timeinput--bottom-sheet-wheels',
    );
    // Caught as it is created (catchTurn), so a late harness still films the
    // turn from its start. Held after waitForAnimation instead, the turn
    // had ended on a loaded machine.
    await installTimerGate(page);
    const caught = catchTurn(meridiem);
    await turnHourTo12(driver, hour);
    await caught;
    const clip = (await sheet.boundingBox()) ?? undefined;
    const storyboard = new Storyboard(page, {
      name: 'timewheels-meridiem-follows-hour',
      clip,
      columns: 6,
      cellScale: 0.4,
    });
    for (const t of timeline(TURN_MS, 1000 / 30)) {
      const y = await meridiem.evaluate((column, time) => {
        for (const animation of column.getAnimations({subtree: true})) {
          animation.currentTime = time;
        }
        const strip = column.querySelector('[data-wheel-strip]');
        // The animator writes the strip's `translate`, which `transform`
        // does not report: its drawn top, from the box.
        return strip == null
          ? NaN
          : Number(strip.getBoundingClientRect().top.toFixed(2));
      }, t);
      await storyboard.capture(`t=${+t.toFixed(1)} ms`, t, {y});
    }
    await storyboard.write(testInfo);
    // The held end timer finishes the turn.
    await thawTimers(page);
  },
);
