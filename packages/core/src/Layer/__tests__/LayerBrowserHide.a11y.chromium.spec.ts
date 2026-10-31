// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Layer

/**
 * @file LayerBrowserHide.a11y.chromium.spec.ts
 * @input The `Core/Layer` BrowserHideWakesAFocusLayer story in a built
 *   Storybook, driven by real Chromium pointer and keyboard input.
 * @output Real-engine proof that a show the browser's own hide wakes — its
 *   close watcher's Escape returning focus to a trigger whose focus-driven
 *   layer asks to show — reaches the page as no error and ends with that
 *   layer shown; that a tap outside, which returns no focus, hides the
 *   layer with no error and wakes nothing; and that a press which
 *   light-dismisses one layer and opens another opens it at once. Only a real engine
 *   decides when a popover operation is in flight and refuses a show inside
 *   it; the unit suite (useLayer.test.tsx) covers the same rules on a
 *   mirrored Popover API. The in-flight rule is Chromium 150+: on the
 *   Chromium this repository's Playwright pins (149) the first case passes
 *   with or without the fix, so until that pin moves it guards the end state
 *   only.
 * @position Run with `pnpm test:a11y-contract`.
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

/** Every error the page reports while the test runs: a refused show is one. */
function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => {
    errors.push(`${error.name}: ${error.message}`);
  });
  return errors;
}

async function openStory(page: Page, id: string): Promise<void> {
  await page.goto(`${storybook.origin}/iframe.html?id=${id}&viewMode=story`);
  await page.locator('#storybook-root button').first().waitFor();
}

test('an Escape the browser answers, with focus inside the layer, returns focus to the trigger and shows its focus-driven layer, without an error', async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await openStory(page, 'core-layer--browser-hide-wakes-a-focus-layer');
  const trigger = page.getByRole('button', {name: 'Show layer'});
  const inside = page.getByRole('button', {name: 'Inside', exact: true});
  const hint = page.getByRole('tooltip');

  // Keyboard focus shows the focus-driven layer; the press opens the content
  // and Tab moves into it, which hides the focus-driven layer.
  await page.keyboard.press('Tab');
  await expect(trigger).toBeFocused();
  await expect(hint).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(inside).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(inside).toBeFocused();
  await expect(hint).toBeHidden();

  // No layer handles Escape here: the browser's own close watcher hides the
  // content layer and returns focus to the trigger inside that hide.
  await page.keyboard.press('Escape');
  await expect(inside).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(hint).toBeVisible();
  expect(errors).toEqual([]);
});

test('a tap outside the layer, with focus inside it, hides the layer without an error; it returns no focus, so the focus-driven layer stays hidden', async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await openStory(page, 'core-layer--browser-hide-wakes-a-focus-layer');
  const trigger = page.getByRole('button', {name: 'Show layer'});
  const inside = page.getByRole('button', {name: 'Inside', exact: true});
  const hint = page.getByRole('tooltip');

  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(inside).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(inside).toBeFocused();

  // A light dismiss returns no focus: the press moves focus to the page
  // before the hide runs, so nothing wakes the focus-driven layer.
  await page.mouse.click(5, 5);
  await expect(inside).toBeHidden();
  await expect(trigger).not.toBeFocused();
  await expect(hint).toBeHidden();
  expect(errors).toEqual([]);
});

test('a press that light-dismisses one layer and opens another opens it at once: focus moves into it, without an error', async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await openStory(page, 'core-layer--browser-hide-wakes-a-focus-layer');
  const inside = page.getByRole('button', {name: 'Inside', exact: true});
  const otherTrigger = page.getByRole('button', {name: 'Show the other layer'});
  const otherInside = page.getByRole('button', {name: 'Inside the other'});

  await page.getByRole('button', {name: 'Show layer'}).click();
  await expect(inside).toBeVisible();

  // The browser light-dismisses the first layer at pointerup; the click opens
  // the other one in the same gesture and focuses into it right away.
  await otherTrigger.click();
  await expect(inside).toBeHidden();
  await expect(otherInside).toBeVisible();
  await expect(otherInside).toBeFocused();
  expect(errors).toEqual([]);
});
