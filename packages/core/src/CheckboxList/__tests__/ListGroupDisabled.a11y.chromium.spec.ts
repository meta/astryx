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

import {expect, test, type Page} from '@playwright/test';
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

/** The disabled state Chromium's own accessibility tree reports for the group. */
async function axDisabled(
  page: Page,
  role: string,
  name: string,
): Promise<boolean | null> {
  const cdp = await page.context().newCDPSession(page);
  const {nodes} = (await cdp.send('Accessibility.getFullAXTree')) as {
    nodes: {
      role?: {value?: string};
      name?: {value?: string};
      properties?: {name: string; value: {value?: unknown}}[];
    }[];
  };
  await cdp.detach();
  const node = nodes.find(
    n => n.role?.value === role && n.name?.value === name,
  );
  if (node == null) {
    return null;
  }
  return (
    node.properties?.find(p => p.name === 'disabled')?.value.value === true
  );
}

for (const {story, role, name} of CASES) {
  test(`${story}: the ${role} is exposed as disabled`, async ({page}) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=${story}&viewMode=story`,
    );
    await holdMotionStill(page);
    await expect(page.getByRole(role, {name})).toBeVisible();
    expect(await axDisabled(page, role, name)).toBe(true);
  });

  test(`${story} with isDisabled off: the ${role} is not disabled`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=${story}&viewMode=story&args=isDisabled:!false`,
    );
    await holdMotionStill(page);
    await expect(page.getByRole(role, {name})).toBeVisible();
    expect(await axDisabled(page, role, name)).toBe(false);
  });
}
