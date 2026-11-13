// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MonthPager.interaction.browser.spec.ts
 * @input The built "Bottom Sheet Calendar" DateInput story and the MonthPager
 *   proof story, real touch and trackpad input, and the interaction harness
 * @output Interaction proofs, in Chromium and WebKit, that the sheet's
 *   calendar pages like UIDatePicker under a finger. They cover releases,
 *   flicks, the title, the arrows, the sheet split, the rubber band, RTL and
 *   Reduced Motion
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
  armHold,
  busyWindowProof,
  curveOf,
  drag,
  flick,
  freezeTimers,
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
  waitForRest,
  webInputDriver,
  withStorybook,
  writeEvidence,
  WHEEL_SKIP,
  type TouchDriver,
  type TouchScript,
} from '@astryxdesign/interaction-harness';
import {paging} from '../../motion/uikit/paging';

const storybook = withStorybook(test);

const STEP_MS = paging.animatedScroll.durationMs;

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

/**
 * Resolves once `locator`'s element shows `property` at `value` and no
 * animation inside it is left unfinished. The page checks the value once a
 * frame, then awaits each animation's own `finished` promise. It sets no
 * deadline of its own, so a starved runner only makes it later.
 */
async function settlesAt(locator: Locator, property: string, value: string) {
  await locator.evaluate(
    async (element, [name, expected]) => {
      await new Promise<void>(resolve => {
        const check = () => {
          if (getComputedStyle(element).getPropertyValue(name) === expected) {
            resolve();
          } else {
            requestAnimationFrame(check);
          }
        };
        check();
      });
      for (;;) {
        const unfinished = element
          .getAnimations({subtree: true})
          .filter(animation => animation.playState !== 'finished');
        if (unfinished.length === 0) {
          return;
        }
        await Promise.all(
          unfinished.map(async animation =>
            animation.finished.catch(() => undefined),
          ),
        );
      }
    },
    [property, value] as const,
  );
}

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
  await settlesAt(sheet, 'transform', 'matrix(1, 0, 0, 1, 0, 0)');
  const rect = await viewport.boundingBox();
  if (rect == null) {
    throw new Error('no viewport');
  }
  return {
    driver,
    sheet,
    viewport,
    // The track is the months viewport's only child.
    track: viewport.locator(':scope > *'),
    title: page.locator('[data-title="month-year"]'),
    width: rect.width,
    center: {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2},
  };
}

/** The content offset in months: 0 at January in this story. */
async function monthsIn(viewport: Locator): Promise<number> {
  return viewport.evaluate(element => {
    const track = element.firstElementChild;
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
    // The pager's viewport clips its track; the snap scroller's scrolls.
    expect(
      await viewport.evaluate(element => getComputedStyle(element).overflowX),
    ).not.toBe('hidden');
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
  browserName,
}) => {
  const {driver, track, title, center} = await openCalendar(page);
  await installTimerGate(page);
  // About a quarter of a month at 2500 px/s: the release pages, short of
  // half.
  await driver.play(
    liftWithLastMove(
      flick(center, {velocity: {x: -2500, y: 0}, durationMs: 40, hz: 120}),
    ),
  );
  // Hold the page's frames right after the lift. UIDatePicker's title follows
  // the content, so the title must not change at the lift itself.
  await freezeTimers(page);
  await page.waitForTimeout(80);
  expect(await title.textContent()).toBe('October 2026');
  await thawTimers(page);
  await waitForRest(track);
  // WebKit stamps each injected touch when it arrives, so a stalled dispatch
  // changes the release speed the page reads. The release's paging is
  // asserted where the script sets each touch's time.
  if (browserName === 'chromium') {
    await expect(title).toHaveText('November 2026');
  }
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

test('the arrow names the month at the tap and scrolls one month', async ({
  page,
}) => {
  const {driver, viewport, track, title, width} = await openCalendar(page);
  await installTimerGate(page);
  const next = page.getByRole('button', {name: 'Next month'});
  const box = await next.boundingBox();
  if (box == null) {
    throw new Error('no arrow');
  }
  // The page holds the step as soon as it runs. A hold sent once the tap
  // returns reaches a busy page late, and the step can end first.
  const hold = await armHold(page, track, {
    judges: {target: track, property: 'translate'},
  });
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  await expect(title).toHaveText('November 2026');
  await hold.held();
  await freezeTimers(page);
  const samples = curveOf(
    await sampleCurve(track, timeline(STEP_MS, 1000 / 60)),
    'translateX',
  );
  const start = samples[0].value;
  const end = samples[samples.length - 1].value;
  expect(Math.abs(end - start)).toBeCloseTo(width, 0);
  // It travels: the frames between the ends move one way, never back.
  const progress = samples.map(({value}) => (value - start) / (end - start));
  await releaseAnimations(page, {finish: true});
  await thawTimers(page);
  expect(progress.some(share => share > 0.05 && share < 0.95)).toBe(true);
  for (let index = 1; index < progress.length; index += 1) {
    expect(progress[index]).toBeGreaterThanOrEqual(progress[index - 1] - 1e-6);
  }
  await waitForRest(track);
  expect(await monthsIn(viewport)).toBeCloseTo(10, 2);
});

/**
 * `script` with its lift sent right after its last move. A lift that waits
 * for its own time can reach a loaded page more than 40 ms late. The page
 * then reads a resting finger, which releases at no speed.
 */
function liftWithLastMove(script: TouchScript): TouchScript {
  const lift = script.at(-1);
  const last = script.at(-2);
  if (lift == null || last == null) {
    return script;
  }
  return [...script.slice(0, -1), {...lift, t: last.t}];
}

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
  // nearest it. The drag rests before the lift, so it releases at no speed.
  // The settle then runs by position, whatever a loaded runner does to the
  // moves' times.
  const {driver, title, track, center, width} = await openCalendar(page);
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
  // The page holds the settle as soon as it runs, so Next lands mid-settle
  // on any runner. The arrow's own step then replaces the held settle.
  const hold = await armHold(page, track, {
    judges: {target: track, property: 'translate'},
  });
  await driver.play(slowDrag(center, -0.7 * width));
  expect((await hold.held()).length).toBeGreaterThan(0);
  await tapArrow(page, driver, 'Next month');
  await releaseAnimations(page);
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
    const track = element.firstElementChild;
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
  // from usePager's animator default.
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
    "WebKit's screencast clock is not the page's (frames arrive ~100 ms off), so the step's motion cannot be placed inside the block; Mobile Safari on the iOS simulator is this proof's WebKit evidence",
  );
  await openCalendar(page);
  // The incoming month, whose chip shows as soon as its edge slides in.
  const incoming = page.getByRole('grid', {name: 'November 2026'});
  await markElement(incoming, {inset: 8});
  const cast = await startScreencast(page);
  await page.waitForTimeout(300);
  // The page schedules the tap and an 800 ms block 90 ms in. A harness round
  // trip would eat most of the step's motion.
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
  /**
   * Plays `script` while the page records, every frame, the sheet's drop and
   * the grid's offset, and counts the moves that reach the sheet. The split
   * keeps the grid's moves from the sheet, so that count names who took the
   * drag on any runner. The page samples the rest itself: an evaluate per
   * move would slow the script on a loaded runner and blunt the fast flick.
   */
  const play = async (script: Parameters<typeof driver.play>[0]) => {
    await sheet.evaluate((sheetElement, top) => {
      const months = document.querySelector('[data-scroller="months"]');
      const track = months?.firstElementChild;
      const seen = {
        sheetDrop: 0,
        monthsMin: Infinity,
        monthsMax: -Infinity,
        sheetMoves: 0,
        frame: 0,
        stop: () => {},
      };
      const countMove = () => {
        seen.sheetMoves += 1;
      };
      sheetElement.addEventListener('touchmove', countMove, {passive: true});
      seen.stop = () => {
        sheetElement.removeEventListener('touchmove', countMove);
      };
      const sample = () => {
        if (months == null || track == null) {
          return;
        }
        const drop = Math.abs(sheetElement.getBoundingClientRect().y - top);
        seen.sheetDrop = Math.max(seen.sheetDrop, drop);
        const box = months.getBoundingClientRect();
        const offset =
          (box.left - track.getBoundingClientRect().left) / box.width;
        seen.monthsMin = Math.min(seen.monthsMin, offset);
        seen.monthsMax = Math.max(seen.monthsMax, offset);
        seen.frame = requestAnimationFrame(sample);
      };
      sample();
      (window as unknown as {splitSeen: typeof seen}).splitSeen = seen;
    }, topBefore);
    await driver.play(script);
    return page.evaluate(() => {
      const {splitSeen} = window as unknown as {
        splitSeen: {
          sheetDrop: number;
          monthsMin: number;
          monthsMax: number;
          sheetMoves: number;
          frame: number;
          stop: () => void;
        };
      };
      cancelAnimationFrame(splitSeen.frame);
      splitSeen.stop();
      return {
        sheetDrop: splitSeen.sheetDrop,
        monthsMin: splitSeen.monthsMin,
        monthsMax: splitSeen.monthsMax,
        sheetMoves: splitSeen.sheetMoves,
      };
    });
  };

  // 35°, slow (4 px steps): the sideways travel reaches 10 px first. The
  // grid follows the finger, the sheet stays, and the slow release settles
  // back on September.
  const shallow = await play(
    drag(center, along(35, 145), {durationMs: 500, restMs: 150}),
  );
  expect(shallow.sheetMoves).toBe(0);
  expect(shallow.sheetDrop).toBeLessThan(1);
  expect(shallow.monthsMax - 9).toBeGreaterThan(0.2);
  await waitForRest(track);
  expect(await monthsIn(viewport)).toBeCloseTo(9, 2);

  // 55°, fast (25 px steps, ~1500 px/s): the first move lands 14 px
  // sideways. So the grid takes the drag: no move reaches the sheet, and the
  // sheet never moves. Where the grid then rests depends on the release's
  // speed, which a loaded runner can change, so it is read, not asserted.
  const fast = await play(drag(center, along(55, 150), {durationMs: 100}));
  expect(fast.sheetMoves).toBe(0);
  expect(fast.sheetDrop).toBeLessThan(1);
  await waitForRest(track);
  const restsOn = await monthsIn(viewport);
  expect([9, 10]).toContain(Math.round(restsOn));
  expect(restsOn).toBeCloseTo(Math.round(restsOn), 2);

  // 60°, slow (3.3 px steps): the vertical travel reaches 10 px first, so
  // the sheet takes the drag and the grid never moves.
  const steep = await play(
    drag(center, along(60, 120), {durationMs: 600, restMs: 150}),
  );
  expect(steep.sheetMoves).toBeGreaterThan(0);
  expect(steep.sheetDrop).toBeGreaterThan(20);
  expect(steep.monthsMax - steep.monthsMin).toBeLessThan(0.01);
  expect(await monthsIn(viewport)).toBeCloseTo(restsOn, 2);
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
    // The page holds the step as soon as it runs, so a busy page cannot let
    // it end before the film starts.
    const hold = await armHold(page, track, {
      judges: {target: track, property: 'translate'},
    });
    await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
    const held = await hold.held();
    await freezeTimers(page);
    const {storyboard} = await animationStoryboard(page, {
      name: 'month-pager-arrow-step',
      clip: viewport,
      scope: track,
      held,
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
    // The page holds the settle as soon as it runs, as for the arrow step.
    const hold = await armHold(page, track, {
      judges: {target: track, property: 'translate'},
    });
    await driver.play(slowDrag(center, -0.7 * width));
    const held = await hold.held();
    await freezeTimers(page);
    const {storyboard} = await animationStoryboard(page, {
      name: 'month-pager-release-settle',
      clip: viewport,
      scope: track,
      held,
      columns: 6,
      cellScale: 0.4,
      measure: async () => ({months: +(await monthsIn(viewport)).toFixed(3)}),
    });
    await storyboard.write(testInfo);
    await releaseAnimations(page, {finish: true});
    await thawTimers(page);
  },
);

test.describe('a trackpad (spec:AST-094 FR43)', () => {
  // WebKit's driver sends a trackpad's precise deltas from a desktop context;
  // the pager is opened alone there.
  test.use({hasTouch: false, isMobile: false});
  const TRACKPAD_IN_WEBKIT =
    "Chromium's driver sends each wheel as a mouse wheel's notch; only WebKit's sends a trackpad's precise deltas";

  async function openPager(page: Page) {
    await openStory(page, storybook(), 'core-monthpager--pager');
    const field = page.getByRole('textbox', {name: 'Shown month'});
    await expect(field).toHaveValue('2026-03');
    const viewport = page.locator('[data-scroller="months"]');
    await expect(viewport).toBeVisible();
    const box = await viewport.boundingBox();
    if (box == null) {
      throw new Error('no pager');
    }
    return {
      field,
      track: viewport.locator(':scope > *'),
      at: {x: box.x + box.width / 2, y: box.y + box.height / 2},
    };
  }

  test('a slow 30 px trackpad swipe leaves the pager on its month, and the month never changes on the way', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'webkit', TRACKPAD_IN_WEBKIT);
    const {field, track, at} = await openPager(page);
    const input = await webInputDriver(page);
    test.skip(!input.wheels, WHEEL_SKIP);
    // Five steps of 6 px, 40 ms apart.
    for (let i = 0; i < 5; i++) {
      await input.wheel({...at, dx: 6});
      expect(await field.inputValue()).toBe('2026-03');
      await page.waitForTimeout(40);
    }
    // A trackpad scroll ends 220 ms after its last wheel.
    await page.waitForTimeout(300);
    await waitForRest(track);
    await expect(field).toHaveValue('2026-03');
  });

  test('a trackpad swipe past half a page pages one month', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'webkit', TRACKPAD_IN_WEBKIT);
    const {field, track, at} = await openPager(page);
    const input = await webInputDriver(page);
    test.skip(!input.wheels, WHEEL_SKIP);
    // 40 steps of 6.5 px: 260 px, past half of the 360 px page.
    for (let i = 0; i < 40; i++) {
      await input.wheel({...at, dx: 6.5});
    }
    await page.waitForTimeout(300);
    await waitForRest(track);
    await expect(field).toHaveValue('2026-04');
  });
});
