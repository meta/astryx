// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file MultiSelector.disabledFocus.a11y.chromium.spec.ts
 * @input The `Core/MultiSelector` Default story in a built Storybook.
 * @output Real-engine proof of `spec:AST-085` FR4: a trigger disabled while it
 *   holds keyboard focus keeps focus and reports itself disabled.
 * @position Run with `pnpm test:a11y-contract`; a DOM emulator does not move
 *   focus off an element that becomes disabled, so it cannot show the loss.
 */

import {expect, test} from '@playwright/test';
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

test('a focused trigger keeps focus when it becomes disabled', async ({
  page,
}) => {
  const storyId = 'core-multiselector--default';
  await page.goto(
    `${storybook.origin}/iframe.html?id=${storyId}&viewMode=story`,
  );
  const trigger = page.getByRole('combobox', {name: 'Columns'});
  await trigger.focus();
  await expect(trigger).toBeFocused();

  await page.evaluate(id => {
    const channel = (
      window as unknown as {
        __STORYBOOK_ADDONS_CHANNEL__?: {
          emit: (event: string, payload: unknown) => void;
        };
      }
    ).__STORYBOOK_ADDONS_CHANNEL__;
    if (channel == null) {
      throw new Error('Storybook channel is unavailable');
    }
    channel.emit('updateStoryArgs', {
      storyId: id,
      updatedArgs: {isDisabled: true},
    });
  }, storyId);

  // Wait for the disabled re-render in either form, so focus is checked
  // after it lands.
  await expect
    .poll(async () =>
      trigger.evaluate(
        el =>
          el.hasAttribute('disabled') ||
          el.getAttribute('aria-disabled') === 'true',
      ),
    )
    .toBe(true);
  await expect(trigger).toBeFocused();
});
