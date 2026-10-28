// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuRootUnmount.interaction.browser.spec.ts
 * @input The built "Pointer presentation" ContextMenu story, a mouse, and
 *   Storybook's switch to another story, which unmounts the story's whole
 *   React root
 * @output Real-browser proof that ContextMenu's menu goes with the React
 *   tree it renders in (component:ContextMenu FR10): unmounting the whole
 *   root around an open menu throws nothing, in Chromium and WebKit
 * @position Run with `pnpm test:interaction ContextMenuRootUnmount`
 */

import {expect, test} from '@playwright/test';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

test('switching stories, which unmounts the whole React root around an open ContextMenu, throws nothing (component:ContextMenu FR10)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => {
    errors.push(error.message);
  });
  await openStory(page, storybook(), 'core-contextmenu--pointer-presentation');
  const box = await page.getByTestId('pointer-context-menu').boundingBox();
  if (box == null) {
    throw new Error('no trigger');
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
    button: 'right',
  });
  const menu = page.getByRole('menu', {name: 'Document actions'});
  await expect(menu).toBeVisible();
  // Storybook unmounts the story's root before it renders the next story.
  await page.evaluate(() => {
    const channel = (
      globalThis as unknown as {
        __STORYBOOK_ADDONS_CHANNEL__?: {
          emit: (event: string, data: unknown) => void;
        };
      }
    ).__STORYBOOK_ADDONS_CHANNEL__;
    if (channel == null) {
      throw new Error('no Storybook channel');
    }
    channel.emit('setCurrentStory', {
      storyId: 'core-contextmenu--headless-on-a-list-row',
      viewMode: 'story',
    });
  });
  await expect(page.getByTestId('headless-row')).toBeVisible();
  await expect(menu).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});
