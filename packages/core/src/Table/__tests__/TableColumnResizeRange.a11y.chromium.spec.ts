// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Table/|apps/storybook/stories/TableColumnResize\.stories)

/**
 * @file TableColumnResizeRange.a11y.chromium.spec.ts
 * @input Storybook story core-tablecolumnresize--default, whose columns have
 *   no maximum width
 * @output Chromium's own accessibility tree for each resize handle: a
 *   maximum at or above its value and its minimum, and the width in words.
 * @position Real-browser check of the separator range assistive technology
 *   reads; jsdom has no accessibility tree.
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

type AXValue = {value?: string | number | boolean};
type AXNode = {
  role?: AXValue;
  value?: AXValue;
  properties?: {name: string; value?: AXValue}[];
};

function axProperty(node: AXNode, name: string): string | number | undefined {
  const value = node.properties?.find(entry => entry.name === name)?.value
    ?.value;
  return typeof value === 'boolean' ? undefined : value;
}

test('an unbounded column handle announces a range that holds its value', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablecolumnresize--default&viewMode=story`,
    {waitUntil: 'load'},
  );
  await expect(page.getByRole('separator').first()).toBeAttached();

  const cdp = await page.context().newCDPSession(page);
  const {nodes} = (await cdp.send('Accessibility.getFullAXTree')) as {
    nodes: AXNode[];
  };
  const separators = nodes.filter(node => node.role?.value === 'separator');
  expect(separators.length).toBeGreaterThan(0);
  for (const node of separators) {
    const now = Number(node.value?.value);
    const min = Number(axProperty(node, 'valuemin'));
    const max = Number(axProperty(node, 'valuemax'));
    expect(Number.isFinite(max)).toBe(true);
    expect(max).toBeGreaterThanOrEqual(now);
    expect(max).toBeGreaterThanOrEqual(min);
    // The width in words, since the maximum stands in for a missing limit.
    expect(axProperty(node, 'valuetext')).toBe(`${now} pixels`);
  }
});

test("a handle announces its column's rendered width before any resize", async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablecolumnresize--default&viewMode=story`,
    {waitUntil: 'load'},
  );
  await expect(page.getByRole('separator').first()).toBeAttached();
  const widths = await page
    .getByRole('separator')
    .evaluateAll(handles =>
      handles.map(handle =>
        Math.round(handle.closest('th')?.getBoundingClientRect().width ?? 0),
      ),
    );

  const cdp = await page.context().newCDPSession(page);
  const announced = async () => {
    const {nodes} = (await cdp.send('Accessibility.getFullAXTree')) as {
      nodes: AXNode[];
    };
    return nodes
      .filter(node => node.role?.value === 'separator')
      .map(node => Number(node.value?.value));
  };
  const rendered = async () =>
    page
      .getByRole('separator')
      .evaluateAll(handles =>
        handles.map(handle =>
          Math.round(handle.closest('th')?.getBoundingClientRect().width ?? 0),
        ),
      );
  await expect.poll(announced).toEqual(widths);

  // After a keyboard resize the value follows the column.
  await page.getByRole('separator').first().focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const resized = await rendered();
  expect(resized).not.toEqual(widths);
  await expect.poll(announced).toEqual(resized);
});
