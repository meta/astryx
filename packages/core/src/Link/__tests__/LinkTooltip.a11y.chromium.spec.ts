// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Link/|packages/core/src/utils/OnDemandTooltip|apps/storybook/stories/Link\.stories)

/**
 * @file LinkTooltip.a11y.chromium.spec.ts
 * @input Storybook story core-link--links-with-tooltips
 * @output Chromium's own accessibility tree describes each link by its tooltip
 *   text before any interaction, with no tooltip layer and no wrapper around
 *   the link, and the first hover opens the tooltip on the link itself
 * @position Real-browser check for Link FR10 and PR2: jsdom's accessible
 *   description and class-based styles differ from a browser's.
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
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

test('a link with a tooltip is described by its text before any interaction, with no wrapper', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-link--links-with-tooltips&viewMode=story`,
    {waitUntil: 'load'},
  );
  const link = page.getByRole('link', {name: 'Settings'});
  await expect(link).toBeVisible();

  // No tooltip layer exists yet.
  await expect(page.locator('[role="tooltip"]')).toHaveCount(0);

  // The link's parent is the story's own row, not a `display: contents`
  // wrapper.
  const parentDisplay = await link.evaluate(element =>
    element.parentElement == null
      ? null
      : getComputedStyle(element.parentElement).display,
  );
  expect(parentDisplay).not.toBe('contents');

  const cdp = await page.context().newCDPSession(page);
  const {nodes} = (await cdp.send('Accessibility.getFullAXTree')) as {
    nodes: {
      role?: {value?: string};
      name?: {value?: string};
      description?: {value?: string};
    }[];
  };
  const settings = nodes.find(
    node => node.role?.value === 'link' && node.name?.value === 'Settings',
  );
  expect(settings?.description?.value).toBe('Configure your account settings');

  // The first hover opens the tooltip, attached to the link itself.
  await link.hover();
  const tooltip = page.locator('[role="tooltip"]:popover-open');
  await expect(tooltip).toHaveText('Configure your account settings');
});
