// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CitationTextSize.interaction.browser.spec.ts
 * @input The built Citation Variants story, with the citations' text
 *   enlarged while the spacing sizes stay put, as iOS Dynamic Type does
 * @output Real-browser evidence that a citation pill grows with its label, so
 *   the label stays inside its own box, and that the default text size keeps
 *   each pill at its height
 * @position Browser proof of Citation's text growth (AST-102 FR4)
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

test.use({
  viewport: {width: 1280, height: 800},
  isMobile: false,
  hasTouch: false,
  deviceScaleFactor: 1,
});

async function openStory(page: Page): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-citation--variants&viewMode=story`,
  );
  await page.locator('#storybook-root .astryx-citation').first().waitFor();
}

/** Each citation's box against its text's line boxes. */
async function readCitations(page: Page) {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '#storybook-root .astryx-citation',
      ),
    ]
      .filter(citation => (citation.textContent ?? '').trim() !== '')
      .map(citation => {
        const range = document.createRange();
        range.selectNodeContents(citation);
        const text = range.getBoundingClientRect();
        const box = citation.getBoundingClientRect();
        return {
          name: (citation.textContent ?? '').trim(),
          height: box.height,
          above: box.top - text.top,
          below: text.bottom - box.bottom,
        };
      }),
  );
}

test('at the default text size each citation keeps its 20 px height', async ({
  page,
}) => {
  await openStory(page);
  const citations = await readCitations(page);
  expect(citations.length).toBeGreaterThan(0);
  for (const citation of citations) {
    expect(citation.height, citation.name).toBeCloseTo(20, 1);
  }
});

test('a label larger than the pill grows the pill', async ({page}) => {
  await openStory(page);
  // Grows the citations' text, but not the spacing sizes, the way iOS Dynamic
  // Type grows theme text at its accessibility sizes.
  await page.addStyleTag({
    content:
      '#storybook-root .astryx-citation { font-size: 40px; line-height: 60px; }',
  });
  const citations = await readCitations(page);
  expect(citations.length).toBeGreaterThan(0);
  for (const citation of citations) {
    expect(citation.above, citation.name).toBeLessThanOrEqual(1);
    expect(citation.below, citation.name).toBeLessThanOrEqual(1);
  }
});
