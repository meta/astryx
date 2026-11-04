// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file blog-heading-links.spec.ts
 * @input Production docsite blog post (the 0.6.0 release post)
 * @output Proof that post headings reveal a copy-link control, that it copies
 *   the heading's permalink, and that a copied link lands the heading below
 *   the sticky header, left to right and right to left
 * @position Docsite browser tests; jsdom has no hover, clipboard, or layout
 */

import {expect, test, type Page} from '@playwright/test';

const POST = '/blog/astryx-v0-6-0';
const HEADING = 'Themes respond in CSS';
const HEADING_ID = 'themes-respond-in-css';

function copyButton(page: Page, heading: string) {
  return page.getByRole('button', {name: `Copy link to ${heading}`});
}

test.use({
  permissions: ['clipboard-read', 'clipboard-write'],
  // Headless Chromium reports no hover-capable pointer; give it the desktop
  // mouse a reader has, so the hover reveal is what gets exercised.
  launchOptions: {
    args: [
      '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4',
    ],
  },
});

async function opacity(locator: ReturnType<Page['getByRole']>) {
  return Number(await locator.evaluate(el => getComputedStyle(el).opacity));
}

test('hovering a post heading reveals a control that copies its permalink', async ({
  page,
}) => {
  await page.setViewportSize({width: 1280, height: 900});
  await page.goto(POST);

  const heading = page.getByRole('heading', {name: HEADING});
  await expect(heading).toHaveAttribute('id', HEADING_ID);

  expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(
    true,
  );
  const button = copyButton(page, HEADING);
  await page.mouse.move(0, 0);
  await expect.poll(() => opacity(button)).toBe(0);
  await heading.hover();
  await expect.poll(() => opacity(button)).toBe(1);
  await button.click();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(copied).pathname).toBe(POST);
  expect(new URL(copied).hash).toBe(`#${HEADING_ID}`);
});

for (const [dir, colorScheme] of [
  ['ltr', 'light'],
  ['rtl', 'dark'],
] as const) {
  test(`a copied heading link lands below the sticky header (${dir}, ${colorScheme})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({width: 1280, height: 900});
    await page.emulateMedia({colorScheme});
    await page.goto(POST);
    await page.evaluate(
      ([d, id]) => {
        document.documentElement.setAttribute('dir', d);
        // Follow the copied link the way a reader does: by its fragment.
        window.location.hash = '';
        window.location.hash = id;
      },
      [dir, HEADING_ID] as const,
    );

    const heading = page.getByRole('heading', {name: HEADING});
    const header = page.locator('.astryx-app-shell-header').first();
    await expect(heading).toBeInViewport();
    const headerBox = await header.boundingBox();
    const headingTop = (await heading.boundingBox())?.y ?? -1;
    expect(headingTop).toBeGreaterThanOrEqual(
      (headerBox?.y ?? 0) + (headerBox?.height ?? 0) - 1,
    );

    await heading.hover();
    const button = copyButton(page, HEADING);
    await expect(button).toBeVisible();
    // The control trails the heading text on the inline-end side.
    const textBox = await heading.evaluate(el => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      return {x: r.x, y: r.y, width: r.width, height: r.height};
    });
    const buttonBox = await button.boundingBox();
    if (buttonBox == null) {
      throw new Error('missing layout');
    }
    if (dir === 'rtl') {
      expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(textBox.x + 1);
    } else {
      expect(buttonBox.x).toBeGreaterThanOrEqual(textBox.x + textBox.width - 1);
    }

    // Review evidence: the revealed control beside its heading.
    await page.screenshot({
      path: testInfo.outputPath(`heading-link-${dir}-${colorScheme}.png`),
      clip: {
        x: Math.max(0, Math.min(textBox.x, buttonBox.x) - 24),
        y: Math.max(0, textBox.y - 24),
        width: textBox.width + buttonBox.width + 64,
        height: textBox.height + 48,
      },
    });
  });
}
