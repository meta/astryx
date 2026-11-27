// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SegmentedControlDisabled.a11y.browser.spec.ts
 * @input The built Core/SegmentedControl "Default" and "Disabled" stories in
 *   real browsers
 * @output Browser evidence that a disabled SegmentedControl renders at half
 *   opacity and an enabled one at full opacity, and that real mouse and
 *   keyboard input selects nothing while it is disabled
 * @position Browser binding for the disabled dimming and the disabled
 *   selection block; SegmentedControl.test.tsx covers every input in jsdom
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

async function openStory(page: Page, story: string): Promise<void> {
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  await page.getByRole('radiogroup').first().waitFor();
}

async function groupOpacity(page: Page): Promise<string> {
  return page
    .getByRole('radiogroup')
    .first()
    .evaluate(group => getComputedStyle(group).opacity);
}

test('a disabled SegmentedControl renders at half opacity and an enabled one at full opacity', async ({
  page,
}) => {
  await openStory(page, 'core-segmentedcontrol--disabled');
  expect(await groupOpacity(page)).toBe('0.5');
  await openStory(page, 'core-segmentedcontrol--default');
  expect(await groupOpacity(page)).toBe('1');
});

test('real mouse and keyboard input selects nothing while the control is disabled', async ({
  page,
}) => {
  await openStory(page, 'core-segmentedcontrol--disabled');
  const group = page.getByRole('radiogroup').first();
  const checked = async () =>
    group.evaluate(element =>
      Array.from(element.querySelectorAll('[role="radio"]'))
        .filter(radio => radio.getAttribute('aria-checked') === 'true')
        .map(radio => radio.textContent),
    );
  const before = await checked();
  expect(before).toHaveLength(1);

  for (const radio of await group.getByRole('radio').all()) {
    await radio.click({force: true});
  }
  await page.keyboard.press('Tab');
  for (const key of ['ArrowRight', 'ArrowLeft', 'End', 'Home', 'ArrowDown']) {
    await page.keyboard.press(key);
  }

  expect(await checked()).toEqual(before);
});
