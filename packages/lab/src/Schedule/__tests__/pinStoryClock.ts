// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pinStoryClock.ts
 * @input A Playwright `test` whose specs open Lab/Schedule stories that build
 *   their events from the browser's clock
 * @output The browser zone and clock those stories need to render the same way
 *   on every day CI runs
 * @position Shared setup for the Schedule browser specs
 */

import type {test as playwrightTest} from '@playwright/test';

/** The zone the Lab/Schedule stories render their Schedules in. */
export const STORY_TIME_ZONE = 'America/Los_Angeles';

/** A fixed weekday morning, mid-month and mid-week, in that zone. */
export const PINNED_NOW = new Date('2026-05-13T10:00:00-07:00');

/**
 * Some Lab/Schedule stories (Weekly, Day) build their events from the
 * browser's clock, at fixed hours of the browser's own day, week and month,
 * and render them in {@link STORY_TIME_ZONE}; the fixture stories use a fixed
 * UTC week instead and need no pin. For a spec that opens a live-clock story, run the browser in that zone with its clock at
 * {@link PINNED_NOW}, so every event lands in the day, week and month the
 * Schedule shows, whatever the date and the runner's zone, and across daylight
 * saving changes and month ends. The installed clock also fakes
 * `requestAnimationFrame`, so keep it off specs whose stories don't need it.
 * Call it at the top of a spec file.
 */
export function pinStoryClock(test: typeof playwrightTest): void {
  test.use({timezoneId: STORY_TIME_ZONE});
  test.beforeEach(async ({page}) => {
    await page.clock.install({time: PINNED_NOW});
  });
}
