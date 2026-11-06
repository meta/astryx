// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file timeGridProbe.ts
 * @input A Playwright page showing a built Lab/Schedule week or day story
 * @output Geometry, block, and focus readings of the painted time grid, plus a
 *   receipt writer that pairs each reading with a screenshot
 * @position Shared by the Schedule time-grid browser contracts. Every lookup
 *   works from text, computed style, and geometry rather than class names, so
 *   the same readings describe a build that predates a contract and one that
 *   implements it.
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

export const OUTPUT = path.resolve('test-results/schedule-time-grid-evidence');
export const WEEKLY = 'lab-schedule--weekly';
export const WEEKLY_FIXED_HEIGHT = 'lab-schedule--weekly-fixed-height';
export const DAY = 'lab-schedule--day';
export const OVERLAPPING = 'lab-schedule--overlapping-events';
export const WIDE = {width: 1280, height: 900};
export const NARROW = {width: 760, height: 700};
// One hour of the week/day stories; the contract's lead context is one hour.
export const HOUR_HEIGHT = 100;

export interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface TimeGridReading {
  readonly direction: 'ltr' | 'rtl';
  readonly scroller: {
    readonly box: Box;
    readonly scrollTop: number;
    readonly scrollLeft: number;
    readonly scrollHeight: number;
    readonly clientHeight: number;
    readonly scrollWidth: number;
    readonly clientWidth: number;
    readonly verticalScrollbarWidth: number;
  } | null;
  readonly headerCells: ReadonlyArray<Box>;
  readonly bodyColumns: ReadonlyArray<Box>;
  readonly hourLabels: ReadonlyArray<{
    readonly text: string;
    readonly left: number;
  }>;
  readonly nowLine: {readonly topInContent: number} | null;
  readonly firstColumnTopInContent: number | null;
  readonly horizontalScrollerCount: number;
  readonly pageOverflows: boolean;
}

export interface Receipt {
  readonly test: string;
  readonly story: string;
  readonly viewport: {readonly width: number; readonly height: number};
  readonly direction: 'ltr' | 'rtl';
  readonly browser: string;
  readonly checkout: string;
  readonly head: string;
  readonly measured: unknown;
  readonly screenshot: string;
}

export interface Evidence {
  readonly storybook: StaticServer;
  readonly checkoutSha: string;
  readonly receipts: Receipt[];
}

/** Serves the built Storybook and prepares the evidence directory. */
export async function startEvidence(): Promise<Evidence> {
  const checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  fs.mkdirSync(OUTPUT, {recursive: true});
  const storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
  return {storybook, checkoutSha, receipts: []};
}

/** Writes the receipts of one contract file and stops the server. */
export async function finishEvidence(
  evidence: Evidence | undefined,
  name: string,
): Promise<void> {
  if (evidence == null) {
    return;
  }
  fs.writeFileSync(
    path.join(OUTPUT, `receipts-${name}.json`),
    `${JSON.stringify(evidence.receipts, null, 2)}\n`,
  );
  await evidence.storybook.close();
}

export function storyUrl(
  evidence: Evidence,
  id: string,
  globals?: string,
): string {
  const query = globals == null ? '' : `&globals=${globals}`;
  return `${evidence.storybook.origin}/iframe.html?id=${id}&viewMode=story${query}`;
}

export async function openStory(
  evidence: Evidence,
  page: Page,
  id: string,
  viewport: {width: number; height: number},
  globals?: string,
): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto(storyUrl(evidence, id, globals), {waitUntil: 'load'});
  await page.locator('.astryx-schedule').waitFor();
  // Fonts and the first layout pass settle before anything is measured.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
}

/**
 * Reads the painted time grid by what it is, not by how it is classed: the
 * scroll owner is the first element whose block axis overflows, header cells
 * hold the day headings, body columns are the stacks of empty hour slots, and
 * the now-line is the two-pixel rule.
 */
export function readTimeGrid(page: Page): Promise<TimeGridReading> {
  return page.evaluate((hourHeight): TimeGridReading => {
    const toBox = (rect: DOMRect) => ({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
    const root = document.querySelector<HTMLElement>('.astryx-schedule');
    if (root == null) {
      throw new Error('No Schedule root in the story');
    }
    const direction: 'ltr' | 'rtl' =
      getComputedStyle(root).direction === 'rtl' ? 'rtl' : 'ltr';
    const all = [...root.querySelectorAll<HTMLElement>('*')];
    const scrollsOn = (element: HTMLElement, axis: 'x' | 'y') => {
      const style = getComputedStyle(element);
      const overflow = axis === 'x' ? style.overflowX : style.overflowY;
      const excess =
        axis === 'x'
          ? element.scrollWidth - element.clientWidth
          : element.scrollHeight - element.clientHeight;
      return (overflow === 'auto' || overflow === 'scroll') && excess > 1;
    };
    const scrollerElement =
      all.find(element => scrollsOn(element, 'y')) ?? null;
    const scrollerBox = scrollerElement?.getBoundingClientRect();
    const inScroller = (element: Element) =>
      scrollerElement != null && scrollerElement.contains(element);

    const headerCells = [...root.querySelectorAll<HTMLElement>('h3')]
      .map(heading => heading.parentElement)
      .filter((cell): cell is HTMLElement => cell != null)
      .map(cell => toBox(cell.getBoundingClientRect()));

    const isEmptyBox = (element: HTMLElement) =>
      element.children.length === 0 && element.textContent?.trim() === '';
    const slots = all.filter(element => {
      if (!inScroller(element) || !isEmptyBox(element)) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      return Math.abs(rect.height - hourHeight) <= 2 && rect.width > 20;
    });
    const columnsByLeft = new Map<number, Box>();
    for (const slot of slots) {
      const rect = slot.getBoundingClientRect();
      const key = Math.round(rect.left);
      const existing = columnsByLeft.get(key);
      if (existing == null) {
        columnsByLeft.set(key, toBox(rect));
      } else {
        columnsByLeft.set(key, {
          ...existing,
          top: Math.min(existing.top, rect.top),
          bottom: Math.max(existing.bottom, rect.bottom),
        });
      }
    }
    const bodyColumns = [...columnsByLeft.values()].sort((a, b) =>
      direction === 'rtl' ? b.left - a.left : a.left - b.left,
    );
    const sortedHeaderCells = [...headerCells].sort((a, b) =>
      direction === 'rtl' ? b.left - a.left : a.left - b.left,
    );

    const hourLabels = all
      .filter(
        element =>
          inScroller(element) &&
          element.children.length === 0 &&
          /^\d{1,2}(:\d{2})?\s?(AM|PM)$/i.test(
            element.textContent?.trim() ?? '',
          ),
      )
      .map(element => ({
        text: element.textContent?.trim() ?? '',
        left: element.getBoundingClientRect().left,
      }));

    const nowLineElement = all.find(element => {
      if (!inScroller(element) || !isEmptyBox(element)) {
        return false;
      }
      const style = getComputedStyle(element);
      return (
        style.position === 'absolute' &&
        style.borderTopWidth === '2px' &&
        element.getBoundingClientRect().height <= 2
      );
    });
    const contentTop = (element: Element) =>
      scrollerElement == null || scrollerBox == null
        ? null
        : element.getBoundingClientRect().top -
          scrollerBox.top +
          scrollerElement.scrollTop;
    const firstSlotOfFirstColumn = slots
      .map(slot => ({slot, rect: slot.getBoundingClientRect()}))
      .filter(
        ({rect}) =>
          bodyColumns[0] != null &&
          Math.round(rect.left) === Math.round(bodyColumns[0].left),
      )
      .sort((a, b) => a.rect.top - b.rect.top)[0]?.slot;

    const horizontalScrollerCount = all.filter(element =>
      scrollsOn(element, 'x'),
    ).length;

    return {
      direction,
      scroller:
        scrollerElement == null || scrollerBox == null
          ? null
          : {
              box: toBox(scrollerBox),
              scrollTop: scrollerElement.scrollTop,
              scrollLeft: scrollerElement.scrollLeft,
              scrollHeight: scrollerElement.scrollHeight,
              clientHeight: scrollerElement.clientHeight,
              scrollWidth: scrollerElement.scrollWidth,
              clientWidth: scrollerElement.clientWidth,
              verticalScrollbarWidth:
                scrollerElement.offsetWidth - scrollerElement.clientWidth,
            },
      headerCells: sortedHeaderCells,
      bodyColumns,
      hourLabels,
      nowLine:
        nowLineElement == null
          ? null
          : {topInContent: contentTop(nowLineElement) ?? Number.NaN},
      firstColumnTopInContent:
        firstSlotOfFirstColumn == null
          ? null
          : contentTop(firstSlotOfFirstColumn),
      horizontalScrollerCount,
      pageOverflows:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    };
  }, HOUR_HEIGHT);
}

export function columnDeltas(reading: TimeGridReading) {
  return reading.headerCells.map((cell, index) => {
    const column = reading.bodyColumns[index];
    return {
      index,
      header: [Math.round(cell.left), Math.round(cell.right)],
      body:
        column == null
          ? null
          : [Math.round(column.left), Math.round(column.right)],
      deltaLeft: column == null ? null : Math.abs(cell.left - column.left),
      deltaRight: column == null ? null : Math.abs(cell.right - column.right),
    };
  });
}

export function setScrollLeft(page: Page, value: number): Promise<void> {
  return page.evaluate(scrollLeft => {
    const root = document.querySelector<HTMLElement>('.astryx-schedule');
    const scroller = [...(root?.querySelectorAll<HTMLElement>('*') ?? [])].find(
      element => {
        const style = getComputedStyle(element);
        return (
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          element.scrollHeight - element.clientHeight > 1
        );
      },
    );
    if (scroller != null) {
      scroller.scrollLeft = scrollLeft;
    }
  }, value);
}

export function setScrollTop(page: Page, value: number): Promise<void> {
  return page.evaluate(scrollTop => {
    const root = document.querySelector<HTMLElement>('.astryx-schedule');
    const scroller = [...(root?.querySelectorAll<HTMLElement>('*') ?? [])].find(
      element => {
        const style = getComputedStyle(element);
        return (
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          element.scrollHeight - element.clientHeight > 1
        );
      },
    );
    if (scroller != null) {
      scroller.scrollTop = scrollTop;
    }
  }, value);
}

export async function record(
  evidence: Evidence,
  page: Page,
  name: string,
  story: string,
  direction: 'ltr' | 'rtl',
  measured: unknown,
): Promise<void> {
  const viewport = page.viewportSize() ?? WIDE;
  const file = `${name}.png`;
  await page.screenshot({path: path.join(OUTPUT, file), fullPage: false});
  evidence.receipts.push({
    test: name,
    story,
    viewport,
    direction,
    browser: page.context().browser()?.version() ?? 'unknown',
    checkout: evidence.checkoutSha,
    head: process.env.ASTRYX_HEAD_SHA ?? evidence.checkoutSha,
    measured,
    screenshot: file,
  });
  // The job log is the durable copy of each measurement when artifacts expire.
  // eslint-disable-next-line no-console
  console.log(`[schedule-time-grid] ${name}: ${JSON.stringify(measured)}`);
}

export interface BlockReading {
  readonly title: string;
  readonly box: Box;
  readonly columnIsolation: string;
}

export function readBlocks(
  page: Page,
  titles: ReadonlyArray<string>,
): Promise<BlockReading[]> {
  return page.evaluate((wanted): BlockReading[] => {
    const root = document.querySelector<HTMLElement>('.astryx-schedule');
    if (root == null) {
      throw new Error('No Schedule root in the story');
    }
    const leaves = [...root.querySelectorAll<HTMLElement>('*')].filter(
      element =>
        element.children.length === 0 &&
        wanted.includes(element.textContent?.trim() ?? ''),
    );
    const seen = new Set<HTMLElement>();
    const blocks: Array<{title: string; box: Box; columnIsolation: string}> =
      [];
    for (const leaf of leaves) {
      let block: HTMLElement | null = leaf;
      while (block != null && getComputedStyle(block).position !== 'absolute') {
        block = block.parentElement;
      }
      if (block == null || seen.has(block)) {
        continue;
      }
      // The hidden read-only grid repeats titles inside aria-labels, never as
      // text nodes, so a text leaf is always a painted block.
      seen.add(block);
      const rect = block.getBoundingClientRect();
      blocks.push({
        title: leaf.textContent?.trim() ?? '',
        box: {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        columnIsolation:
          block.parentElement == null
            ? ''
            : getComputedStyle(block.parentElement).isolation,
      });
    }
    return blocks;
  }, titles);
}

export function inlineOverlap(a: Box, b: Box): number {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
}

export function blockOverlap(a: Box, b: Box): number {
  const horizontal = inlineOverlap(a, b);
  const vertical = Math.max(
    0,
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
  );
  return horizontal * vertical;
}

/**
 * How much of each edge of a frame changed between two same-size PNG
 * buffers: the share of columns (top/bottom) or rows (left/right) in a
 * 4-pixel band along that edge with at least one changed pixel. A complete
 * focus ring scores near 1 on all four edges; a ring hidden under a pinned
 * part scores near 0 there.
 */
export function ringEdgeCoverage(
  before: {width: number; height: number; data: Uint8Array},
  after: {width: number; height: number; data: Uint8Array},
  band = 4,
): {top: number; bottom: number; left: number; right: number} {
  const {width, height} = before;
  const changed = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      if (
        Math.abs(before.data[index + channel] - after.data[index + channel]) >
        24
      ) {
        return true;
      }
    }
    return false;
  };
  const columnChanged = (x: number, fromY: number, toY: number) => {
    for (let y = fromY; y < toY; y += 1) {
      if (changed(x, y)) {
        return true;
      }
    }
    return false;
  };
  const rowChanged = (y: number, fromX: number, toX: number) => {
    for (let x = fromX; x < toX; x += 1) {
      if (changed(x, y)) {
        return true;
      }
    }
    return false;
  };
  let top = 0;
  let bottom = 0;
  for (let x = 0; x < width; x += 1) {
    if (columnChanged(x, 0, band)) {
      top += 1;
    }
    if (columnChanged(x, height - band, height)) {
      bottom += 1;
    }
  }
  let left = 0;
  let right = 0;
  for (let y = 0; y < height; y += 1) {
    if (rowChanged(y, 0, band)) {
      left += 1;
    }
    if (rowChanged(y, width - band, width)) {
      right += 1;
    }
  }
  return {
    top: top / width,
    bottom: bottom / width,
    left: left / height,
    right: right / height,
  };
}
