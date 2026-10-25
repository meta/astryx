// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/progressbar\.|packages/core/src/ProgressBar/|packages/lab/src/CircularProgress/|apps/storybook/stories/ProgressbarA11y)

/**
 * @file ProgressBar.a11y.chromium.spec.ts
 * @input Built ProgressBar stories and PROGRESSBAR_PATTERN in real Chromium
 * @output Browser evidence for every progressbar expectation across the binding's states, reconciled against the exact known failures
 * @position Chromium lane of the ProgressBar binding
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  PROGRESSBAR_PATTERN,
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
import {PROGRESSBAR_KNOWN_FAILURES} from './ProgressBar.a11y.known-failures';
import {
  PROGRESSBAR_BINDING_STATES,
  type ProgressBarBindingState,
} from './ProgressBar.a11y.states';

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
  state: ProgressBarBindingState,
): Promise<{subject: Locator; related: Record<string, Locator>}> {
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  await holdMotionStill(page);
  const subject = page
    .locator('#storybook-root')
    .getByRole('progressbar', {name: state.facts.name});
  await subject.waitFor({state: 'attached'});
  return {subject, related: {}};
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: ProgressBarBindingState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: PROGRESSBAR_PATTERN,
    binding: 'ProgressBar',
    state: state.id,
    facts: state.facts,
    knownFailures: PROGRESSBAR_KNOWN_FAILURES,
    mount: async () => {
      const {subject, related} = await mountState(page, state);
      return createChromiumHarness({page, cdp, subject, related});
    },
  });
}

test('every progressbar expectation is exercised by a ProgressBar state', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of PROGRESSBAR_BINDING_STATES) {
    results.push(await runState(page, cdp, state));
  }
  expect(neverExercised(results)).toEqual([]);
  expect(unmatchedKnownFailures(PROGRESSBAR_KNOWN_FAILURES, results)).toEqual(
    [],
  );
});

for (const state of PROGRESSBAR_BINDING_STATES) {
  test(`ProgressBar [${state.id}] — ${state.summary}`, async ({page}) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    const report = summarize(PROGRESSBAR_PATTERN, [result]);
    // Required rows block (AST-020 FR9); advisory rows and exact known
    // failures report.
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}
