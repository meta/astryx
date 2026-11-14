// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reset.file-selector-button.a11y.browser.spec.ts
 * @input packages/core/src/reset.css, alone on a blank page
 * @output Browser evidence that a file input's button gets the reset a
 *   `<button>` gets
 * @position reset.css integration proof. The button is a pseudo-element of
 *   the input, styled by the browser from inside the input, and only a
 *   shipping engine shows what it computes.
 */

import * as fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {expect, test} from '@playwright/test';

const RESET_CSS = fs.readFileSync(
  fileURLToPath(new URL('./reset.css', import.meta.url)),
  'utf8',
);

// What the reset settles for a bare button. Padding and margin are left out:
// the file button keeps its own, to stay apart from the file name.
const SHARED = [
  'boxSizing',
  'borderTopStyle',
  'borderTopWidth',
  'backgroundColor',
  'backgroundImage',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontFeatureSettings',
  'fontVariationSettings',
  'letterSpacing',
  'color',
  'appearance',
] as const;

test.beforeEach(async ({page}) => {
  await page.setContent(`
    <div style="font-family: serif; font-size: 20px; font-weight: 600;
      font-feature-settings: 'smcp' 1; font-variation-settings: 'wght' 650;
      color: rgb(10, 20, 30)">
      <input id="file" type="file">
      <button id="button">Choose</button>
    </div>
  `);
  await page.addStyleTag({content: RESET_CSS});
});

test('the file button matches a bare button under the reset', async ({
  page,
}) => {
  const [fileButton, button] = await page.evaluate(keys => {
    const pick = (style: CSSStyleDeclaration) =>
      Object.fromEntries(keys.map(key => [key, style[key]]));
    const file = document.getElementById('file');
    const plain = document.getElementById('button');
    if (!file || !plain) {
      throw new Error('missing controls');
    }
    return [
      pick(getComputedStyle(file, '::file-selector-button')),
      pick(getComputedStyle(plain)),
    ];
  }, SHARED);
  expect(fileButton).toEqual(button);
  expect(fileButton).toMatchObject({
    borderTopWidth: '0px',
    backgroundColor: 'rgba(0, 0, 0, 0)',
    fontFamily: 'serif',
    fontFeatureSettings: '"smcp"',
    color: 'rgb(10, 20, 30)',
  });
});
