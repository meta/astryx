// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pointer.ts
 * @input Uses a Playwright `Browser` and `Page` (Chromium or WebKit)
 * @output `desktop` (the fine-pointer browser context), `newFinePointerPage`
 *   (a page in that context, checked), and the guards `assertFinePointer` /
 *   `assertCoarsePointer`.
 * @position The other half of every "under a finger" proof: touch work must
 *   cost nothing under a fine pointer, and a proof of that has to run under a
 *   pointer the page really reads as fine.
 *
 * A context a test makes with `browser.newContext()` inherits the project's
 * own `use` options, and every interaction project is the touch phone: such a
 * context matches `(pointer: coarse)` unless it says `hasTouch: false` itself
 * (measured with Playwright 1.61, Chromium and WebKit). So a fine-pointer case
 * opens its page through `newFinePointerPage`, which forces `hasTouch: false`
 * and `isMobile: false` and fails before the test's checks when the page still
 * reads a coarse pointer.
 */

import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Page,
} from '@playwright/test';

/** A desktop browser with a mouse: fine pointer, hover, no touch. */
export const desktop = {
  viewport: {width: 1280, height: 800},
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
} as const;

/** What the page itself reads about its pointer. */
export interface PointerReading {
  coarse: boolean;
  fine: boolean;
  anyCoarse: boolean;
  hover: boolean;
  maxTouchPoints: number;
}

export async function readPointer(page: Page): Promise<PointerReading> {
  return page.evaluate(() => ({
    coarse: matchMedia('(pointer: coarse)').matches,
    fine: matchMedia('(pointer: fine)').matches,
    anyCoarse: matchMedia('(any-pointer: coarse)').matches,
    hover: matchMedia('(hover: hover)').matches,
    maxTouchPoints: navigator.maxTouchPoints,
  }));
}

/**
 * Fails loudly unless the page reads a fine primary pointer and no coarse
 * one. Call it before a fine-pointer case's checks when the case makes its
 * own context.
 */
export async function assertFinePointer(page: Page): Promise<void> {
  const reading = await readPointer(page);
  if (reading.coarse || !reading.fine || reading.anyCoarse) {
    throw new Error(
      `Not a fine pointer: the page reads (pointer: coarse) ${reading.coarse}, ` +
        `(pointer: fine) ${reading.fine}, (any-pointer: coarse) ${reading.anyCoarse}. ` +
        'A context made inside a test inherits the touch phone project; open the ' +
        'page with newFinePointerPage(browser), or pass hasTouch: false and ' +
        'isMobile: false yourself.',
    );
  }
}

/** Fails loudly unless the page reads a coarse primary pointer. */
export async function assertCoarsePointer(page: Page): Promise<void> {
  const reading = await readPointer(page);
  if (!reading.coarse || reading.fine) {
    throw new Error(
      `Not a coarse pointer: the page reads (pointer: coarse) ${reading.coarse}, ` +
        `(pointer: fine) ${reading.fine}. Run the case in the phone project's own ` +
        'page, or a context with hasTouch: true.',
    );
  }
}

/**
 * Opens a page under a fine pointer: the `desktop` context, with `options`
 * layered on top (a viewport, a color scheme), except that touch and mobile
 * stay off. Checks the pointer before returning. Close the context when done.
 */
export async function newFinePointerPage(
  browser: Browser,
  options: BrowserContextOptions = {},
): Promise<{context: BrowserContext; page: Page}> {
  const context = await browser.newContext({
    ...desktop,
    ...options,
    isMobile: false,
    hasTouch: false,
  });
  const page = await context.newPage();
  await assertFinePointer(page);
  return {context, page};
}
