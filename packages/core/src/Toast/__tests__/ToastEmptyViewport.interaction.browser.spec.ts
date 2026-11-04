// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ToastEmptyViewport.interaction.browser.spec.ts
 * @input The ErrorPersists story, whose toast stays until dismissed, on a
 *   phone page, with a finger, in Chromium and WebKit.
 * @output Tests that the toast viewport has no box once its last toast has
 *   left, by a swipe or by its dismiss button. The viewport has a box again
 *   for the next toast.
 * @position iOS Safari colors its toolbar from a fixed element at the bottom
 *   edge. A swiped toast leaves through that edge, and Safari keeps its color
 *   while the viewport has a box.
 */
import {
  expect,
  test,
  type ElementHandle,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  drag,
  openStory,
  touchDriver,
  waitForRest,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

test.use({
  viewport: {width: 390, height: 844},
  isMobile: true,
  hasTouch: true,
});

async function showToast(page: Page): Promise<Locator> {
  await page.getByRole('button', {name: 'Trigger error'}).click();
  const card = page.locator('.astryx-toast').first();
  await expect(card).toBeVisible();
  await waitForRest(card);
  return card;
}

/** The viewport keeps its element when it empties, so a handle outlives its landmark role. */
async function viewportOf(page: Page): Promise<ElementHandle<HTMLElement>> {
  const handle = await page
    .getByRole('region', {name: 'Notifications'})
    .elementHandle();
  if (handle == null) {
    throw new Error('no toast viewport');
  }
  return handle as ElementHandle<HTMLElement>;
}

const boxCount = async (viewport: ElementHandle<HTMLElement>) =>
  viewport.evaluate(element => element.getClientRects().length);

test('the viewport has no box once a swipe sends its last toast away', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-toast--error-persists');
  const driver = await touchDriver(page);
  const card = await showToast(page);
  const viewport = await viewportOf(page);
  expect(await boxCount(viewport)).toBeGreaterThan(0);

  const box = await card.boundingBox();
  if (box == null) {
    throw new Error('no toast');
  }
  const from = {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
  await driver.play(
    drag(
      from,
      {x: from.x, y: from.y + 90},
      {durationMs: 120, hz: 60, restMs: 0},
    ),
  );
  await expect(page.locator('.astryx-toast')).toHaveCount(0);
  await expect.poll(async () => boxCount(viewport)).toBe(0);

  await showToast(page);
  expect(await boxCount(viewport)).toBeGreaterThan(0);
});

test('the viewport has no box once its dismiss button sends its last toast away', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-toast--error-persists');
  const card = await showToast(page);
  const viewport = await viewportOf(page);
  await card.getByRole('button', {name: 'Dismiss notification'}).click();
  await expect(page.locator('.astryx-toast')).toHaveCount(0);
  await expect.poll(async () => boxCount(viewport)).toBe(0);
});
