// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file SelectorOverlayClamp.a11y.browser.spec.ts
 * @input The Pre Selected and the near-viewport-bottom overlay stories, in
 *   Chromium and WebKit, in both directions
 * @output Cross-engine proof that the overlay's clamp resolves in layout: the
 *   list stays inside the block gutters with the row on the trigger, starts
 *   where its anchor starts on the inline axis, a list wider than its trigger
 *   stays inside the inline-end gutter, and a list taller than the room takes
 *   the start gutter and the runtime's cap
 * @position Cross-browser geometry contract for the Selector overlay
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import type {Page} from '@astryxdesign/a11y-spec/playwright';
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

/** The viewport gutter an anchored layer keeps: the spacing-4 step. */
const GUTTER_PX = 16;

interface OverlayBoxes {
  direction: string;
  anchor: {left: number; right: number};
  layer: {left: number; right: number; top: number; bottom: number};
  rowCenter: number;
  triggerCenter: number;
  rowsInView: number;
  rows: number;
}

/** The layer's box, its anchor's box, and the rows in full view. */
async function readBoxes(page: Page, limit: number): Promise<OverlayBoxes> {
  return page.evaluate(limitPx => {
    const listbox = document.querySelector<HTMLElement>('[role="listbox"]');
    const trigger = document.querySelector<HTMLElement>('[role="combobox"]');
    if (listbox == null || trigger == null) {
      throw new Error('the list and the trigger must be in the document');
    }
    const layer = listbox.closest<HTMLElement>('[popover]') ?? listbox;
    const layerStyle = getComputedStyle(layer);
    const anchor = Array.from(document.querySelectorAll<HTMLElement>('*')).find(
      element =>
        getComputedStyle(element).anchorName === layerStyle.positionAnchor,
    );
    if (anchor == null) {
      throw new Error('the layer must name an anchor');
    }
    const layerBox = layer.getBoundingClientRect();
    const anchorBox = anchor.getBoundingClientRect();
    const triggerBox = trigger.getBoundingClientRect();
    const row = listbox.querySelector<HTMLElement>(
      '[role="option"][aria-selected="true"]',
    );
    const rowBox = row?.getBoundingClientRect();
    const listBox = listbox.getBoundingClientRect();
    const rows = Array.from(
      listbox.querySelectorAll<HTMLElement>('[role="option"]'),
    );
    const rowsInView = rows.filter(option => {
      const rect = option.getBoundingClientRect();
      return (
        rect.top >= listBox.top - 0.5 &&
        rect.bottom <= listBox.bottom + 0.5 &&
        rect.top >= -0.5 &&
        rect.bottom <= limitPx + 0.5
      );
    }).length;
    return {
      direction: layerStyle.direction,
      anchor: {left: anchorBox.left, right: anchorBox.right},
      layer: {
        left: layerBox.left,
        right: layerBox.right,
        top: layerBox.top,
        bottom: layerBox.bottom,
      },
      rowCenter: rowBox == null ? -1 : rowBox.top + rowBox.height / 2,
      triggerCenter: triggerBox.top + triggerBox.height / 2,
      rowsInView,
      rows: rows.length,
    };
  }, limit);
}

async function openStory(
  page: Page,
  story: string,
  rtl: boolean,
  prepare?: () => Promise<void>,
) {
  const globals = rtl ? '&globals=direction:rtl' : '';
  await page.goto(
    `${storybook.origin}/iframe.html?id=${story}&viewMode=story${globals}`,
    {waitUntil: 'load'},
  );
  const trigger = page.getByRole('combobox').first();
  await expect(trigger).toBeVisible();
  await prepare?.();
  await trigger.click();
  await expect(page.getByRole('listbox')).toBeVisible();
}

/** Pin the Selector's field at the viewport's inline-end edge, 250px wide. */
async function pinFieldAtInlineEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    const field = document
      .querySelector<HTMLElement>('[role="combobox"]')
      ?.closest<HTMLElement>('.astryx-selector');
    if (field == null) {
      throw new Error('the Selector field must be in the document');
    }
    field.style.position = 'fixed';
    field.style.width = '250px';
    field.style.insetBlockStart = '300px';
    field.style.insetInlineStart = 'auto';
    field.style.insetInlineEnd = '2px';
  });
}

for (const rtl of [false, true]) {
  const direction = rtl ? 'RTL' : 'LTR';

  test(`the overlay list clamps inside the end gutter with the row on the trigger (${direction})`, async ({
    page,
  }) => {
    await page.setViewportSize({width: 1280, height: 720});
    await openStory(page, 'core-selector--overlay-near-viewport-bottom', rtl);
    await expect(async () => {
      const boxes = await readBoxes(page, 720);
      expect(boxes.direction).toBe(rtl ? 'rtl' : 'ltr');
      // The clamp binds at the end: the list ends inside the gutter, and the
      // row sits where the clamp allows, above the trigger.
      expect(Math.round(boxes.layer.bottom)).toBeLessThanOrEqual(
        720 - GUTTER_PX,
      );
      expect(Math.round(boxes.layer.bottom)).toBeGreaterThan(
        720 - GUTTER_PX - 40,
      );
      expect(boxes.layer.top).toBeGreaterThanOrEqual(GUTTER_PX - 0.5);
      expect(boxes.rowsInView).toBe(boxes.rows);
    }).toPass({timeout: 5_000});
  });

  test(`the overlay list starts where its anchor starts (${direction})`, async ({
    page,
  }) => {
    await page.setViewportSize({width: 1280, height: 720});
    await openStory(page, 'core-selector--pre-selected', rtl);
    await expect(async () => {
      const boxes = await readBoxes(page, 720);
      expect(boxes.direction).toBe(rtl ? 'rtl' : 'ltr');
      // Start-aligned on the anchor in the layer's own direction.
      const startDelta = rtl
        ? boxes.layer.right - boxes.anchor.right
        : boxes.layer.left - boxes.anchor.left;
      expect(Math.abs(startDelta)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(boxes.rowCenter - boxes.triggerCenter),
      ).toBeLessThanOrEqual(2);
      expect(boxes.rowsInView).toBeGreaterThanOrEqual(Math.min(2, boxes.rows));
    }).toPass({timeout: 5_000});
  });

  test(`the overlay list stays inside the inline gutter at a narrow width (${direction})`, async ({
    page,
  }) => {
    await page.setViewportSize({width: 320, height: 720});
    await openStory(page, 'core-selector--pre-selected', rtl);
    await expect(async () => {
      const boxes = await readBoxes(page, 720);
      expect(boxes.layer.left).toBeGreaterThanOrEqual(GUTTER_PX - 0.5);
      expect(boxes.layer.right).toBeLessThanOrEqual(320 - GUTTER_PX + 0.5);
      expect(
        Math.abs(boxes.rowCenter - boxes.triggerCenter),
      ).toBeLessThanOrEqual(2);
      expect(boxes.rowsInView).toBeGreaterThanOrEqual(Math.min(2, boxes.rows));
    }).toPass({timeout: 5_000});
  });

  test(`a list wider than its trigger stays inside the inline-end gutter (${direction})`, async ({
    page,
  }) => {
    await page.setViewportSize({width: 1280, height: 720});
    await openStory(page, 'core-selector--pre-selected', rtl, async () =>
      pinFieldAtInlineEnd(page),
    );
    // One option far longer than the trigger widens the list past it.
    await page.evaluate(() => {
      const option = document.querySelector<HTMLElement>(
        '[role="listbox"] [role="option"]:last-child',
      );
      if (option != null) {
        option.style.minInlineSize = '420px';
      }
    });
    await expect(async () => {
      const boxes = await readBoxes(page, 720);
      expect(boxes.layer.right - boxes.layer.left).toBeGreaterThan(400);
      // Wider than the trigger, the list ends inside the inline-end gutter
      // and keeps its start inside the inline-start gutter.
      expect(boxes.layer.left).toBeGreaterThanOrEqual(GUTTER_PX - 0.5);
      expect(boxes.layer.right).toBeLessThanOrEqual(1280 - GUTTER_PX + 0.5);
      expect(
        Math.abs(boxes.rowCenter - boxes.triggerCenter),
      ).toBeLessThanOrEqual(2);
    }).toPass({timeout: 5_000});
  });

  test(`a list taller than the room takes the start gutter and the cap (${direction})`, async ({
    page,
  }) => {
    await page.setViewportSize({width: 1280, height: 300});
    await openStory(page, 'core-selector--long-list', rtl);
    await expect(async () => {
      const boxes = await readBoxes(page, 300);
      // 120 options outgrow a 300px viewport: the clamp's minimum wins, so
      // the list starts at the start gutter, and the runtime's cap ends it
      // inside the end gutter. The selected row cannot sit on the trigger
      // here; the rows that fit are in full view.
      expect(Math.round(boxes.layer.top)).toBe(GUTTER_PX);
      expect(boxes.layer.bottom).toBeLessThanOrEqual(300 - GUTTER_PX + 0.5);
      expect(boxes.layer.bottom).toBeGreaterThan(300 - GUTTER_PX - 40);
      expect(boxes.rowsInView).toBeGreaterThanOrEqual(2);
    }).toPass({timeout: 5_000});
  });
}
