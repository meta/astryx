// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/alert-dialog|internal/a11y-spec/src/harness|packages/core/src/AlertDialog/|packages/core/src/Dialog/|apps/storybook/stories/AlertDialogA11y)

/**
 * @file AlertDialog.a11y.chromium.spec.ts
 * @input Built AlertDialog stories and ALERT_DIALOG_PATTERN in real Chromium
 * @output Browser evidence for every alert-dialog expectation across the binding's states, the surface opened through its opener the way a person reaches it
 * @position Chromium lane of the AlertDialog binding (component:AlertDialog AR1)
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  ALERT_DIALOG_PATTERN,
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
  ALERT_DIALOG_BINDING_STATES,
  ALERT_DIALOG_CANCEL_LABEL,
  ALERT_DIALOG_MESSAGE,
  ALERT_DIALOG_OPEN_LABEL,
  type AlertDialogBindingState,
} from './AlertDialog.a11y.states';

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
  state: AlertDialogBindingState,
): Promise<{subject: Locator; related: Record<string, Locator>}> {
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  await holdMotionStill(page);
  const root = page.locator('#storybook-root');
  const subject = root.locator('dialog');
  await root.getByRole('button', {name: ALERT_DIALOG_OPEN_LABEL}).click();
  await subject.waitFor({state: 'visible'});
  const message = subject.getByText(ALERT_DIALOG_MESSAGE);
  const cancel = subject.getByRole('button', {
    name: ALERT_DIALOG_CANCEL_LABEL,
  });
  return {subject, related: {message, cancel}};
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: AlertDialogBindingState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: ALERT_DIALOG_PATTERN,
    binding: 'AlertDialog',
    state: state.id,
    facts: state.facts,
    mount: async () => {
      const {subject, related} = await mountState(page, state);
      return createChromiumHarness({page, cdp, subject, related});
    },
  });
}

test('every alert-dialog expectation is exercised by an AlertDialog state', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of ALERT_DIALOG_BINDING_STATES) {
    results.push(await runState(page, cdp, state));
  }
  expect(neverExercised(results)).toEqual([]);
});

for (const state of ALERT_DIALOG_BINDING_STATES) {
  test(`AlertDialog [${state.id}] — ${state.summary}`, async ({page}) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    const report = summarize(ALERT_DIALOG_PATTERN, [result]);
    // Required rows block (AST-020 FR9); advisory rows and exact known
    // failures report.
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}
