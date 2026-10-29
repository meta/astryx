// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/Table/ ^packages/core/src/motion/ ^apps/storybook/stories/TableRowExpansion

/**
 * @file TableRowGlide.a11y.browser.spec.ts
 * @input Built TableRowExpansion stories in real Chromium and WebKit
 * @output Browser evidence for the row-expansion glide (component:Table FR14,
 *   FR15): with an `animatedLayout` handle the rows after a detail panel
 *   glide and each divider moves with its row, pinned cells included, the
 *   columns keep their widths, and an open panel draws its divider; without
 *   a handle the rows change at once
 * @position Regression proof for useTableRowExpansion's animatedLayout
 *   adoption and glidingDivider.ts
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

async function mount(page: Page, story: string, args = '', timeout = 5000) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablerowexpansion--${story}&viewMode=story${args}`,
  );
  await expect(page.locator('[data-expansion-toggle]').first()).toBeVisible({
    timeout,
  });
}

/**
 * Toggles a row and holds every animation `ms` into its run, so the frame
 * can be read.
 */
async function toggleAndHold(page: Page, index: number, ms: number) {
  return page.evaluate(
    async ({index, ms}) => {
      (
        document.querySelectorAll('[data-expansion-toggle]')[index] as
          HTMLElement | undefined
      )?.click();
      await new Promise(resolve => requestAnimationFrame(resolve));
      // The glide's own motion on rows (script animations), not a CSS
      // transition a row's hover or press state runs.
      const rows = document
        .getAnimations()
        .filter(
          animation =>
            !(animation instanceof CSSTransition) &&
            !(animation instanceof CSSAnimation) &&
            (animation.effect as KeyframeEffect | null)?.target?.nodeName ===
              'TR',
        );
      for (const animation of document.getAnimations()) {
        animation.pause();
        animation.currentTime = ms;
      }
      return rows.length;
    },
    {index, ms},
  );
}

type Rgb = [number, number, number];

/** The darkest pixel within 3 px of `y` at `x`. */
async function darkestNear(page: Page, x: number, y: number): Promise<Rgb> {
  const shot = await page.screenshot({
    clip: {x, y: y - 3, width: 1, height: 7},
    scale: 'css',
  });
  return page.evaluate(async b64 => {
    const image = new Image();
    image.src = `data:image/png;base64,${b64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (context == null) {
      return [255, 255, 255];
    }
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, image.width, image.height).data;
    let darkest: [number, number, number] = [255, 255, 255];
    for (let i = 0; i < data.length; i += 4) {
      if (
        data[i] + data[i + 1] + data[i + 2] <
        darkest[0] + darkest[1] + darkest[2]
      ) {
        darkest = [data[i], data[i + 1], data[i + 2]];
      }
    }
    return darkest;
  }, shot.toString('base64'));
}

/** Where a body row's divider is now, under its pinned and an unpinned cell. */
async function rowBottom(page: Page, index: number) {
  return page.evaluate(i => {
    const row = document.querySelectorAll(
      '.astryx-table-scroll-wrapper tbody tr',
    )[i] as HTMLElement;
    const pinned = row.children[0].getBoundingClientRect();
    const last = row.children[row.children.length - 1].getBoundingClientRect();
    return {
      y: Math.round(pinned.bottom),
      pinnedX: Math.round(pinned.left + pinned.width / 2),
      unpinnedX: Math.round((pinned.right + last.right) / 2),
    };
  }, index);
}

const near = (a: Rgb, b: Rgb, tolerance: number) =>
  a.every((channel, i) => Math.abs(channel - b[i]) <= tolerance);

const columnWidths = async (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('thead th')]
      .map(th => Math.round(th.getBoundingClientRect().width))
      .join('/'),
  );

test('without a handle the rows change at once', async ({page}) => {
  // 2,000 rows: a slow runner takes more than the default 5 s to render it.
  await mount(page, 'gliding-rows-long-table', '&args=glide:!false', 30_000);
  expect(await toggleAndHold(page, 1, 90)).toBe(0);
});

test('mid-glide each divider moves with its row, pinned cells included', async ({
  page,
}) => {
  await mount(page, 'gliding-rows');
  for (const action of ['opening', 'closing'] as const) {
    expect(await toggleAndHold(page, 0, 90), action).toBeGreaterThan(0);
    // Every row after the panel but the last (which has no divider), where
    // it shows now (its glide included): a line under its pinned cell as
    // under the rest of the row. A divider left at its static place leaves
    // nothing here.
    const rows = await page.evaluate(
      () =>
        document.querySelectorAll('.astryx-table-scroll-wrapper tbody tr')
          .length,
    );
    for (let row = action === 'opening' ? 2 : 1; row < rows - 1; row++) {
      const {y, pinnedX, unpinnedX} = await rowBottom(page, row);
      const pinned = await darkestNear(page, pinnedX, y);
      const unpinned = await darkestNear(page, unpinnedX, y);
      expect(unpinned[0], `${action}, row ${row}`).toBeLessThan(248);
      expect(near(pinned, unpinned, 8), `${action}, row ${row}, pinned`).toBe(
        true,
      );
    }
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        animation.finish();
      }
    });
    await page.waitForTimeout(100);
  }
});

test("a theme's divider and an app's override move with their rows, pinned cells included", async ({
  page,
}) => {
  await mount(page, 'gliding-rows', '&args=themed:!true');
  expect(await toggleAndHold(page, 0, 90)).toBeGreaterThan(0);
  // The story's red is on the tbody's third row, which is the first after
  // the open panel (row 2); the next (row 3) draws the theme's blue.
  for (const [row, isBlue] of [
    [2, false],
    [3, true],
  ] as const) {
    const {y, pinnedX, unpinnedX} = await rowBottom(page, row);
    for (const [where, x] of [
      ['pinned', pinnedX],
      ['unpinned', unpinnedX],
    ] as const) {
      const [r, , b] = await darkestNear(page, x, y);
      expect(isBlue ? b - r : r - b, `row ${row}, ${where}`).toBeGreaterThan(
        60,
      );
    }
  }
});

test("an app's border on a row itself moves with the row, pinned cells included, and leaves nothing at its static place", async ({
  page,
}) => {
  await mount(page, 'gliding-rows', '&args=rowBorder:!true');
  expect(await toggleAndHold(page, 0, 90)).toBeGreaterThan(0);
  // The green border is on the fourth order's row, which glides down: the
  // open panel sits above it, so it is the tbody's fifth row now.
  const {y, pinnedX, unpinnedX} = await rowBottom(page, 4);
  for (const [where, x] of [
    ['pinned', pinnedX],
    ['unpinned', unpinnedX],
  ] as const) {
    const [r, g] = await darkestNear(page, x, y);
    expect(g - r, `moving line, ${where}`).toBeGreaterThan(60);
  }
  // Where the row lands, the line is not drawn yet.
  const travel = await page.evaluate(() => {
    const row = document.querySelectorAll(
      '.astryx-table-scroll-wrapper tbody tr',
    )[4] as HTMLElement;
    const parts = getComputedStyle(row).translate.split(' ');
    return Number.parseFloat(parts[1] ?? '0') || 0;
  });
  expect(Math.abs(travel)).toBeGreaterThan(4);
  const [r, g] = await darkestNear(page, unpinnedX, Math.round(y - travel));
  expect(g - r, 'static place').toBeLessThan(30);
});

/** The rows of green pixels down one column of the page at `x`. */
async function greenRowsAt(page: Page, x: number): Promise<number[]> {
  const shot = await page.screenshot({
    clip: {x, y: 0, width: 1, height: 720},
    scale: 'css',
  });
  return page.evaluate(async b64 => {
    const image = new Image();
    image.src = `data:image/png;base64,${b64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (context == null) {
      return [];
    }
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, 1, image.height).data;
    const rows: number[] = [];
    for (let y = 0; y < image.height; y += 1) {
      const [r, g, b] = [data[y * 4], data[y * 4 + 1], data[y * 4 + 2]];
      if (g - r > 60 && g - b > 30) {
        rows.push(y);
      }
    }
    return rows;
  }, shot.toString('base64'));
}

for (const [name, args] of [
  ["a row's own 3 px border", '&args=rowBorder:!true'],
  ["a theme's 2 px divider", '&args=wideBorder:!true'],
] as const) {
  test(`${name} glides level across the pinned and scrolling cells`, async ({
    page,
  }) => {
    await mount(page, 'gliding-rows', args);
    expect(await toggleAndHold(page, 0, 90)).toBeGreaterThan(0);
    const {pinnedX, unpinnedX} = await rowBottom(page, 4);
    const pinned = await greenRowsAt(page, pinnedX);
    const unpinned = await greenRowsAt(page, unpinnedX);
    expect(pinned.length).toBeGreaterThan(0);
    expect(unpinned.length).toBeGreaterThan(0);
    // One line, at one height on both sides of the pinned edge: not even a
    // 1 px step.
    expect(Math.min(...pinned)).toBe(Math.min(...unpinned));
    expect(Math.max(...pinned)).toBe(Math.max(...unpinned));
  });
}

for (const edge of ['tbody', 'top'] as const) {
  test(`a divider the collapse takes from ${edge === 'tbody' ? "the body's bottom border" : "the next row's top border"} is drawn once while it glides`, async ({
    page,
  }) => {
    await mount(page, 'gliding-rows', `&args=edgeBorder:${edge}`);
    const {unpinnedX} = await rowBottom(page, 0);
    expect((await greenRowsAt(page, unpinnedX)).length).toBeGreaterThan(0);
    expect(await toggleAndHold(page, 0, 90)).toBeGreaterThan(0);
    const rows = await greenRowsAt(page, unpinnedX);
    // One 3 px line, moving: none left at the static place.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(4);
  });
}

test('the chevron turns on the glide; column lines and Reduce Motion change at once', async ({
  page,
}) => {
  await mount(page, 'gliding-rows');
  await page.locator('[data-expansion-toggle]').first().click();
  const timing = await page
    .locator('[data-expansion-toggle] > *')
    .first()
    .evaluate(glyph =>
      (glyph as HTMLElement).style.getPropertyValue(
        'transition-timing-function',
      ),
    );
  expect(timing.startsWith('linear(')).toBe(true);

  for (const dividers of ['columns', 'grid']) {
    await mount(page, 'gliding-rows', `&args=dividers:${dividers}`);
    expect(await toggleAndHold(page, 0, 90), dividers).toBe(0);
  }

  await page.emulateMedia({reducedMotion: 'reduce'});
  await mount(page, 'gliding-rows');
  expect(await toggleAndHold(page, 0, 90)).toBe(0);
});

test('under Reduce Motion a finger sees the rows fade in place, not move', async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
    viewport: {width: 390, height: 800},
  });
  const page = await context.newPage();
  await mount(page, 'gliding-rows');
  await toggleAndHold(page, 0, 0);
  // The size-change module's Reduce Motion under a coarse pointer: a short
  // fade at the new place (design:reduced-motion DR2), never a translate.
  const moves = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter(animation => !(animation instanceof CSSTransition))
        .flatMap(
          animation =>
            (animation.effect as KeyframeEffect | null)?.getKeyframes() ?? [],
        )
        .filter(
          keyframe => keyframe.translate != null || keyframe.transform != null,
        ).length,
  );
  expect(moves).toBe(0);
  await context.close();
});

test('the columns keep their widths through a glide', async ({page}) => {
  await mount(page, 'gliding-rows');
  // A table its columns do not fill, so they share the spare width.
  await page.evaluate(() => {
    let box = document.querySelector<HTMLElement>(
      '.astryx-table-scroll-wrapper',
    );
    for (let i = 0; i < 6 && box != null; i++, box = box.parentElement) {
      box.style.maxWidth = 'none';
    }
    const table = document.querySelector('table');
    if (table != null) {
      table.style.width = '1200px';
    }
  });
  const before = await columnWidths(page);
  expect(await toggleAndHold(page, 0, 90)).toBeGreaterThan(0);
  expect(await columnWidths(page)).toBe(before);
});

test('an open panel draws the divider its row hands down', async ({page}) => {
  await mount(page, 'gliding-rows');
  await page.locator('[data-expansion-toggle]').first().click();
  await page.waitForTimeout(800);
  const {y, unpinnedX} = await page.evaluate(() => {
    const panel = document
      .querySelector('tr[data-expansion-panel]')
      ?.getBoundingClientRect();
    return {
      y: Math.round(panel?.bottom ?? 0),
      unpinnedX: Math.round(((panel?.left ?? 0) + (panel?.right ?? 0)) / 2),
    };
  });
  expect((await darkestNear(page, unpinnedX, y))[0]).toBeLessThan(245);
});
