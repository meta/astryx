// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ToastCustomLayoutAnnouncement.a11y.browser.spec.ts
 * @input The Custom content story's "Two lines" toast: a custom layout whose
 *   body stacks two Text lines, with a dismiss Button beside them.
 * @output Tests that the toast announces the custom layout's rendered text
 *   with the two lines apart and without the button's name, in Chromium and
 *   WebKit, where computed display resolves on the live element.
 * @position `component:Toast` FR9 and `spec:AST-086` FR7: the announced words
 *   match the shown words.
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

test('a custom layout announces its stacked lines apart, without its controls', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-toast--custom-content');
  // Every write to a polite region, so an announcement that clears again is
  // still seen.
  await page.evaluate(() => {
    const record = window as unknown as {announced: string[]};
    record.announced = [];
    new MutationObserver(() => {
      for (const region of document.querySelectorAll(
        '[data-astryx-live-region="polite"], [data-astryx-modal-live-region="polite"]',
      )) {
        const text = (region.textContent ?? '').trim();
        if (text !== '' && !record.announced.includes(text)) {
          record.announced.push(text);
        }
      }
    }).observe(document, {childList: true, characterData: true, subtree: true});
  });
  await page.getByRole('button', {name: 'Two lines'}).click();
  await expect(page.locator('.astryx-toast').first()).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as unknown as {announced: string[]}).announced,
      ),
    )
    .toContain('Upload complete 3 files uploaded');
  const announced = await page.evaluate(
    () => (window as unknown as {announced: string[]}).announced,
  );
  expect(announced.join(' ')).not.toContain('Dismiss custom toast');
});
