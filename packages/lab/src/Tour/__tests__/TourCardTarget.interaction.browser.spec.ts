// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TourCardTarget.interaction.browser.spec.ts
 * @input The built Lab Tour "Card Target" story (a step on a card, then a
 *   step on a Refresh button) and the dimmed "Showcase" story. Real browser
 *   input drives them.
 * @output Proofs that the callout anchors next to a card, that a step started
 *   from the keyboard shows the focus ring on its region, that Tab leaves the
 *   callout for the page, that pressing the introduced control keeps the
 *   tour, that a held press on a scaling target leaves the callout in place,
 *   that Escape ends it, that a press on a dimmed page ends a backdrop tour,
 *   and that the close control's touch target grows under a coarse pointer. Each state is attached as a still.
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
  // The callout anchors to the highlight box drawn over the card.
  const card = await page.getByTestId('tour-highlight').boundingBox();
  const callout = await region.boundingBox();
  if (card == null || callout == null) {
    throw new Error('the highlight or the callout has no box');
  }
  // Below the card's highlight, overlapping it along the inline axis.
  expect(callout.y).toBeGreaterThanOrEqual(card.y + card.height - 1);
  expect(callout.x).toBeLessThan(card.x + card.width);
  expect(callout.x + callout.width).toBeGreaterThan(card.x);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await testInfo.attach('card-step', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('a step started from the keyboard shows the focus ring on its region', async ({
  page,
}) => {
  await openStory(page, storybook(), STORY);
  await page.getByRole('button', {name: 'Start tour'}).focus();
  await page.keyboard.press('Enter');
  const region = page.getByRole('region', {name: 'Your revenue'});
  await expect(region).toBeFocused();
  const outline = await region.evaluate(element => {
    const style = getComputedStyle(element);
    return {style: style.outlineStyle, width: parseFloat(style.outlineWidth)};
  });
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThan(0);
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

test('a held press on a target that scales leaves the callout in place', async ({
  page,
}) => {
  await startTour(page);
  await page
    .getByRole('region', {name: 'Your revenue'})
    .getByRole('button', {name: 'Next'})
    .click();
  const step = page.getByRole('region', {name: 'Refresh it'});
  await expect(step).toBeVisible();
  const before = await step.boundingBox();
  const refresh = await page
    .getByRole('button', {name: 'Refresh', exact: true})
    .boundingBox();
  if (before == null || refresh == null) {
    throw new Error('the callout or the target has no box');
  }
  await page.mouse.move(
    refresh.x + refresh.width / 2,
    refresh.y + refresh.height / 2,
  );
  await page.mouse.down();
  // Long enough for the press scale to finish.
  await page.waitForTimeout(400);
  const held = await step.boundingBox();
  await page.mouse.up();
  if (held == null) {
    throw new Error('the callout lost its box during the press');
  }
  expect(Math.abs(held.x - before.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(held.y - before.y)).toBeLessThanOrEqual(0.5);
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
  // The hit area writes its insets after its first measurement.
  await expect
    .poll(() =>
      close.evaluate(button =>
        (button as HTMLElement).style.getPropertyValue(
          '--astryx-hit-inset-top',
        ),
      ),
    )
    .not.toBe('');
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

test('a press on the dimmed page ends a backdrop tour', async ({page}) => {
  await openStory(page, storybook(), 'lab-tour--showcase');
  await page.getByRole('button', {name: 'Start tour'}).click();
  const step = page.getByRole('region', {name: 'Save your work'});
  await expect(step).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(step).toHaveCount(0);
});
