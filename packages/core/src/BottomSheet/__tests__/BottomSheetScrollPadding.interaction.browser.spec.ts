// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetScrollPadding.interaction.browser.spec.ts
 * @input Playwright, the interaction harness, the Mobile keyboard story, and a
 *   stand-in visual viewport the test shrinks as an on-screen keyboard does
 * @output Tests that a Tall sheet's body pads its end only while the keyboard
 *   covers the sheet. With a fine pointer and no keyboard, a field Tab moves
 *   to stops at the body's end, as in other scroll areas.
 * @position Browser tests for BottomSheet's scroll padding
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

// The cover Mobile Safari reports on an iPhone 17 Pro (keyboard, accessory
// bar and the floating address bar).
const COVER = 337;

/**
 * Replaces `window.visualViewport` before the page loads with one the test
 * drives: `__keyboard(cover)` shrinks it from the bottom and fires one
 * `resize`, as Mobile Safari does.
 */
async function installKeyboard(page: Page) {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Navigator.prototype, 'virtualKeyboard');
    const viewport = Object.assign(new EventTarget(), {
      height: window.innerHeight,
      width: window.innerWidth,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      get: () => viewport,
    });
    (window as unknown as {__keyboard: (cover: number) => void}).__keyboard =
      cover => {
        viewport.height = window.innerHeight - cover;
        viewport.dispatchEvent(new Event('resize'));
      };
  });
}

/** The field's scrolling body: its padding, and where the field ends in it. */
const readBody = async (field: Locator) =>
  field.evaluate(element => {
    let body = element.parentElement;
    while (body != null && getComputedStyle(body).overflowY !== 'auto') {
      body = body.parentElement;
    }
    if (body == null) {
      throw new Error('no scrolling body');
    }
    return {
      scrollPadding: getComputedStyle(body).scrollPaddingBlockEnd,
      gap:
        body.getBoundingClientRect().bottom -
        element.getBoundingClientRect().bottom,
    };
  });

/** Scrolls the body so `field`'s top shows `peek` px above the body's end. */
const peekAtEnd = async (field: Locator, peek: number) =>
  field.evaluate((element, px) => {
    let body = element.parentElement;
    while (body != null && getComputedStyle(body).overflowY !== 'auto') {
      body = body.parentElement;
    }
    if (body == null) {
      throw new Error('no scrolling body');
    }
    const top = element.getBoundingClientRect().top;
    const end = body.getBoundingClientRect().bottom;
    body.scrollTop += top - (end - px);
  }, peek);

const openSheet = async (page: Page) => {
  await openStory(page, storybook(), 'core-bottomsheet--mobile-keyboard');
  await page.getByRole('button', {name: 'Add a comment'}).click();
  const dialog = page.getByRole('dialog', {name: 'Add a comment'});
  await expect(dialog).toBeVisible();
  // Let the sheet settle fully expanded.
  await page.waitForTimeout(800);
  return dialog;
};

test.describe('with a fine pointer and no keyboard', () => {
  test.use({hasTouch: false, isMobile: false});

  test('a field Tab moves to stops at the body\u2019s end, with no scroll padding', async ({
    page,
  }) => {
    const dialog = await openSheet(page);
    const fields = dialog.getByRole('textbox');
    const count = await fields.count();
    // A field with more content below it, so the body can scroll past it.
    const target = fields.nth(count - 2);
    const before = fields.nth(count - 3);
    // Its top shows 15 px above the body's end. Within 48 px of padding, the
    // browser centres it. With none, it scrolls it only to the end.
    await peekAtEnd(target, 15);
    await before.focus();
    await page.keyboard.press('Tab');
    await expect(target).toBeFocused();
    const {scrollPadding, gap} = await readBody(target);
    expect(scrollPadding).toBe('auto');
    expect(Math.abs(gap)).toBeLessThanOrEqual(1);
  });
});

test.describe('under an on-screen keyboard', () => {
  test.use({hasTouch: true, isMobile: true});

  test('pads the body\u2019s end by the field\u2019s 10 px clearance while the keyboard covers the sheet', async ({
    page,
  }) => {
    await installKeyboard(page);
    const dialog = await openSheet(page);
    const last = dialog.getByRole('textbox').last();
    expect((await readBody(last)).scrollPadding).toBe('auto');
    await last.focus();
    await page.evaluate(
      cover =>
        (window as unknown as {__keyboard: (c: number) => void}).__keyboard(
          cover,
        ),
      COVER,
    );
    await expect
      .poll(async () => (await readBody(last)).scrollPadding)
      .toBe('10px');
  });
});
