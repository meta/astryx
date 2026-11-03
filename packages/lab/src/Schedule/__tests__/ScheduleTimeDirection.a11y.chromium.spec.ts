// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScheduleTimeDirection.a11y.chromium.spec.ts
 * @input The built Lab/Schedule week, month, and list stories in real Chromium
 * @output Receipted evidence that every painted time — hour labels, event
 *   times, month chip times, and list rows — reads in order in both
 *   directions: a number paints before its AM or PM, and a range reads start
 *   first in its locale's direction (en-US in either layout, he-IL)
 * @position Browser binding for the Schedule's direction support
 *   (`component:Schedule` AR6). jsdom does not run the bidirectional
 *   algorithm, so only a browser shows the painted order.
 */

import {expect, test, type Page} from '@playwright/test';
import {
  finishEvidence,
  openStory,
  record,
  startEvidence,
  WEEKLY,
  WIDE,
  type Evidence,
} from './timeGridProbe';

/** Each view, and whether it paints time ranges (month chips show starts). */
const STORIES = [
  ['week', WEEKLY, true],
  ['month', 'lab-schedule--monthly', false],
  ['list', 'lab-schedule--list', true],
] as const;
/** The list under a right-to-left locale with 24-hour times. */
const RTL_LOCALE = 'lab-schedule--right-to-left-locale';

let evidence: Evidence;

// The stories show one fixed week, built in the Schedule's own
// America/Los_Angeles (Schedule.stories.tsx), so this contract reads the same
// events in any browser zone and on any day; it needs no zone or clock pin.
test.beforeAll(async () => {
  evidence = await startEvidence();
});
test.afterAll(async () => {
  await finishEvidence(evidence, 'time-direction');
});

interface TimeReading {
  readonly text: string;
  /** Every number paints before its AM or PM. */
  readonly meridiemInOrder: boolean;
  /** For a range, which side its start paints on. */
  readonly startSide: 'left' | 'right' | null;
}

/**
 * Every visible time in the schedule: text nodes holding a time, skipping
 * visually hidden text (read by assistive technology in logical order, never
 * painted).
 */
function readTimes(page: Page): Promise<TimeReading[]> {
  return page.evaluate(() => {
    const root = document.querySelector('.astryx-schedule');
    if (root == null) {
      throw new Error('no Schedule in the story');
    }
    const isHidden = (element: Element | null): boolean => {
      for (let node = element; node != null; node = node.parentElement) {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        if (
          style.clipPath !== 'none' ||
          style.clip !== 'auto' ||
          (rect.width <= 1 && style.overflow === 'hidden')
        ) {
          return true;
        }
      }
      return false;
    };
    const rectOf = (node: Node, from: number, to: number) => {
      const range = document.createRange();
      range.setStart(node, from);
      range.setEnd(node, to);
      return range.getBoundingClientRect();
    };
    const readings: Array<{
      text: string;
      meridiemInOrder: boolean;
      startSide: 'left' | 'right' | null;
    }> = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node != null; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      const times = [
        ...text.matchAll(/(\d{1,2}(?::\d{2})?)(?:\s?([AP]M))?/gu),
      ].filter(match => match[2] != null || match[1].includes(':'));
      if (times.length === 0 || isHidden(node.parentElement)) {
        continue;
      }
      const boxes = times.map(match => {
        const at = match.index ?? 0;
        const number = rectOf(node, at, at + match[1].length);
        const meridiemAt =
          match[2] == null ? -1 : text.indexOf(match[2], at + match[1].length);
        return {
          number,
          meridiem:
            meridiemAt < 0 ? null : rectOf(node, meridiemAt, meridiemAt + 2),
        };
      });
      if (boxes.some(box => box.number.width < 1)) {
        continue;
      }
      const [start, end] = boxes;
      readings.push({
        text: text.trim(),
        meridiemInOrder: boxes.every(
          box =>
            box.meridiem == null || box.number.right <= box.meridiem.left + 1,
        ),
        startSide:
          end == null
            ? null
            : start.number.left < end.number.left
              ? 'left'
              : 'right',
      });
    }
    return readings;
  });
}

async function expectTimesInOrder(
  page: Page,
  name: string,
  story: string,
  direction: 'ltr' | 'rtl',
  localeDirection: 'ltr' | 'rtl',
  paintsRanges: boolean,
) {
  const times = await readTimes(page);
  const ranges = times.filter(time => time.startSide != null);
  // A range reads start first in its locale's direction: on the left for a
  // left-to-right locale, on the right for a right-to-left one, whatever the
  // layout direction.
  const startSide = localeDirection === 'ltr' ? 'left' : 'right';
  const outOfOrder = times
    .filter(
      time =>
        !time.meridiemInOrder ||
        (time.startSide != null && time.startSide !== startSide),
    )
    .map(time => time.text);
  await record(evidence, page, name, story, direction, {
    count: times.length,
    ranges: ranges.length,
    outOfOrder,
  });
  expect(times.length, `${name} paints times`).toBeGreaterThan(0);
  if (paintsRanges) {
    expect(ranges.length, `${name} paints ranges`).toBeGreaterThan(0);
  }
  expect(outOfOrder, `${name} times painted out of order`).toEqual([]);
}

for (const [view, story, paintsRanges] of STORIES) {
  for (const [direction, globals] of [
    ['ltr', undefined],
    ['rtl', 'direction:rtl'],
  ] as const) {
    test(`every painted ${view} time reads in order (en-US, ${direction})`, async ({
      page,
    }) => {
      await openStory(evidence, page, story, WIDE, globals);
      await expectTimesInOrder(
        page,
        `time-direction-${view}-${direction}`,
        story,
        direction,
        'ltr',
        paintsRanges,
      );
    });
  }
}

test('a right-to-left locale reads its 24-hour ranges start first (he-IL)', async ({
  page,
}) => {
  await openStory(evidence, page, RTL_LOCALE, WIDE);
  await expectTimesInOrder(
    page,
    'time-direction-list-he-IL',
    RTL_LOCALE,
    'rtl',
    'rtl',
    true,
  );
});
