// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file OverflowListSizing.interaction.browser.spec.ts
 * @input The built OverflowList and Toolbar stories on desktop and narrow
 *   viewports, driven through real resize steps
 * @output Real-browser evidence that a single-row list keeps its intrinsic
 *   width in a content-sized parent, that an observeSelf list is never capped
 *   below the width it is given, that it grows back after a fold, and that a
 *   toolbar overflow trigger stays whole while the row wraps
 * @position Browser proof of the scoped containment and published bounds
 *   (OverflowList FR4, Toolbar two-slot wrap)
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

async function openStory(
  page: Page,
  id: string,
  waitFor: string,
): Promise<void> {
  await page.goto(`${storybook.origin}/iframe.html?id=${id}&viewMode=story`);
  await page.locator(waitFor).first().waitFor();
}

/** The visible list's rendered labels, containment, rendered cap, and width. */
async function readList(page: Page) {
  return page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.astryx-overflow-list');
    if (list == null) {
      throw new Error('No overflow list');
    }
    const style = getComputedStyle(list);
    return {
      labels: [...list.children].map(child =>
        (child as HTMLElement).innerText.trim(),
      ),
      contain: style.contain,
      maxInlineSize: style.maxInlineSize,
      width: list.getBoundingClientRect().width,
    };
  });
}

/** Sets the resizable story box's width and waits for the list to re-measure. */
async function resizeBox(
  page: Page,
  width: number,
  expected: (list: Awaited<ReturnType<typeof readList>>) => boolean,
): Promise<void> {
  await page.evaluate(w => {
    const box = document.querySelector<HTMLElement>('div[style*="resize"]');
    if (box == null) {
      throw new Error('No resizable box');
    }
    box.style.width = `${w}px`;
  }, width);
  await expect.poll(async () => expected(await readList(page))).toBe(true);
}

test('a content-sized parent sizes to the items, not the folded indicator', async ({
  page,
}) => {
  await page.setViewportSize({width: 1024, height: 768});
  await openStory(
    page,
    'core-overflowlist--content-sized-parent',
    '.astryx-overflow-list',
  );
  const list = await readList(page);
  // Outside Toolbar's marked lane the list carries no containment, so it
  // contributes its items' width to the shrink-to-fit parent.
  expect(list.contain).toBe('none');
  expect(list.labels).toEqual([
    'Save',
    'Edit',
    'Duplicate',
    'Share',
    'Archive',
    'Delete',
  ]);
  const parentWidth = await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.astryx-overflow-list');
    const parent = list?.parentElement;
    if (parent == null) {
      throw new Error('No content-sized parent');
    }
    return parent.getBoundingClientRect().width;
  });
  expect(parentWidth).toBeGreaterThan(300);
});

test('an observeSelf list that fits keeps every item and no rendered cap', async ({
  page,
}) => {
  await page.setViewportSize({width: 1024, height: 768});
  await openStory(
    page,
    'core-overflowlist--no-overflow',
    '.astryx-overflow-list',
  );
  const list = await readList(page);
  expect(list.labels).toEqual(['Edit', 'Save']);
  expect(list.maxInlineSize).toBe('none');
});

test('an observeSelf list shows all five items that fit its box', async ({
  page,
}) => {
  await page.setViewportSize({width: 1024, height: 768});
  await openStory(
    page,
    'core-overflowlist--dynamic-items',
    '.astryx-overflow-list',
  );
  const list = await readList(page);
  expect(list.labels).toEqual([
    'Item 1',
    'Item 2',
    'Item 3',
    'Item 4',
    'Item 5',
  ]);
  expect(list.maxInlineSize).toBe('none');
});

test('an observeSelf list grows back after the box widens again', async ({
  page,
}) => {
  await page.setViewportSize({width: 1024, height: 768});
  await openStory(
    page,
    'core-overflowlist--resizable',
    '.astryx-overflow-list',
  );
  const wide = await readList(page);
  expect(wide.labels.length).toBeGreaterThan(2);

  await resizeBox(page, 220, list => list.labels.length < wide.labels.length);
  const narrow = await readList(page);
  expect(narrow.labels.length).toBeLessThan(wide.labels.length);

  await resizeBox(
    page,
    500,
    list => list.labels.join('|') === wide.labels.join('|'),
  );
  const back = await readList(page);
  expect(back.labels).toEqual(wide.labels);
});

/** The toolbar's overflow trigger and badge, as boxes and text. */
async function readToolbar(page: Page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector<HTMLElement>('[role="toolbar"]');
    if (toolbar == null) {
      throw new Error('No toolbar');
    }
    const list = toolbar.querySelector<HTMLElement>('.astryx-overflow-list');
    if (list == null) {
      throw new Error('No overflow list in the toolbar');
    }
    const buttons = list.querySelectorAll<HTMLElement>('button');
    const trigger = buttons[buttons.length - 1];
    const badge = toolbar.querySelector<HTMLElement>('.astryx-badge');
    if (trigger == null || badge == null) {
      throw new Error('No overflow trigger or badge in the toolbar');
    }
    const box = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      return {
        text: el.innerText.trim(),
        width: rect.width,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    };
    return {
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      listWidth: list.getBoundingClientRect().width,
      trigger: box(trigger),
      badge: box(badge),
    };
  });
}

for (const width of [240, 215]) {
  test(`a toolbar overflow trigger stays whole at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({width, height: 714});
    await openStory(page, 'core-toolbar--overflow-actions', '[role="toolbar"]');
    const {scrollWidth, viewportWidth, listWidth, trigger, badge} =
      await readToolbar(page);
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth);
    // The trigger renders its full "+N" label, not a clipped "+.".
    expect(trigger.text).toMatch(/^\+\d+$/);
    expect(trigger.scrollWidth).toBeLessThanOrEqual(trigger.clientWidth + 1);
    // The list floors at the trigger, so the trigger fits inside it.
    expect(listWidth).toBeGreaterThanOrEqual(trigger.width - 1);
    // The badge keeps its full text beside the list.
    expect(badge.text).toBe('5 selected');
    expect(badge.scrollWidth).toBeLessThanOrEqual(badge.clientWidth + 1);
  });
}

test('a toolbar overflow list shows its actions again when the row widens', async ({
  page,
}) => {
  await page.setViewportSize({width: 240, height: 714});
  await openStory(page, 'core-toolbar--overflow-actions', '[role="toolbar"]');
  const narrow = await readList(page);
  await page.setViewportSize({width: 900, height: 714});
  await expect
    .poll(async () => (await readList(page)).labels.length)
    .toBeGreaterThan(narrow.labels.length);
  const wide = await readList(page);
  expect(wide.labels).toContain('Save');
  expect(wide.labels).toContain('Delete');
});
