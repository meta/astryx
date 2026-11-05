// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MonthPager.interaction.browser.spec.ts
 * @input The built "Bottom Sheet Calendar" DateInput story, real touch input
 *   and the interaction harness
 * @output Interaction proofs that the sheet's calendar pages like UIDatePicker
 *   under a finger, in Chromium and WebKit: releases, flicks, the title, the
 *   arrows, the sheet split, the rubber band, RTL and Reduced Motion
 * @position Interaction tests of MonthPager.tsx (`*.interaction.browser.spec.ts`,
 *   run by `pnpm test:interaction`)
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  animationStoryboard,
  busyWindowProof,
  compareCurve,
  curveOf,
  drag,
  flick,
  freezeTimers,
  holdAnimations,
  installTimerGate,
  markElement,
  openStory,
  releaseAnimations,
  sampleCurve,
  startScreencast,
  thawTimers,
  timeline,
  touchDriver,
  trackMarker,
  waitForAnimation,
  waitForRest,
  withStorybook,
  writeEvidence,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';
import {paging} from '../../motion/uikit/paging';

const storybook = withStorybook(test);

const STEP_MS = paging.animatedScroll.durationMs;
/** `setContentOffset(_:animated:)`'s curve: ½ − ½ cos(πt). */
const sinusoid = (t: number) =>
  t >= STEP_MS ? 1 : 0.5 - 0.5 * Math.cos((Math.PI * Math.max(t, 0)) / STEP_MS);

interface OpenCalendar {
  driver: TouchDriver;
  sheet: Locator;
  viewport: Locator;
  track: Locator;
  title: Locator;
  width: number;
  center: {x: number; y: number};
}

const STORY = 'core-dateinput--bottom-sheet-calendar';

async function openCalendar(
  page: Page,
  {rtl = false}: {rtl?: boolean} = {},
): Promise<OpenCalendar> {
  if (rtl) {
    // The Storybook toolbar's direction global, as the URL sets it.
    await page.goto(
      `${storybook()}/iframe.html?id=${STORY}&viewMode=story&globals=direction:rtl`,
    );
    await page
      .locator('#storybook-root > *')
      .first()
      .waitFor({state: 'attached'});
    await page.evaluate(async () => document.fonts.ready);
  } else {
    await openStory(page, storybook(), STORY);
  }
  const driver = await touchDriver(page);
  const opener = page.getByRole('button', {name: /calendar/i}).first();
  const box = await opener.boundingBox();
  if (box == null) {
    throw new Error('no opener');
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  const viewport = page.locator('[data-scroller="months"]');
  await expect(viewport).toBeVisible();
  // The sliding surface: the dialog element itself does not move.
  const sheet = page
    .getByRole('dialog')
    .locator('.astryx-bottom-sheet')
    .first();
  await waitForRest(sheet);
  const rect = await viewport.boundingBox();
  if (rect == null) {
    throw new Error('no viewport');
  }
  return {
    driver,
    sheet,
    viewport,
    track: page.locator('[data-month-track]'),
    title: page.locator('[data-title="month-year"]'),
    width: rect.width,
    center: {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2},
  };
}

/** The content offset in months: 0 at January in this story. */
async function monthsIn(viewport: Locator): Promise<number> {
  return viewport.evaluate(element => {
    const track = element.querySelector('[data-month-track]');
    if (track == null) {
      return NaN;
    }
    const offset =
      element.getBoundingClientRect().left - track.getBoundingClientRect().left;
    return offset / element.getBoundingClientRect().width;
  });
}

/** A drag that rests before the lift, so the release velocity is 0. */
function slowDrag(from: {x: number; y: number}, dx: number, dy = 0) {
  return drag(
    from,
    {x: from.x + dx, y: from.y + dy},
    {durationMs: 500, restMs: 150},
  );
}

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test('the calendar keeps the native scroller', async ({page}) => {
    await openStory(page, storybook(), STORY);
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    await page
      .getByRole('button', {name: /calendar/i})
      .first()
      .click();
    const viewport = page.locator('[data-scroller="months"]');
    await expect(viewport).toBeVisible();
    expect(await page.locator('[data-month-track]').count()).toBe(0);
    expect(
      await viewport.evaluate(
        element => getComputedStyle(element).scrollSnapType,
      ),
    ).toContain('mandatory');
  });
});

test('a slow release before half a month returns; past it, the next month', async ({
  page,
}) => {
  const {driver, viewport, track, title, width, center} =
    await openCalendar(page);
  expect(await monthsIn(viewport)).toBeCloseTo(9, 2);
  await expect(title).toHaveText('October 2026');

  // 30 % of a page (finger travel; the pan's hysteresis comes off it).
  await driver.play(slowDrag(center, -0.3 * width));
  await waitForRest(track);
  expect(await monthsIn(viewport)).toBeCloseTo(9, 2);
  await expect(title).toHaveText('October 2026');

  // 70 %: the next month.
  await driver.play(slowDrag(center, -0.7 * width));
  await waitForRest(track);
  expect(await monthsIn(viewport)).toBeCloseTo(10, 2);
  await expect(title).toHaveText('November 2026');
});

test('after the month and year wheels close, a drag past half a month still pages', async ({
  page,
}) => {
  const {driver, viewport, track, title, width, center} =
    await openCalendar(page);
  const toggle = page.getByRole('button', {name: /choose month and year/i});
  const wheels = page.locator('[data-panel="wheels"]');
  const tapToggle = async () => {
    const box = await toggle.boundingBox();
    if (box == null) {
      throw new Error('no month and year toggle');
    }
    await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  };
  await tapToggle();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // Closing re-asserts the month shown, which the pager is already on.
  await tapToggle();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect
    .poll(async () =>
      wheels.evaluate(element => getComputedStyle(element).opacity),
    )
    .toBe('0');

  await driver.play(slowDrag(center, -0.7 * width));
  await waitForRest(track);
  expect(await monthsIn(viewport)).toBeCloseTo(10, 2);
  await expect(title).toHaveText('November 2026');
});

test('the title follows the drag, changing at half a month', async ({page}) => {
  const {driver, viewport, title, width, center} = await openCalendar(page);
  const script = slowDrag(center, -0.7 * width);
  const seen: {months: number; title: string}[] = [];
  await driver.play(script, {
    onEvent: async step => {
      if (step.type === 'touchMove') {
        seen.push({
          months: await monthsIn(viewport),
          title: (await title.textContent()) ?? '',
        });
      }
    },
  });
  const before = seen.filter(s => s.months < 9.45);
  const after = seen.filter(s => s.months > 9.55);
  expect(before.length).toBeGreaterThan(0);
  expect(after.length).toBeGreaterThan(0);
  // A move is reported a frame later than it is read, so judge each side
  // away from the crossing.
  expect(before.slice(0, -1).every(s => s.title === 'October 2026')).toBe(true);
  expect(after.slice(1).every(s => s.title === 'November 2026')).toBe(true);
});

test('a flick released before half a month turns the title as the settle crosses half, not at the lift', async ({
  page,
}) => {
  const {driver, track, title, center, width} = await openCalendar(page);
  await installTimerGate(page);
  // About a fifth of a month, fast: the release pages, short of half.
  await driver.play(
    flick(center, {
      velocity: {x: -0.2 * width * 12.5, y: 0},
      durationMs: 80,
      hz: 120,
    }),
  );
  // Hold the page's frames right after the lift: the title must not have
  // changed at the lift itself (UIDatePicker's title follows the content).
  await freezeTimers(page);
  await page.waitForTimeout(80);
  expect(await title.textContent()).toBe('October 2026');
  await thawTimers(page);
  await waitForRest(track);
  await expect(title).toHaveText('November 2026');
});

test('a horizontal trackpad swipe pages one month per gesture', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'Playwright cannot send wheel events to mobile WebKit',
  );
  const {track, title, center} = await openCalendar(page);
  await page.mouse.move(center.x, center.y);
  // One gesture: its momentum keeps sending wheel events. (The phone's
  // device pixel ratio of 3 divides the deltas the page sees.)
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(60, 0);
  }
  await waitForRest(track);
  await expect(title).toHaveText('November 2026');
  // A new gesture, after a pause, pages again.
  await page.waitForTimeout(300);
  await page.mouse.wheel(150, 0);
  await waitForRest(track);
  await expect(title).toHaveText('December 2026');
});

test('a flick pages exactly one month', async ({page}) => {
  const {driver, viewport, track, title, center} = await openCalendar(page);
  await driver.play(
    flick(center, {velocity: {x: -2500, y: 0}, durationMs: 80, hz: 120}),
  );
  await waitForRest(track);
  expect(await monthsIn(viewport)).toBeCloseTo(10, 2);
  await expect(title).toHaveText('November 2026');
});

test('the arrow names the month at the tap and scrolls on the 0.3 s sinusoid', async ({
  page,
}) => {
  const {driver, viewport, track, title, width} = await openCalendar(page);
  await installTimerGate(page);
  const next = page.getByRole('button', {name: 'Next month'});
  const box = await next.boundingBox();
  if (box == null) {
    throw new Error('no arrow');
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  await expect(title).toHaveText('November 2026');
  await waitForAnimation(track);
  await freezeTimers(page);
  await holdAnimations(page, track);
  const samples = curveOf(
    await sampleCurve(track, timeline(STEP_MS, 1000 / 60)),
    'translateX',
  );
  const start = samples[0].value;
  const end = samples[samples.length - 1].value;
  expect(Math.abs(end - start)).toBeCloseTo(width, 0);
  const progress = samples.map(({t, value}) => ({
    t,
    value: (value - start) / (end - start),
  }));
  const fit = compareCurve(progress, sinusoid, 0.02);
  await releaseAnimations(page, {finish: true});
  await thawTimers(page);
  expect(fit.pass, JSON.stringify(fit.worst)).toBe(true);
  await waitForRest(track);
  expect(await monthsIn(viewport)).toBeCloseTo(10, 2);
});

/** Taps a header arrow through the touch driver. */
async function tapArrow(
  page: Page,
  driver: TouchDriver,
  name: 'Next month' | 'Previous month',
) {
  const box = await page.getByRole('button', {name}).boundingBox();
  if (box == null) {
    throw new Error(`no ${name} arrow`);
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
}

test('an arrow tapped right after a release keeps the title on the month it named', async ({
  page,
}) => {
  // The release settles towards November; Next, tapped before that settle
  // ends, names December. The title goes October, November, December and
  // stays, instead of falling back to November while the content is still
  // nearest it.
  const {driver, title, track, center} = await openCalendar(page);
  await title.evaluate(element => {
    const seen: string[] = [element.textContent ?? ''];
    (window as unknown as {titles: string[]}).titles = seen;
    new MutationObserver(() => {
      const text = element.textContent ?? '';
      if (seen[seen.length - 1] !== text) {
        seen.push(text);
      }
    }).observe(element, {subtree: true, characterData: true, childList: true});
  });
  await driver.play(
    drag(center, {x: center.x - 260, y: center.y}, {durationMs: 200}),
  );
  await tapArrow(page, driver, 'Next month');
  await waitForRest(track);
  const titles = await page.evaluate(
    () => (window as unknown as {titles: string[]}).titles,
  );
  const order = ['October', 'November', 'December'];
  const months = titles.map(text =>
    order.findIndex(month => text.includes(month)),
  );
  expect(months.at(-1), titles.join(' → ')).toBe(2);
  for (let index = 1; index < months.length; index += 1) {
    expect(months[index], titles.join(' → ')).toBeGreaterThanOrEqual(
      months[index - 1],
    );
  }
});

/** The track's farthest offset in months, logged every frame from now. */
async function startOffsetLog(viewport: Locator) {
  await viewport.evaluate(element => {
    const log: number[] = [];
    (window as unknown as {offsets: number[]}).offsets = log;
    const track = element.querySelector('[data-month-track]');
    const t0 = performance.now();
    const tick = () => {
      if (track != null) {
        log.push(
          (element.getBoundingClientRect().left -
            track.getBoundingClientRect().left) /
            element.getBoundingClientRect().width,
        );
      }
      if (performance.now() - t0 < 2000) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
}

test('past the range’s last and first months the calendar rubber-bands, then returns', async ({
  page,
}) => {
  const {driver, viewport, track, title, width, center} =
    await openCalendar(page);
  // October to December, the story's last month.
  for (const month of ['November 2026', 'December 2026']) {
    await tapArrow(page, driver, 'Next month');
    await expect(title).toHaveText(month);
    await waitForRest(track);
  }
  expect(await monthsIn(viewport)).toBeCloseTo(11, 2);
  await startOffsetLog(viewport);
  await driver.play(slowDrag(center, -120));
  await waitForRest(track);
  let offsets = await page.evaluate(
    () => (window as unknown as {offsets: number[]}).offsets,
  );
  const past = (Math.max(...offsets) - 11) * width;
  // It gives under the finger, less than the finger moved, then comes back.
  expect(past).toBeGreaterThan(5);
  expect(past).toBeLessThan(0.6 * 120);
  expect(await monthsIn(viewport)).toBeCloseTo(11, 2);
  await expect(title).toHaveText('December 2026');

  // January, the first month, by PageUp from a focused day (a year back
  // would leave the range).
  const day = page.getByRole('button', {name: /December 15, 2026/});
  const dayBox = await day.boundingBox();
  if (dayBox == null) {
    throw new Error('no day');
  }
  await driver.tap({
    x: dayBox.x + dayBox.width / 2,
    y: dayBox.y + dayBox.height / 2,
  });
  for (let month = 0; month < 11; month += 1) {
    await page.keyboard.press('PageUp');
  }
  await expect(title).toHaveText('January 2026');
  await waitForRest(track);
  expect(await monthsIn(viewport)).toBeCloseTo(0, 2);
  await startOffsetLog(viewport);
  await driver.play(slowDrag(center, 120));
  await waitForRest(track);
  offsets = await page.evaluate(
    () => (window as unknown as {offsets: number[]}).offsets,
  );
  const before = -Math.min(...offsets) * width;
  expect(before).toBeGreaterThan(5);
  expect(before).toBeLessThan(0.6 * 120);
  expect(await monthsIn(viewport)).toBeCloseTo(0, 2);
  await expect(title).toHaveText('January 2026');
});

test('in RTL a drag to the right pages to the next month, and the arrows follow the reading direction', async ({
  page,
}) => {
  const {driver, track, title, width, center} = await openCalendar(page, {
    rtl: true,
  });
  await expect(page.locator('[dir="rtl"]').first()).toBeAttached();
  await expect(title).toHaveText('October 2026');
  // 70 % of a page toward the inline start's opposite: the next month.
  await driver.play(slowDrag(center, 0.7 * width));
  await waitForRest(track);
  await expect(title).toHaveText('November 2026');
  // And back the other way.
  await driver.play(slowDrag(center, -0.7 * width));
  await waitForRest(track);
  await expect(title).toHaveText('October 2026');
  await tapArrow(page, driver, 'Next month');
  await expect(title).toHaveText('November 2026');
  await waitForRest(track);
});

/**
 * Every running animation under `root`: its animated properties and its
 * active length, when its last keyframe change lands. An animation may hold
 * its end value for the rest of its span.
 */
async function runningAnimations(locator: Locator) {
  return locator.evaluate(root =>
    root.getAnimations({subtree: true}).map(animation => {
      const effect = animation.effect as KeyframeEffect;
      const frames = effect.getKeyframes();
      const properties = [
        ...new Set(
          frames.flatMap(frame =>
            Object.keys(frame).filter(
              key =>
                !['offset', 'easing', 'composite', 'computedOffset'].includes(
                  key,
                ),
            ),
          ),
        ),
      ];
      let lastChange = 0;
      for (let index = 1; index < frames.length; index += 1) {
        if (
          properties.some(
            property => frames[index][property] !== frames[index - 1][property],
          )
        ) {
          lastChange = frames[index].computedOffset ?? 0;
        }
      }
      return {
        properties,
        duration: lastChange * Number(effect.getTiming().duration),
      };
    }),
  );
}

test('Reduced Motion: a release and the arrow step change the month through an opacity dip, without travel', async ({
  page,
}) => {
  // design:reduced-motion DR2: a transition a touch release or a tap starts
  // changes opacity only, in at most 200 ms. The settle and the step come
  // from usePager's animator default (C23's #8146 on F1's #8076).
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {driver, viewport, title, width, center} = await openCalendar(page);
  await driver.play(slowDrag(center, -0.7 * width));
  for (const animation of await runningAnimations(viewport)) {
    expect(animation.properties).toEqual(['opacity']);
    expect(animation.duration).toBeLessThanOrEqual(200);
  }
  await expect(title).toHaveText('November 2026');
  await page.waitForTimeout(400);
  expect(await monthsIn(viewport)).toBeCloseTo(10, 2);
  await tapArrow(page, driver, 'Next month');
  const step = await runningAnimations(viewport);
  expect(step.length).toBeGreaterThan(0);
  for (const animation of step) {
    expect(animation.properties).toEqual(['opacity']);
    expect(animation.duration).toBeLessThanOrEqual(200);
  }
  await expect(title).toHaveText('December 2026');
  await page.waitForTimeout(400);
  expect(await monthsIn(viewport)).toBeCloseTo(11, 2);
});

test('a second tap mid-scroll goes on to the month after', async ({page}) => {
  const {driver, viewport, track, title} = await openCalendar(page);
  const next = page.getByRole('button', {name: 'Next month'});
  const box = await next.boundingBox();
  if (box == null) {
    throw new Error('no arrow');
  }
  const at = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  await driver.tap(at);
  await page.waitForTimeout(120);
  await driver.tap(at);
  await expect(title).toHaveText('December 2026');
  await waitForRest(track);
  expect(await monthsIn(viewport)).toBeCloseTo(11, 2);
});

test('the arrow step keeps advancing every frame through a blocked main thread', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName === 'webkit',
    "WebKit's screencast clock is not the page's (frames arrive ~100 ms off), so a 0.3 s motion cannot be placed inside the block; Mobile Safari on the iOS simulator is this proof's WebKit evidence",
  );
  await openCalendar(page);
  // The incoming month, whose chip shows as soon as its edge slides in.
  const incoming = page.getByRole('grid', {name: 'November 2026'});
  await markElement(incoming, {inset: 8});
  const cast = await startScreencast(page);
  await page.waitForTimeout(300);
  // The page schedules the tap and an 800 ms block 90 ms in. A harness round
  // trip would eat most of the 0.3 s motion.
  const started = await page.evaluate(() => {
    document
      .querySelector<HTMLButtonElement>('button[aria-label="Next month"]')
      ?.click();
    setTimeout(() => {
      const from = performance.timeOrigin + performance.now();
      const end = performance.now() + 800;
      while (performance.now() < end) {
        // Busy.
      }
      (window as unknown as {busy: unknown}).busy = {
        from,
        to: performance.timeOrigin + performance.now(),
      };
    }, 90);
    return performance.timeOrigin + performance.now();
  });
  await page.waitForTimeout(1200);
  const busy = await page.evaluate(
    () => (window as unknown as {busy: {from: number; to: number}}).busy,
  );
  const tracked = await trackMarker(page, await cast.stop());
  const spanned = {...busy, to: Math.min(busy.to, started + STEP_MS)};
  expect(spanned.to - spanned.from).toBeGreaterThan(150);
  const proof = busyWindowProof(tracked, spanned, {
    axis: 'x',
    settledWithin: 1,
  });
  await writeEvidence(
    'busy-main-thread/month-pager-arrow-step',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {
          busy,
          proof,
          frames: tracked.map(f => ({
            t: +(f.t - started).toFixed(1),
            x: f.box?.x ?? null,
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
});

/**
 * UIKit's split in a sheet (motion/MEASUREMENTS.md M-DP01). A drag on the
 * grid is decided on the first move where either axis travels 10 px. It is
 * the grid's if the sideways travel has reached 10 px, else the sheet's. At
 * 60 Hz a slow drag steps a few px per move, so its angle decides. A fast
 * drag's first move can land 10 px sideways however steep it is.
 */
test('in the sheet, a drag is decided once it has moved 10 px either way: slow 35° and fast 55° drags are the grid’s, a slow 60° drag the sheet’s', async ({
  page,
}) => {
  const {driver, sheet, viewport, track, center} = await openCalendar(page);
  const sheetTop = async () =>
    sheet.evaluate(el => el.getBoundingClientRect().y);
  const topBefore = await sheetTop();
  const along = (degrees: number, length: number) => ({
    x: center.x - length * Math.cos((degrees * Math.PI) / 180),
    y: center.y + length * Math.sin((degrees * Math.PI) / 180),
  });
  /** Plays `script`, sampling the sheet's drop and the grid's offset per move. */
  const play = async (script: Parameters<typeof driver.play>[0]) => {
    const seen = {sheetDrop: 0, monthsMin: Infinity, monthsMax: -Infinity};
    await driver.play(script, {
      onEvent: async step => {
        if (step.type === 'touchMove') {
          seen.sheetDrop = Math.max(
            seen.sheetDrop,
            Math.abs((await sheetTop()) - topBefore),
          );
          const months = await monthsIn(viewport);
          seen.monthsMin = Math.min(seen.monthsMin, months);
          seen.monthsMax = Math.max(seen.monthsMax, months);
        }
      },
    });
    return seen;
  };

  // 35°, slow (4 px steps): the sideways travel reaches 10 px first. The
  // grid follows the finger, the sheet stays, and the slow release settles
  // back on September.
  const shallow = await play(
    drag(center, along(35, 145), {durationMs: 500, restMs: 150}),
  );
  expect(shallow.sheetDrop).toBeLessThan(1);
  expect(shallow.monthsMax - 9).toBeGreaterThan(0.2);
  await waitForRest(track);
  expect(await monthsIn(viewport)).toBeCloseTo(9, 2);

  // 55°, fast (25 px steps, ~1500 px/s): the first move lands 14 px
  // sideways. So the grid takes the drag, the flick pages to October, and
  // the sheet never moves.
  const fast = await play(drag(center, along(55, 150), {durationMs: 100}));
  expect(fast.sheetDrop).toBeLessThan(1);
  await waitForRest(track);
  expect(await monthsIn(viewport)).toBeCloseTo(10, 2);

  // 60°, slow (3.3 px steps): the vertical travel reaches 10 px first, so
  // the sheet takes the drag and the grid never moves.
  const steep = await play(
    drag(center, along(60, 120), {durationMs: 600, restMs: 150}),
  );
  expect(steep.sheetDrop).toBeGreaterThan(20);
  expect(steep.monthsMax - steep.monthsMin).toBeLessThan(0.01);
  expect(await monthsIn(viewport)).toBeCloseTo(10, 2);
});

test(
  'storyboard: the arrow step',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const {driver, viewport, track} = await openCalendar(page);
    await installTimerGate(page);
    const next = page.getByRole('button', {name: 'Next month'});
    const box = await next.boundingBox();
    if (box == null) {
      throw new Error('no arrow');
    }
    await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
    await waitForAnimation(track);
    await freezeTimers(page);
    const {storyboard} = await animationStoryboard(page, {
      name: 'month-pager-arrow-step',
      clip: viewport,
      scope: track,
      times: timeline(STEP_MS, 1000 / 30),
      columns: 6,
      cellScale: 0.4,
      measure: async () => ({months: +(await monthsIn(viewport)).toFixed(3)}),
    });
    await storyboard.write(testInfo);
    await releaseAnimations(page, {finish: true});
    await thawTimers(page);
  },
);

test(
  'storyboard: a release past half a month settles on the next',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const {driver, viewport, track, width, center} = await openCalendar(page);
    await installTimerGate(page);
    await driver.play(slowDrag(center, -0.7 * width));
    await waitForAnimation(track);
    await freezeTimers(page);
    const {storyboard} = await animationStoryboard(page, {
      name: 'month-pager-release-settle',
      clip: viewport,
      scope: track,
      columns: 6,
      cellScale: 0.4,
      measure: async () => ({months: +(await monthsIn(viewport)).toFixed(3)}),
    });
    await storyboard.write(testInfo);
    await releaseAnimations(page, {finish: true});
    await thawTimers(page);
  },
);
