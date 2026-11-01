// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TextReflow.a11y.chromium.spec.ts
 * @input Storybook stories a11y-text-reflow--untruncated, --truncated,
 *   --command-palette-empty-text and --banner-text at a 320 CSS px viewport
 * @output Text and Heading FR3 in a real browser (spec:AST-020 FR1, WCAG 2.2
 *   1.4.10 Reflow): an untruncated long unbroken token wraps (`break-word`),
 *   so the page never scrolls sideways; single-line truncation still clips on
 *   one line; Text inside a container that wraps with `anywhere`
 *   (CommandPaletteEmpty, Banner) keeps `anywhere` and stays inside both
 *   inline edges. A control frame with `overflow-wrap: normal` forced shows
 *   the page scroll the wrap prevents. Frames go to
 *   test-results/text-reflow-evidence/.
 * @position Text and Heading FR3 browser evidence
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const EVIDENCE = 'test-results/text-reflow-evidence';
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
    `${storybook.origin}/iframe.html?id=a11y-text-reflow--${story}&viewMode=story`,
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

async function wrapOf(target: Locator): Promise<string> {
  return target.evaluate(element => getComputedStyle(element).overflowWrap);
}

/** The element's box stays within both inline edges of the viewport. */
async function expectInsideViewport(target: Locator): Promise<void> {
  const box = await target.boundingBox();
  if (box == null) {
    throw new Error('the element has no box');
  }
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(WIDTH);
}

test('untruncated Text and Heading wrap a long token at 320 px, with no page scroll', async ({
  page,
}) => {
  await open(page, 'untruncated');
  for (const id of ['heading', 'text-inline', 'text-block']) {
    const target = page.getByTestId(id);
    expect(await wrapOf(target), id).toBe('break-word');
    expect(await lineCount(target), id).toBeGreaterThan(1);
  }
  await expectInsideViewport(page.getByTestId('text-block'));
  expect(await pageOverflow(page)).toBe(0);
  await page.screenshot({path: `${EVIDENCE}/untruncated-320.png`});

  // Control: without the wrap, the same tokens scroll the page sideways.
  await page.addStyleTag({
    content: '[data-testid] { overflow-wrap: normal !important; }',
  });
  expect(await pageOverflow(page)).toBeGreaterThan(0);
  await page.screenshot({path: `${EVIDENCE}/untruncated-320-control.png`});
});

test('single-line truncation still clips the token on one line at 320 px', async ({
  page,
}) => {
  await open(page, 'truncated');
  for (const id of ['heading', 'text']) {
    const target = page.getByTestId(id);
    const style = await target.evaluate(element => {
      const computed = getComputedStyle(element);
      return {
        whiteSpace: computed.whiteSpace,
        textOverflow: computed.textOverflow,
      };
    });
    expect(style, id).toEqual({whiteSpace: 'nowrap', textOverflow: 'ellipsis'});
    expect(await lineCount(target), id).toBe(1);
    expect(
      await target.evaluate(
        element => element.scrollWidth > element.clientWidth,
      ),
      id,
    ).toBe(true);
  }
  expect(await pageOverflow(page)).toBe(0);
  await page.screenshot({path: `${EVIDENCE}/truncated-320.png`});
});

for (const {story, name} of [
  {story: 'command-palette-empty-text', name: 'CommandPaletteEmpty'},
  {story: 'banner-text', name: 'Banner'},
]) {
  test(`Text inside ${name} keeps the container's anywhere wrap at 320 px`, async ({
    page,
  }) => {
    await open(page, story);
    const target = page.getByTestId('text');
    expect(await wrapOf(target)).toBe('anywhere');
    expect(await lineCount(target)).toBeGreaterThan(1);
    await expectInsideViewport(target);
    expect(await pageOverflow(page)).toBe(0);
    await page.screenshot({path: `${EVIDENCE}/${name}-text-320.png`});
  });
}
