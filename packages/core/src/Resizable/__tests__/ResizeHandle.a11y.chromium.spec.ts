// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/window-splitter|internal/a11y-spec/src/harness|packages/core/src/Resizable/|apps/storybook/stories/WindowSplitterA11y)

/**
 * @file ResizeHandle.a11y.chromium.spec.ts
 * @input Built ResizeHandle stories and WINDOW_SPLITTER_PATTERN in real Chromium
 * @output Browser evidence for every window-splitter expectation across the binding's states, reconciled against the exact known failures
 * @position Chromium lane of the ResizeHandle binding (component:Resizable AR1)
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  WINDOW_SPLITTER_PATTERN,
  blockingResults,
  checkAccessibilitySpec,
  formatFailures,
  neverExercised,
  summarize,
  unmatchedKnownFailures,
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
import {RESIZE_HANDLE_KNOWN_FAILURES} from './ResizeHandle.a11y.known-failures';
import {
  RESIZE_HANDLE_BINDING_STATES,
  type ResizeHandleBindingState,
} from './ResizeHandle.a11y.states';

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

async function mountState(
  page: Page,
  state: ResizeHandleBindingState,
): Promise<{subject: Locator; related: Record<string, Locator>}> {
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  await holdMotionStill(page);
  const root = page.locator('#storybook-root');
  const subject = root.getByRole('separator', {name: state.label});
  await subject.waitFor({state: 'attached'});
  const pane = root.locator('#a11y-splitter-pane');
  return {subject, related: {pane}};
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: ResizeHandleBindingState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: WINDOW_SPLITTER_PATTERN,
    binding: 'ResizeHandle',
    state: state.id,
    facts: state.facts,
    knownFailures: RESIZE_HANDLE_KNOWN_FAILURES,
    mount: async () => {
      const {subject, related} = await mountState(page, state);
      return createChromiumHarness({page, cdp, subject, related});
    },
  });
}

test('every window-splitter expectation is exercised by a ResizeHandle state', async ({
  page,
}) => {
  // One test mounts and checks every binding state in turn: about 20s on an
  // idle machine, three times that when the contract run shares a runner's
  // cores, so the default 60s ran out mid-loop on whichever state it reached.
  // Budget it like the other whole-inventory sweeps (Button, Checkbox).
  test.setTimeout(3 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of RESIZE_HANDLE_BINDING_STATES) {
    results.push(await runState(page, cdp, state));
  }
  expect(neverExercised(results)).toEqual([]);
  expect(unmatchedKnownFailures(RESIZE_HANDLE_KNOWN_FAILURES, results)).toEqual(
    [],
  );
});

for (const state of RESIZE_HANDLE_BINDING_STATES) {
  test(`ResizeHandle [${state.id}] — ${state.summary}`, async ({page}) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    const report = summarize(WINDOW_SPLITTER_PATTERN, [result]);
    // Required rows block (AST-020 FR9); advisory rows and exact known
    // failures report.
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}
