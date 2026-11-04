// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScheduleTimeGridOverlap.a11y.chromium.spec.ts
 * @input The built Lab/Schedule overlapping-events fixture week in real Chromium
 * @output Receipted paint rectangles proving simultaneous events sit side by
 *   side inside an isolated day column, with nothing covered or dropped
 * @position Browser binding for `component:Schedule` FR7–FR10. The layout
 *   model is unit-tested in jsdom; whether the painted blocks actually overlap
 *   is a question only a layout engine can answer.
 */

import {expect, test} from '@playwright/test';
import {
  blockOverlap,
  finishEvidence,
  openStory,
  OVERLAPPING,
  readBlocks,
  record,
  startEvidence,
  WIDE,
  type BlockReading,
  type Evidence,
} from './timeGridProbe';

let evidence: Evidence;
test.beforeAll(async () => {
  evidence = await startEvidence();
});
test.afterAll(async () => {
  await finishEvidence(evidence, 'overlap');
});

const simultaneousGroups: ReadonlyArray<{name: string; titles: string[]}> = [
  {name: 'two-tie', titles: ['Pair review', 'Pair review']},
  {
    name: 'three',
    titles: ['Interview loop 1', 'Interview loop 2', 'Interview loop 3'],
  },
  {
    name: 'five',
    titles: [
      'Office hours A',
      'Office hours B',
      'Office hours C',
      'Office hours D',
      'Office hours E',
    ],
  },
];
const chain = ['Standup', 'Design sync', 'Retro'];
const contained = ['Workshop', 'Coffee chat'];

function coveredPercent(a: BlockReading, b: BlockReading): number {
  const smaller = Math.min(
    a.box.width * a.box.height,
    b.box.width * b.box.height,
  );
  return smaller === 0
    ? 0
    : Math.round((blockOverlap(a.box, b.box) / smaller) * 100);
}

test('simultaneous events sit side by side and never cover one another', async ({
  page,
}) => {
  await openStory(evidence, page, OVERLAPPING, WIDE);
  const titles = [
    ...simultaneousGroups.flatMap(group => group.titles),
    ...chain,
    ...contained,
    'Quick check-in',
  ];
  const blocks = await readBlocks(page, titles);
  const byTitle = (title: string) =>
    blocks.filter(block => block.title === title);

  const groupResults = simultaneousGroups.map(group => {
    const members = [...new Set(group.titles.flatMap(title => byTitle(title)))];
    const pairs: Array<{a: string; b: string; coveredPercent: number}> = [];
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        pairs.push({
          a: members[i].title,
          b: members[j].title,
          coveredPercent: coveredPercent(members[i], members[j]),
        });
      }
    }
    return {
      name: group.name,
      found: members.length,
      expected: group.titles.length,
      widths: members.map(block => Math.round(block.box.width)),
      pairs,
      isolation: members.map(block => block.columnIsolation),
    };
  });
  const chainBlocks = chain.map(title => byTitle(title)[0]).filter(Boolean);
  const containedBlocks = contained
    .map(title => byTitle(title)[0])
    .filter(Boolean);
  const quarter = byTitle('Quick check-in')[0];
  const measured = {
    groups: groupResults,
    chain:
      chainBlocks.length === 3
        ? {
            standupVsDesignSyncPercent: coveredPercent(
              chainBlocks[0],
              chainBlocks[1],
            ),
            designSyncVsRetroPercent: coveredPercent(
              chainBlocks[1],
              chainBlocks[2],
            ),
          }
        : null,
    contained:
      containedBlocks.length === 2
        ? {
            coffeeChatCoveredPercent: Math.round(
              (blockOverlap(containedBlocks[0].box, containedBlocks[1].box) /
                (containedBlocks[1].box.width *
                  containedBlocks[1].box.height)) *
                100,
            ),
          }
        : null,
    quarterHourHeight: quarter == null ? null : Math.round(quarter.box.height),
  };
  await record(
    evidence,
    page,
    'overlap-side-by-side',
    OVERLAPPING,
    'ltr',
    measured,
  );

  for (const group of groupResults) {
    expect(group.found, `${group.name}: every event is painted`).toBe(
      group.expected,
    );
    for (const width of group.widths) {
      expect(
        width,
        `${group.name}: a block keeps a perceivable width`,
      ).toBeGreaterThanOrEqual(16);
    }
    for (const pair of group.pairs) {
      expect(
        pair.coveredPercent,
        `${group.name}: ${pair.a} vs ${pair.b} covered`,
      ).toBeLessThanOrEqual(2);
    }
    for (const isolation of group.isolation) {
      expect(
        isolation,
        `${group.name}: the column isolates its paint order`,
      ).toBe('isolate');
    }
  }
  expect(measured.chain).not.toBeNull();
  expect(measured.chain?.standupVsDesignSyncPercent).toBeLessThanOrEqual(2);
  expect(measured.chain?.designSyncVsRetroPercent).toBeLessThanOrEqual(2);
  expect(measured.contained).not.toBeNull();
  expect(measured.contained?.coffeeChatCoveredPercent).toBeLessThanOrEqual(2);
  expect(measured.quarterHourHeight ?? 0).toBeGreaterThanOrEqual(20);
});

test('narrow tracks keep the title and drop the time line', async ({page}) => {
  await openStory(evidence, page, OVERLAPPING, WIDE);
  const readings = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.astryx-schedule');
    const leaves = [...(root?.querySelectorAll<HTMLElement>('*') ?? [])].filter(
      element =>
        element.children.length === 0 &&
        /^Office hours [A-E]$/.test(element.textContent?.trim() ?? ''),
    );
    return leaves.map(title => {
      let block: HTMLElement | null = title;
      while (block != null && getComputedStyle(block).position !== 'absolute') {
        block = block.parentElement;
      }
      const time = [...(block?.querySelectorAll<HTMLElement>('*') ?? [])].find(
        element =>
          element !== title &&
          element.children.length === 0 &&
          /\d/.test(element.textContent ?? ''),
      );
      return {
        title: title.textContent?.trim(),
        blockWidth:
          block == null
            ? null
            : Math.round(block.getBoundingClientRect().width),
        titleVisible:
          getComputedStyle(title).display !== 'none' &&
          title.getBoundingClientRect().height > 0,
        // Whether the time line paints, read through any inner markup.
        timeVisible: time == null ? null : time.checkVisibility(),
      };
    });
  });
  await record(evidence, page, 'overlap-narrow-tracks', OVERLAPPING, 'ltr', {
    readings,
  });
  expect(readings).toHaveLength(5);
  for (const reading of readings) {
    expect(reading.titleVisible, `${reading.title} title stays`).toBe(true);
    // Five tracks in a 140px column are ~24px each: below the time label's
    // room, so the time line is gone rather than squeezing the title.
    if ((reading.blockWidth ?? 0) <= 72) {
      expect(reading.timeVisible, `${reading.title} time line collapses`).toBe(
        false,
      );
    }
  }
});
