// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TokenizerLayerFocus.a11y.browser.spec.ts
 * @input Built Tokenizer stories "Overflow Layer" and "Overflow Layer States"
 *   in real Chromium and WebKit
 * @output Browser evidence that a collapsed `unfocusedLayer` field keeps one
 *   tab stop, its placeholder: enabled, focus opens the field and typing
 *   lands in the input; disabled, the stop stays, says it is disabled, and
 *   opens nothing; Shift+Tab out of an open field returns to the page order
 * @position Tokenizer proof of component:Tokenizer FR3 and spec:AST-085
 *   FR1-FR2; jsdom cannot show it, because it does not hide a closed popover
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

// macOS WebKit defaults to text-field traversal. Option+Tab selects its native
// all-controls traversal, equivalent to enabling Safari's keyboard preference.
function tabKey(browserName: string, reverse = false): string {
  return `${browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+' : ''}${reverse ? 'Shift+' : ''}Tab`;
}

async function mount(page: Page, story: string) {
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  await expect(page.locator('.astryx-tokenizer').first()).toBeAttached();
  await page.evaluate(async () => document.fonts.ready);
}

/** Whether a field's layer (the popover holding its input) is open. */
async function anyLayerOpen(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[popover]')].some(
      el =>
        el.matches(':popover-open') &&
        el.querySelector('[role="combobox"]') != null,
    ),
  );
}

test('Tab reaches a collapsed field with tokens, and typing lands in its input', async ({
  page,
  browserName,
}) => {
  await mount(page, 'core-tokenizer--overflow-layer');
  await page.keyboard.press(tabKey(browserName));
  const input = page.getByRole('combobox', {name: 'Team Members'});
  await expect(input).toBeFocused();
  expect(await anyLayerOpen(page)).toBe(true);
  await page.keyboard.type('Gr');
  await expect(input).toHaveValue('Gr');
});

test('Tab reaches a collapsed field with no tokens; disabled fields keep their stop and open nothing', async ({
  page,
  browserName,
}) => {
  await mount(page, 'core-tokenizer--overflow-layer-states');
  expect(await page.locator('[disabled]').count()).toBe(0);

  await page.keyboard.press(tabKey(browserName));
  const reviewers = page.getByRole('combobox', {name: 'Reviewers'});
  await expect(reviewers).toBeFocused();
  await page.keyboard.type('A');
  await expect(reviewers).toHaveValue('A');
  await page.keyboard.press('Escape');

  for (const name of ['Owners', 'Approvers']) {
    // Leave the open field, then reach the next field's placeholder.
    await page.keyboard.press(tabKey(browserName));
    let focused = page.locator(':focus');
    let presses = 0;
    while (
      presses++ < 12 &&
      ((await focused.getAttribute('role')) !== 'group' ||
        (await focused.getAttribute('aria-disabled')) !== 'true' ||
        !(await focused.evaluate(
          (el, label) =>
            (el.getAttribute('aria-labelledby') ?? '')
              .split(' ')
              .some(id => document.getElementById(id)?.textContent === label),
          name,
        )))
    ) {
      await page.keyboard.press(tabKey(browserName));
      focused = page.locator(':focus');
    }
    await expect(focused).toHaveAttribute('tabindex', '0');
    if (name === 'Approvers') {
      // The disabled reason shows on focus, anchored to the placeholder.
      await expect(
        page.getByRole('tooltip', {name: /edit access/}),
      ).toBeVisible();
    }
    await page.keyboard.press('Enter');
    await page.keyboard.type('x');
    expect(await anyLayerOpen(page)).toBe(false);
    await expect(focused).toBeFocused();
  }
  expect(await page.locator('[disabled]').count()).toBe(0);
});

test('Shift+Tab out of an open field returns to the page order and closes it', async ({
  page,
  browserName,
}) => {
  await mount(page, 'core-tokenizer--overflow-layer-states');
  await page.keyboard.press(tabKey(browserName));
  await expect(page.getByRole('combobox', {name: 'Reviewers'})).toBeFocused();
  await page.keyboard.press(tabKey(browserName, true));
  await expect
    .poll(async () => page.evaluate(() => document.activeElement?.tagName))
    .toBe('BODY');
  expect(await anyLayerOpen(page)).toBe(false);
});
