// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file InputClearButtonTarget.a11y.chromium.spec.ts
 * @input The clearable stories of the input-family fields in a built
 *   Storybook, in Chromium under a mouse
 * @output Real-browser proof that every field's clear button keeps its 20 px
 *   glyph button and takes a target of at least 24 px on each axis (WCAG 2.2
 *   SC 2.5.8, spec:AST-020 FR1), grown only away from the text, so a click at
 *   the end of the text still places the caret
 * @position Run with `pnpm test:a11y-contract`. Hit testing a pseudo-element
 *   needs real layout, which jsdom does not have.
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORIES = [
  'core-textinput--clearable',
  'core-numberinput--clearable',
  'core-dateinput--clearable',
  'core-timeinput--with-clear-button',
  'core-datetimeinput--with-clear-button',
  'core-multiselector--clearable',
];

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(DEFAULT_STORYBOOK_DIR);
});

test.afterAll(async () => {
  await storybook?.close();
});

interface TargetReport {
  width: number;
  height: number;
  /** Points inside the 24 px target that do not land on the button. */
  misses: string[];
  /** Whether the point 1 px before the button, toward the text, is its. */
  takesTextSide: boolean;
}

for (const story of STORIES) {
  test(`${story}: the clear button keeps its 20 px glyph and takes a 24 px target away from the text`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=${story}&viewMode=story`,
    );
    const button = page.locator('.astryx-input-clear-button').first();
    await button.waitFor();
    const report = await button.evaluate((element): TargetReport => {
      const box = element.getBoundingClientRect();
      const isRTL = getComputedStyle(element).direction === 'rtl';
      const start = isRTL ? box.right : box.left;
      const toEnd = isRTL ? -1 : 1;
      const centerY = box.top + box.height / 2;
      // Half a pixel inside each edge of the 24 px target, which starts at
      // the button's text-side edge and grows up, down and toward the end.
      const centerX = start + (toEnd * 24) / 2;
      const points: [string, number, number][] = [
        ['top', centerX, centerY - 11.5],
        ['bottom', centerX, centerY + 11.5],
        ['end', start + toEnd * 23.5, centerY],
      ];
      const hits = (x: number, y: number) => {
        const hit = document.elementFromPoint(x, y);
        return hit != null && element.contains(hit);
      };
      return {
        width: box.width,
        height: box.height,
        misses: points.filter(([, x, y]) => !hits(x, y)).map(([side]) => side),
        // Chromium gives a point within a pixel before an element's
        // whole-pixel edge to that element, so the probe sits 1 px out.
        takesTextSide: hits(start - toEnd, centerY),
      };
    });
    expect(report.width).toBeCloseTo(20, 0);
    expect(report.height).toBeCloseTo(20, 0);
    expect(report.misses).toEqual([]);
    expect(report.takesTextSide).toBe(false);
  });
}

test('a click at the end of the text places the caret, not a clear', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-textinput--clearable&viewMode=story`,
  );
  const input = page.getByRole('textbox').first();
  await input.waitFor();
  const value = await input.inputValue();
  const box = await input.boundingBox();
  if (box == null) {
    throw new Error('the text input has no layout box');
  }
  await page.mouse.click(box.x + box.width - 1, box.y + box.height / 2);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(value);
  expect(
    await input.evaluate(
      element => (element as HTMLInputElement).selectionStart,
    ),
  ).toBe(value.length);
});
