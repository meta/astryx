// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatMessageListVirtualization.interaction.browser.spec.ts
 * @input The `Core/ChatMessageList virtualization` Long Conversation story
 *   in a built Storybook: 5,000 messages windowed inside ChatLayout, with a
 *   streaming reply and jumps through `scrollToItem`
 * @output Real-browser evidence that the windowed list opens at its newest
 *   message and follows a streamed reply, keeps the end in place when a
 *   message above the newest gets shorter, in either order of the clamp's
 *   scroll event and the row's size, and reveals a message that is not
 *   mounted when its rows are shorter than their estimates
 * @position Browser proof beside ChatMessageList.virtualization.test.tsx,
 *   whose scripted layout cannot show the browser's own clamping and wrapping
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  frames,
  openStory,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const STORY = 'core-chatmessagelist-virtualization--long-conversation';

/** How far the position is from the end of the scroll range, in CSS px. */
async function distanceFromEnd(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('.astryx-chat-layout');
    if (scroller == null) {
      throw new Error('No ChatLayout scroll container');
    }
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
  });
}

/**
 * Streams the story's reply and waits until its last word has arrived. The
 * follow can take one more spring frame to reach the end, so callers poll.
 */
async function streamReply(page: Page): Promise<void> {
  const button = page.getByRole('button', {name: 'Stream a reply'});
  await button.click();
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', {
    timeout: 10_000,
  });
  await page.evaluate(async () => {
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

/** Where a message's row starts below the scrollport's top, in CSS px. */
async function offsetFromTop(page: Page, prefix: string): Promise<number> {
  return page.evaluate(text => {
    const scroller = document.querySelector<HTMLElement>('.astryx-chat-layout');
    const row = [
      ...(scroller?.querySelectorAll('.astryx-chat-message') ?? []),
    ].find(message => message.textContent?.startsWith(text));
    if (scroller == null || row == null) {
      throw new Error(`No mounted message starts with "${text}"`);
    }
    return (
      row.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    );
  }, prefix);
}

test('opens at the newest message and follows a streamed reply', async ({
  page,
}) => {
  await openStory(page, storybook(), STORY);
  expect(await distanceFromEnd(page)).toBeLessThan(1);
  await streamReply(page);
  await expect.poll(async () => distanceFromEnd(page)).toBeLessThan(1);
});

test('keeps the end in place when a message above the newest gets shorter', async ({
  page,
}) => {
  await openStory(page, storybook(), STORY);
  // The content gets shorter above the end, so the browser clamps the
  // position; the list must not read that as the reader's scroll.
  await page.evaluate(() => {
    const rows = [
      ...document.querySelectorAll<HTMLElement>(
        '.astryx-chat-layout .astryx-chat-message',
      ),
    ];
    const above = rows.at(-2);
    if (above == null) {
      throw new Error('No message above the newest');
    }
    above.style.height = `${above.getBoundingClientRect().height - 40}px`;
    above.style.overflow = 'hidden';
  });
  await expect.poll(async () => distanceFromEnd(page)).toBeLessThan(1);
  await streamReply(page);
  await expect.poll(async () => distanceFromEnd(page)).toBeLessThan(1);
});

test('keeps the end when the clamp’s scroll event comes before the shorter message’s size', async ({
  page,
}) => {
  await openStory(page, storybook(), STORY);
  // The order WebKit can deliver: a layout read clamps the position, and the
  // scroll event reaches the list before the resize observer reports the row.
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('.astryx-chat-layout');
    const rows = [
      ...document.querySelectorAll<HTMLElement>(
        '.astryx-chat-layout .astryx-chat-message',
      ),
    ];
    const above = rows.at(-2);
    if (scroller == null || above == null) {
      throw new Error('No scroller or no message above the newest');
    }
    above.style.height = `${above.getBoundingClientRect().height - 40}px`;
    above.style.overflow = 'hidden';
    void scroller.scrollTop;
    scroller.dispatchEvent(new Event('scroll'));
  });
  // Read once the resize observer has reported the row, two frames later.
  await frames(page, 2);
  expect(await distanceFromEnd(page)).toBeLessThan(1);
  await streamReply(page);
  await expect.poll(async () => distanceFromEnd(page)).toBeLessThan(1);
});

test('reveals a message that is not mounted when its rows are shorter than their estimates', async ({
  page,
}) => {
  // At a desktop width the messages wrap less than the story estimates.
  await page.setViewportSize({width: 1280, height: 800});
  await openStory(page, storybook(), STORY);
  await page
    .getByRole('button', {name: 'Jump to the first loaded message'})
    .click();
  await expect
    .poll(async () => offsetFromTop(page, '#3000 ').catch(() => Number.NaN))
    .toBeCloseTo(0, 0);
  await page.getByRole('button', {name: 'Center the middle message'}).click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>(
          '.astryx-chat-layout',
        );
        const row = [
          ...(scroller?.querySelectorAll('.astryx-chat-message') ?? []),
        ].find(message => message.textContent?.startsWith('#4000 '));
        if (scroller == null || row == null) {
          return Number.NaN;
        }
        const box = row.getBoundingClientRect();
        const port = scroller.getBoundingClientRect();
        return Math.round(
          box.top + box.height / 2 - (port.top + scroller.clientHeight / 2),
        );
      }),
    )
    .toBeCloseTo(0, 0);
});
