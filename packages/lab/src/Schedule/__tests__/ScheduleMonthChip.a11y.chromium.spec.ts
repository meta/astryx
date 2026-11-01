// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScheduleMonthChip.a11y.chromium.spec.ts
 * @input The built Lab/Schedule month-overflow story in real Chromium
 * @output Receipted evidence that a month chip leads with its title, shows
 *   the start time beside it only when the whole title and the time fit, and
 *   never lets the time truncate the title; all-day chips carry no time; in
 *   LTR and RTL at a narrow and a wide width
 * @position Browser binding for `component:Schedule` FR18. jsdom has no
 *   layout, so it cannot tell whether a time fits beside a title.
 */

import {expect, test, type Page} from '@playwright/test';
import {
  finishEvidence,
  openStory,
  record,
  startEvidence,
  WIDE,
  type Evidence,
} from './timeGridProbe';

const STORY = 'lab-schedule--month-overflow';
const NARROW_MONTH = {width: 800, height: 900};
// Titles the story paints as chips; the time is any "h:mm" run in a chip.
// A busy day paints its earliest events (FR15), so these are the timed chips
// the story paints.
const TIMED_TITLES = ['1:1', 'Standup', 'Planning', 'Design critique'] as const;
const ALL_DAY_TITLE = 'Design conference';

let evidence: Evidence;
test.beforeAll(async () => {
  evidence = await startEvidence();
});
test.afterAll(async () => {
  await finishEvidence(evidence, 'month-chip');
});

interface ChipReading {
  readonly title: string;
  readonly hasTime: boolean;
  /** The time paints on the chip's visible line. */
  readonly timeVisible: boolean;
  /** The title paints before the time in reading order. */
  readonly titleBeforeTime: boolean | null;
  /** The title is cut short (ellipsized). */
  readonly titleTruncated: boolean;
}

/**
 * Reads each chip by its text: the chip is the marked chip (or a build's
 * hidden overlay child) that holds the title, the title and time are text
 * runs inside it, and the visible line is the box the title sits in.
 */
function readChips(
  page: Page,
  titles: ReadonlyArray<string>,
): Promise<ChipReading[]> {
  return page.evaluate(wanted => {
    const table = document.querySelector<HTMLElement>(
      '.astryx-schedule [role="table"], .astryx-schedule [role="grid"]',
    );
    // Chips carry a marker; a build without it paints them as the children of
    // one hidden overlay.
    const marked = [
      ...(table?.querySelectorAll<HTMLElement>('[data-schedule-month-chip]') ??
        []),
    ];
    const overlay = [
      ...(table?.querySelectorAll<HTMLElement>('[aria-hidden="true"]') ?? []),
    ].find(
      element =>
        getComputedStyle(element).position === 'absolute' &&
        element.children.length > 0,
    );
    const chips: Element[] =
      marked.length > 0 ? marked : [...(overlay?.children ?? [])];
    const isRtl = getComputedStyle(table ?? document.body).direction === 'rtl';
    const textNodes = (root: Node): Text[] => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      for (
        let node = walker.nextNode();
        node != null;
        node = walker.nextNode()
      ) {
        nodes.push(node as Text);
      }
      return nodes;
    };
    const rectOf = (node: Text) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect();
    };
    return wanted.map(title => {
      const chip = chips.find(element =>
        textNodes(element).some(node => node.textContent === title),
      );
      if (chip == null) {
        throw new Error(`no chip titled ${title}`);
      }
      const nodes = textNodes(chip);
      const titleNode = nodes.find(node => node.textContent === title);
      const timeNode = nodes.find(node =>
        /\d{1,2}:\d{2}/.test(node.textContent ?? ''),
      );
      const titleElement = titleNode?.parentElement;
      // The pill's padding box is the visible line.
      const pill = (chip.firstElementChild ?? chip) as HTMLElement;
      const pillRect = pill.getBoundingClientRect();
      const pillStyle = getComputedStyle(pill);
      const lineTop =
        pillRect.top + Number.parseFloat(pillStyle.borderTopWidth);
      const lineBottom =
        pillRect.bottom - Number.parseFloat(pillStyle.borderBottomWidth);
      const titleRect = titleNode == null ? null : rectOf(titleNode);
      const timeRect = timeNode == null ? null : rectOf(timeNode);
      const timeVisible =
        timeRect != null &&
        timeRect.top >= lineTop - 1 &&
        timeRect.bottom <= lineBottom + 1 &&
        timeRect.width > 0;
      return {
        title,
        hasTime: timeNode != null,
        timeVisible,
        titleBeforeTime:
          titleRect == null || timeRect == null || !timeVisible
            ? null
            : isRtl
              ? titleRect.left >= timeRect.right - 1
              : titleRect.right <= timeRect.left + 1,
        titleTruncated:
          titleElement == null
            ? false
            : titleElement.scrollWidth > titleElement.clientWidth + 1,
      };
    });
  }, titles);
}

function expectTitleFirst(chips: ReadonlyArray<ChipReading>) {
  for (const chip of chips) {
    expect(chip.hasTime, `${chip.title} carries a time`).toBe(true);
    if (chip.timeVisible) {
      expect(chip.titleBeforeTime, `${chip.title}: title before time`).toBe(
        true,
      );
      expect(
        chip.titleTruncated,
        `${chip.title}: a visible time never truncates the title`,
      ).toBe(false);
    }
  }
}

for (const [direction, globals] of [
  ['ltr', undefined],
  ['rtl', 'direction:rtl'],
] as const) {
  test(`month chips lead with the title and show the time only when both fit (${direction})`, async ({
    page,
  }) => {
    const readings: Record<string, ChipReading[]> = {};
    for (const [name, viewport] of [
      ['wide', WIDE],
      ['narrow', NARROW_MONTH],
    ] as const) {
      await openStory(evidence, page, STORY, viewport, globals);
      const chips = await readChips(page, TIMED_TITLES);
      readings[name] = chips;
      expectTitleFirst(chips);
      const [allDay] = await readChips(page, [ALL_DAY_TITLE]);
      expect(allDay.hasTime, 'an all-day chip carries no time').toBe(false);
      await record(
        evidence,
        page,
        `month-chip-${direction}-${name}`,
        STORY,
        direction,
        {
          chips,
          allDay,
        },
      );
    }
    // Both branches occur: a short title keeps its time at either width; a
    // longer one drops the time in a narrow column.
    expect(readings.wide.find(chip => chip.title === '1:1')?.timeVisible).toBe(
      true,
    );
    expect(
      readings.narrow.find(chip => chip.title === 'Design critique')
        ?.timeVisible,
    ).toBe(false);
  });
}
