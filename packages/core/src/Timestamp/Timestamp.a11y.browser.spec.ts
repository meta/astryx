// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Timestamp

/**
 * @file Timestamp.a11y.browser.spec.ts
 * @input Built Storybook, keyboard navigation in Chromium and WebKit, and a
 *   delayed card chunk
 * @output Proof of sequential copy access and focus preservation on cold loads
 * @position Browser regressions for Timestamp's lazy details attachment
 */

import AxeBuilder from '@axe-core/playwright';
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
test.afterAll(async () => storybook?.close());

for (const moveAway of [false, true]) {
  test(`cold card attachment ${moveAway ? 'respects newer focus' : 'preserves focus and opens details'}`, async ({
    page,
  }) => {
    let release!: () => void;
    const heldChunk = new Promise<void>(resolve => {
      release = resolve;
    });
    let intercepted = false;
    await page.route(/TimestampHoverCard[^/]*\.js(?:\?.*)?$/, async route => {
      intercepted = true;
      await heldChunk;
      await route.continue();
    });
    try {
      await page.goto(
        `${storybook.origin}/iframe.html?id=core-timestamp--relative-format&viewMode=story`,
      );
      const times = page.locator('#storybook-root time');
      await expect(times).toHaveCount(7);
      await expect.poll(() => intercepted).toBe(true);
      await page.keyboard.press('Tab');
      await expect(times.first()).toBeFocused();
      const original = await times.first().elementHandle();
      if (original === null) {
        throw new Error('Expected the first timestamp');
      }
      if (moveAway) {
        await page.keyboard.press('Tab');
        await expect(times.nth(1)).toBeFocused();
      }
      release();
      const activeTime = times.nth(moveAway ? 1 : 0);
      await expect(activeTime).toBeFocused();
      await expect(activeTime).toHaveAttribute('aria-controls', /.+/);
      // The card has attached, and the time the reader focused survived it.
      expect(await original.evaluate(node => node.isConnected)).toBe(true);
      if (moveAway) {
        await expect(times.first()).not.toHaveAttribute('aria-controls');
      }
      const cardId = await activeTime.getAttribute('aria-controls');
      const card = page.locator(`[id="${cardId}"]`);
      await expect(card).toBeVisible();
      await expect(activeTime).not.toHaveAttribute('aria-expanded');
      await page.keyboard.press('Tab');
      await expect(card.getByRole('button', {name: /^Copy /})).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(activeTime).toBeFocused();
      // The copy button's own tooltip dismisses independently of the card.
      await expect(page.getByRole('tooltip')).not.toBeVisible();
      await page.keyboard.press('Escape');
      await expect(card).not.toBeVisible();
      await expect(activeTime).toBeFocused();
    } finally {
      release();
    }
  });
}

test('each timestamp owns the next copy-button tab stop', async ({page}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-timestamp--relative-format&viewMode=story`,
  );
  const times = page.locator('#storybook-root time');
  await expect(times).toHaveCount(7);
  await page.keyboard.press('Tab');
  for (let index = 0; index < 2; index++) {
    await expect(times.nth(index)).toBeFocused();
    await expect(times.nth(index)).toHaveAttribute('aria-controls', /.+/);
    const id = await times.nth(index).getAttribute('aria-controls');
    await page.keyboard.press('Tab');
    await expect(
      page.locator(`[id="${id}"]`).getByRole('button', {name: /^Copy /}),
    ).toBeFocused();
    await page.keyboard.press('Tab');
  }
  await expect(times.nth(2)).toBeFocused();
});

test('an open card passes axe, and the time carries no unsupported popup attribute', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-timestamp--relative-format&viewMode=story`,
  );
  await expect(page.locator('#storybook-root time')).toHaveCount(7);
  const time = page.locator('#storybook-root time').first();
  await page.keyboard.press('Tab');
  await expect(time).toBeFocused();
  await expect(time).toHaveAttribute('aria-controls', /.+/);
  await expect(time).not.toHaveAttribute('aria-haspopup');
  await expect(time).not.toHaveAttribute('aria-expanded');
  // A story is a page fragment with no landmarks or heading.
  const results = await new AxeBuilder({page})
    .disableRules(['landmark-one-main', 'page-has-heading-one', 'region'])
    .analyze();
  expect(
    results.violations.map(
      violation =>
        `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([]);
});
