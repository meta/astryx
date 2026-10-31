// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TreeListCollapseFocus.a11y.chromium.spec.ts
 * @input The built Storybook's `Core/TreeList` "Collapse Focus" story: a tree
 *   whose app collapses its "src" branch from a `[` shortcut, and a button
 *   outside it
 * @output Real-Chromium proof of `component:TreeList` AR2: focus inside a
 *   collapsing branch moves to its row; focus elsewhere is not moved
 * @position Testing; the unit cases are in TreeList.test.tsx and
 *   motion/animatedLayoutAdopters.test.tsx
 *
 * SYNC: When modified, update the AR2 Verification row in TreeList.spec.md.
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(DEFAULT_STORYBOOK_DIR);
});

test.afterAll(async () => {
  await storybook?.close();
});

async function openStory(page: Page): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-treelist--collapse-focus&viewMode=story`,
  );
  await page.getByRole('treeitem', {name: 'index.ts'}).waitFor();
}

test('focus inside a collapsing branch moves to its row', async ({page}) => {
  await openStory(page);
  const child = page.getByRole('treeitem', {name: 'index.ts'});
  await child.focus();
  await page.keyboard.press('[');

  await expect(child).toHaveCount(0);
  const src = page.getByRole('treeitem', {name: 'src'});
  await expect(src).toBeFocused();
  await expect(src).toHaveAttribute('tabindex', '0');
});

test('focus outside the collapsing branch is not moved', async ({page}) => {
  await openStory(page);
  const elsewhere = page.getByRole('button', {name: 'Elsewhere'});
  await elsewhere.focus();
  await page.keyboard.press('[');

  await expect(page.getByRole('treeitem', {name: 'index.ts'})).toHaveCount(0);
  await expect(elsewhere).toBeFocused();
});
