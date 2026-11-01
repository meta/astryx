// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file DisabledTriggerFocus.a11y.chromium.spec.ts
 * @input The `a11y/Disabled trigger focus` stories in a built Storybook.
 * @output Real-engine proof of `spec:AST-085` FR4 for Selector and
 *   ComplexSelector: a trigger disabled while it holds keyboard focus keeps
 *   focus and reports itself disabled.
 * @position Run in `pr-a11y`; a DOM emulator does not move focus off an
 *   element that becomes disabled, so it cannot show the loss.
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

const CASES = [
  {
    storyId: 'a11y-disabled-trigger-focus--selector-trigger',
    role: 'combobox',
    name: 'Fruit',
  },
  {
    storyId: 'a11y-disabled-trigger-focus--complex-selector-trigger',
    role: 'combobox',
    name: 'View options',
  },
] as const;

for (const {storyId, role, name} of CASES) {
  test(`${name}: a focused trigger keeps focus when it becomes disabled`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=${storyId}&viewMode=story`,
    );
    const trigger = page.getByRole(role, {name});
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
}
