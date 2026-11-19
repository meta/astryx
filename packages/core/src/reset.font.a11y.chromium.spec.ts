// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/reset\.css$

/**
 * @file reset.font.a11y.chromium.spec.ts
 * @input packages/core/src/reset.css on a blank Chromium page, with and
 *   without a page-root --font-family-body
 * @output Browser evidence that text measured in a span appended to body has
 *   the width the same text has when drawn inside the theme root, and that a
 *   page with no token keeps the browser's default font
 * @position reset.css font proof. Chart libraries measure labels in a hidden
 *   span in body and draw them inside the themed chart; the two widths differ
 *   when body has a different font from the theme root.
 */

import * as fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';

const RESET_CSS = fs.readFileSync(
  fileURLToPath(new URL('./reset.css', import.meta.url)),
  'utf8',
);

const LABEL = 'Sep 30, 2026';

// A face whose widths differ from the browser's default serif, declared at
// the page root the way astryx.css declares the token's default.
const PAGE_ROOT_TOKEN = ':root { --font-family-body: monospace; }';

// The theme root takes the token as the compiled theme's scope rule does.
const BODY = `
  <div id="theme-root" style="font-family: var(--font-family-body)">
    <span id="drawn" style="white-space: nowrap">${LABEL}</span>
  </div>
`;

async function load(page: Page, styles: string[]) {
  await page.setContent(BODY);
  for (const content of styles) {
    await page.addStyleTag({content});
  }
}

/** Width of LABEL drawn in the theme root and measured in a span in body. */
async function widths(page: Page) {
  return page.evaluate(label => {
    // The way chart libraries measure: a hidden span appended to body.
    const measure = document.createElement('span');
    measure.style.cssText =
      'position: absolute; top: -9999px; visibility: hidden; white-space: nowrap';
    measure.textContent = label;
    document.body.appendChild(measure);
    const measured = measure.getBoundingClientRect().width;
    measure.remove();
    const drawn =
      document.getElementById('drawn')?.getBoundingClientRect().width ?? 0;
    return {measured, drawn};
  }, LABEL);
}

async function htmlFont(page: Page) {
  return page.evaluate(
    () => getComputedStyle(document.documentElement).fontFamily,
  );
}

test('a label measured in body has the width it is drawn at in the theme root', async ({
  page,
}) => {
  await load(page, [RESET_CSS, PAGE_ROOT_TOKEN]);
  const {measured, drawn} = await widths(page);
  expect(measured).toBeGreaterThan(0);
  expect(measured).toBe(drawn);
});

test('without the reset the measured width differs, so the proof can fail', async ({
  page,
}) => {
  await load(page, [PAGE_ROOT_TOKEN]);
  const {measured, drawn} = await widths(page);
  expect(Math.abs(measured - drawn)).toBeGreaterThan(1);
});

test('a page with no token keeps the browser default font', async ({page}) => {
  await load(page, []);
  const before = await htmlFont(page);
  await page.addStyleTag({content: RESET_CSS});
  expect(await htmlFont(page)).toBe(before);
});
