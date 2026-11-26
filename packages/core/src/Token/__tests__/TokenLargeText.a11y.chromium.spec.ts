// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file TokenLargeText.a11y.chromium.spec.ts
 * @input The `Core/Token` Long End Content In Narrow Space story in a built
 *   Storybook, with the root text at 200%, and real mouse and keyboard input.
 * @output Real-engine proof that a token cut by its width keeps its Remove
 *   button inside the token, visible and hit-testable across a 24 by 24 CSS
 *   pixel target, that its label keeps a width, and that keyboard removal
 *   still works, for the static, clickable and link structures
 *   (spec:AST-020 FR1, WCAG 2.2 1.4.4); and that a focused control in a
 *   token's end content keeps its focus ring.
 * @position Run with `pnpm test:a11y-contract`. jsdom has no layout or hit
 *   testing, so the cut is only observable here.
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

const STORY = 'core-token--long-end-content-in-narrow-space';

async function open(page: Page) {
  await page.setViewportSize({width: 390, height: 700});
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  await expect(
    page.locator('#storybook-root button[aria-label^="Remove "]'),
  ).toHaveCount(4);
}

async function openAtLargeText(page: Page) {
  await open(page);
  // 200% root text, as a browser's text-size setting applies it.
  await page.addStyleTag({content: 'html { font-size: 200% !important; }'});
}

for (const label of ['Static range:', 'Clickable range:', 'Link range:']) {
  test(`${label} keeps its Remove button visible and hit-testable at 200% text`, async ({
    page,
  }) => {
    await openAtLargeText(page);
    const remove = page.locator(
      `#storybook-root button[aria-label^="Remove ${label}"]`,
    );
    const token = remove.locator('xpath=..');
    const labelText = page
      .locator('#storybook-root')
      .getByText(label, {exact: true});
    const [x, t, l] = await Promise.all([
      remove.boundingBox(),
      token.boundingBox(),
      labelText.boundingBox(),
    ]);
    if (x == null || t == null || l == null) {
      throw new Error(`the ${label} token, label or Remove button has no box`);
    }
    // The X lies inside the token's clip, so it is drawn.
    expect(x.x).toBeGreaterThanOrEqual(t.x - 0.5);
    expect(x.x + x.width).toBeLessThanOrEqual(t.x + t.width + 0.5);
    expect(x.width).toBeGreaterThan(0);
    // The label keeps a width: it shares the cut with the end content.
    expect(l.width).toBeGreaterThan(4);

    // A 24 by 24 target around the X's center belongs to the Remove button.
    const cx = x.x + x.width / 2;
    const cy = x.y + x.height / 2;
    const hits = await page.evaluate(
      ({points, name}) =>
        points.map(([px, py]) => {
          const hit = document.elementFromPoint(px, py);
          return hit?.closest(`button[aria-label="${name}"]`) != null;
        }),
      {
        points: [
          [cx, cy],
          [cx - 11, cy],
          [cx + 11, cy],
          [cx, cy - 11],
          [cx, cy + 11],
        ] as [number, number][],
        name: (await remove.getAttribute('aria-label')) ?? '',
      },
    );
    expect(hits).toEqual([true, true, true, true, true]);

    await page.mouse.click(cx, cy);
    await expect(
      page.locator('#storybook-root').getByText(`Removed ${label}`),
    ).toBeVisible();
  });

  test(`${label} still removes from the keyboard at 200% text`, async ({
    page,
  }) => {
    await openAtLargeText(page);
    await page
      .locator(`#storybook-root button[aria-label^="Remove ${label}"]`)
      .focus();
    await page.keyboard.press('Enter');
    await expect(
      page.locator('#storybook-root').getByText(`Removed ${label}`),
    ).toBeVisible();
  });
}

test('a focused control in the end content keeps its focus ring', async ({
  page,
}) => {
  await open(page);
  const control = page.getByRole('button', {name: 'Range details'});
  // Keyboard focus, so the ring shows as it does for a keyboard user.
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('Tab');
    if (await control.evaluate(el => el === document.activeElement)) {
      break;
    }
  }
  await expect(control).toBeFocused();
  // The ring's box, cut to the token's own clip, must lie inside the end
  // content's clip: the end content clips no part of the ring that the token
  // shows.
  const result = await control.evaluate(el => {
    const style = getComputedStyle(el);
    const reach =
      parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    const box = el.getBoundingClientRect();
    const ring = {
      left: box.left - reach,
      top: box.top - reach,
      right: box.right + reach,
      bottom: box.bottom + reach,
    };
    const slot = el.parentElement?.getBoundingClientRect();
    const token = el.parentElement?.parentElement?.getBoundingClientRect();
    if (slot == null || token == null) {
      return null;
    }
    const shown = {
      left: Math.max(ring.left, token.left),
      top: Math.max(ring.top, token.top),
      right: Math.min(ring.right, token.right),
      bottom: Math.min(ring.bottom, token.bottom),
    };
    return {
      reach,
      inside:
        shown.left >= slot.left - 0.5 &&
        shown.top >= slot.top - 0.5 &&
        shown.right <= slot.right + 0.5 &&
        shown.bottom <= slot.bottom + 0.5,
    };
  });
  expect(result).not.toBeNull();
  expect(result?.reach).toBeGreaterThan(0);
  expect(result?.inside).toBe(true);
});
