// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScheduleTimeGridInitialPosition.a11y.chromium.spec.ts
 * @input The built Lab/Schedule week and day stories in real Chromium with an
 *   installed clock
 * @output Receipted scroll offsets proving a range containing today opens one
 *   hour before now, clamps at the grid's end, leaves other ranges at their
 *   start, and never moves the person's own scroll afterwards
 * @position Browser binding for `component:Schedule` FR4–FR6. jsdom proves the
 *   arithmetic against mocked geometry; only a layout engine shows the offset
 *   the viewport really lands on.
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DAY,
  finishEvidence,
  HOUR_HEIGHT,
  openStory,
  OVERLAPPING,
  readTimeGrid,
  record,
  setScrollTop,
  startEvidence,
  WEEKLY,
  WIDE,
  type Evidence,
} from './timeGridProbe';

let evidence: Evidence;
test.beforeAll(async () => {
  evidence = await startEvidence();
});
test.afterAll(async () => {
  await finishEvidence(evidence, 'initial-position');
});

async function expectedInitialScrollTop(page: Page) {
  const reading = await readTimeGrid(page);
  const {scroller, nowLine, firstColumnTopInContent} = reading;
  if (scroller == null || nowLine == null || firstColumnTopInContent == null) {
    return {reading, expected: null, max: null};
  }
  const max = scroller.scrollHeight - scroller.clientHeight;
  // The pinned rows above the columns occupy the top of the viewport, so the
  // one-hour lead is measured from the column's own top, not the scroller's.
  const lead = nowLine.topInContent - firstColumnTopInContent - HOUR_HEIGHT;
  const expected = Math.min(max, Math.max(0, lead));
  return {reading, expected, max};
}

test('a week containing today opens one hour before now and stays put', async ({
  page,
}) => {
  // 22:00Z is 15:00 in the story's America/Los_Angeles week (07:00–19:00).
  await page.clock.install({time: new Date('2026-05-13T22:00:00Z')});
  await openStory(evidence, page, WEEKLY, WIDE);
  const {reading, expected, max} = await expectedInitialScrollTop(page);
  await record(
    evidence,
    page,
    'initial-scroll-week-today',
    WEEKLY,
    reading.direction,
    {
      scrollTop: reading.scroller?.scrollTop,
      expected,
      max,
      nowLineTopInContent: reading.nowLine?.topInContent,
      columnTopInContent: reading.firstColumnTopInContent,
    },
  );
  expect(expected, 'the now-line is painted').not.toBeNull();
  expect(
    Math.abs((reading.scroller?.scrollTop ?? 0) - (expected ?? 0)),
  ).toBeLessThanOrEqual(2);

  // The position is set once per range open: a clock tick, a theme change,
  // and a resize all re-render the grid and leave the person's scroll alone.
  await setScrollTop(page, 123);
  await page.clock.pauseAt(new Date('2026-05-13T22:05:00Z'));
  await page.clock.runFor(61_000);
  await page.evaluate(() => {
    (
      window as unknown as {
        __STORYBOOK_ADDONS_CHANNEL__: {
          emit: (event: string, payload: unknown) => void;
        };
      }
    ).__STORYBOOK_ADDONS_CHANNEL__.emit('updateGlobals', {
      globals: {colorMode: 'dark'},
    });
  });
  await page.setViewportSize({width: 1180, height: 820});
  await page.waitForTimeout(250);
  const afterTick = await readTimeGrid(page);
  await record(
    evidence,
    page,
    'initial-scroll-week-today-after-tick',
    WEEKLY,
    afterTick.direction,
    {scrollTop: afterTick.scroller?.scrollTop},
  );
  expect(afterTick.scroller?.scrollTop).toBe(123);
});

test('a day containing today opens one hour before now', async ({page}) => {
  // 20:00Z is 13:00 in the story's America/Los_Angeles day (00:00–24:00).
  await page.clock.install({time: new Date('2026-05-13T20:00:00Z')});
  await openStory(evidence, page, DAY, WIDE);
  const {reading, expected, max} = await expectedInitialScrollTop(page);
  await record(
    evidence,
    page,
    'initial-scroll-day-today',
    DAY,
    reading.direction,
    {scrollTop: reading.scroller?.scrollTop, expected, max},
  );
  expect(expected).not.toBeNull();
  expect(
    Math.abs((reading.scroller?.scrollTop ?? 0) - (expected ?? 0)),
  ).toBeLessThanOrEqual(2);
});

test('near midnight the position clamps to the end of the grid', async ({
  page,
}) => {
  // 06:50Z is 23:50 the previous evening in America/Los_Angeles.
  await page.clock.install({time: new Date('2026-05-14T06:50:00Z')});
  await openStory(evidence, page, DAY, WIDE);
  const {reading, expected, max} = await expectedInitialScrollTop(page);
  await record(
    evidence,
    page,
    'initial-scroll-day-near-midnight',
    DAY,
    reading.direction,
    {scrollTop: reading.scroller?.scrollTop, expected, max},
  );
  expect(expected).not.toBeNull();
  expect(expected).toBe(max);
  expect(
    Math.abs((reading.scroller?.scrollTop ?? 0) - (expected ?? 0)),
  ).toBeLessThanOrEqual(2);
});

test('a range without today opens at its configured start', async ({page}) => {
  await page.clock.install({time: new Date('2026-06-01T17:00:00Z')});
  await openStory(evidence, page, OVERLAPPING, WIDE);
  const reading = await readTimeGrid(page);
  await record(
    evidence,
    page,
    'initial-scroll-not-today',
    OVERLAPPING,
    reading.direction,
    {scrollTop: reading.scroller?.scrollTop, nowLine: reading.nowLine},
  );
  expect(reading.nowLine).toBeNull();
  expect(reading.scroller?.scrollTop ?? 0).toBe(0);
});
