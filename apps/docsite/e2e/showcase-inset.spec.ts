// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file showcase-inset.spec.ts
 * @input Production docsite component pages at phone and desktop widths
 * @output Proof that the Overview showcase keeps an inline inset in its card
 * @position Docsite browser tests; jsdom cannot measure layout
 */

import {expect, test, type Page} from '@playwright/test';

/** The stage's gutter, `--spacing-4` in the neutral preview theme, in px. */
const GUTTER = 16;

/**
 * Measures the showcase's target element against the hero card's padding
 * box. The hero is the first example anchor on a component page.
 */
async function measureHero(page: Page, targetSelector: string) {
  const hero = page.locator('[id^="example-"]').first();
  await expect(hero.locator(targetSelector).first()).toBeVisible();
  return hero.evaluate((anchor, selector) => {
    const card = anchor.querySelector('.astryx-card');
    const stage = card?.firstElementChild;
    const target = anchor.querySelector(selector);
    if (card == null || stage == null || target == null) {
      throw new Error('The hero has no card, stage, or target.');
    }
    const cardBox = card.getBoundingClientRect();
    const stageBox = stage.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    const border = parseFloat(getComputedStyle(card).borderLeftWidth);
    return {
      startGap: targetBox.left - (cardBox.left + border),
      endGap: cardBox.right - border - targetBox.right,
      targetWidth: targetBox.width,
      innerWidth: cardBox.width - 2 * border,
      stageWidth: stageBox.width,
      stageHeight: stageBox.height,
      cardWidth: cardBox.width,
      scrolls: stage.scrollWidth > stage.clientWidth,
    };
  }, targetSelector);
}

test('a fluid showcase on a phone stops at the gutters', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/components/Tokenizer');
  const hero = await measureHero(page, '.astryx-tokenizer');

  expect(hero.startGap).toBeCloseTo(GUTTER, 0);
  expect(hero.endGap).toBeCloseTo(GUTTER, 0);
  expect(hero.scrolls).toBe(false);
});

test('a fixed-width showcase that fits a phone card stays centered without scrolling', async ({
  page,
}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/components/Typeahead');
  const hero = await measureHero(page, '.astryx-typeahead');
  const centeredGap = (hero.innerWidth - hero.targetWidth) / 2;

  expect(hero.targetWidth).toBeCloseTo(320, 0);
  expect(Math.abs(hero.startGap - centeredGap)).toBeLessThanOrEqual(1);
  expect(Math.abs(hero.endGap - centeredGap)).toBeLessThanOrEqual(1);
  expect(hero.scrolls).toBe(false);
});

test('a fluid showcase on the desktop stage stops at the gutters inside the 16:9 frame', async ({
  page,
}) => {
  await page.setViewportSize({width: 1280, height: 900});
  await page.goto('/components/AppShell');
  const hero = await measureHero(page, '.astryx-app-shell');

  // A shrinking showcase takes a small share of the gutters' space too.
  expect(hero.startGap).toBeGreaterThanOrEqual(GUTTER - 2);
  expect(hero.startGap).toBeLessThanOrEqual(GUTTER);
  expect(Math.abs(hero.startGap - hero.endGap)).toBeLessThanOrEqual(1);
  expect(hero.stageWidth).toBeCloseTo(hero.cardWidth, 0);
  expect(hero.stageHeight).toBeCloseTo((hero.stageWidth * 9) / 16, 0);
});

test('a fixed-width showcase that nearly fills the desktop card stays centered without scrolling', async ({
  page,
}) => {
  // At this width the card is 12px wider than the 525px showcase, so
  // full-width gutters would make the stage scroll.
  await page.setViewportSize({width: 845, height: 900});
  await page.goto('/components/AspectRatio');
  // The showcase's root is the stage's first child.
  const hero = await measureHero(page, '.astryx-card > div > *');
  const centeredGap = (hero.innerWidth - hero.targetWidth) / 2;

  expect(hero.targetWidth).toBeCloseTo(525, 0);
  expect(centeredGap).toBeLessThan(GUTTER);
  expect(Math.abs(hero.startGap - centeredGap)).toBeLessThanOrEqual(1);
  expect(Math.abs(hero.endGap - centeredGap)).toBeLessThanOrEqual(1);
  expect(hero.scrolls).toBe(false);
});

test('a narrow fixed-width showcase keeps its place on the desktop stage', async ({
  page,
}) => {
  await page.setViewportSize({width: 1280, height: 900});
  await page.goto('/components/TextInput');
  const hero = await measureHero(page, '.astryx-text-input');
  const centeredGap = (hero.innerWidth - hero.targetWidth) / 2;

  expect(hero.targetWidth).toBeCloseTo(300, 0);
  expect(Math.abs(hero.startGap - centeredGap)).toBeLessThanOrEqual(1);
});
