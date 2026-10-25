// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/TreeList/|packages/core/src/hooks/useTreeFocus|apps/storybook/stories/TreeListA11y)

/**
 * @file TreeListRowNames.a11y.chromium.spec.ts
 * @input The built TreeList row-names story in real Chromium
 * @output Proof that the browser names every treeitem by its label alone and describes it by its description — the chevron toggle and inner link/button do not leak into the row's name
 * @position Chromium evidence for component:TreeList AR1 (component:TreeList's row-naming implementation gap, closed)
 */

import {expect, test, type Page} from '@playwright/test';
import {
  createChromiumHarness,
  holdMotionStill,
} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY_ID = 'a11y-treelist-row-names--row-names';

const ROWS = [
  {id: 'docs', name: 'Documents', description: 'Shared with the team'},
  // Carries start content and an end-content button: neither joins the name.
  {id: 'budget', name: 'Budget', description: 'Updated yesterday'},
  {id: 'report', name: 'Report', description: 'Opens the report'},
  {id: 'export', name: 'Export', description: 'Downloads a file'},
] as const;

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

async function mount(page: Page): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY_ID}&viewMode=story`,
    {waitUntil: 'load'},
  );
  await holdMotionStill(page);
  await page.locator('[role="tree"]').waitFor({state: 'attached'});
}

for (const row of ROWS) {
  test(`the browser names the "${row.name}" row by its label and describes it by its description`, async ({
    page,
  }) => {
    await mount(page);
    const cdp = await page.context().newCDPSession(page);
    const harness = createChromiumHarness({
      page,
      cdp,
      subject: page.locator(`[role="treeitem"][data-tree-id="${row.id}"]`),
    });
    const computed = await (await harness.subject()).computed();
    expect(computed.role).toBe('treeitem');
    expect(computed.name).toBe(row.name);
    expect(computed.description).toBe(row.description);
  });
}

test('typing a letter matches the label, so a row whose text begins with start content is reachable', async ({
  page,
}) => {
  await mount(page);
  const docsRow = page.locator('[role="treeitem"][data-tree-id="docs"]');
  await docsRow.focus();
  // The Budget row's text begins with its start content ("3"), so a
  // whole-text match never finds it under "b"; the label match does.
  await page.keyboard.press('b');
  await expect(
    page.locator('[role="treeitem"][data-tree-id="budget"]'),
  ).toBeFocused();
});
