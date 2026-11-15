// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(Layout|Card|Dialog|BottomSheet|Section|ScrollableArea|Table|List|Item)/|apps/storybook/stories/ContainerCorners\.stories)

/**
 * @file ContainerCorners.a11y.chromium.spec.ts
 * @input Built ContainerCorners stories and real Chromium keyboard input
 * @output Evidence that a full-bleed child takes the corner of the rounded
 *   container it reaches, minus the padding it keeps, and that its focus
 *   ring stays whole at that corner
 * @position Real-engine proof for container corner geometry; jsdom cannot
 *   resolve inherited custom properties into a used radius or paint a ring
 */

// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

// Table's scroll region: the group that wraps the table.
const TABLE_REGION = '#storybook-root [role="group"]:has(> * > table)';
const BOTTOM_SHEET_TABLE_REGION = 'dialog [role="group"]:has(> * > table)';
const LIST_ROWS = '#storybook-root [role="list"] > *';

/** Used radii in physical order: top-left, top-right, bottom-right, bottom-left. */
type Radii = readonly [string, string, string, string];

async function mount(page: Page, story: string, ready: string) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-containercorners--${story}&viewMode=story`,
  );
  await expect(page.locator(ready).first()).toBeVisible();
}

async function radii(page: Page, selector: string, index = 0): Promise<Radii> {
  return page
    .locator(selector)
    .nth(index)
    .evaluate(el => {
      const style = getComputedStyle(el);
      return [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius,
      ] as const;
    });
}

/**
 * The used radius of the rounded container that clips `selector`: its
 * nearest ancestor with a rounded corner and a clip.
 */
async function clippingHostRadius(page: Page, selector: string) {
  return (await clippingHost(page, selector)).radius;
}

/** The used top-start radius and top border of the clipping host. */
async function clippingHost(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate(el => {
      for (
        let node = el.parentElement;
        node != null;
        node = node.parentElement
      ) {
        const style = getComputedStyle(node);
        const radius = parseFloat(style.borderTopLeftRadius);
        if (radius > 0 && style.overflow !== 'visible') {
          return {radius, border: parseFloat(style.borderTopWidth)};
        }
      }
      return {radius: 0, border: 0};
    });
}

async function tabTo(page: Page, selector: string, maxTabs = 20) {
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    const reached = await page.evaluate(
      sel => document.activeElement?.closest(sel) != null,
      selector,
    );
    if (reached) {
      return;
    }
  }
  throw new Error(`Tab never reached ${selector}`);
}

/**
 * Counts pixels in the ring's colour on the 45-degree line that runs inward
 * from one corner of `selector`'s box. A ring that follows the corner
 * crosses this line; a square ring that the container's rounded clip cuts
 * off does not.
 */
async function ringPixelsOnCornerDiagonal(
  page: Page,
  selector: string,
  ringElement: string,
  corner: 'top-left' | 'bottom-right',
): Promise<number> {
  const size = 16;
  const {box, ring} = await page.evaluate(
    ({sel, ringSel}) => {
      const target = document.querySelector(sel);
      const ringOwner = document.querySelector(ringSel);
      if (target == null || ringOwner == null) {
        throw new Error(`Missing ${sel} or ${ringSel}`);
      }
      const rect = target.getBoundingClientRect();
      return {
        box: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
        ring: getComputedStyle(ringOwner).outlineColor,
      };
    },
    {sel: selector, ringSel: ringElement},
  );
  const x = corner === 'top-left' ? box.x : box.x + box.width - size;
  const y = corner === 'top-left' ? box.y : box.y + box.height - size;
  const shot = await page.screenshot({
    clip: {x: Math.round(x), y: Math.round(y), width: size, height: size},
    scale: 'css',
  });
  const png = PNG.sync.read(shot);
  const [r, g, b] = (ring.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  const distanceAt = (x: number, y: number) => {
    const offset = (y * png.width + x) * 4;
    return (
      Math.abs(png.data[offset] - r) +
      Math.abs(png.data[offset + 1] - g) +
      Math.abs(png.data[offset + 2] - b)
    );
  };
  // A 2px ring drawn on a curve is anti-aliased where it crosses the
  // diagonal, so each step also checks the pixel beside it.
  let hits = 0;
  for (let i = 0; i < size - 1; i++) {
    const p = corner === 'top-left' ? i : size - 1 - i;
    const q = corner === 'top-left' ? p + 1 : p - 1;
    if (Math.min(distanceAt(p, p), distanceAt(q, p), distanceAt(p, q)) < 120) {
      hits++;
    }
  }
  return hits;
}

test.describe('Container corners (Chromium)', () => {
  test.use({viewport: {width: 480, height: 800}});

  test('a table that fills a Card takes the card corner at all four corners', async ({
    page,
  }) => {
    await mount(page, 'table-in-card', TABLE_REGION);
    const corner = await clippingHostRadius(page, TABLE_REGION);
    expect(corner).toBeGreaterThan(0);
    expect(await radii(page, TABLE_REGION)).toEqual(
      Array(4).fill(`${corner}px`),
    );
  });

  test('the focus ring of a table that fills a Card stays whole at the corners', async ({
    page,
  }) => {
    await mount(page, 'table-in-card', TABLE_REGION);
    await tabTo(page, TABLE_REGION);
    for (const corner of ['top-left', 'bottom-right'] as const) {
      expect(
        await ringPixelsOnCornerDiagonal(
          page,
          TABLE_REGION,
          TABLE_REGION,
          corner,
        ),
        corner,
      ).toBeGreaterThan(0);
    }
  });

  test('text above the table keeps the card padding there, so only the bottom corners round', async ({
    page,
  }) => {
    await mount(page, 'table-after-text-in-card', TABLE_REGION);
    const corner = await clippingHostRadius(page, TABLE_REGION);
    expect(corner).toBeGreaterThan(0);
    expect(await radii(page, TABLE_REGION)).toEqual([
      '0px',
      '0px',
      `${corner}px`,
      `${corner}px`,
    ]);
  });

  test('a Section between the Card and the table keeps the table square', async ({
    page,
  }) => {
    await mount(page, 'table-in-section-in-card', TABLE_REGION);
    expect(await radii(page, TABLE_REGION)).toEqual([
      '0px',
      '0px',
      '0px',
      '0px',
    ]);
  });

  test('in a Dialog with no padding, the first and last bleeding rows take the dialog corners', async ({
    page,
  }) => {
    await mount(page, 'bleed-list-in-dialog', LIST_ROWS);
    const dialogCorner = await clippingHostRadius(page, LIST_ROWS);
    expect(dialogCorner).toBeGreaterThan(0);
    const count = await page.locator(LIST_ROWS).count();
    expect(await radii(page, LIST_ROWS, 0)).toEqual([
      `${dialogCorner}px`,
      `${dialogCorner}px`,
      '0px',
      '0px',
    ]);
    expect(await radii(page, LIST_ROWS, 1)).toEqual([
      '0px',
      '0px',
      '0px',
      '0px',
    ]);
    expect(await radii(page, LIST_ROWS, count - 1)).toEqual([
      '0px',
      '0px',
      `${dialogCorner}px`,
      `${dialogCorner}px`,
    ]);
  });

  test('a table between other content in a Dialog with no padding stays square', async ({
    page,
  }) => {
    await mount(page, 'table-between-text-in-dialog', TABLE_REGION);
    expect(await radii(page, TABLE_REGION)).toEqual([
      '0px',
      '0px',
      '0px',
      '0px',
    ]);
  });

  test('a bleeding list inside a wrapper element keeps its rows square', async ({
    page,
  }) => {
    await mount(page, 'wrapped-bleed-list-in-dialog', LIST_ROWS);
    const count = await page.locator(LIST_ROWS).count();
    for (let i = 0; i < count; i++) {
      expect(await radii(page, LIST_ROWS, i), `row ${i}`).toEqual([
        '0px',
        '0px',
        '0px',
        '0px',
      ]);
    }
  });

  test('in a padded Card, bleeding rows stay square', async ({page}) => {
    await mount(page, 'bleed-list-in-card', LIST_ROWS);
    const count = await page.locator(LIST_ROWS).count();
    for (let i = 0; i < count; i++) {
      expect(await radii(page, LIST_ROWS, i), `row ${i}`).toEqual([
        '0px',
        '0px',
        '0px',
        '0px',
      ]);
    }
  });

  test('a table at the top of a bottom sheet stays square below the grab bar', async ({
    page,
  }) => {
    await mount(page, 'table-in-bottom-sheet', BOTTOM_SHEET_TABLE_REGION);
    expect(await radii(page, BOTTOM_SHEET_TABLE_REGION)).toEqual([
      '0px',
      '0px',
      '0px',
      '0px',
    ]);
  });
});
