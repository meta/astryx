// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file DropdownMenuSecondDocument.a11y.chromium.spec.ts
 * @input Uses @playwright/test, the a11y-spec static Storybook server, and the
 *   checked-in DropdownMenuSecondDocumentA11y story
 * @output Real-browser evidence that a mouse press opens a DropdownMenu whose
 *   trigger sits in a second document (a same-origin iframe, a Document
 *   Picture-in-Picture window, a window that `window.open` opens), and that
 *   the menu stays open through that press's release. Enter opens it too.
 * @position The second-document half of the press-open rule that jsdom cannot
 *   reach: native light dismiss on another window's release.
 * SYNC: Fixture lives in
 *   /apps/storybook/stories/DropdownMenuSecondDocumentA11y.stories.tsx.
 */

import {
  expect,
  test,
  type Frame,
  type Keyboard,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY_ID = 'a11y-dropdownmenu-in-a-second-document--second-documents';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

type Where = 'iframe' | 'Picture-in-Picture window' | 'popup window';

/** One second document: where its controls live and where input goes. */
interface Surface {
  frame: Frame;
  keyboard: Keyboard;
}

/** Load the story and return the second document the test drives. */
async function mountStory(page: Page, where: Where): Promise<Surface> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY_ID}&viewMode=story`,
    {waitUntil: 'load'},
  );
  await holdMotionStill(page);
  if (where === 'iframe') {
    const element = await page
      .locator('iframe[title="Second document"]')
      .elementHandle();
    const frame = await element?.contentFrame();
    if (element == null || frame == null) {
      throw new Error('the story renders no iframe');
    }
    await frame.getByRole('button', {name: 'Actions'}).waitFor();
    return {frame, keyboard: page.keyboard};
  }
  const opener = page.getByRole('button', {
    name: where === 'popup window' ? 'Open window' : 'Pop out',
  });
  // Opening the window needs a user gesture; the click is one.
  const [opened] = await Promise.all([
    page.context().waitForEvent('page'),
    opener.click(),
  ]);
  await opened.getByRole('button', {name: 'Actions'}).waitFor();
  return {
    frame: opened.mainFrame(),
    keyboard: opened.keyboard,
  };
}

for (const where of [
  'iframe',
  'Picture-in-Picture window',
  'popup window',
] as const) {
  test.describe(`a menu whose trigger is in ${
    where === 'iframe' ? 'an iframe' : `a ${where}`
  }`, () => {
    test('a mouse press opens it, and it stays open through the release', async ({
      page,
    }) => {
      const surface = await mountStory(page, where);
      const trigger = surface.frame.getByRole('button', {name: 'Actions'});
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await expect(
        surface.frame.getByRole('menu', {name: 'Actions'}),
      ).toBeVisible();
      await expect(surface.frame.getByTestId('clicks')).toHaveText('1');
    });

    test('Enter opens it', async ({page}) => {
      const surface = await mountStory(page, where);
      const trigger = surface.frame.getByRole('button', {name: 'Actions'});
      await trigger.focus();
      await surface.keyboard.press('Enter');
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    test('Escape closes it and hands focus back to the trigger', async ({
      page,
    }) => {
      const surface = await mountStory(page, where);
      const trigger = surface.frame.getByRole('button', {name: 'Actions'});
      await trigger.focus();
      await surface.keyboard.press('Enter');
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await surface.keyboard.press('Escape');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger).toBeFocused();
    });
  });
}
