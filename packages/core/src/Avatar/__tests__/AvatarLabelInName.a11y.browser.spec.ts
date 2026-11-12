// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/Avatar/ ^apps/storybook/stories/Avatar

/**
 * @file AvatarLabelInName.a11y.browser.spec.ts
 * @input The built Avatar "Interactive" and "Initials Fallback" stories in
 *   real Chromium and WebKit, axe, and keyboard focus
 * @output Browser evidence that an initials avatar's control is named by the
 *   person's name with no visible text label it does not contain (WCAG 2.5.3
 *   Label in Name), that the initials stay on screen, also in forced colors,
 *   and that keyboard focus shows the name tooltip
 * @position Regression proof for Avatar AR1 and AR3
 */

import AxeBuilder from '@axe-core/playwright';
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

async function openStory(page: Page, story: string): Promise<void> {
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  await page.locator('.astryx-avatar').first().waitFor();
}

/** The text each initials fallback draws through its generated content. */
async function drawnInitials(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.astryx-avatar-fallback'))
      .filter(el => el.querySelector('svg') == null)
      .map(el => getComputedStyle(el, '::before').content),
  );
}

test('no interactive initials avatar fails Label in Name', async ({page}) => {
  await openStory(page, 'core-avatar--interactive');
  const results = await new AxeBuilder({page})
    .withRules(['label-content-name-mismatch'])
    .analyze();
  expect(results.violations).toEqual([]);
  // The rule saw initials avatars, not an empty page.
  const named = page.getByRole('link', {name: 'Grace Hopper'});
  await expect(named).toBeVisible();
  await expect(named).toHaveText('');
  const drawn = await named
    .locator('.astryx-avatar-fallback')
    .evaluate(el => getComputedStyle(el, '::before').content);
  expect(drawn).toContain('GH');
  // No public attribute carries the initials.
  await expect(page.locator('[data-initials]')).toHaveCount(0);
  await expect(
    page.getByRole('button', {name: /Dorothy Vaughan/}),
  ).toBeVisible();
});

test('the initials stay on screen as generated content', async ({page}) => {
  await openStory(page, 'core-avatar--initials-fallback');
  const drawn = await drawnInitials(page);
  expect(drawn.length).toBeGreaterThan(0);
  for (const content of drawn) {
    expect(content).toMatch(/\S/);
    expect(content).not.toBe('none');
  }
});

test('the initials stay on screen in forced colors', async ({page}) => {
  await page.emulateMedia({forcedColors: 'active'});
  await openStory(page, 'core-avatar--initials-fallback');
  const drawn = await drawnInitials(page);
  expect(drawn.length).toBeGreaterThan(0);
  for (const content of drawn) {
    expect(content).not.toBe('none');
  }
});

test('keyboard focus on an initials avatar shows the name', async ({page}) => {
  await openStory(page, 'core-avatar--interactive');
  const grace = page.getByRole('link', {name: 'Grace Hopper'});
  await grace.focus();
  await expect(page.getByRole('tooltip', {name: 'Grace Hopper'})).toBeVisible();
});
