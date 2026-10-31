// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Dialog/|packages/core/src/utils/(focusReturn|interactionModality)\.ts|apps/storybook/stories/DialogSecondDocumentA11y)

/**
 * @file DialogSecondDocument.a11y.browser.spec.ts
 * @input Uses @playwright/test, the a11y-spec static Storybook server, and the
 *   checked-in DialogSecondDocumentA11y story
 * @output Real-browser evidence that a Dialog rendered into a second document
 *   (a same-origin iframe, a Document Picture-in-Picture window) returns focus
 *   to the control that opened it when it closes, by Escape or by a control
 *   inside it, exactly as the same Dialog does in the page, with the focus
 *   ring that close's input calls for, a text field that opened it keeping
 *   its ring with no extra blur; and that a Dialog in an iframe opened by a
 *   control in the page returns focus to that control.
 * @position The half of Dialog's focus return jsdom cannot reach: which
 *   document holds focus, and the browser's own focus restore when a modal
 *   dialog closes. The Vitest case in `Dialog/Dialog.test.tsx` models the
 *   same rule with an iframe. Document Picture-in-Picture is Chromium's
 *   alone, so the window's cases skip in other engines; the page and the
 *   iframe run everywhere.
 *
 * SYNC: Fixture lives in
 *   /apps/storybook/stories/DialogSecondDocumentA11y.stories.tsx.
 */

import {
  expect,
  test,
  type Frame,
  type Keyboard,
  type Locator,
  type Page,
} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY_ID = 'a11y-dialog-in-a-second-document--second-documents';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

type Where = 'page' | 'iframe' | 'Picture-in-Picture window';

/** One document of the story: where its controls live and where keys go. */
interface Surface {
  frame: Frame;
  keyboard: Keyboard;
}

/** Load the story and return the document the test drives. */
async function mountStory(page: Page, where: Where): Promise<Surface> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY_ID}&viewMode=story`,
    {waitUntil: 'load'},
  );
  await holdMotionStill(page);
  const popOut = page.getByRole('button', {name: 'Pop out'});
  await popOut.waitFor();

  if (where === 'page') {
    return {frame: page.mainFrame(), keyboard: page.keyboard};
  }
  if (where === 'iframe') {
    const element = await page
      .locator('iframe[title="Second document"]')
      .elementHandle();
    const frame = await element?.contentFrame();
    if (frame == null) {
      throw new Error('the story renders no iframe');
    }
    await frame
      .getByRole('button', {name: 'Open dialog', exact: true})
      .waitFor();
    // Key presses go to whichever frame holds focus; the clicks below put it
    // in this one.
    return {frame, keyboard: page.keyboard};
  }
  // Opening the window needs a user gesture; the click is one.
  const [pictureInPicture] = await Promise.all([
    page.context().waitForEvent('page'),
    popOut.click(),
  ]);
  await pictureInPicture
    .getByRole('button', {
      name: 'Open dialog',
      exact: true,
    })
    .waitFor();
  return {
    frame: pictureInPicture.mainFrame(),
    keyboard: pictureInPicture.keyboard,
  };
}

/** Whether the element matches `:focus-visible`, i.e. would show a ring. */
async function showsRing(element: Locator): Promise<boolean> {
  return element.evaluate(node => node.matches(':focus-visible'));
}

/** Open the dialog from its control with the pointer; returns the control. */
async function open(frame: Frame): Promise<{opener: Locator; dialog: Locator}> {
  const opener = frame.getByRole('button', {name: 'Open dialog', exact: true});
  await opener.click();
  const dialog = frame.getByRole('dialog', {name: 'Review changes'});
  await expect(dialog).toBeVisible();
  return {opener, dialog};
}

for (const where of [
  'page',
  'iframe',
  'Picture-in-Picture window',
] as const satisfies ReadonlyArray<Where>) {
  test.describe(`a Dialog in the ${where}`, () => {
    test.skip(
      ({browserName}) =>
        where === 'Picture-in-Picture window' && browserName !== 'chromium',
      'Document Picture-in-Picture is a Chromium API',
    );

    test('closing with Escape returns focus to the control that opened it', async ({
      page,
    }) => {
      const {frame, keyboard} = await mountStory(page, where);
      const {opener, dialog} = await open(frame);

      await keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(opener).toBeFocused();
      // A key closed it, so the ring shows (`architecture:interaction-modality`
      // INV1), whatever the page's own last input was (a pointer press on Pop
      // out, for the Picture-in-Picture window).
      await expect.poll(async () => showsRing(opener)).toBe(true);
    });

    test('closing from a control inside returns focus to the control that opened it', async ({
      page,
    }) => {
      const {frame} = await mountStory(page, where);
      const {opener, dialog} = await open(frame);

      await frame.getByRole('button', {name: 'Close dialog'}).click();
      await expect(dialog).toBeHidden();
      await expect(opener).toBeFocused();
      // A pointer closed it, so no ring.
      await expect.poll(async () => showsRing(opener)).toBe(false);
    });

    test('a text field that opened it keeps focus and its ring after a pointer close', async ({
      page,
    }) => {
      const {frame} = await mountStory(page, where);
      const field = frame.getByRole('textbox', {name: 'Search'});
      await field.click();
      await field.press('Enter');
      const dialog = frame.getByRole('dialog', {name: 'Review changes'});
      await expect(dialog).toBeVisible();
      // Count the field's blurs from here on: the open already moved focus
      // away, so any blur now would be the return's own.
      await field.evaluate(node => {
        node.dataset.blurs = '0';
        node.addEventListener('blur', () => {
          node.dataset.blurs = String(Number(node.dataset.blurs) + 1);
        });
      });

      await frame.getByRole('button', {name: 'Close dialog'}).click();
      await expect(dialog).toBeHidden();
      await expect(field).toBeFocused();
      // A text field shows where typing goes whatever moved focus there.
      await expect.poll(async () => showsRing(field)).toBe(true);
      await expect(field).toHaveAttribute('data-blurs', '0');
    });
  });
}

test.describe('a Dialog in the iframe that a control in the page opens', () => {
  test('closing with Escape returns focus to that control', async ({page}) => {
    const {frame, keyboard} = await mountStory(page, 'iframe');
    const opener = page.getByRole('button', {name: 'Open dialog in the frame'});
    await opener.click();
    const dialog = frame.getByRole('dialog', {name: 'Opened from the page'});
    await expect(dialog).toBeVisible();

    await keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });
});
