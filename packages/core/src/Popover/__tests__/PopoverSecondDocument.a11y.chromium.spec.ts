// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file PopoverSecondDocument.a11y.chromium.spec.ts
 * @input Uses @playwright/test, the a11y-spec static Storybook server, and the
 *   checked-in PopoverSecondDocumentA11y story
 * @output Real-browser evidence that a Popover rendered into a second document
 *   (a same-origin iframe, a Document Picture-in-Picture window) focuses its
 *   first control on open, keeps Tab inside, closes on Escape through the layer
 *   stack with and without light dismiss, hands focus back to its trigger after
 *   an outside click, and scrolls once its own window is too short for it or
 *   its content grows past it, exactly as the same Popover does in the page.
 * @position The half of the second-document rule jsdom cannot honestly reach:
 *   real key delivery to another window, native light dismiss, the browser's
 *   own close watcher, and layout in another window. The Vitest cases in
 *   `Popover/Popover.test.tsx` model the same rule with an iframe.
 *
 * SYNC: Fixture lives in
 *   /apps/storybook/stories/PopoverSecondDocumentA11y.stories.tsx.
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

const STORY_ID = 'a11y-popover-in-a-second-document--second-documents';

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
  /** Give the document's own window this height, in CSS pixels. */
  resize: (height: number) => Promise<void>;
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
    const viewport = page.viewportSize();
    if (viewport == null) {
      throw new Error('the page has no viewport size');
    }
    return {
      frame: page.mainFrame(),
      keyboard: page.keyboard,
      resize: async height => {
        await page.setViewportSize({width: viewport.width, height});
      },
    };
  }
  if (where === 'iframe') {
    const element = await page
      .locator('iframe[title="Second document"]')
      .elementHandle();
    const frame = await element?.contentFrame();
    if (element == null || frame == null) {
      throw new Error('the story renders no iframe');
    }
    await frame.getByRole('button', {name: 'Settings', exact: true}).waitFor();
    // Key presses go to whichever frame holds focus; the clicks below put it
    // in this one.
    return {
      frame,
      keyboard: page.keyboard,
      // The frame's window is as tall as the iframe element.
      resize: async height => {
        await element.evaluate((iframe, to) => {
          (iframe as HTMLElement).style.height = `${to}px`;
        }, height);
      },
    };
  }
  // Opening the window needs a user gesture; the click is one.
  const [pictureInPicture] = await Promise.all([
    page.context().waitForEvent('page'),
    popOut.click(),
  ]);
  await pictureInPicture
    .getByRole('button', {name: 'Settings', exact: true})
    .waitFor();
  const pictureInPictureViewport = pictureInPicture.viewportSize();
  if (pictureInPictureViewport == null) {
    throw new Error('the Picture-in-Picture window has no viewport size');
  }
  return {
    frame: pictureInPicture.mainFrame(),
    keyboard: pictureInPicture.keyboard,
    resize: async height => {
      await pictureInPicture.setViewportSize({
        width: pictureInPictureViewport.width,
        height,
      });
    },
  };
}

/** Open a popover from its trigger with the pointer; returns the trigger. */
async function open(frame: Frame, name: string): Promise<Locator> {
  const trigger = frame.getByRole('button', {name, exact: true});
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(frame.getByRole('dialog', {name, exact: true})).toBeVisible();
  return trigger;
}

for (const where of [
  'page',
  'iframe',
  'Picture-in-Picture window',
] as const satisfies ReadonlyArray<Where>) {
  test.describe(`a Popover in the ${where}`, () => {
    test('focuses its first control on open', async ({page}) => {
      const {frame} = await mountStory(page, where);
      await open(frame, 'Settings');

      await expect(frame.getByRole('button', {name: 'First'})).toBeFocused();
    });

    test('keeps Tab inside: past the last control, focus wraps to the first', async ({
      page,
    }) => {
      const {frame, keyboard} = await mountStory(page, where);
      await open(frame, 'Settings');
      const first = frame.getByRole('button', {name: 'First'});
      await first.focus();

      // First, Last, the fallback Close popover control, then First again.
      for (let press = 0; press < 3; press++) {
        await keyboard.press('Tab');
      }
      await expect(first).toBeFocused();
    });

    test('closes on Escape with light dismiss off, and focus returns to the trigger', async ({
      page,
    }) => {
      const {frame, keyboard} = await mountStory(page, where);
      const trigger = await open(frame, 'Pinned settings');

      await keyboard.press('Escape');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger).toBeFocused();
    });

    test('closes on Escape through the layer stack with light dismiss on', async ({
      page,
    }) => {
      const {frame, keyboard} = await mountStory(page, where);
      const trigger = await open(frame, 'Settings');
      // The stack claims a press it handles with preventDefault(), so the
      // browser's own close watcher does not act on it too. A window listener
      // runs after the stack's document listener and reads that claim.
      await frame.evaluate(() => {
        window.addEventListener('keydown', event => {
          if (event.key === 'Escape') {
            document.body.dataset.escapeClaimed = String(
              event.defaultPrevented,
            );
          }
        });
      });

      await keyboard.press('Escape');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(
        await frame.evaluate(() => document.body.dataset.escapeClaimed),
      ).toBe('true');
      await expect(trigger).toBeFocused();
    });

    test('closes on an outside click, and focus returns to the trigger', async ({
      page,
    }) => {
      const {frame} = await mountStory(page, where);
      const trigger = await open(frame, 'Settings');

      await frame.getByText('Outside', {exact: true}).click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger).toBeFocused();
    });

    test('scrolls once its own window is too short for it, and stops once it fits', async ({
      page,
    }) => {
      const {frame, resize} = await mountStory(page, where);
      await resize(700);
      await open(frame, 'Long list');
      const surface = frame.getByRole('dialog', {name: 'Long list'});
      await expect(surface).toHaveCSS('overflow-y', 'visible');

      await resize(240);
      await expect(surface).toHaveCSS('overflow-y', 'auto');
      await resize(700);
      await expect(surface).toHaveCSS('overflow-y', 'visible');
    });

    test('scrolls once its content grows past its window', async ({page}) => {
      const {frame, resize} = await mountStory(page, where);
      await resize(700);
      await open(frame, 'Long list');
      const surface = frame.getByRole('dialog', {name: 'Long list'});
      await expect(surface).toHaveCSS('overflow-y', 'visible');

      // An inline style is an attribute change the popover's mutation
      // observer ignores, so only its ResizeObserver can see the growth.
      await surface.evaluate(element => {
        (element.firstElementChild as HTMLElement).style.minHeight = '2000px';
      });
      await expect(surface).toHaveCSS('overflow-y', 'auto');
    });

    if (where !== 'page') {
      test('an Escape press affects only the document it was made in', async ({
        page,
      }) => {
        const {frame, keyboard} = await mountStory(page, where);
        // Opened first, so one order across both documents would put the
        // page's popover above this one.
        const there = await open(frame, 'Pinned settings');
        const here = await open(page.mainFrame(), 'Pinned settings');

        await frame.getByRole('button', {name: 'First'}).click();
        await keyboard.press('Escape');
        await expect(there).toHaveAttribute('aria-expanded', 'false');
        await expect(here).toHaveAttribute('aria-expanded', 'true');

        await page.mainFrame().getByRole('button', {name: 'First'}).click();
        await page.keyboard.press('Escape');
        await expect(here).toHaveAttribute('aria-expanded', 'false');
      });
    }
  });
}
