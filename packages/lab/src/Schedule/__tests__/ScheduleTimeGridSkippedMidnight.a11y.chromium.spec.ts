// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScheduleTimeGridSkippedMidnight.a11y.chromium.spec.ts
 * @input The built Lab/Schedule SkippedMidnight story in real Chromium
 * @output Receipted evidence that a week and a day whose midnight daylight
 *   saving skips keep their own dates: seven day columns in the week, one in
 *   the day view, in America/Santiago and America/Havana
 * @position Browser binding for `component:Schedule` FR8 (no event or day is
 *   dropped) across a skipped midnight
 */

import {expect, test, type Page} from '@playwright/test';
import {
  finishEvidence,
  record,
  startEvidence,
  storyUrl,
  WIDE,
  type Evidence,
} from './timeGridProbe';

const STORY = 'lab-schedule--skipped-midnight';
const ZONES = [
  {
    timezoneID: 'America/Santiago',
    week: [
      'Sunday, September 6, 2026',
      'Monday, September 7, 2026',
      'Tuesday, September 8, 2026',
      'Wednesday, September 9, 2026',
      'Thursday, September 10, 2026',
      'Friday, September 11, 2026',
      'Saturday, September 12, 2026',
    ],
  },
  {
    timezoneID: 'America/Havana',
    week: [
      'Sunday, March 8, 2026',
      'Monday, March 9, 2026',
      'Tuesday, March 10, 2026',
      'Wednesday, March 11, 2026',
      'Thursday, March 12, 2026',
      'Friday, March 13, 2026',
      'Saturday, March 14, 2026',
    ],
  },
] as const;

let evidence: Evidence;

/** The story holds four schedules, so wait for each zone's pair. */
async function openSkippedMidnight(page: Page, globals?: string) {
  await page.setViewportSize(WIDE);
  await page.goto(storyUrl(evidence, STORY, globals), {waitUntil: 'load'});
  await expect(page.locator('.astryx-schedule')).toHaveCount(4);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
}
test.beforeAll(async () => {
  evidence = await startEvidence();
});
test.afterAll(async () => {
  await finishEvidence(evidence, 'skipped-midnight');
});

for (const [direction, globals] of [
  ['ltr', undefined],
  ['rtl', 'direction:rtl'],
] as const) {
  test(`a skipped midnight keeps seven days in the week and one in the day view (${direction})`, async ({
    page,
  }) => {
    await openSkippedMidnight(page, globals);
    const readings = [];
    for (const zone of ZONES) {
      const section = page.getByRole('region', {name: zone.timezoneID});
      const grids = section.getByRole('grid', {name: 'Schedule time grid'});
      await expect(grids).toHaveCount(2);
      const days = async (index: number) =>
        (
          await grids
            .nth(index)
            .getByRole('columnheader')
            .evaluateAll(headers =>
              headers.map(header => header.textContent?.trim() ?? ''),
            )
        ).filter(name => /, \d{4}$/u.test(name));
      const week = await days(0);
      const day = await days(1);
      // The first hour's event paints in the first day's column.
      const firstHour = await section
        .getByText('First hour', {exact: true})
        .first()
        .isVisible();
      readings.push({zone: zone.timezoneID, week, day, firstHour});
      expect(week, `${zone.timezoneID} week`).toEqual([...zone.week]);
      expect(day, `${zone.timezoneID} day`).toEqual([zone.week[0]]);
      expect(firstHour, `${zone.timezoneID} first hour painted`).toBe(true);
    }
    await record(
      evidence,
      page,
      `skipped-midnight-${direction}`,
      STORY,
      direction,
      {
        readings,
      },
    );
  });
}
