// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/HoverCard ^apps/storybook/stories/HoverCardSecondDocumentA11y

/**
 * @file HoverCardSecondDocument.a11y.chromium.spec.ts
 * @input The built a11y/HoverCard in a second document story; real Chromium
 *   keyboard and mouse input inside a same-origin iframe and a Document
 *   Picture-in-Picture window
 * @output Browser evidence that a card in either document closes on Escape
 *   pressed there, and that Escape from inside the card returns focus to its trigger
 * @position Chromium proof for component:HoverCard FR6 in a second document.
 *   The jsdom cases in HoverCard.test.tsx check the same paths against
 *   stand-in popovers.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
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

async function openFrame(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=a11y-hovercard-in-a-second-document--second-document&viewMode=story`,
  );
  await holdMotionStill(page);
  const frame = page.frameLocator('iframe[title="Second document"]');
  await expect(frame.getByRole('button', {name: 'Rowan'})).toBeVisible();
  // Keys go to the focused document: put it in the frame, where a user who
  // works there has it.
  const frameHandle = page.frame({url: /^about:srcdoc/});
  if (frameHandle == null) {
    throw new Error('the story has no srcdoc frame');
  }
  await frameHandle.evaluate(() => window.focus());
  return frame;
}

test('Escape pressed in the frame closes the card there', async ({page}) => {
  const frame = await openFrame(page);
  await frame.getByRole('button', {name: 'Rowan'}).hover();
  const message = frame.getByRole('button', {name: 'Message'});
  await expect(message).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(message).toBeHidden();
});

test('Escape from inside the card returns focus to its trigger', async ({
  page,
}) => {
  const frame = await openFrame(page);
  const trigger = frame.getByRole('button', {name: 'Rowan'});
  await trigger.hover();
  const message = frame.getByRole('button', {name: 'Message'});
  await expect(message).toBeVisible();
  await message.focus();

  await page.keyboard.press('Escape');
  await expect(message).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('Escape pressed in a Picture-in-Picture window closes the card there, and focus returns to its trigger', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=a11y-hovercard-in-a-second-document--second-document&viewMode=story`,
  );
  await holdMotionStill(page);
  // Opening the window needs a user gesture; the click is one.
  const [pictureInPicture] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByRole('button', {name: 'Pop out'}).click(),
  ]);
  const trigger = pictureInPicture.getByRole('button', {name: 'Rowan'});
  await expect(trigger).toBeVisible();

  await trigger.hover();
  const message = pictureInPicture.getByRole('button', {name: 'Message'});
  await expect(message).toBeVisible();
  await pictureInPicture.keyboard.press('Escape');
  await expect(message).toBeHidden();

  // Leave the trigger first: a hover where the pointer already rests fires no
  // mouseenter.
  await pictureInPicture.mouse.move(0, 0);
  await trigger.hover();
  await expect(message).toBeVisible();
  await message.focus();
  await pictureInPicture.keyboard.press('Escape');
  await expect(message).toBeHidden();
  await expect(trigger).toBeFocused();
});
