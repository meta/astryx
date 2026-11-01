// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TextReflow.a11y.chromium.spec.ts
 * @input Storybook stories core-text--body, core-heading--level-1,
 *   core-text--single-line-truncation and core-heading--single-line-truncation
 *   at a 320 CSS px viewport, each given a long unbroken token
 * @output Text and Heading FR3 in a real browser (spec:AST-020 FR1, WCAG 2.2
 *   1.4.10 Reflow): a token longer than its line wraps, so the page never
 *   scrolls sideways; single-line truncation still clips on one line. A control
 *   frame with `overflow-wrap: normal` forced shows the page scroll this
 *   prevents. (The truncation stories sit in a fixed 300 px box, so only the
 *   element's own clipping is checked there.) Frames go to test-results/text-reflow-evidence/.
 * @position Text and Heading FR3 browser evidence
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const TOKEN =
  'https://example.com/releases/2026/aVeryLongUnbrokenTokenThatIsMuchWiderThanAPhone';
const EVIDENCE = 'test-results/text-reflow-evidence';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});
test.use({viewport: {width: 320, height: 640}});

/** Open a story and give its first `selector` element the long token. */
async function openWithToken(page: Page, story: string, selector: string) {
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  const target = page.locator(selector).first();
  await expect(target).toBeVisible();
  await target.evaluate((element, token) => {
    element.textContent = token;
  }, TOKEN);
  return target;
}

/** How far the page scrolls sideways, in CSS px (0 = no horizontal scroll). */
async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

for (const {name, story, selector} of [
  {name: 'Text', story: 'core-text--body', selector: '.astryx-text'},
  {
    name: 'Heading',
    story: 'core-heading--level-1',
    selector: '.astryx-heading',
  },
]) {
  test(`${name}: a long unbroken token wraps at 320 px, with no page scroll`, async ({
    page,
  }) => {
    const target = await openWithToken(page, story, selector);
    expect(await target.evaluate(e => getComputedStyle(e).overflowWrap)).toBe(
      'break-word',
    );
    expect(await pageOverflow(page)).toBe(0);
    const box = await target.boundingBox();
    expect(box && box.x + box.width).toBeLessThanOrEqual(320);
    // It wrapped onto more than one line rather than being clipped.
    expect(
      await target.evaluate(e => {
        const range = document.createRange();
        range.selectNodeContents(e);
        const tops = new Set(
          Array.from(range.getClientRects(), rect => Math.round(rect.top)),
        );
        return tops.size;
      }),
    ).toBeGreaterThan(1);
    await page.screenshot({path: `${EVIDENCE}/${name}-320-after.png`});

    // Control: without the wrap, the same token scrolls the page sideways.
    await target.evaluate(e => {
      (e as HTMLElement).style.overflowWrap = 'normal';
    });
    expect(await pageOverflow(page)).toBeGreaterThan(0);
    await page.screenshot({path: `${EVIDENCE}/${name}-320-control.png`});
  });
}

for (const {name, story, selector} of [
  {
    name: 'Text',
    story: 'core-text--single-line-truncation',
    selector: '.astryx-text',
  },
  {
    name: 'Heading',
    story: 'core-heading--single-line-truncation',
    selector: '.astryx-heading',
  },
]) {
  test(`${name}: single-line truncation still clips one line at 320 px`, async ({
    page,
  }) => {
    const target = await openWithToken(page, story, selector);
    const style = await target.evaluate(e => {
      const s = getComputedStyle(e);
      return {whiteSpace: s.whiteSpace, textOverflow: s.textOverflow};
    });
    expect(style).toEqual({whiteSpace: 'nowrap', textOverflow: 'ellipsis'});
    // The token stays on one clipped line inside the element.
    expect(await target.evaluate(e => e.scrollWidth > e.clientWidth)).toBe(
      true,
    );
    expect(
      await target.evaluate(e => {
        const range = document.createRange();
        range.selectNodeContents(e);
        return new Set(
          Array.from(range.getClientRects(), rect => Math.round(rect.top)),
        ).size;
      }),
    ).toBe(1);
    await page.screenshot({path: `${EVIDENCE}/${name}-truncated-320.png`});
  });
}
