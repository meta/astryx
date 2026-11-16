// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/(Button|Banner|Field)/

/**
 * @file ButtonTooltipInName.a11y.chromium.spec.ts
 * @input Uses @astryxdesign/a11y-spec (the Chromium harness and the static
 *   Storybook server) and the checked-in Banner and TextInput stories
 * @output Proves in the accessibility tree that a Core Button whose name
 *   contains its short tooltip exposes no description, while the tooltip
 *   still shows on hover
 * @position The browser lane for Button FR12's Core sentence; the jsdom
 *   tests beside each component cover the same cases
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  createChromiumHarness,
  holdMotionStill,
} from '@astryxdesign/a11y-spec/chromium';
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

async function mountStory(page: Page, storyId: string): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${storyId}&viewMode=story`,
    {waitUntil: 'load'},
  );
  await holdMotionStill(page);
}

const CASES = [
  {
    part: "Banner's dismiss button",
    storyId: 'core-banner--dismissable',
    name: 'Dismiss Your session will expire soon.',
    tooltip: 'Dismiss',
  },
  {
    part: "TextInput's clear button",
    storyId: 'core-textinput--clearable',
    name: 'Clear Search',
    tooltip: 'Clear',
  },
] as const;

for (const {part, storyId, name, tooltip} of CASES) {
  test(`${part} is named once: its "${tooltip}" tooltip shows but adds no description`, async ({
    page,
  }) => {
    await mountStory(page, storyId);
    const button = page
      .locator('#storybook-root')
      .getByRole('button', {name, exact: true});
    await button.waitFor({state: 'attached'});
    const cdp = await page.context().newCDPSession(page);
    const computed = await (
      await createChromiumHarness({page, subject: button, cdp}).subject()
    ).computed();

    expect(computed.name).toBe(name);
    expect(computed.description).toBe('');

    await button.hover();
    await expect(
      page.getByRole('tooltip').filter({hasText: new RegExp(`^${tooltip}$`)}),
    ).toBeVisible();
  });
}
