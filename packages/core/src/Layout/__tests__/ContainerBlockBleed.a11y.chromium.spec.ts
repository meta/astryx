// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(Layout|Card|Dialog|BottomSheet|Drawer|Section|ScrollableArea|Table|Stack|AppShell)/|apps/storybook/stories/ContainerBlockBleed\.stories)

/**
 * @file ContainerBlockBleed.a11y.chromium.spec.ts
 * @input Built ContainerBlockBleed stories in real Chromium
 * @output Evidence that a Table bleeds to a padding host's block edge only as
 *   that host's direct first or last child, and that a Table inside a Stack
 *   keeps the padding and never overlaps the content after it
 * @position Real-engine proof for block-edge bleed; jsdom cannot resolve
 *   `:has()` or inherited custom properties into used margins
 */

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
const TABLE_REGION = '[role="group"]:has(> * > table)';

async function mount(page: Page, story: string) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-containerblockbleed--${story}&viewMode=story`,
  );
  await expect(page.locator(TABLE_REGION).first()).toBeVisible();
}

interface Geometry {
  region: {top: number; bottom: number};
  parent: {top: number; bottom: number};
  margins: {top: string; bottom: string};
  next: {top: number} | null;
}

/**
 * The table region's box, its parent's border box, its used block margins,
 * and the top of the first element after the region's parent.
 */
async function geometry(page: Page): Promise<Geometry> {
  return page
    .locator(TABLE_REGION)
    .first()
    .evaluate(el => {
      const region = el.getBoundingClientRect();
      const parentEl = el.parentElement as HTMLElement;
      const parent = parentEl.getBoundingClientRect();
      const style = getComputedStyle(el);
      const nextEl = parentEl.nextElementSibling;
      return {
        region: {top: region.top, bottom: region.bottom},
        parent: {top: parent.top, bottom: parent.bottom},
        margins: {top: style.marginTop, bottom: style.marginBottom},
        next: nextEl == null ? null : {top: nextEl.getBoundingClientRect().top},
      };
    });
}

test.describe('Container block bleed (Chromium)', () => {
  test.use({viewport: {width: 640, height: 800}});

  for (const [story, host] of [
    ['table-in-card', 'Card'],
    ['table-in-section', 'Section'],
    ['table-in-dialog', 'Dialog'],
  ] as const) {
    test(`a table that is a ${host}'s only child bleeds to both block edges`, async ({
      page,
    }) => {
      await mount(page, story);
      const {region, parent, margins} = await geometry(page);
      expect(parseFloat(margins.top)).toBeLessThan(0);
      expect(parseFloat(margins.bottom)).toBeLessThan(0);
      expect(region.top).toBeCloseTo(parent.top, 0);
      expect(region.bottom).toBeCloseTo(parent.bottom, 0);
    });
  }

  test('a table inside a Stack in a Section keeps the padding and the text after it does not overlap', async ({
    page,
  }) => {
    await mount(page, 'table-in-stack-in-section');
    const {region, parent, margins, next} = await geometry(page);
    expect(margins).toEqual({top: '0px', bottom: '0px'});
    expect(parent.bottom).toBeCloseTo(region.bottom, 0);
    expect(next?.top ?? Number.NaN).toBeGreaterThanOrEqual(region.bottom);
  });

  test('a table that is the only child of a Stack in a Card keeps the padding', async ({
    page,
  }) => {
    await mount(page, 'table-in-stack-in-card');
    const {region, parent, margins} = await geometry(page);
    expect(margins).toEqual({top: '0px', bottom: '0px'});
    expect(region.top).toBeCloseTo(parent.top, 0);
    expect(region.bottom).toBeCloseTo(parent.bottom, 0);
    const card = await page
      .locator(TABLE_REGION)
      .first()
      .evaluate(el => {
        const host = el.parentElement?.parentElement;
        if (host == null) {
          throw new Error('The table has no Card around it');
        }
        const box = host.getBoundingClientRect();
        return {top: box.top, bottom: box.bottom};
      });
    expect(region.top).toBeGreaterThan(card.top + 1);
    expect(region.bottom).toBeLessThan(card.bottom - 1);
  });
});
