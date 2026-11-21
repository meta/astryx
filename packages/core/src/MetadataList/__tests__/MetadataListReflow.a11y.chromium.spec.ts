// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MetadataListReflow.a11y.chromium.spec.ts
 * @input Storybook stories a11y-metadatalist-reflow--* at a 320 CSS px viewport
 * @output MetadataListItem FR1 in a real browser (WCAG 2.2 1.4.10 Reflow): an
 *   amount beside a long description keeps its own width on one line, and a
 *   word longer than its line wraps inside the list in side-by-side, stacked,
 *   horizontal and two-column lists, so the page never scrolls sideways
 * @position MetadataListItem FR1 browser evidence
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const WIDTH = 320;

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});
test.use({viewport: {width: WIDTH, height: 640}});

async function open(page: Page, story: string): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=a11y-metadatalist-reflow--${story}&viewMode=story`,
  );
  await expect(page.getByTestId(/./).first()).toBeVisible();
}

/** How far the page scrolls sideways, in CSS px (0 = no horizontal scroll). */
async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

/** How many line boxes the element's text occupies. */
async function lineCount(target: Locator): Promise<number> {
  return target.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return new Set(
      Array.from(range.getClientRects(), rect => Math.round(rect.top)),
    ).size;
  });
}

test('an amount beside a long description stays on one line', async ({
  page,
}) => {
  await open(page, 'amount-in-row');
  const amount = page.getByTestId('amount');
  expect(await lineCount(amount)).toBe(1);
  const box = await amount.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(40);
  expect(await pageOverflow(page)).toBe(0);
});

for (const story of [
  'token-side-by-side',
  'token-stacked',
  'token-horizontal',
  'token-two-columns',
]) {
  test(`${story}: a word longer than its line wraps inside the list`, async ({
    page,
  }) => {
    await open(page, story);
    const token = page.getByTestId('token');
    expect(await lineCount(token)).toBeGreaterThan(1);
    const box = await token.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(WIDTH);
    expect(await pageOverflow(page)).toBe(0);
  });
}

/** The right edge of the element's text (not its box), in CSS px. */
async function textRight(target: Locator): Promise<number> {
  return target.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getBoundingClientRect().right;
  });
}

test('a label word longer than its column breaks inside its column', async ({
  page,
}) => {
  await open(page, 'long-label-two-columns');
  const label = page.locator('dt', {hasText: 'Internationalization'});
  expect(await lineCount(label)).toBeGreaterThan(1);
  const neighborBox = await page
    .locator('dt', {hasText: 'Status'})
    .boundingBox();
  if (neighborBox == null) {
    throw new Error('the neighbor label has no box');
  }
  // The label's text ends before the neighbor column starts (left to right).
  expect(await textRight(label)).toBeLessThanOrEqual(neighborBox.x);
  expect(await pageOverflow(page)).toBe(0);
});
