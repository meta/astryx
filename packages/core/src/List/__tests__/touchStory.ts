// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchStory.ts
 * @input Playwright's Page and a built Storybook's origin
 * @output `openStory(page, origin, storyId, options)`: opens a story and
 *   waits for its first rows, its fonts and two frames
 * @position Shared helper for the list specs. Their behaviour is the one
 *   touch model under any finger (TOUCH_QUERY in utils/touchPresentation.ts):
 *   the projects' contexts already have the finger, and nothing is emulated,
 *   so Chromium shows it as Android's engine does and WebKit as Safari's. A
 *   mouse case opens its own context without touch.
 *
 * SYNC: When modified, update the specs that import it.
 */

import type {Page} from '@playwright/test';

/**
 * Opens a story and waits for its first rows, its fonts and two frames.
 * `globals`: Storybook globals such as `direction:rtl`.
 */
export async function openStory(
  page: Page,
  origin: string,
  storyId: string,
  {globals}: {globals?: string} = {},
): Promise<void> {
  const params = new URLSearchParams({id: storyId, viewMode: 'story'});
  if (globals != null) {
    params.set('globals', globals);
  }
  await page.goto(`${origin}/iframe.html?${params.toString()}`);
  await page
    .locator('#storybook-root > *')
    .first()
    .waitFor({state: 'attached'});
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}
