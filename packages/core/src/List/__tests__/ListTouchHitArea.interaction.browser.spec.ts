// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListTouchHitArea.interaction.browser.spec.ts
 * @input The built List stories in the touch phone context (primary pointer
 *   coarse) and in a mouse context of the same viewport and scale
 * @output Proofs for `component:List` FR10 under a finger: an interactive
 *   row's hit layer grows toward the touch target, taking half the gap to
 *   each neighboring row and growing further only where nothing is near; a
 *   tap in that growth activates the row and a tap past it does not; no two
 *   rows' areas overlap; the row's own content keeps its taps; a row already
 *   as tall as the touch target and a disabled row gain nothing; the theme's
 *   touch target and row padding reach it; the layer adds no layout and
 *   paints nothing; a mouse gets no layer. Geometry is read from the layer's
 *   computed edges: Chromium's elementFromPoint snaps a point to whole CSS
 *   pixels, too coarse for a 1 px half gap, so the hit tests probe whole
 *   pixels inside a wider growth
 * @position Interaction evidence for ListItem's touch hit area
 *   (utils/touchHitArea.stylex.ts, kept live by utils/touchHitArea.ts) under a finger
 *   (./touchStory.ts)
 */

import {
  expect,
  test,
  type Browser,
  type Page,
  type TestInfo,
} from '@playwright/test';
import {withStorybook} from '@astryxdesign/interaction-harness';
import {openStory} from './touchStory';

const storybook = withStorybook(test);

interface Row {
  readonly text: string;
  readonly top: number;
  readonly bottom: number;
  readonly height: number;
  readonly x: number;
  readonly layer: {
    readonly content: string;
    readonly top: number;
    readonly bottom: number;
    readonly paint: string;
  };
  readonly isolation: string;
  readonly written: string;
}

/** The story's rows (Storybook's own hidden error page has list items too). */
async function rowsOf(page: Page): Promise<Row[]> {
  return page.locator('#storybook-root li').evaluateAll(elements =>
    elements.map(el => {
      const box = el.getBoundingClientRect();
      const layer = getComputedStyle(el, '::after');
      return {
        text: el.textContent?.trim() ?? '',
        top: box.top,
        bottom: box.bottom,
        height: box.height,
        x: box.left + box.width / 2,
        layer: {
          content: layer.content,
          // How far the layer reaches past the row, px (its insets negated).
          top: layer.content === 'none' ? 0 : 0 - Number.parseFloat(layer.top),
          bottom:
            layer.content === 'none' ? 0 : 0 - Number.parseFloat(layer.bottom),
          paint: [
            layer.backgroundColor,
            layer.backgroundImage,
            layer.boxShadow,
            layer.borderTopWidth,
            layer.outlineStyle,
          ].join(' | '),
        },
        isolation: getComputedStyle(el).isolation,
        written: (el as HTMLElement).style.getPropertyValue(
          '--astryx-hit-inset-top',
        ),
      };
    }),
  );
}

/**
 * The rows once the shared hit area has measured them: its pass runs in a
 * frame after the rows show, and writes only insets that differ from 0, so
 * wait a few frames and then until two frames read the same.
 */
async function measuredRowsOf(page: Page): Promise<Row[]> {
  const frames = async (count: number) =>
    page.evaluate(async n => {
      for (let i = 0; i < n; i++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    }, count);
  await frames(4);
  let previous = JSON.stringify(await rowsOf(page));
  await expect
    .poll(async () => {
      await frames(2);
      const current = JSON.stringify(await rowsOf(page));
      const settled = current === previous;
      previous = current;
      return settled;
    })
    .toBe(true);
  return rowsOf(page);
}

/** A theme that sets the touch target size, before the story renders. */
async function themeTouchTarget(page: Page, size: string): Promise<void> {
  // Storybook rewrites the root element's style attribute, so a stylesheet.
  await page.addInitScript(value => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = `:root { --size-touch-target: ${value}; }`;
      document.head.append(style);
    });
  }, size);
}

/** The story row the browser hit-tests at a point, by its text. */
async function rowAt(page: Page, x: number, y: number): Promise<string | null> {
  return page.evaluate(
    ([px, py]) =>
      document
        .elementFromPoint(px, py)
        ?.closest('#storybook-root li')
        ?.textContent?.trim() ?? null,
    [x, y] as const,
  );
}

const isTouch = async (page: Page) =>
  page.evaluate(() => matchMedia('(pointer: coarse)').matches);

/** FR10's invariant: no row's area reaches into the next row's area. */
function expectNoOverlap(rows: ReadonlyArray<Row>): void {
  for (let i = 0; i + 1 < rows.length; i++) {
    expect(
      rows[i].bottom + rows[i].layer.bottom,
      JSON.stringify(rows),
    ).toBeLessThanOrEqual(rows[i + 1].top - rows[i + 1].layer.top + 0.01);
  }
}

/** The same page with a mouse: the phone's viewport and scale, a fine pointer. */
async function withMouse<T>(
  browser: Browser,
  testInfo: TestInfo,
  run: (page: Page) => Promise<T>,
): Promise<T> {
  const {viewport, deviceScaleFactor} = testInfo.project.use;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    hasTouch: false,
    isMobile: false,
  });
  try {
    const page = await context.newPage();
    return await run(page);
  } finally {
    await context.close();
  }
}

test('under a finger, a short interactive row takes half the gap to each neighbor and grows toward the touch target where nothing is near', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-list--interactive');
  test.skip(!(await isTouch(page)), 'the hit area applies under a finger only');
  const rows = await measuredRowsOf(page);
  expect(rows).toHaveLength(3);
  const gap = rows[1].top - rows[0].bottom;
  const grow = (44 - rows[0].height) / 2;
  const summary = JSON.stringify({gap, grow, rows});
  // One-line rows, shorter than the 44px touch target, 2px apart.
  expect(rows[0].height, summary).toBeLessThan(44);
  expect(gap, summary).toBeCloseTo(2, 1);
  // Half the gap between rows; the full growth past the list's ends, where
  // nothing interactive is near.
  const reach = rows.map(row => [row.layer.top, row.layer.bottom]);
  expect(reach, summary).toEqual([
    [grow, gap / 2],
    [gap / 2, gap / 2],
    [gap / 2, grow],
  ]);
  expectNoOverlap(rows);
});

test('under a finger, a tap in a row’s growth activates that row, and nothing is hit past it', async ({
  page,
}) => {
  test.skip(!(await isTouch(page)), 'the hit area applies under a finger only');
  // A theme with a 60px touch target, so the growth past the list's first row
  // spans whole pixels a tap can land on.
  await themeTouchTarget(page, '60px');
  await openStory(page, storybook(), 'core-list--interactive');
  const rows = await measuredRowsOf(page);
  const grow = (60 - rows[0].height) / 2;
  expect(rows[0].layer.top, JSON.stringify(rows)).toBeCloseTo(grow, 1);
  const inside = Math.round(rows[0].top - grow / 2);
  const outside = Math.round(rows[0].top - grow - 3);
  // The browser's own hit test at each point, then a real tap in the growth.
  // (No tap past it: a touch engine's own touch adjustment may move a tap
  // that lands a few pixels from a target onto it.)
  expect(await rowAt(page, rows[0].x, inside)).toBe(rows[0].text);
  expect(await rowAt(page, rows[0].x, outside)).toBe(null);
  await page.evaluate(() => {
    const taps: string[] = [];
    (window as unknown as {taps: string[]}).taps = taps;
    for (const row of document.querySelectorAll('#storybook-root li')) {
      row.addEventListener('click', () =>
        taps.push(row.textContent?.trim() ?? ''),
      );
    }
  });
  await page.touchscreen.tap(rows[0].x, inside);
  expect(
    await page.evaluate(() => (window as unknown as {taps: string[]}).taps),
  ).toEqual([rows[0].text]);
});

test('under a finger, the row’s own content keeps its taps', async ({page}) => {
  await openStory(page, storybook(), 'core-list--interactive');
  test.skip(!(await isTouch(page)), 'the hit area applies under a finger only');
  await measuredRowsOf(page);
  const hits = await page.locator('#storybook-root li').evaluateAll(rows =>
    rows.map(row => {
      // The row's end content (its chevron), above the layer.
      const icons = row.querySelectorAll('svg');
      const end = icons[icons.length - 1];
      const box = end.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      return hit != null && hit !== row && row.contains(hit);
    }),
  );
  expect(hits).toEqual([true, true, true]);
});

test('under a finger, a row already as tall as the touch target gains nothing, rows that touch take nothing from each other, and a disabled row has no layer', async ({
  page,
}) => {
  test.slow();
  // Links: a one-line row, then two rows with descriptions (taller than the
  // touch target): only the short row grows.
  await openStory(page, storybook(), 'core-list--links');
  test.skip(!(await isTouch(page)), 'the hit area applies under a finger only');
  const links = await measuredRowsOf(page);
  const summary = JSON.stringify(links);
  expect(links[0].height, summary).toBeLessThan(44);
  expect(links[0].layer.bottom, summary).toBeCloseTo(
    (links[1].top - links[0].bottom) / 2,
    1,
  );
  for (const row of links.slice(1)) {
    expect(row.height, summary).toBeGreaterThanOrEqual(44);
    expect([row.layer.top, row.layer.bottom], summary).toEqual([0, 0]);
  }
  expectNoOverlap(links);
  // Compact with dividers: the rows touch, so between them nothing grows.
  await openStory(page, storybook(), 'core-list--compact');
  const compact = await measuredRowsOf(page);
  expect(compact.length).toBeGreaterThan(1);
  for (let i = 0; i + 1 < compact.length; i++) {
    expect(compact[i].layer.bottom, JSON.stringify(compact)).toBe(0);
    expect(compact[i + 1].layer.top, JSON.stringify(compact)).toBe(0);
  }
  expectNoOverlap(compact);
  // A disabled row offers no target: no layer, nothing measured.
  await openStory(page, storybook(), 'core-list--disabled-items');
  await measuredRowsOf(page);
  const disabled = await page
    .locator('#storybook-root li[aria-disabled="true"]')
    .evaluateAll(rows =>
      rows.map(row => [
        getComputedStyle(row, '::after').content,
        (row as HTMLElement).style.getPropertyValue('--astryx-hit-inset-top'),
      ]),
    );
  expect(disabled.length).toBeGreaterThan(0);
  for (const [content, written] of disabled) {
    expect(content).toBe('none');
    expect(written).toBe('');
  }
});

test('under a finger, the theme’s touch target and row padding reach the layer', async ({
  page,
}) => {
  test.skip(!(await isTouch(page)), 'the hit area applies under a finger only');
  // A theme whose touch target is shorter than the row: nothing to grow.
  await themeTouchTarget(page, '30px');
  await openStory(page, storybook(), 'core-list--interactive');
  for (const row of await measuredRowsOf(page)) {
    expect([row.layer.top, row.layer.bottom]).toEqual([0, 0]);
  }
  // A theme whose row padding makes the row as tall as the target (the later
  // stylesheet's 44px wins over the 30px one).
  await themeTouchTarget(page, '44px');
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent =
        '#storybook-root li { padding-block: 12px !important; }';
      document.head.append(style);
    });
  });
  await openStory(page, storybook(), 'core-list--interactive');
  const padded = await measuredRowsOf(page);
  expect(padded[0].height).toBeGreaterThanOrEqual(44);
  for (const row of padded) {
    expect([row.layer.top, row.layer.bottom]).toEqual([0, 0]);
  }
});

for (const story of [
  'core-list--interactive',
  'core-list--links',
  'core-list--compact',
  'core-list--with-media',
]) {
  test(`${story}: the layer adds no layout and paints nothing, and a mouse gets none`, async ({
    browser,
    page,
  }, testInfo) => {
    await openStory(page, storybook(), story);
    test.skip(
      !(await isTouch(page)),
      'the hit area applies under a finger only',
    );
    const touch = await measuredRowsOf(page);
    // The same page with every row's layer taken away: the same boxes.
    await page.addStyleTag({
      content: '#storybook-root li::after { display: none !important; }',
    });
    const bare = await rowsOf(page);
    const mouse = await withMouse(browser, testInfo, async mousePage => {
      await openStory(mousePage, storybook(), story);
      expect(await isTouch(mousePage)).toBe(false);
      // A frame for a pass that must not come.
      await mousePage.evaluate(async () => {
        await new Promise(resolve => requestAnimationFrame(resolve));
      });
      return rowsOf(mousePage);
    });
    const summary = JSON.stringify({touch, bare, mouse});
    expect(touch.length, summary).toBeGreaterThan(0);
    expect(bare.length, summary).toBe(touch.length);
    expect(mouse.length, summary).toBe(touch.length);
    for (const [i, row] of touch.entries()) {
      expect(row.top, summary).toBeCloseTo(bare[i].top, 2);
      expect(row.height, summary).toBeCloseTo(bare[i].height, 2);
      if (row.layer.content !== 'none') {
        expect(row.layer.paint, summary).toMatch(
          /^rgba\(0, 0, 0, 0\) \| none \| none \| 0px \| none$/,
        );
      }
      // A mouse: no pseudo-element, no stacking context, nothing measured.
      expect(mouse[i].layer.content, summary).toBe('none');
      expect(mouse[i].isolation, summary).toBe('auto');
      expect(mouse[i].written, summary).toBe('');
    }
  });
}
