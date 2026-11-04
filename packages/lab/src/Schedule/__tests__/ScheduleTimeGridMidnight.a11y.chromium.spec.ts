// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScheduleTimeGridMidnight.a11y.chromium.spec.ts
 * @input The built Lab/Schedule EventEndingAtMidnight story in real Chromium
 * @output Receipted evidence that a timed event ending exactly at midnight
 *   paints from its start to the bottom of its day column
 * @position Browser binding for `component:Schedule` FR8 (no event is
 *   dropped) at the midnight boundary
 */

import {expect, test} from '@playwright/test';
import {
  finishEvidence,
  openStory,
  record,
  startEvidence,
  WIDE,
  type Evidence,
} from './timeGridProbe';

const STORY = 'lab-schedule--event-ending-at-midnight';
/** The story's hour window. */
const MIN_HOUR = 16;
const MAX_HOUR = 24;

let evidence: Evidence;
test.beforeAll(async () => {
  evidence = await startEvidence();
});
test.afterAll(async () => {
  await finishEvidence(evidence, 'midnight');
});

for (const [direction, globals] of [
  ['ltr', undefined],
  ['rtl', 'direction:rtl'],
] as const) {
  test(`an event ending at midnight paints to the bottom of its day (${direction})`, async ({
    page,
  }) => {
    await openStory(evidence, page, STORY, WIDE, globals);
    const blocks = await page.evaluate(
      titles =>
        titles.map(title => {
          const leaf = [
            ...document.querySelectorAll<HTMLElement>('.astryx-schedule *'),
          ].find(
            element =>
              element.children.length === 0 &&
              element.textContent?.trim() === title,
          );
          let block: HTMLElement | null = leaf ?? null;
          while (
            block != null &&
            getComputedStyle(block).position !== 'absolute'
          ) {
            block = block.parentElement;
          }
          const column = block?.parentElement;
          if (block == null || column == null) {
            return {title, painted: false};
          }
          const box = block.getBoundingClientRect();
          const day = column.getBoundingClientRect();
          return {
            title,
            painted: true,
            top: box.top - day.top,
            bottom: box.bottom - day.top,
            columnHeight: day.height,
          };
        }),
      ['Late sync', 'Evening review', 'Planning'],
    );
    await record(evidence, page, `midnight-${direction}`, STORY, direction, {
      blocks,
    });
    const hours = MAX_HOUR - MIN_HOUR;
    const read = (title: string) => {
      const block = blocks.find(reading => reading.title === title);
      expect(block?.painted, `${title} is painted`).toBe(true);
      if (block == null || !('columnHeight' in block)) {
        throw new Error(`${title} is not painted`);
      }
      return block as {top: number; bottom: number; columnHeight: number};
    };
    // An ordinary block from 17:00 to 18:00 gives the blocks' own insets.
    const planning = read('Planning');
    const hourHeight = planning.columnHeight / hours;
    const insetTop = planning.top - (17 - MIN_HOUR) * hourHeight;
    const insetBottom = (18 - MIN_HOUR) * hourHeight - planning.bottom;
    for (const [title, startHour] of [
      ['Late sync', 22],
      ['Evening review', 20],
    ] as const) {
      const block = read(title);
      expect(
        Math.abs(block.top - (startHour - MIN_HOUR) * hourHeight - insetTop),
        `${title} starts at ${startHour}:00`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(block.columnHeight - block.bottom - insetBottom),
        `${title} ends at the bottom of its day`,
      ).toBeLessThanOrEqual(1);
    }
  });
}
