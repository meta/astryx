// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Table/|apps/storybook/stories/TableColumnResize\.stories)

/**
 * @file TableColumnResizeName.a11y.chromium.spec.ts
 * @input Storybook story core-tablecolumnresize--default
 * @output Chromium's own accessibility tree for each column header in a table
 *   with resize handles: the header is named by its text, and the handle's
 *   name and width value never join it.
 * @position Real-browser check: name-from-content of a focusable separator
 *   differs between engines and jsdom.
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

test('a resize handle never adds to its column header name', async ({page}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablecolumnresize--default&viewMode=story`,
    {waitUntil: 'load'},
  );
  await expect(page.getByRole('separator').first()).toBeAttached();

  const cdp = await page.context().newCDPSession(page);
  const {nodes} = (await cdp.send('Accessibility.getFullAXTree')) as {
    nodes: {role?: {value?: string}; name?: {value?: string}}[];
  };
  const headerNames = nodes
    .filter(node => node.role?.value === 'columnheader')
    .map(node => node.name?.value ?? '');
  const visibleTexts = await page
    .getByRole('columnheader')
    .evaluateAll(cells =>
      cells.map(cell => (cell as HTMLElement).innerText.trim()),
    );

  expect(headerNames.length).toBeGreaterThan(0);
  expect(headerNames).toEqual(visibleTexts);
});
