// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pointer.interaction.browser.spec.ts
 * @input Real Chromium/WebKit in the interaction projects (the touch phone)
 * @output Proof that `newFinePointerPage` gives a page that reads a fine
 *   pointer, that a context made inside a test does not, and that the guards
 *   catch both.
 * @position Why a fine-pointer case may trust `newFinePointerPage`.
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {
  assertCoarsePointer,
  assertFinePointer,
  newFinePointerPage,
  readPointer,
} from './index';

test('a context made inside a test inherits the touch phone: the guard catches it', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: {width: 1280, height: 800},
  });
  try {
    const page = await context.newPage();
    expect((await readPointer(page)).coarse).toBe(true);
    await expect(assertFinePointer(page)).rejects.toThrow(
      /Not a fine pointer: the page reads \(pointer: coarse\) true/,
    );
  } finally {
    await context.close();
  }
});

test('newFinePointerPage reads a fine pointer with hover and no touch', async ({
  browser,
}) => {
  const {context, page} = await newFinePointerPage(browser);
  try {
    expect(await readPointer(page)).toEqual({
      coarse: false,
      fine: true,
      anyCoarse: false,
      hover: true,
      maxTouchPoints: 0,
    });
    await page.setContent(
      '<style>@media (pointer: coarse) { p { color: red } }</style><p>x</p>',
    );
    expect(
      await page.locator('p').evaluate(p => getComputedStyle(p).color),
    ).toBe('rgb(0, 0, 0)');
    await expect(assertCoarsePointer(page)).rejects.toThrow(
      /Not a coarse pointer/,
    );
  } finally {
    await context.close();
  }
});

test('options cannot turn touch back on', async ({browser}) => {
  const {context, page} = await newFinePointerPage(browser, {
    hasTouch: true,
    isMobile: true,
    viewport: {width: 800, height: 600},
  });
  try {
    expect((await readPointer(page)).fine).toBe(true);
    expect(page.viewportSize()).toEqual({width: 800, height: 600});
  } finally {
    await context.close();
  }
});

test("the phone project's own page reads a coarse pointer", async ({page}) => {
  await assertCoarsePointer(page);
  await expect(assertFinePointer(page)).rejects.toThrow(/Not a fine pointer/);
});
