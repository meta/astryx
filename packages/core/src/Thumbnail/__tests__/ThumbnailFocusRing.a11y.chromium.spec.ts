// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Thumbnail/|packages/core/src/utils/focusOutline|apps/storybook/stories/Thumbnail\.stories)

/**
 * @file ThumbnailFocusRing.a11y.chromium.spec.ts
 * @input The built Thumbnail story with Open and Remove, and real Chromium
 *   keyboard input
 * @output Evidence that each focus move shows one ring: the image container
 *   rings for Open, and the remove button rings itself without the container
 * @position Real-engine proof for `architecture:interaction-modality` INV3;
 *   jsdom cannot match :focus-visible or paint
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

/** The elements from the focused one up to the root group that paint a ring. */
async function ringPainters(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const painters: string[] = [];
    let node = document.activeElement as HTMLElement | null;
    while (node != null && node.getAttribute('role') !== 'group') {
      const style = getComputedStyle(node);
      if (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) {
        painters.push(
          node === document.activeElement ? 'focused' : 'container',
        );
      }
      node = node.parentElement;
    }
    return painters;
  });
}

async function tabTo(page: Page, name: string) {
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    const label = await page.evaluate(
      () => document.activeElement?.getAttribute('aria-label') ?? '',
    );
    if (label.startsWith(name)) {
      return;
    }
  }
  throw new Error(`Tab never reached ${name}`);
}

test.describe('Thumbnail focus ring', () => {
  test.beforeEach(async ({page}) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-thumbnail--clickable-with-remove&viewMode=story`,
    );
    await page.locator('#storybook-root [role="group"]').waitFor();
  });

  test('focusing Open shows one ring, on the image container', async ({
    page,
  }) => {
    await tabTo(page, 'Open');
    expect(await ringPainters(page)).toEqual(['container']);
  });

  test('focusing Remove shows one ring, on the remove button', async ({
    page,
  }) => {
    await tabTo(page, 'Remove');
    expect(await ringPainters(page)).toEqual(['focused']);
  });
});
