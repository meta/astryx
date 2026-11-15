// Copyright (c) Meta Platforms, Inc. and affiliates.
import {expect, test} from '@astryxdesign/a11y-spec/playwright';
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
test('nested popup retains keyboard focus inside its parent', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-layer--boundary-nested-focus&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open outer', exact: true}).click();
  await page.getByRole('button', {name: 'Open inner', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Inner first'})).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', {name: 'Inner second'})).toBeFocused();
});
test('safe writing scope continues to inherit direction changes', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-layer--boundary-live-direction&viewMode=story`,
  );
  const tooltip = page.getByRole('tooltip', {name: 'Direction hint'});
  await expect(tooltip).toBeVisible();
  expect(
    await tooltip.evaluate(element => getComputedStyle(element).direction),
  ).toBe('rtl');
  await page.getByRole('button', {name: 'Change direction'}).click();
  await expect
    .poll(async () =>
      tooltip.evaluate(element => getComputedStyle(element).direction),
    )
    .toBe('ltr');
});
