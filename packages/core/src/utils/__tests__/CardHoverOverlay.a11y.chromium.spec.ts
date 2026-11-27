// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(ClickableCard|SelectableCard|Thumbnail)/|packages/core/src/utils/interactionOverlay|apps/storybook/stories/(ClickableCard|SelectableCard|Thumbnail)\.stories)

/**
 * @file CardHoverOverlay.a11y.chromium.spec.ts
 * @input The ClickableCard, SelectableCard and clickable Thumbnail stories in
 *   a built Storybook (a layered stylesheet), light and dark
 * @output Real-engine proof that a mouse hover tints each card: its
 *   `::after` layer paints the theme's hover overlay, and it paints nothing
 *   at rest
 * @position Run with `pnpm test:a11y-contract`. The hover tint is these
 *   cards' only hover cue (WCAG 2.2 1.4.1), and a rule that out-ranks it in
 *   the stylesheet removes it with no error.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
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

test.use({viewport: {width: 900, height: 700}, hasTouch: false});

const CARDS = [
  {
    name: 'ClickableCard',
    story: 'core-clickablecard--navigation',
    target: '.astryx-clickable-card',
  },
  {
    name: 'SelectableCard',
    story: 'core-selectablecard--single-select',
    target: '.astryx-selectable-card',
  },
  // The clickable Thumbnail tints its image container, the `thumbnail`
  // target's first child.
  {
    name: 'Thumbnail',
    story: 'core-thumbnail--clickable',
    target: '.astryx-thumbnail > div',
  },
] as const;

/** The computed `::after` background of the first matching element. */
async function overlay(page: Page, target: string): Promise<string> {
  return page
    .locator(`#storybook-root ${target}`)
    .first()
    .evaluate(element => getComputedStyle(element, '::after').backgroundColor);
}

/** The alpha of a computed `rgb()` or `rgba()` colour. */
function alpha(color: string): number {
  const parts = color.match(/[\d.]+/g)?.map(Number) ?? [];
  return parts.length === 4 ? parts[3] : parts.length === 3 ? 1 : 0;
}

for (const card of CARDS) {
  for (const mode of ['light', 'dark'] as const) {
    test(`${card.name} (${mode}): a hover paints the hover overlay, and rest paints none`, async ({
      page,
    }) => {
      await page.goto(
        `${storybook.origin}/iframe.html?id=${card.story}&viewMode=story&globals=colorMode:${mode}`,
        {waitUntil: 'load'},
      );
      await holdMotionStill(page);
      const element = page.locator(`#storybook-root ${card.target}`).first();
      await expect(element).toBeVisible();

      await page.mouse.move(1, 1);
      const rest = await overlay(page, card.target);
      expect(alpha(rest), `${card.name} at rest: ${rest}`).toBe(0);

      await element.hover();
      await expect
        .poll(async () => alpha(await overlay(page, card.target)), {
          message: `${card.name} hovered: the ::after stays transparent`,
        })
        .toBeGreaterThan(0);
      // The tint is the theme's hover overlay, which the element sets on the
      // custom property its `::after` paints.
      const custom = await element.evaluate(e =>
        getComputedStyle(e).getPropertyValue('--_press-overlay').trim(),
      );
      expect(custom, `${card.name} hovered: --_press-overlay`).not.toBe(
        'transparent',
      );
    });
  }
}
