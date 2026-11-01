// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatPastedTextTokenTap.a11y.browser.spec.ts
 * @input The `Core/ChatComposerInput` Controlled story in a built Storybook,
 *   with a long paste turned into a pasted-text token, in Chromium and WebKit.
 * @output Real-browser proof that a touch tap on a pasted-text token opens its
 *   preview and stops there: the composer around it takes no focus and no
 *   caret (which on a phone would raise the keyboard over the preview), while
 *   a mouse click on the token still places the caret in the composer and
 *   mouse hover still opens the preview.
 * @position Run with `pnpm test:a11y-contract`. Focus and caret placement from
 *   a press need a real browser: jsdom moves neither.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY = 'core-chatcomposerinput--controlled';
/** Long enough (over 200 characters) for the default paste-as-token rule. */
const PASTED = Array.from(
  {length: 12},
  (_, i) => `line ${i + 1} of the pasted text`,
).join('\n');
/** Text only the token's preview shows. */
const PREVIEW_TEXT = 'line 12 of the pasted text';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

/**
 * Opens the story, pastes the long text into the composer, and returns the
 * token it became, with focus taken out of the composer again.
 */
async function pastedToken(page: Page): Promise<Locator> {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  const composer = page.getByRole('textbox', {name: 'Message input'});
  await composer.waitFor();
  await composer.evaluate((element, text) => {
    (element as HTMLElement).focus();
    const data = new DataTransfer();
    data.setData('text/plain', text);
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, PASTED);
  const token = composer.locator('[contenteditable="false"]');
  // One token, painted: the presses below land on something real.
  await expect(token).toHaveCount(1);
  const box = await token.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    document.getSelection()?.removeAllRanges();
  });
  return token;
}

/**
 * Whether the composer has focus or holds the caret. Throws when there is no
 * composer, so a missing one never reads as "no focus, no caret".
 */
async function composerState(page: Page) {
  return page.evaluate(() => {
    const composers = document.querySelectorAll('[aria-label="Message input"]');
    if (composers.length !== 1) {
      throw new Error(`expected one composer, found ${composers.length}`);
    }
    const composer = composers[0];
    const selection = document.getSelection();
    const anchor = selection?.anchorNode ?? null;
    return {
      focused: document.activeElement === composer,
      caret:
        selection != null &&
        selection.rangeCount > 0 &&
        anchor != null &&
        composer.contains(anchor),
    };
  });
}

/**
 * The preview: the pasted text in full, in the token's hover card (a popover
 * layer), apart from the story's own readout of the composer's value.
 */
function preview(page: Page): Locator {
  return page.locator('[popover]').getByText(PREVIEW_TEXT);
}

test.describe('a touch tap on a pasted-text token', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: {width: 390, height: 844},
  });

  test('opens its preview and leaves the composer without focus or caret', async ({
    page,
  }) => {
    const token = await pastedToken(page);
    const box = await token.boundingBox();
    if (box == null) {
      throw new Error('the token has no layout box');
    }
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

    await expect(preview(page)).toBeVisible();
    // The tap asked for the preview, so the composer did not go on to take
    // focus and the caret, which on a phone raises the keyboard over it.
    expect(await composerState(page)).toEqual({focused: false, caret: false});
  });
});

test.describe('a mouse on a pasted-text token', () => {
  test('hover opens its preview', async ({page}) => {
    const token = await pastedToken(page);
    await token.hover();

    await expect(preview(page)).toBeVisible();
  });

  test('a click places the caret in the composer, as before', async ({
    page,
  }) => {
    const token = await pastedToken(page);
    await token.click();

    await expect
      .poll(async () => composerState(page))
      .toEqual({focused: true, caret: true});
  });
});
