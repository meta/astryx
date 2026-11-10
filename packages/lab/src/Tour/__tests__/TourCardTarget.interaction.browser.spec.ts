// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TourCardTarget.interaction.browser.spec.ts
 * @input The built Lab Tour "Card Target" story: a step on a card, then a
 *   step on a Refresh button. Real Chromium and WebKit input drive it.
 * @output Proofs that the callout anchors next to a card, that Tab leaves the
 *   callout for the page, that pressing the introduced control keeps the
 *   tour, that Escape ends it, and that the close control's touch target
 *   grows under a coarse pointer. Each state is attached as a still.
 * @position Real-engine layer of Tour; the jsdom layer is Tour.test.tsx
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const STORY = 'lab-tour--card-target';

async function startTour(page: Page) {
  await openStory(page, storybook(), STORY);
  await page.getByRole('button', {name: 'Start tour'}).click();
  await expect(page.getByRole('region', {name: 'Your revenue'})).toBeVisible();
}

test('the callout anchors next to a card target', async ({page}, testInfo) => {
  await startTour(page);
  const region = page.getByRole('region', {name: 'Your revenue'});
  // The step's target is the card that holds the Revenue heading. While the
  // step shows, that card carries the layer's anchor name.
  const card = await page
    .getByRole('heading', {name: 'Revenue', exact: true})
    .evaluate(element => {
      let node: HTMLElement | null = element;
      while (
        node != null &&
        node.style.getPropertyValue('anchor-name') === ''
      ) {
        node = node.parentElement;
      }
      if (node == null) {
        return null;
      }
      const box = node.getBoundingClientRect();
      return {bottom: box.bottom, left: box.left, right: box.right};
    });
  const callout = await region.boundingBox();
  if (card == null || callout == null) {
    throw new Error('the card is not an anchor, or the callout has no box');
  }
  // Below the card, overlapping it along the inline axis.
  expect(callout.y).toBeGreaterThanOrEqual(card.bottom - 1);
  expect(callout.x).toBeLessThan(card.right);
  expect(callout.x + callout.width).toBeGreaterThan(card.left);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await testInfo.attach('card-step', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('Tab leaves the callout for the page', async ({page}) => {
  await startTour(page);
  const region = page.getByRole('region', {name: 'Your revenue'});
  await region.getByRole('button', {name: 'Next'}).focus();
  await page.keyboard.press('Tab');
  const focusIsInCallout = await region.evaluate(element =>
    element.contains(document.activeElement),
  );
  expect(focusIsInCallout).toBe(false);
  await expect(region).toBeVisible();
});

test('pressing the introduced control keeps the tour, and Escape ends it', async ({
  page,
}, testInfo) => {
  await startTour(page);
  await page
    .getByRole('region', {name: 'Your revenue'})
    .getByRole('button', {name: 'Next'})
    .click();
  const step = page.getByRole('region', {name: 'Refresh it'});
  await expect(step).toBeVisible();
  await page.getByRole('button', {name: 'Refresh', exact: true}).click();
  await expect(page.getByText('Refreshed 1 times')).toBeVisible();
  await expect(step).toBeVisible();
  await testInfo.attach('interactive-step-after-press', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.keyboard.press('Escape');
  await expect(step).toHaveCount(0);
});

test('the close control is a labelled button whose touch target grows under a coarse pointer', async ({
  page,
}) => {
  await startTour(page);
  const close = page
    .getByRole('region', {name: 'Your revenue'})
    .getByRole('button', {name: 'Close tour'});
  await expect(close).toBeVisible();
  const isCoarse = await page.evaluate(
    () => matchMedia('(pointer: coarse)').matches,
  );
  test.skip(!isCoarse, 'the hit area grows only under a coarse pointer');
  // A point 21 px from the button's center on the block axis lies inside a
  // 44 px target. It hits the close button, not the callout around it.
  const hitsClose = await close.evaluate(button => {
    const box = button.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2 - 21;
    return document.elementFromPoint(x, y)?.closest('button') === button;
  });
  expect(hitsClose).toBe(true);
});
