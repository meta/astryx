// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MonthYearToggle.interaction.browser.spec.ts
 * @input The built "Bottom Sheet Calendar" DateInput story, real touch input
 *   and the interaction harness
 * @output Interaction proofs, in Chromium and WebKit, that the calendar's
 *   month/year toggle runs on the theme's tokens under a finger. They cover
 *   the fades, the chevron, a turnaround, a blocked main thread, Reduced
 *   Motion, RTL and the calendar beneath the wheels
 * @position Interaction tests of TouchDateField.tsx, TouchDateTimeField.tsx and
 *   MonthPager.tsx (`*.interaction.browser.spec.ts`)
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
  blockMainThread,
  busyWindowProof,
  freezeTimers,
  installTimerGate,
  markElement,
  openStory,
  releaseAnimations,
  startScreencast,
  thawTimers,
  timeline,
  touchDriver,
  waitForRest,
  watchAnimations,
  webInputDriver,
  withStorybook,
  writeEvidence,
  type ActiveAnimation,
  type CastFrame,
  type TrackedFrame,
} from '@astryxdesign/interaction-harness';
import {datePicker} from '../../motion/uikit/datePicker';

const storybook = withStorybook(test);

/** The title chevron's quarter turn, from the UIKit table. */
const TURN = `rotate(-${datePicker.calendar.monthYearToggle.chevronTurnDegrees}deg)`;

/** CSS's named cubic-bézier easings, which a browser may report by name. */
const NAMED_EASINGS: Record<string, ReadonlyArray<number>> = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
  linear: [0, 0, 1, 1],
};

/**
 * A reported easing's cubic-bézier control points: Chromium reports
 * `cubic-bezier(0.42, 0, 0.58, 1)` where WebKit names it `ease-in-out`.
 */
function bezierOf(easing: string): ReadonlyArray<number> {
  const named = NAMED_EASINGS[easing.trim()];
  if (named != null) {
    return named;
  }
  const match = /^cubic-bezier\(([^)]+)\)$/.exec(easing.trim());
  if (match == null) {
    throw new Error(`not a cubic-bézier easing: ${easing}`);
  }
  return match[1].split(',').map(Number);
}

/** The toggle's tokens, as the page's theme resolves them. */
interface ToggleTokens {
  /** `--duration-medium-min`, in ms. */
  ms: number;
  /** The control points of `--ease-entrance`, `--ease-exit` and `--ease-move`. */
  entrance: ReadonlyArray<number>;
  exit: ReadonlyArray<number>;
  move: ReadonlyArray<number>;
}

/**
 * Reads the toggle's tokens from the sheet. A browser spec cannot import
 * tokens.stylex.ts, which needs the StyleX compiler, and a theme's tempo and
 * character set the values.
 */
async function toggleTokens(page: Page): Promise<ToggleTokens> {
  const [duration, entrance, exit, move] = await page
    .locator('.astryx-bottom-sheet')
    .first()
    .evaluate(element => {
      const style = getComputedStyle(element);
      return [
        '--duration-medium-min',
        '--ease-entrance',
        '--ease-exit',
        '--ease-move',
      ].map(name => style.getPropertyValue(name).trim());
    });
  const ms = Number.parseFloat(duration);
  expect(ms, duration).toBeGreaterThan(0);
  return {
    ms: duration.endsWith('ms') ? ms : ms * 1000,
    entrance: bezierOf(entrance),
    exit: bezierOf(exit),
    move: bezierOf(move),
  };
}

/** The steepest slope of a cubic-bézier easing, in output per unit of time. */
function steepestSlope([x1, y1, x2, y2]: ReadonlyArray<number>): number {
  const at = (t: number, a: number, b: number) =>
    3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t ** 2 + t ** 3;
  let steepest = 0;
  for (let i = 0; i < 1000; i += 1) {
    const [t0, t1] = [i / 1000, (i + 1) / 1000];
    const dx = at(t1, x1, x2) - at(t0, x1, x2);
    if (dx > 0) {
      steepest = Math.max(steepest, (at(t1, y1, y2) - at(t0, y1, y2)) / dx);
    }
  }
  return steepest;
}

/**
 * The toggle's run of `property` as the page plays it: `ease` over the
 * toggle's duration token, from one end value to the other. It is read from
 * the watched transition itself, whose duration, easing and end values fix
 * every frame. A hold taken after the tap returns can miss the fade on a
 * loaded runner.
 */
function expectToggleRun(
  runs: ReadonlyArray<ActiveAnimation>,
  property: string,
  [from, to]: readonly [string, string],
  {ms, ease}: {ms: number; ease: ReadonlyArray<number>},
) {
  const run = runs.find(candidate => candidate.name === property);
  if (run == null) {
    throw new Error(`no ${property} run among ${JSON.stringify(runs)}`);
  }
  expect(run.durationMs).toBe(ms);
  const points = bezierOf(run.easing);
  ease.forEach((point, index) =>
    expect(points[index], run.easing).toBeCloseTo(point, 3),
  );
  const frames = run.keyframes;
  expect(String(frames[0][property])).toBe(from);
  expect(String(frames[frames.length - 1][property])).toBe(to);
}

const STORY = 'core-dateinput--bottom-sheet-calendar';
const DTI_STORY = 'core-datetimeinput--bottom-sheet-calendar';

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
  {rtl = false, story = STORY}: {rtl?: boolean; story?: string} = {},
) {
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
    await openStory(page, storybook(), story);
  }
  const driver = await touchDriver(page);
  const opener = page.getByRole('button', {name: /calendar/i}).first();
  const box = await opener.boundingBox();
  if (box == null) {
    throw new Error('no opener');
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  const sheet = page
    .getByRole('dialog')
    .locator('.astryx-bottom-sheet')
    .first();
  await settlesAt(sheet, 'transform', 'matrix(1, 0, 0, 1, 0, 0)');
  const wheels = page.locator('[data-panel="wheels"]').first();
  const title = page.locator('[data-title="month-year"]');
  const titleBox = await title.boundingBox();
  if (titleBox == null) {
    throw new Error('no title');
  }
  return {
    driver,
    sheet,
    wheels,
    titleAt: {
      x: titleBox.x + titleBox.width / 2,
      y: titleBox.y + titleBox.height / 2,
    },
  };
}

/** Every running animation under `root`: its animated properties and duration. */
async function runningAnimations(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate(root =>
      root.getAnimations({subtree: true}).map(animation => {
        const effect = animation.effect as KeyframeEffect;
        return {
          properties: [
            ...new Set(
              effect
                .getKeyframes()
                .flatMap(frame =>
                  Object.keys(frame).filter(
                    key =>
                      ![
                        'offset',
                        'easing',
                        'composite',
                        'computedOffset',
                      ].includes(key),
                  ),
                ),
            ),
          ],
          duration: Number(effect.getTiming().duration),
        };
      }),
    );
}

test('the wheels fade in and the chevron turns on the theme’s tokens nearest UIKit’s toggle', async ({
  page,
}) => {
  const {driver, wheels, titleAt} = await openCalendar(page);
  const tokens = await toggleTokens(page);
  const chevron = page
    .locator('[data-title="month-year"] .astryx-icon')
    .first();
  const fade = await watchAnimations(wheels);
  const turn = await watchAnimations(chevron);
  await driver.tap(titleAt);
  expectToggleRun(await fade.started(), 'opacity', ['0', '1'], {
    ms: tokens.ms,
    ease: tokens.entrance,
  });
  expectToggleRun(await turn.started(), 'transform', [TURN, 'rotate(0deg)'], {
    ms: tokens.ms,
    ease: tokens.move,
  });
});

test('the wheels fade out on the exit curve when they close', async ({
  page,
}) => {
  const {driver, wheels, titleAt} = await openCalendar(page);
  const tokens = await toggleTokens(page);
  await driver.tap(titleAt);
  // The opening fade's own end, so the closing run starts from full opacity.
  await waitForOpacityAbove(wheels, 0.99);
  await wheels.evaluate(async element => {
    await Promise.all(
      element
        .getAnimations()
        .map(async animation => animation.finished.catch(() => undefined)),
    );
  });
  const fade = await watchAnimations(wheels);
  await driver.tap(titleAt);
  expectToggleRun(await fade.started(), 'opacity', ['1', '0'], {
    ms: tokens.ms,
    ease: tokens.exit,
  });
});

test('DateTimeInput: the wheels fade in over the calendar on the theme’s motion tokens, the title chevron turning with them', async ({
  page,
}) => {
  await openStory(page, storybook(), DTI_STORY);
  const driver = await touchDriver(page);
  const tapCenter = async (selector: string) => {
    const box = await page.locator(selector).first().boundingBox();
    if (box == null) {
      throw new Error(`no ${selector}`);
    }
    await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  };
  await tapCenter('button[aria-label^="Open "]');
  const wheels = page.locator('[data-date-surface="wheels"]').first();
  await expect(wheels).toBeAttached();
  await waitForRest(
    page.getByRole('dialog').locator('.astryx-bottom-sheet').first(),
  );
  const tokens = await toggleTokens(page);
  const chevron = page
    .locator('button[aria-label$="Choose month and year"] .astryx-icon')
    .first();
  const fade = await watchAnimations(wheels);
  const turn = await watchAnimations(chevron);
  await tapCenter('button[aria-label$="Choose month and year"]');
  expectToggleRun(await fade.started(), 'opacity', ['0', '1'], {
    ms: tokens.ms,
    ease: tokens.entrance,
  });
  expectToggleRun(await turn.started(), 'transform', [TURN, 'rotate(0deg)'], {
    ms: tokens.ms,
    ease: tokens.move,
  });
});

test('a second tap mid-fade turns the fade around from where it is', async ({
  page,
}) => {
  const {driver, wheels, titleAt} = await openCalendar(page);
  const tokens = await toggleTokens(page);
  // A test stylesheet stretches the toggle's fades and the chevron's turn to
  // 2 s. So the second tap lands mid-fade every time, instead of racing a
  // toggle's fade. The turnaround does not depend on the length.
  await page.addStyleTag({
    content:
      '[data-panel], button[aria-label$="Choose month and year"] .astryx-icon { transition-duration: 2000ms !important; }',
  });
  // Every frame's opacity, with the page's clock, from before the first tap
  // until the wheels rest: the turnaround is read from the fade itself. A log
  // started after the wait below could begin once the turnaround had begun,
  // reading its first value as the peak.
  await wheels.evaluate(element => {
    const state = {log: [] as [number, number][], stop: false};
    (window as unknown as {fade: typeof state}).fade = state;
    const t0 = performance.now();
    const tick = () => {
      state.log.push([
        performance.now() - t0,
        Number(getComputedStyle(element).opacity),
      ]);
      if (!state.stop) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
  await driver.tap(titleAt);
  await wheels.evaluate(
    async element =>
      new Promise<void>(resolve => {
        const check = () => {
          if (Number(getComputedStyle(element).opacity) > 0.3) {
            resolve();
          } else {
            requestAnimationFrame(check);
          }
        };
        check();
      }),
  );
  await driver.tap(titleAt);
  await waitForRest(wheels);
  const fade = await page.evaluate(() => {
    const state = (
      window as unknown as {fade: {log: [number, number][]; stop: boolean}}
    ).fade;
    state.stop = true;
    return state.log;
  });
  const values = fade.map(([, opacity]) => opacity);
  const peak = Math.max(...values);
  const peakAt = values.indexOf(peak);
  // The first fade never finished: the second tap caught it part way in.
  expect(peak).toBeGreaterThan(0.3);
  expect(peak).toBeLessThan(0.95);
  // From there it only falls back to 0: never up to 1, never a jump. The fall
  // is a leave, on the exit curve the hidden style carries. Each step falls at
  // most what that curve's steepest slope covers in the step's own time on
  // the 2 s run. That time counts as at least 50 ms. So a late frame is not a
  // jump, and a jump still fails.
  const steepest = steepestSlope(tokens.exit);
  for (let i = peakAt + 1; i < fade.length; i += 1) {
    const [time, opacity] = fade[i];
    const [lastTime, last] = fade[i - 1];
    expect(opacity).toBeLessThanOrEqual(last + 1e-6);
    expect(last - opacity).toBeLessThan(
      (1.5 * steepest * Math.max(50, time - lastTime)) / 2000,
    );
  }
  expect(fade.at(-1)?.[1]).toBe(0);
});

/** Resolves once `locator`'s element shows more than `opacity`, page-side. */
async function waitForOpacityAbove(locator: Locator, opacity: number) {
  await locator.evaluate(
    async (element, above) =>
      new Promise<void>(resolve => {
        const check = () => {
          if (Number(getComputedStyle(element).opacity) > above) {
            resolve();
          } else {
            requestAnimationFrame(check);
          }
        };
        check();
      }),
    opacity,
  );
}

/** Every transition in the open sheet, stretched so a tap lands mid-fade. */
const STRETCH_SHEET_FADES =
  'dialog[open] * { transition-duration: 2000ms !important; }';

test('a tap on Done during the opening fade does not reach Save beneath it', async ({
  page,
}) => {
  const {driver, wheels, titleAt} = await openCalendar(page);
  const field = page.getByRole('combobox').first();
  const value = await field.inputValue();
  // Counts the clicks that reach Save, beneath Done in the footer.
  await page
    .locator('dialog[open] button', {hasText: /^Save$/})
    .evaluate(button => {
      const counter = window as unknown as {saveClicks: number};
      counter.saveClicks = 0;
      button.addEventListener('click', () => {
        counter.saveClicks += 1;
      });
    });
  await page.addStyleTag({content: STRETCH_SHEET_FADES});
  await driver.tap(titleAt);
  await waitForOpacityAbove(wheels, 0.3);
  const done = await page
    .locator('dialog[open] button', {hasText: /^Done$/})
    .boundingBox();
  if (done == null) {
    throw new Error('no Done');
  }
  await driver.tap({x: done.x + done.width / 2, y: done.y + done.height / 2});
  await waitForRest(wheels);
  // Nothing reached Save: the sheet is still open, on the wheels, and
  // nothing was saved.
  expect(
    await page.evaluate(
      () => (window as unknown as {saveClicks: number}).saveClicks,
    ),
  ).toBe(0);
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  expect(await wheels.evaluate(e => getComputedStyle(e).opacity)).toBe('1');
  expect(await field.inputValue()).toBe(value);
});

test('DateTimeInput: a tap on the month arrows during the opening fade changes nothing', async ({
  page,
}) => {
  await openStory(page, storybook(), DTI_STORY);
  const driver = await touchDriver(page);
  const tapCenter = async (selector: string) => {
    const box = await page.locator(selector).first().boundingBox();
    if (box == null) {
      throw new Error(`no ${selector}`);
    }
    await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  };
  await tapCenter('button[aria-label^="Open "]');
  await waitForRest(
    page.getByRole('dialog').locator('.astryx-bottom-sheet').first(),
  );
  // Counts the clicks that reach the next-month arrow.
  await page
    .locator('button[aria-label="Next month"]')
    .first()
    .evaluate(button => {
      const counter = window as unknown as {arrowClicks: number};
      counter.arrowClicks = 0;
      button.addEventListener('click', () => {
        counter.arrowClicks += 1;
      });
    });
  await page.addStyleTag({content: STRETCH_SHEET_FADES});
  await tapCenter('button[aria-label$="Choose month and year"]');
  await waitForOpacityAbove(
    page.locator('[data-date-surface="wheels"]').first(),
    0.3,
  );
  await tapCenter('button[aria-label="Next month"]');
  await waitForRest(page.locator('[data-date-surface="wheels"]').first());
  expect(
    await page.evaluate(
      () => (window as unknown as {arrowClicks: number}).arrowClicks,
    ),
  ).toBe(0);
});

/**
 * The chip's mean green channel in every frame: magenta over whatever is
 * beneath, so it moves with the panel's opacity.
 */
async function chipShades(
  page: Page,
  frames: ReadonlyArray<CastFrame>,
  rect: {x: number; y: number; width: number; height: number},
): Promise<{t: number; green: number}[]> {
  const scratch = await page.context().newPage();
  try {
    const out: {t: number; green: number}[] = [];
    for (let i = 0; i < frames.length; i += 12) {
      const batch = frames.slice(i, i + 12);
      const greens = await scratch.evaluate(
        async ({items, box}) => {
          const results: number[] = [];
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
            // The chip's middle, clear of its anti-aliased edge.
            const x = Math.round((box.x + box.width / 4) * scale);
            const y = Math.round((box.y + box.height / 4) * scale);
            const w = Math.max(1, Math.round((box.width / 2) * scale));
            const h = Math.max(1, Math.round((box.height / 2) * scale));
            const {data} = context.getImageData(x, y, w, h);
            let sum = 0;
            for (let o = 1; o < data.length; o += 4) {
              sum += data[o];
            }
            results.push(sum / (data.length / 4));
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
      greens.forEach((green, k) => out.push({t: batch[k].t, green}));
    }
    return out;
  } finally {
    await scratch.close();
  }
}

test('the wheels keep fading in every frame through a blocked main thread', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName === 'webkit',
    "WebKit's screencast clock is not the page's (frames arrive ~100 ms off), so the toggle's fade cannot be placed inside the block; Mobile Safari on the iOS simulator is this proof's WebKit evidence",
  );
  const {driver, wheels, titleAt} = await openCalendar(page);
  const tokens = await toggleTokens(page);
  // A magenta chip on the wheels' panel: its colour on screen is the fade.
  await markElement(wheels, {inset: 8, size: 24});
  const chip = page.locator('[data-harness-marker-chip]').first();
  const rect = await chip.boundingBox();
  if (rect == null) {
    throw new Error('no chip');
  }
  const cast = await startScreencast(page);
  await page.waitForTimeout(300);
  await driver.tap(titleAt);
  // The page blocks itself once the fade has run 32 ms: started, and on
  // screen. This guards the compositor path once a fade is on screen, which
  // a CSS fade passes too; the next case is what the animator changes.
  const busy = await blockMainThread(page, 600, {
    during: wheels,
    minProgressMs: 32,
  });
  await page.waitForTimeout(600);
  const shades = await chipShades(page, await cast.stop(), rect);
  const before = shades[0]?.green;
  const end = shades.at(-1)?.green;
  if (before == null || end == null || before - end < 50) {
    throw new Error('the chip did not show the fade');
  }
  // Opacity in thousandths, as a position the busy proof can judge.
  const tracked: TrackedFrame[] = shades.map(s => ({
    t: s.t,
    box: {
      x: (1000 * (before - s.green)) / (before - end),
      y: 0,
      width: 0,
      height: 0,
    },
    pixels: 1,
  }));
  const started = busy.from - 32;
  const spanned = {...busy, to: Math.min(busy.to, started + tokens.ms)};
  expect(spanned.to - spanned.from).toBeGreaterThan(0.6 * tokens.ms);
  const proof = busyWindowProof(tracked, spanned, {
    axis: 'x',
    settledWithin: 10,
  });
  await writeEvidence(
    'busy-main-thread/month-year-toggle-fade',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {
          busy,
          proof,
          frames: tracked.map(f => ({
            t: +(f.t - started).toFixed(1),
            opacity: +((f.box?.x ?? 0) / 1000).toFixed(3),
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

test('Reduced Motion: the wheels cross-fade in at most 200 ms and the chevron dips instead of turning', async ({
  page,
}) => {
  // On a touch screen: opacity only, plus the discrete `visibility` that
  // follows it, for 200 ms or less from the policy's keys. The chevron's turn
  // applies at the middle of its dip.
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {driver, wheels, titleAt} = await openCalendar(page);
  await driver.tap(titleAt);
  const panel = await runningAnimations(page, '[data-panel="wheels"]');
  expect(panel.map(animation => animation.properties).flat()).toContain(
    'opacity',
  );
  for (const animation of panel) {
    for (const property of animation.properties) {
      expect(['opacity', 'visibility']).toContain(property);
    }
    expect(animation.duration).toBeLessThanOrEqual(200);
  }
  // The chevron dips; its turn is no transition but an instant change that
  // lands at the dip's middle, while the glyph is transparent.
  const chevron = (
    await runningAnimations(page, '[data-title="month-year"] .astryx-icon')
  ).filter(animation => animation.duration > 0);
  expect(chevron.length).toBeGreaterThan(0);
  for (const animation of chevron) {
    expect(animation.properties).toEqual(['opacity']);
    expect(animation.duration).toBeLessThanOrEqual(200);
  }
  const icon = page.locator('[data-title="month-year"] .astryx-icon').first();
  const turn = await icon.evaluate(element => {
    const style = getComputedStyle(element);
    return {duration: style.transitionDuration, delay: style.transitionDelay};
  });
  expect(turn).toEqual({duration: '0s', delay: '0s'});
  await waitForRest(wheels);
  // Once the dip has landed, the chevron shows the turn: it points down.
  expect(
    await icon.evaluate(element => getComputedStyle(element).transform),
  ).toBe('matrix(1, 0, 0, 1, 0, 0)');
});

test('DateTimeInput: Done hands focus to the shown month’s day once the calendar can take focus', async ({
  page,
}) => {
  await openStory(page, storybook(), DTI_STORY);
  const driver = await touchDriver(page);
  const tapCenter = async (selector: string) => {
    const box = await page.locator(selector).first().boundingBox();
    if (box == null) {
      throw new Error(`no ${selector}`);
    }
    await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  };
  await tapCenter('button[aria-label^="Open "]');
  await waitForRest(
    page.getByRole('dialog').locator('.astryx-bottom-sheet').first(),
  );
  await tapCenter('button[aria-label$="Choose month and year"]');
  const wheels = page.locator('[data-date-surface="wheels"]').first();
  await waitForRest(wheels);
  // Done from the keyboard: focus sits in the wheels' footer.
  const done = wheels.getByRole('button', {name: 'Done', exact: true});
  await done.focus();
  await page.keyboard.press('Enter');
  // The story's value is March 15, 2026: the shown month's tab stop.
  const day = page.locator(
    'button[data-date="2026-03-15"]:not([data-outside])',
  );
  await expect(day).toBeFocused();
  await expect(day).toHaveAttribute('tabindex', '0');
  await expect(day).toBeInViewport();
});

test('in RTL the chevron points left, and turns to point down', async ({
  page,
}) => {
  const {driver, wheels, titleAt} = await openCalendar(page, {rtl: true});
  const tokens = await toggleTokens(page);
  // Where the chevron's glyph (drawn pointing down) points on screen: its
  // transform (the turn, mirrored under RTL) applied to +y.
  const pointing = async () =>
    page.evaluate(() => {
      const icon = document.querySelector<HTMLElement>(
        '[data-title="month-year"] .astryx-icon',
      );
      if (icon == null) {
        throw new Error('no chevron');
      }
      const value = getComputedStyle(icon).transform;
      const matrix = new DOMMatrix(value === 'none' ? undefined : value);
      const p = matrix.transformPoint(new DOMPoint(0, 1));
      const q = matrix.transformPoint(new DOMPoint(0, 0));
      return {x: +(p.x - q.x).toFixed(3), y: +(p.y - q.y).toFixed(3)};
    });
  await expect(page.locator('[dir="rtl"]').first()).toBeAttached();
  expect(await pointing()).toEqual({x: -1, y: 0});
  await driver.tap(titleAt);
  await waitForRest(wheels);
  await page.waitForTimeout(tokens.ms + 100);
  expect(await pointing()).toEqual({x: 0, y: 1});
});

test('a finger’s tapped day selects at once', async ({page}) => {
  const {driver} = await openCalendar(page);
  const day = page.getByRole('button', {name: /October 20, 2026/});
  const box = await day.boundingBox();
  if (box == null) {
    throw new Error('no day');
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  // No transition on the day: nothing is animating once the tap is handled.
  const puck = await day.evaluate(element => ({
    duration: Number.parseFloat(
      getComputedStyle(element.firstElementChild ?? element).transitionDuration,
    ),
    running: element.getAnimations({subtree: true}).length,
  }));
  expect(puck).toEqual({duration: 0, running: 0});
  await expect(page.getByRole('gridcell', {selected: true})).toContainText(
    '20',
  );
});

test('a pen pick in the touch sheet keeps the fade', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Only Chromium’s driver sends a pen as a pen',
  );
  await openCalendar(page);
  const day = page.getByRole('button', {name: /October 20, 2026/});
  const box = await day.boundingBox();
  if (box == null) {
    throw new Error('no day');
  }
  const at = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  await (
    await webInputDriver(page)
  ).pen([
    {...at, t: 0},
    {...at, t: 40},
  ]);
  await expect(page.getByRole('gridcell', {selected: true})).toContainText(
    '20',
  );
  const fade = await day.evaluate(element => {
    const style = getComputedStyle(element.firstElementChild ?? element);
    const ms = (value: string) =>
      value.trim().endsWith('ms')
        ? Number.parseFloat(value)
        : Number.parseFloat(value) * 1000;
    return {
      duration: ms(style.transitionDuration),
      fast: ms(style.getPropertyValue('--duration-fast')),
    };
  });
  expect(fade.duration).toBeGreaterThan(0);
  expect(fade.duration).toBe(fade.fast);
});

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test('a picked day’s selection keeps the fade, on the theme’s fast duration', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    await page
      .getByRole('button', {name: /calendar/i})
      .first()
      .click();
    const day = page.getByRole('button', {name: /October 20, 2026/});
    await day.click();
    await expect(page.getByRole('gridcell', {selected: true})).toContainText(
      '20',
    );
    const fade = await day.evaluate(element => {
      const style = getComputedStyle(element.firstElementChild ?? element);
      const ms = (value: string) =>
        value.trim().endsWith('ms')
          ? Number.parseFloat(value)
          : Number.parseFloat(value) * 1000;
      return {
        property: style.transitionProperty,
        duration: ms(style.transitionDuration),
        fast: ms(style.getPropertyValue('--duration-fast')),
      };
    });
    expect(fade.property).toBe('background-color, color, border-color');
    expect(fade.duration).toBeGreaterThan(0);
    expect(fade.duration).toBe(fade.fast);
  });
});

/** The computed state of the hidden wheels panel and its fade. */
async function wheelsState(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate(element => {
      const style = getComputedStyle(element);
      return {
        visibility: style.visibility,
        opacity: style.opacity,
        inert: (element as HTMLElement).inert,
        ariaHidden: element.getAttribute('aria-hidden'),
        transitionProperty: style.transitionProperty,
        transitionDuration: style.transitionDuration,
        transitionTimingFunction: style.transitionTimingFunction,
        inlineOpacity: (element as HTMLElement).style.opacity,
      };
    });
}

type CommitLog = {
  frame: number;
  /** The document timeline's time, ms. */
  time: number;
  panel: string;
  attribute: string | null;
  present: boolean;
  opacity: number;
  visibility: string;
  wheelsOpacity: number;
  pointerEvents: string;
}[];

for (const [name, story, titleSelector, panelSelector, panelKey] of [
  ['DateInput', STORY, '[data-title="month-year"]', '[data-panel]', 'panel'],
  [
    'DateTimeInput',
    DTI_STORY,
    'button[aria-label$="Choose month and year"]',
    '[data-date-surface]',
    'dateSurface',
  ],
] as const) {
  test(`${name}: the toggle's commit flips no inherited property on the panels; they swap inert when the fade ends`, async ({
    page,
  }) => {
    // `inert` and `pointer-events` are inherited: flipping either restyles a
    // panel's whole subtree. So the toggle's commit changes only the panels'
    // classes and `aria-hidden`. A shield takes touches during the fade, and
    // the panels swap `inert` at its end, when nothing moves.
    await openStory(page, storybook(), story);
    const driver = await touchDriver(page);
    const tapCenter = async (selector: string) => {
      const box = await page.locator(selector).first().boundingBox();
      if (box == null) {
        throw new Error(`no ${selector}`);
      }
      await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
    };
    await tapCenter('button[aria-label^="Open "]');
    const wheels = page
      .locator(`${panelSelector.slice(0, -1)}="wheels"]`)
      .first();
    await settlesAt(
      page.getByRole('dialog').locator('.astryx-bottom-sheet').first(),
      'transform',
      'matrix(1, 0, 0, 1, 0, 0)',
    );
    const tokens = await toggleTokens(page);
    await page.evaluate(
      ({selector, key}) => {
        const state = {
          frames: 0,
          log: [] as CommitLog,
          shielded: null as boolean | null,
        };
        (window as unknown as {toggleCommit: typeof state}).toggleCommit =
          state;
        const tick = () => {
          state.frames += 1;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        const panels = [...document.querySelectorAll<HTMLElement>(selector)];
        const observer = new MutationObserver(records => {
          if (state.shielded == null) {
            // One frame into the fade: a touch on the panels' middle meets
            // the shield, not a control inside either panel.
            state.shielded = false;
            requestAnimationFrame(() => {
              const box = panels[0].getBoundingClientRect();
              const hit = document.elementFromPoint(
                box.left + box.width / 2,
                box.top + box.height / 2,
              );
              state.shielded =
                hit != null && !panels.some(panel => panel.contains(hit));
            });
          }
          for (const record of records) {
            const target = record.target as HTMLElement;
            const style = getComputedStyle(target);
            const wheelsPanel = panels.find(
              panel => panel.dataset[key] === 'wheels',
            );
            state.log.push({
              frame: state.frames,
              time: Number(document.timeline.currentTime),
              panel: target.dataset[key] ?? '',
              attribute: record.attributeName,
              present:
                record.attributeName != null &&
                target.hasAttribute(record.attributeName),
              opacity: Number(style.opacity),
              visibility: style.visibility,
              wheelsOpacity:
                wheelsPanel == null
                  ? NaN
                  : Number(getComputedStyle(wheelsPanel).opacity),
              pointerEvents: style.pointerEvents,
            });
          }
        });
        for (const panel of panels) {
          observer.observe(panel, {
            attributes: true,
            attributeFilter: ['class', 'inert', 'aria-hidden'],
          });
        }
      },
      {selector: panelSelector, key: panelKey},
    );
    await tapCenter(titleSelector);
    await waitForRest(wheels);
    await page.waitForTimeout(150);
    const {log, shielded} = await page.evaluate(
      () =>
        (
          window as unknown as {
            toggleCommit: {log: CommitLog; shielded: boolean | null};
          }
        ).toggleCommit,
    );
    expect(shielded).toBe(true);
    const commitFrame = log.find(entry => entry.attribute === 'class')?.frame;
    expect(commitFrame, JSON.stringify(log)).toBeDefined();
    for (const change of log.filter(
      entry => entry.attribute === 'class' && entry.frame === commitFrame,
    )) {
      expect(change.pointerEvents).toBe('auto');
    }
    // The outgoing calendar leaves assistive technology with the toggle.
    const hidden = log.find(
      entry =>
        entry.panel === 'calendar' &&
        entry.attribute === 'aria-hidden' &&
        entry.present,
    );
    expect(hidden?.frame, JSON.stringify(log)).toBe(commitFrame);
    // The incoming wheels go live when the fade ends, with the swap.
    const live = log.find(
      entry =>
        entry.panel === 'wheels' &&
        entry.attribute === 'inert' &&
        !entry.present,
    );
    expect(live, JSON.stringify(log)).toBeDefined();
    // Both waits are counted on the document timeline, not in frames: a
    // loaded runner presents fewer, longer frames. The swap still waits for the
    // fade's end, with the wheels fully faded in.
    const commitTime =
      log.find(entry => entry.attribute === 'class')?.time ?? Number.NaN;
    expect(
      (live?.time ?? Number.NaN) - commitTime,
      JSON.stringify(log),
    ).toBeGreaterThanOrEqual(tokens.ms);
    expect(live?.wheelsOpacity, JSON.stringify(log)).toBe(1);
    // The outgoing calendar turns inert once the cross-fade has ended: faded
    // to 0, hidden, or covered by the wheels at opacity 1. Never part way.
    const inert = log.find(
      entry =>
        entry.panel === 'calendar' &&
        entry.attribute === 'inert' &&
        entry.present,
    );
    expect(inert, JSON.stringify(log)).toBeDefined();
    expect(
      inert?.opacity === 0 ||
        inert?.visibility === 'hidden' ||
        inert?.wheelsOpacity === 1,
      JSON.stringify(inert),
    ).toBe(true);
    expect(
      (inert?.time ?? Number.NaN) - commitTime,
      JSON.stringify(log),
    ).toBeGreaterThanOrEqual(tokens.ms);
  });
}

for (const [name, story, titleSelector, calendarSelector, wheelsSelector] of [
  [
    'DateInput',
    STORY,
    '[data-title="month-year"]',
    '[data-panel="calendar"]',
    '[data-panel="wheels"]',
  ],
  [
    'DateTimeInput',
    DTI_STORY,
    'button[aria-label$="Choose month and year"]',
    '[data-date-surface="calendar"]',
    '[data-date-surface="wheels"]',
  ],
] as const) {
  test(`${name}: the wheels fade in on an opaque plate, and the calendar stays drawn beneath them`, async ({
    page,
  }) => {
    await openStory(page, storybook(), story);
    const driver = await touchDriver(page);
    const tapCenter = async (selector: string) => {
      const box = await page.locator(selector).first().boundingBox();
      if (box == null) {
        throw new Error(`no ${selector}`);
      }
      await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
    };
    await tapCenter('button[aria-label^="Open "]');
    await settlesAt(
      page.getByRole('dialog').locator('.astryx-bottom-sheet').first(),
      'transform',
      'matrix(1, 0, 0, 1, 0, 0)',
    );
    const calendar = page.locator(calendarSelector).first();
    const wheels = page.locator(wheelsSelector).first();
    // The panels share one parent, so its watch sees a run on either panel.
    const runs = await watchAnimations(calendar.locator('..'));
    await tapCenter(titleSelector);
    // The wheels fade in. Nothing fades out beneath them.
    const fades = (await runs.started()).filter(run => run.name === 'opacity');
    expect(fades.length, JSON.stringify(fades)).toBeGreaterThan(0);
    for (const fade of fades) {
      expect(String(fade.keyframes[0].opacity), JSON.stringify(fade)).toBe('0');
    }
    await waitForRest(wheels);
    const state = await page.evaluate(
      ({calendarAt, wheelsAt}) => {
        const under = document.querySelector<HTMLElement>(calendarAt);
        const over = document.querySelector<HTMLElement>(wheelsAt);
        if (under == null || over == null) {
          throw new Error('no panels');
        }
        // The color behind both panels: their nearest ancestor that paints.
        let painted = over.parentElement;
        while (
          painted != null &&
          getComputedStyle(painted).backgroundColor === 'rgba(0, 0, 0, 0)'
        ) {
          painted = painted.parentElement;
        }
        const underStyle = getComputedStyle(under);
        const overStyle = getComputedStyle(over);
        const underBox = under.getBoundingClientRect();
        const overBox = over.getBoundingClientRect();
        return {
          calendar: {
            opacity: underStyle.opacity,
            visibility: underStyle.visibility,
            ariaHidden: under.getAttribute('aria-hidden'),
          },
          plate: {
            color: overStyle.backgroundColor,
            isolation: overStyle.isolation,
            covers:
              overBox.left <= underBox.left + 0.5 &&
              overBox.top <= underBox.top + 0.5 &&
              overBox.right >= underBox.right - 0.5 &&
              overBox.bottom >= underBox.bottom - 0.5,
          },
          sheetColor:
            painted == null ? null : getComputedStyle(painted).backgroundColor,
        };
      },
      {calendarAt: calendarSelector, wheelsAt: wheelsSelector},
    );
    // Still drawn at full opacity, but out of the accessibility tree.
    expect(state.calendar).toEqual({
      opacity: '1',
      visibility: 'visible',
      ariaHidden: 'true',
    });
    // The wheels cover it with a plate in the sheet's own color.
    expect(state.sheetColor).not.toBeNull();
    expect(state.plate).toEqual({
      color: state.sheetColor,
      isolation: 'isolate',
      covers: true,
    });
  });
}

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test('DateTimeInput: Done hands focus to the shown month’s day, not to a month mounted off-screen', async ({
    page,
  }) => {
    await openStory(page, storybook(), DTI_STORY);
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    await page.locator('button[aria-label^="Open "]').first().click();
    await waitForRest(
      page.getByRole('dialog').locator('.astryx-bottom-sheet').first(),
    );
    await page
      .locator('button[aria-label$="Choose month and year"]')
      .first()
      .click();
    const wheels = page.locator('[data-date-surface="wheels"]').first();
    await waitForRest(wheels);
    // Done from the keyboard: focus sits in the wheels' footer.
    const done = wheels.getByRole('button', {name: 'Done', exact: true});
    await done.focus();
    await page.keyboard.press('Enter');
    // The mouse calendar gives every mounted month a tab stop. The story's
    // March 2026 is the month in view.
    const day = page.locator(
      'button[data-date="2026-03-15"]:not([data-outside])',
    );
    await expect(day).toBeFocused();
    await expect(day).toBeInViewport();
  });

  test('under Reduced Motion the toggle changes at once', async ({page}) => {
    // design:reduced-motion DR3: no animated property with a mouse.
    await page.emulateMedia({reducedMotion: 'reduce'});
    await openStory(page, storybook(), STORY);
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    await page
      .getByRole('button', {name: /calendar/i})
      .first()
      .click();
    await expect(page.locator('[data-panel="wheels"]').first()).toBeAttached();
    const state = await wheelsState(page, '[data-panel="wheels"]');
    expect(state.transitionDuration).toBe('0s');
    const turn = await page
      .locator('[data-title="month-year"] .astryx-icon')
      .first()
      .evaluate(element => getComputedStyle(element).transitionDuration);
    expect(turn).toBe('0s');
  });

  test('the swap keeps its values: a linear opacity fade on --duration-fast', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    await page
      .getByRole('button', {name: /calendar/i})
      .first()
      .click();
    const wheels = page.locator('[data-panel="wheels"]').first();
    await expect(wheels).toBeAttached();
    const state = await wheelsState(page, '[data-panel="wheels"]');
    const fast = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--duration-fast')
        .trim(),
    );
    expect(state.transitionProperty).toBe('opacity, visibility');
    expect(state.transitionTimingFunction).toBe('linear');
    expect(state.visibility).toBe('hidden');
    expect(fast).not.toBe('');
    const durationMs = (value: string) =>
      value.endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000;
    expect(durationMs(state.transitionDuration)).toBeCloseTo(
      durationMs(fast),
      3,
    );
  });
});

test(
  'storyboard: the month/year toggle',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const {driver, sheet, wheels, titleAt} = await openCalendar(page);
    const tokens = await toggleTokens(page);
    await installTimerGate(page);
    // The page holds the fade itself as soon as it runs. A hold sent after
    // the tap can miss the toggle's fade on a loaded runner.
    const hold = await armHold(page, sheet, {
      judges: {target: wheels, property: 'opacity'},
    });
    await driver.tap(titleAt);
    const held = await hold.held();
    await freezeTimers(page);
    const {storyboard} = await animationStoryboard(page, {
      name: 'month-year-toggle',
      clip: sheet,
      held,
      times: timeline(tokens.ms, 1000 / 30),
      columns: 5,
      cellScale: 0.35,
      measure: async () => ({
        opacity: +(
          await wheels.evaluate(el => Number(getComputedStyle(el).opacity))
        ).toFixed(3),
      }),
    });
    await storyboard.write(testInfo);
    await releaseAnimations(page, {finish: true});
    await thawTimers(page);
  },
);
