// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ButtonGroupCorners.interaction.browser.spec.ts
 * @input Storybook story a11y-buttongroup-corners--shapes, in Chromium and
 *   WebKit
 * @output ButtonGroup FR3 in real browsers: in every member shape, only the
 *   group's last member (the last sibling that is not a popover, template or
 *   dialog) rounds its trailing corners, and an InputGroup button addon
 *   rounds its trailing corners only when no member follows it. Plus the
 *   cost contract from #9281: with the group rules on the page, inserting
 *   thousands of children into one container stays linear (WebKit
 *   re-evaluated the old sibling-relative `:has()` rule per sibling on every
 *   insertion)
 * @position ButtonGroup FR3 and InputGroup end-cap evidence; the jsdom tests
 *   assert membership only, since jsdom never receives these rules
 */

import {expect, test, type Page} from '@playwright/test';
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

async function openShapes(page: Page): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=a11y-buttongroup-corners--shapes&viewMode=story`,
  );
  await page.locator('[data-corner-shape="input-group-addon"]').waitFor();
}

interface Corner {
  shape: string;
  label: string;
  expected: 'round' | 'square';
  trailing: string[];
}

/** Each marked member's two trailing-corner radii, for its orientation. */
async function trailingCorners(page: Page): Promise<Corner[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>('[data-corner-case]'),
    ).map(element => {
      const style = getComputedStyle(element);
      const vertical = element.closest('[data-orientation="vertical"]') != null;
      const trailing = vertical
        ? [style.borderEndStartRadius, style.borderEndEndRadius]
        : [style.borderStartEndRadius, style.borderEndEndRadius];
      return {
        shape: element.dataset.cornerCase ?? '',
        label: element.textContent?.trim() ?? '',
        expected: element.dataset.trailing as 'round' | 'square',
        trailing,
      };
    }),
  );
}

test('only the last member rounds its trailing corners, in every shape', async ({
  page,
}) => {
  await openShapes(page);
  const corners = await trailingCorners(page);
  expect(corners.length).toBeGreaterThanOrEqual(22);
  for (const {shape, label, expected, trailing} of corners) {
    const rounded = trailing.map(value => parseFloat(value) > 0);
    expect(rounded, `${shape} / ${label}`).toEqual(
      expected === 'round' ? [true, true] : [false, false],
    );
  }
  await page.screenshot({
    path: `test-results/interaction-evidence/buttongroup-corners/shapes-${test.info().project.name}.png`,
    fullPage: true,
  });
});

/**
 * Inserts `count` closed popovers into one rendered container, reading layout
 * every 50 insertions as a page that renders as it fills does; returns the
 * time in ms.
 */
async function insertionMs(page: Page, count: number): Promise<number> {
  return page.evaluate(total => {
    const container = document.createElement('div');
    document.body.append(container);
    void container.offsetHeight;
    const start = performance.now();
    for (let index = 0; index < total; index += 1) {
      const piece = document.createElement('div');
      piece.setAttribute('popover', 'manual');
      container.append(piece);
      if (index % 50 === 0) {
        void container.offsetHeight;
      }
    }
    void container.offsetHeight;
    const elapsed = performance.now() - start;
    container.remove();
    return elapsed;
  }, count);
}

test('filling one container stays linear with the group rules on the page', async ({
  page,
}) => {
  await openShapes(page);
  const median = async (count: number) => {
    const runs = [];
    for (let run = 0; run < 3; run += 1) {
      runs.push(await insertionMs(page, count));
    }
    return runs.sort((a, b) => a - b)[1];
  };
  const small = await median(2_000);
  const large = await median(8_000);
  test.info().annotations.push({
    type: 'insertion-ms',
    description: `2,000: ${small.toFixed(1)} ms; 8,000: ${large.toFixed(1)} ms`,
  });
  // Four times the children: linear cost is about four times the time, and
  // the old rule's quadratic cost about sixteen (#9281 measured 45 ms at
  // 2,000 and 1,152 ms at 10,000 in WebKit). The floor keeps a run too fast
  // to time from failing on noise.
  expect(large).toBeLessThan(Math.max(small, 5) * 9);
});
