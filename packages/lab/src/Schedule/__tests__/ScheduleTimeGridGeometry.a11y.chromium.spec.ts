// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScheduleTimeGridGeometry.a11y.chromium.spec.ts
 * @input The built Lab/Schedule week stories in real Chromium, with the classic
 *   space-taking scrollbars Playwright's headless default hides
 * @output Receipted evidence that the time grid has one scroll owner whose
 *   header, gutter, and columns stay aligned, and that a keyboard reaches it
 * @position Browser binding for `component:Schedule` FR1–FR3 and AR1. jsdom
 *   lays out nothing, so scrollbar width, sticky alignment, and inline scroll
 *   ownership are checkable only here.
 */

import {expect, test} from '@playwright/test';
import pixelmatch from 'pixelmatch';
// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';
import {
  columnDeltas,
  finishEvidence,
  NARROW,
  openStory,
  readTimeGrid,
  record,
  ringEdgeCoverage,
  setScrollLeft,
  setScrollTop,
  startEvidence,
  WEEKLY,
  WEEKLY_FIXED_HEIGHT,
  WIDE,
  type Evidence,
} from './timeGridProbe';

// Linux Chromium paints classic 15px scrollbars once Playwright's
// `--hide-scrollbars` is dropped: the Windows / "always show scroll bars"
// case this geometry contract exists for.
test.use({launchOptions: {ignoreDefaultArgs: ['--hide-scrollbars']}});

let evidence: Evidence;
test.beforeAll(async () => {
  evidence = await startEvidence();
});
test.afterAll(async () => {
  await finishEvidence(evidence, 'geometry');
});

for (const direction of ['ltr', 'rtl'] as const) {
  test(`header and body columns share one geometry with classic scrollbars (${direction})`, async ({
    page,
  }) => {
    await openStory(
      evidence,
      page,
      WEEKLY_FIXED_HEIGHT,
      WIDE,
      direction === 'rtl' ? 'direction:rtl' : undefined,
    );
    const reading = await readTimeGrid(page);
    const deltas = columnDeltas(reading);
    await record(
      evidence,
      page,
      `geometry-classic-scrollbar-${direction}`,
      WEEKLY_FIXED_HEIGHT,
      direction,
      {
        scrollbarWidth: reading.scroller?.verticalScrollbarWidth,
        horizontalScrollers: reading.horizontalScrollerCount,
        deltas,
      },
    );

    expect(
      reading.scroller,
      'the time grid has a block-axis scroll owner',
    ).not.toBeNull();
    expect(reading.headerCells).toHaveLength(7);
    expect(reading.bodyColumns).toHaveLength(7);
    // The scrollbar must be a real, space-taking one for this evidence to
    // mean anything; the launch option above is what provides it.
    expect(
      reading.scroller?.verticalScrollbarWidth ?? 0,
    ).toBeGreaterThanOrEqual(8);
    for (const delta of deltas) {
      expect(
        delta.deltaLeft,
        `column ${delta.index} inline-start edge`,
      ).toBeLessThanOrEqual(1);
      expect(
        delta.deltaRight,
        `column ${delta.index} inline-end edge`,
      ).toBeLessThanOrEqual(1);
    }
    expect(reading.pageOverflows, 'no whole-page overflow').toBe(false);
  });
}

test('a narrow viewport scrolls header, gutter, and columns as one owner', async ({
  page,
}) => {
  await openStory(evidence, page, WEEKLY, NARROW);
  const before = await readTimeGrid(page);
  await setScrollLeft(page, 160);
  await page.waitForTimeout(50);
  const after = await readTimeGrid(page);
  const deltas = columnDeltas(after);
  const labelDrift = after.hourLabels.map((label, index) => ({
    text: label.text,
    drift: Math.abs(
      label.left - (before.hourLabels[index]?.left ?? Number.NaN),
    ),
  }));
  await record(
    evidence,
    page,
    'geometry-narrow-horizontal-scroll',
    WEEKLY,
    after.direction,
    {
      horizontalScrollersBefore: before.horizontalScrollerCount,
      scrollLeftApplied: after.scroller?.scrollLeft,
      deltas,
      labelDrift,
      pageOverflows: after.pageOverflows,
    },
  );

  expect(
    after.scroller?.scrollLeft ?? 0,
    'the owner actually scrolled',
  ).toBeGreaterThan(100);
  expect(
    before.horizontalScrollerCount,
    'exactly one inline-axis scroll owner',
  ).toBe(1);
  for (const delta of deltas) {
    expect(
      delta.deltaLeft,
      `column ${delta.index} inline-start edge after scroll`,
    ).toBeLessThanOrEqual(1);
    expect(
      delta.deltaRight,
      `column ${delta.index} inline-end edge after scroll`,
    ).toBeLessThanOrEqual(1);
  }
  expect(labelDrift.length).toBeGreaterThan(0);
  for (const label of labelDrift) {
    expect(
      label.drift,
      `hour label ${label.text} stays pinned`,
    ).toBeLessThanOrEqual(1);
  }
  expect(after.pageOverflows, 'no whole-page overflow').toBe(false);
});

function decode(buffer: Buffer): {
  width: number;
  height: number;
  data: Buffer;
} {
  return PNG.sync.read(buffer) as {width: number; height: number; data: Buffer};
}

test('Tab reaches the time grid after the header controls', async ({page}) => {
  await openStory(evidence, page, WEEKLY, WIDE);
  const rest = await readTimeGrid(page);
  const clip = rest.scroller?.box;
  const restFrame =
    clip == null
      ? null
      : await page.screenshot({
          clip: {
            x: clip.left,
            y: clip.top,
            width: clip.width,
            height: clip.height,
          },
        });
  const sequence: Array<{
    tag: string;
    role: string | null;
    label: string | null;
    text: string;
    insideTimeGrid: boolean;
  }> = [];
  for (let press = 0; press < 12; press += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (element == null || element === document.body) {
        return {
          tag: 'body',
          role: null,
          label: null,
          text: '',
          insideTimeGrid: false,
        };
      }
      const root = document.querySelector('.astryx-schedule');
      const headerRow =
        root?.querySelector('h2')?.closest('div')?.parentElement ?? null;
      const insideTimeGrid =
        root != null &&
        root.contains(element) &&
        !(headerRow != null && headerRow.contains(element));
      return {
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role'),
        label: element.getAttribute('aria-label'),
        text: (element.textContent ?? '').trim().slice(0, 40),
        insideTimeGrid,
      };
    });
    sequence.push(focused);
    if (focused.insideTimeGrid || focused.tag === 'body') {
      break;
    }
  }
  // The ring must be visible pixels on every edge, not just a computed
  // outline: the frame clips its own border box, and the viewport's own
  // outline would sit under its pinned header and gutter, so the ring is an
  // overlay laid over the focused viewport.
  const ring = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    const overlay = element?.nextElementSibling;
    if (element == null || overlay == null) {
      return null;
    }
    const style = getComputedStyle(overlay);
    return {
      viewportOutline: getComputedStyle(element).outlineStyle,
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineOffset: Number.parseFloat(style.outlineOffset),
    };
  });
  const focusedFrame =
    clip == null
      ? null
      : await page.screenshot({
          clip: {
            x: clip.left,
            y: clip.top,
            width: clip.width,
            height: clip.height,
          },
        });
  let ringPixels = 0;
  let edges = {top: 0, bottom: 0, left: 0, right: 0};
  if (restFrame != null && focusedFrame != null) {
    const before = decode(restFrame);
    const after = decode(focusedFrame);
    ringPixels = pixelmatch(
      before.data,
      after.data,
      undefined,
      before.width,
      before.height,
      {threshold: 0.1},
    );
    edges = ringEdgeCoverage(before, after);
  }
  await record(evidence, page, 'keyboard-reach', WEEKLY, 'ltr', {
    sequence,
    ring,
    ringPixels,
    edges,
  });
  const reached = sequence.find(stop => stop.insideTimeGrid);
  expect(
    reached,
    'a keyboard user can reach the time grid (its scroll owner or an event)',
  ).toBeDefined();
  // The scroll owner is the named region AST-025 prescribes, and Arrow keys
  // move it.
  expect(reached?.role).toBe('region');
  expect(reached?.label).toMatch(/time grid$/);
  expect(ring?.outlineStyle).not.toBe('none');
  expect(ring?.outlineWidth ?? 0).toBeGreaterThan(0);
  expect(
    ring?.outlineOffset ?? 1,
    'the ring sits inside the clipped frame',
  ).toBeLessThanOrEqual(0);
  // A complete ring: at least a one-pixel perimeter of changed pixels, and
  // every edge — including the ones over the pinned header and gutter —
  // mostly changed.
  expect(ringPixels).toBeGreaterThan(
    2 * ((clip?.width ?? 0) + (clip?.height ?? 0)),
  );
  for (const [edge, coverage] of Object.entries(edges)) {
    expect(
      coverage,
      `${edge} edge of the focus ring is painted`,
    ).toBeGreaterThan(0.9);
  }
  // Start from the top so the key has somewhere to go whatever offset the
  // grid opened at.
  await setScrollTop(page, 0);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  const after = await readTimeGrid(page);
  expect(after.scroller?.scrollTop ?? 0).toBeGreaterThan(0);
});
