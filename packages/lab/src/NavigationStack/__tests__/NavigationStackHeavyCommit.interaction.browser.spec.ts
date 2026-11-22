// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file NavigationStackHeavyCommit.interaction.browser.spec.ts
 * @input The built Storybook's NavigationStack Settings story, in Chromium
 *   and WebKit on the phone profile
 * @output Proof that a push or a pop from rest starts at its first presented
 *   frame: a block before that frame delays the motion, and skips none of it
 * @position High-fidelity lane for NavigationStack's draft record. A frame's
 *   timing needs a real engine
 *
 * SYNC: The story this reads is Settings in
 *   apps/storybook/stories/NavigationStack.stories.tsx.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

/** How long the first frame after the change blocks the main thread. */
const BLOCK_MS = 300;

/** Where a card is in the first frame after a blocked commit, and its travel. */
interface FirstFrame {
  left: number;
  width: number;
}

/**
 * Blocks the main thread for BLOCK_MS in the first frame after the next
 * click, before that frame paints, and resolves with where the card
 * `selector` names is then. Call it before the click and await it after.
 */
function blockFirstFrameAfterClick(
  page: Page,
  selector: string,
): Promise<FirstFrame | null> {
  return page.evaluate(
    ([cardSelector, ms]) =>
      new Promise<FirstFrame | null>(resolve => {
        document.addEventListener(
          'click',
          () => {
            requestAnimationFrame(() => {
              const end = performance.now() + ms;
              while (performance.now() < end) {
                // The commit's heavy work, before the frame paints.
              }
              const card = document.querySelector(cardSelector);
              const cards = card?.parentElement;
              resolve(
                card == null || cards == null
                  ? null
                  : {
                      left: card.getBoundingClientRect().left,
                      width: cards.clientWidth,
                    },
              );
            });
          },
          {capture: true, once: true},
        );
      }),
    [selector, BLOCK_MS] as const,
  );
}

const SCREEN = '[data-navigation-screen="screen-General"]';

/** Waits until no animation runs on the root's and General's cards. */
async function settled(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(
          document.querySelectorAll('[data-navigation-screen]'),
        ).reduce((count, card) => count + card.getAnimations().length, 0),
      ),
    )
    .toBe(0);
}

test('a push from rest starts at its first presented frame, when its commit blocks the main thread', async ({
  page,
}) => {
  await openStory(page, storybook(), 'lab-navigationstack--settings');
  const first = blockFirstFrameAfterClick(page, SCREEN);
  await page.getByRole('button', {name: 'General', exact: true}).tap();
  const frame = await first;
  if (frame == null) {
    throw new Error('The pushed card was not in the first frame.');
  }
  // The pushed card enters from the trailing edge: in its first frame, most
  // of its travel is still ahead.
  expect(frame.left).toBeGreaterThan(frame.width * 0.5);
});

test('a pop from rest starts at its first presented frame, when its commit blocks the main thread', async ({
  page,
}) => {
  await openStory(page, storybook(), 'lab-navigationstack--settings');
  await page.getByRole('button', {name: 'General', exact: true}).tap();
  await expect(page.locator(SCREEN)).toHaveAttribute('data-navigation-top');
  await settled(page);
  const first = blockFirstFrameAfterClick(page, SCREEN);
  await page.locator('[data-navigation-back]').tap();
  const frame = await first;
  if (frame == null) {
    throw new Error('The popped card was not in the first frame.');
  }
  // The popped card leaves toward the trailing edge: in its first frame,
  // most of its travel is still ahead.
  expect(frame.left).toBeLessThan(frame.width * 0.5);
});
