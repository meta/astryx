// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/CheckboxList

/**
 * @file CheckboxListErrorStatus.a11y.chromium.spec.ts
 * @input The built Core/CheckboxList WithErrorStatus story; Chromium's
 *   accessibility tree through the DevTools protocol
 * @output Browser evidence that every checkbox in a list with an error status
 *   is exposed as invalid
 * @position Chromium proof for CheckboxList's per-checkbox invalid state
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

interface AXNode {
  role?: {value?: string};
  properties?: {name: string; value: {value?: unknown}}[];
}

test('every checkbox of a list with an error status is invalid', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-checkboxlist--with-error-status&viewMode=story`,
  );
  await holdMotionStill(page);
  await expect(page.getByRole('checkbox').first()).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  const {nodes} = (await cdp.send('Accessibility.getFullAXTree')) as {
    nodes: AXNode[];
  };
  const checkboxes = nodes.filter(node => node.role?.value === 'checkbox');
  expect(checkboxes.length).toBeGreaterThan(0);
  for (const checkbox of checkboxes) {
    const invalid = checkbox.properties?.find(
      property => property.name === 'invalid',
    )?.value.value;
    expect(invalid).toBe('true');
  }
});
