// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/tree-view|internal/a11y-spec/src/harness|packages/core/src/TreeList/|packages/core/src/hooks/useTreeFocus|apps/storybook/stories/TreeListTreeViewA11y)

/**
 * @file TreeList.a11y.chromium.spec.ts
 * @input Built TreeList tree-view stories and TREE_VIEW_PATTERN in real Chromium
 * @output Browser evidence for every tree-view expectation across the binding's states
 * @position Chromium lane of the TreeList tree-view binding (component:TreeList AR1)
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  TREE_VIEW_PATTERN,
  blockingResults,
  checkAccessibilitySpec,
  formatFailures,
  neverExercised,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {
  createChromiumHarness,
  holdMotionStill,
} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {
  TREE_LIST_BINDING_STATES,
  type TreeListBindingState,
} from './TreeList.a11y.states';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

function storyUrl(storyId: string): string {
  return `${storybook.origin}/iframe.html?id=${storyId}&viewMode=story`;
}

function rowLocator(page: Page, id: string): Locator {
  return page.locator(
    `#storybook-root [role="treeitem"][data-tree-id="${id}"]`,
  );
}

async function mountState(
  page: Page,
  state: TreeListBindingState,
): Promise<{subject: Locator; related: Record<string, Locator>}> {
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  await holdMotionStill(page);
  const subject = rowLocator(page, state.subject);
  await subject.waitFor({state: 'attached'});
  const root = page.locator('#storybook-root');
  const related: Record<string, Locator> = {
    tree: root.getByRole('tree'),
    before: root.getByRole('button', {name: 'Before the tree'}),
    after: root.getByRole('button', {name: 'After the tree'}),
    group: subject.locator('[role="group"]'),
  };
  for (const [name, id] of Object.entries(state.relations)) {
    related[name] = rowLocator(page, id);
  }
  return {subject, related};
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: TreeListBindingState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: TREE_VIEW_PATTERN,
    binding: 'TreeList',
    state: state.id,
    facts: state.facts,
    mount: async () => {
      const {subject, related} = await mountState(page, state);
      return createChromiumHarness({page, cdp, subject, related});
    },
  });
}

test('every tree-view expectation is exercised by a TreeList state', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of TREE_LIST_BINDING_STATES) {
    results.push(await runState(page, cdp, state));
  }
  expect(neverExercised(results)).toEqual([]);
});

for (const state of TREE_LIST_BINDING_STATES) {
  test(`TreeList [${state.id}] — ${state.summary}`, async ({page}) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    const report = summarize(TREE_VIEW_PATTERN, [result]);
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(
      result.results.filter(
        row => row.status !== 'pass' && row.status !== 'not-applicable',
      ),
    ).toEqual([]);
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}
