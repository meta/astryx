// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ButtonPress.interaction.browser.spec.ts
 * @input The built press feedback stories (Buttons, Buttons in a scroller),
 *   real touch input (Chromium CDP / WebKit's input command), the
 *   interaction harness, and the touch press model's clocks
 *   (utils/pressGesture.ts)
 * @output Interaction proofs for a finger's press on a button
 *   (`spec:AST-094` FR11): outside a scroller it highlights in the frame it
 *   lands and releases on the shared release clock; inside one it waits
 *   UIScrollView's content-touch delay, a flick paints nothing, and a scroll
 *   that takes a held press cancels it with no fade and no click; a quick
 *   tap highlights at the lift; the engine's own tap paints and activates
 *   once; a storyboard of a press, its trace asserted
 * @position Interaction evidence for the touch press model
 *   (utils/pressFeedback.ts, as installed by hooks/usePressFeedback.ts)
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  flick,
  freezeTimers,
  holdThenDrag,
  installTimerGate,
  openStory,
  tap,
  thawTimers,
  touchDriver,
  touchStoryboard,
  withStorybook,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';
import {scroll} from '../../motion/uikit/scroll';

const storybook = withStorybook(test);

/**
 * A finger's release on a control: UIButton's 250 ms,
 * `controlPressConsts.controlReleaseMs` in utils/controlPressLayer.stylex.ts,
 * which this runner cannot import (it compiles StyleX). pressFeedback.test.ts
 * holds the two equal.
 */
const RELEASE_MS = 250;
const CONTENT_TOUCH_DELAY_MS = scroll.delaysContentTouchesMs;
/** Long enough that a press in a scroller is believed. */
const HOLD_MS = 400;
/** Two frames at 60 Hz: "in the frame the finger lands", with dispatch slack. */
const SAME_FRAME_MS = 34;

const BUTTONS = 'core-press-feedback-touch--buttons';
const SCROLLER = 'core-press-feedback-touch--buttons-in-scroller';

interface Opened {
  driver: TouchDriver;
  surface: Locator;
  center: {x: number; y: number};
  /** What the page saw, on its own clock (performance.now()). */
  log: () => Promise<LogEntry[]>;
}

type LogEntry = [kind: string, t: number, value: string | null];

async function openSurface(
  page: Page,
  story: string,
  surface: (page: Page) => Locator,
): Promise<Opened> {
  await openStory(page, storybook(), story);
  const driver = await touchDriver(page);
  const element = surface(page);
  await expect(element).toBeVisible();
  const box = await element.boundingBox();
  if (box == null) {
    throw new Error(`${story}: the surface has no box`);
  }
  await element.evaluate(el => {
    const entries: LogEntry[] = [];
    (window as unknown as {__press: LogEntry[]}).__press = entries;
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) {
      document.addEventListener(
        type,
        () => entries.push([type, performance.now(), null]),
        true,
      );
    }
    new MutationObserver(records => {
      for (const record of records) {
        entries.push([
          'press',
          performance.now(),
          (record.target as Element).getAttribute('data-astryx-press'),
        ]);
      }
    }).observe(el, {attributes: true, attributeFilter: ['data-astryx-press']});
  });
  return {
    driver,
    surface: element,
    center: {x: box.x + box.width / 2, y: box.y + box.height / 2},
    log: async () =>
      page.evaluate(() => (window as unknown as {__press: LogEntry[]}).__press),
  };
}

const secondaryButton = (page: Page) =>
  page.getByRole('button', {name: 'Secondary', exact: true});
const scrollerButton = (page: Page) =>
  page.getByRole('button', {name: 'Action 2', exact: true});

const first = (entries: LogEntry[], kind: string, value?: string | null) =>
  entries.find(
    ([k, , v]) => k === kind && (value === undefined || v === value),
  );

test('outside a scroller, a finger’s press highlights in the frame it lands, and the lift fades it on the shared release clock', async ({
  page,
}) => {
  const opened = await openSurface(page, BUTTONS, secondaryButton);
  await opened.driver.play(tap(opened.center, {holdMs: 300}));
  await expect
    .poll(async () => opened.surface.getAttribute('data-astryx-press'))
    .toBeNull();
  const entries = await opened.log();
  const down = first(entries, 'pointerdown');
  const on = first(entries, 'press', 'on');
  const up = first(entries, 'pointerup');
  const fading = first(entries, 'press', 'fading');
  const gone = first(entries, 'press', null);
  expect(
    down && on && up && fading && gone,
    JSON.stringify(entries),
  ).toBeTruthy();
  if (!down || !on || !up || !fading || !gone) {
    return;
  }
  expect(on[1] - down[1]).toBeLessThan(SAME_FRAME_MS);
  expect(fading[1] - up[1]).toBeLessThan(SAME_FRAME_MS);
  // The attribute leaves when the shared release clock runs out.
  expect(gone[1] - fading[1]).toBeGreaterThanOrEqual(RELEASE_MS - 5);
  expect(gone[1] - fading[1]).toBeLessThan(RELEASE_MS + 80);
  // WebKit synthesises a click only from its own tap path, not from a raw
  // touch sequence (harness README, engine limits); Chromium does from both.
  if (opened.driver.engine === 'chromium') {
    expect(entries.filter(([k]) => k === 'click')).toHaveLength(1);
  }
});

test('inside a scroller, a held press waits UIScrollView’s content-touch delay', async ({
  page,
}) => {
  const opened = await openSurface(page, SCROLLER, scrollerButton);
  await opened.driver.play(tap(opened.center, {holdMs: HOLD_MS}));
  const entries = await opened.log();
  const down = first(entries, 'pointerdown');
  const on = first(entries, 'press', 'on');
  expect(down && on, JSON.stringify(entries)).toBeTruthy();
  if (!down || !on) {
    return;
  }
  expect(on[1] - down[1]).toBeGreaterThanOrEqual(CONTENT_TOUCH_DELAY_MS - 5);
  expect(on[1] - down[1]).toBeLessThan(CONTENT_TOUCH_DELAY_MS + 60);
  // WebKit synthesises a click only from its own tap path, not from a raw
  // touch sequence (harness README, engine limits); Chromium does from both.
  if (opened.driver.engine === 'chromium') {
    expect(entries.filter(([k]) => k === 'click')).toHaveLength(1);
  }
});

test('inside a scroller, a tap quicker than the delay highlights at the lift, then fades', async ({
  page,
}) => {
  const opened = await openSurface(page, SCROLLER, scrollerButton);
  await opened.driver.play(tap(opened.center, {holdMs: 60}));
  await expect
    .poll(async () => opened.surface.getAttribute('data-astryx-press'))
    .toBeNull();
  const entries = await opened.log();
  const up = first(entries, 'pointerup');
  const on = first(entries, 'press', 'on');
  const fading = first(entries, 'press', 'fading');
  expect(up && on && fading, JSON.stringify(entries)).toBeTruthy();
  if (!up || !on || !fading) {
    return;
  }
  // Nothing before the lift, the highlight at it, held for the quick-tap
  // flash, then the release.
  expect(on[1]).toBeGreaterThanOrEqual(up[1] - 5);
  expect(fading[1] - on[1]).toBeGreaterThanOrEqual(90);
  // WebKit synthesises a click only from its own tap path, not from a raw
  // touch sequence (harness README, engine limits); Chromium does from both.
  if (opened.driver.engine === 'chromium') {
    expect(entries.filter(([k]) => k === 'click')).toHaveLength(1);
  }
});

test('a tap through the engine’s own tap path paints the press and activates once', async ({
  page,
}) => {
  const opened = await openSurface(page, BUTTONS, secondaryButton);
  await opened.driver.tap(opened.center);
  await expect
    .poll(async () => opened.surface.getAttribute('data-astryx-press'))
    .toBeNull();
  const entries = await opened.log();
  expect(first(entries, 'press', 'on'), JSON.stringify(entries)).toBeTruthy();
  expect(first(entries, 'press', 'fading')).toBeTruthy();
  expect(entries.filter(([k]) => k === 'click')).toHaveLength(1);
});

test('inside a scroller, a flick scrolls the list and paints nothing', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'injected touches start no native scroll in this WebKit build; the iOS simulator covers it',
  );
  const opened = await openSurface(page, SCROLLER, scrollerButton);
  await opened.driver.play(
    flick(opened.center, {velocity: {x: 0, y: -1500}, durationMs: 80}),
  );
  await page.waitForTimeout(300);
  const entries = await opened.log();
  expect(
    entries.filter(([k]) => k === 'press'),
    JSON.stringify(entries),
  ).toEqual([]);
  expect(entries.filter(([k]) => k === 'click')).toHaveLength(0);
  const scrolled = await page
    .getByTestId('button-scroller')
    .evaluate(el => el.scrollTop);
  expect(scrolled).toBeGreaterThan(0);
});

test('inside a scroller, a scroll that takes a held press cancels it: the paint goes at once, with no fade and no click', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'injected touches start no native scroll in this WebKit build; the iOS simulator covers it',
  );
  const opened = await openSurface(page, SCROLLER, scrollerButton);
  await opened.driver.play(
    holdThenDrag(
      opened.center,
      {x: opened.center.x, y: opened.center.y - 150},
      {holdMs: 300, durationMs: 300},
    ),
  );
  await page.waitForTimeout(100);
  const entries = await opened.log();
  const presses = entries.filter(([k]) => k === 'press').map(([, , v]) => v);
  // Highlighted while held; the browser's takeover removes it, never fades it.
  expect(presses, JSON.stringify(entries)).toEqual(['on', null]);
  expect(first(entries, 'pointercancel')).toBeTruthy();
  expect(entries.filter(([k]) => k === 'click')).toHaveLength(0);
  const scrolled = await page
    .getByTestId('button-scroller')
    .evaluate(el => el.scrollTop);
  expect(scrolled).toBeGreaterThan(0);
});

test(
  'storyboard: a button pressed and lifted outside a scroller',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const opened = await openSurface(page, BUTTONS, secondaryButton);
    await installTimerGate(page);
    const box = await opened.surface.boundingBox();
    if (box == null) {
      throw new Error('no button');
    }
    const clip = {
      x: Math.max(0, box.x - 16),
      y: Math.max(0, box.y - 16),
      width: box.width + 32,
      height: box.height + 32,
    };
    const storyboard = await touchStoryboard(
      page,
      opened.driver,
      tap(opened.center, {holdMs: 300}),
      {
        name: 'button-press-touch-down',
        clip,
        measure: async () => ({
          state: await opened.surface.getAttribute('data-astryx-press'),
        }),
        columns: 3,
      },
    );
    await freezeTimers(page);
    await storyboard.write(testInfo);
    await thawTimers(page);
    const states = storyboard.frames.map(f => f.data.state as string | null);
    // Before the touch, the touch itself (already highlighted), the lift.
    expect(states).toEqual([null, 'on', 'fading']);
  },
);
