// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^apps/storybook/stories/Overlay

/**
 * @file OverlayKeyboardReveal.a11y.chromium.spec.ts
 * @input The `Core/Overlay` reveal stories in a built Storybook, driven by a
 *   real keyboard and pointer in Chromium.
 * @output Real-engine proof that an action inside a hover or focus overlay
 *   over media with no focusable element is in the tab order, that focus on
 *   it reveals the overlay, and that the hidden overlay takes no pointer
 * input at rest.
 * @position Run with `pnpm test:a11y-contract`.
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

async function open(page: Page, story: string) {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-overlay--${story}&viewMode=story`,
  );
  await page.locator('#storybook-root .astryx-overlay img').first().waitFor();
  await page.mouse.move(0, 0);
}

/** The focused element's label and the opacity of the scrim that holds it. */
async function focused(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    const scrim = active?.closest('.astryx-overlay-scrim');
    return {
      label: scrim ? (active?.textContent?.trim() ?? null) : active?.tagName,
      scrimOpacity: scrim ? getComputedStyle(scrim).opacity : null,
    };
  });
}

test('Tab reaches a hover overlay action over an image, and focus reveals it', async ({
  page,
}) => {
  await open(page, 'hover-on-image');
  const action = page.locator('#storybook-root .astryx-overlay-scrim button');
  const box = await action.boundingBox();
  expect(box).not.toBeNull();
  if (box != null) {
    const hit = await page.evaluate(
      ({x, y}) => document.elementFromPoint(x, y)?.tagName ?? null,
      {x: box.x + box.width / 2, y: box.y + box.height / 2},
    );
    expect(hit).toBe('IMG');
  }

  await page.keyboard.press('Tab');
  expect(await focused(page)).toEqual({label: 'Quick view', scrimOpacity: '1'});
});

test('Tab reaches the action of every reveal mode in source order', async ({
  page,
}) => {
  await open(page, 'reveal-modes');
  // A hidden overlay takes no click. Each Link with no href sets its own
  // pointer-events.
  for (const name of [
    'Focus action',
    'Focus link action',
    'Hover link action',
  ]) {
    const box = await page.getByRole('button', {name}).boundingBox();
    expect(box).not.toBeNull();
    if (box != null) {
      const hit = await page.evaluate(
        ({x, y}) => document.elementFromPoint(x, y)?.tagName ?? null,
        {x: box.x + box.width / 2, y: box.y + box.height / 2},
      );
      expect(hit).toBe('IMG');
    }
  }
  for (const label of [
    'Hover action',
    'Focus action',
    'Hover strip action',
    'Always action',
    'Focus link action',
    'Hover link action',
  ]) {
    await page.keyboard.press('Tab');
    expect(await focused(page)).toEqual({label, scrimOpacity: '1'});
  }
});
