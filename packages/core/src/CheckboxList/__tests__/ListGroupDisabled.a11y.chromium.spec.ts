// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/CheckboxList core/RadioList

/**
 * @file ListGroupDisabled.a11y.chromium.spec.ts
 * @input The built Core/CheckboxList and Core/RadioList Disabled stories;
 *   Chromium's accessibility tree
 * @output Browser evidence that a disabled CheckboxList or RadioList exposes
 *   its group as disabled, and an enabled one does not
 * @position Chromium proof for the group-level aria-disabled on both lists
 */

import {expect, test} from '@playwright/test';
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

const CASES = [
  {
    story: 'core-checkboxlist--disabled',
    role: 'group',
    name: 'Notification preferences',
  },
  {
    story: 'core-radiolist--disabled',
    role: 'radiogroup',
    name: 'Notification preference',
  },
] as const;

for (const {story, role, name} of CASES) {
  test(`${story}: the ${role} is exposed as disabled`, async ({page}) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=${story}&viewMode=story`,
    );
    await holdMotionStill(page);
    // Playwright's role query reads the accessibility tree's disabled state.
    await expect(page.getByRole(role, {name, disabled: true})).toBeVisible();
  });

  test(`${story} with isDisabled off: the ${role} is not disabled`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=${story}&viewMode=story&args=isDisabled:!false`,
    );
    await holdMotionStill(page);
    await expect(page.getByRole(role, {name, disabled: false})).toBeVisible();
  });
}
