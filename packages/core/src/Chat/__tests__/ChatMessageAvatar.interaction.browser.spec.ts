// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatMessageAvatar.interaction.browser.spec.ts
 * @input Storybook story core-chat--chat-conversation
 * @output ChatMessage's avatar spacing in a real browser: a message whose
 *   bubble renders a name gives its avatar the name row's top spacing, and a
 *   message without one does not. The rule is judged from the message article
 *   (parent-relative), so the stylesheet keeps no sibling-relative :has().
 * @position ChatMessage avatar-alignment evidence, run in the Chromium
 *   interaction lane; jsdom checks only the compiled selector's shape.
 */

import {expect, test, type Page} from '@playwright/test';
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

interface AvatarSpacing {
  story: string;
  hasName: boolean;
  marginTop: string;
}

async function avatarSpacing(
  page: Page,
  story: string,
): Promise<AvatarSpacing[]> {
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  await page.locator('article.astryx-chat-message').first().waitFor();
  const rows = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>('article.astryx-chat-message'),
    )
      // The avatar wrapper is the article's first child when an avatar renders.
      .filter(article =>
        article.firstElementChild?.querySelector('.astryx-avatar'),
      )
      .map(article => ({
        hasName: article.querySelector('[data-chat-name]') != null,
        marginTop: getComputedStyle(article.firstElementChild as HTMLElement)
          .marginTop,
      })),
  );
  return rows.map(row => ({story, ...row}));
}

test('an avatar takes the name row spacing only when a bubble has a name', async ({
  page,
}) => {
  const rows = [
    ...(await avatarSpacing(page, 'core-chat--chat-conversation')),
    ...(await avatarSpacing(page, 'core-chatmessage--default')),
  ];
  const named = rows.filter(row => row.hasName);
  const unnamed = rows.filter(row => !row.hasName);
  expect(named.length).toBeGreaterThan(0);
  expect(unnamed.length).toBeGreaterThan(0);
  for (const row of named) {
    expect(parseFloat(row.marginTop), row.story).toBeGreaterThan(0);
  }
  for (const row of unnamed) {
    expect(row.marginTop, row.story).toBe('0px');
  }
});
