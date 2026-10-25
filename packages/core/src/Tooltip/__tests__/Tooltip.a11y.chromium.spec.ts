// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/tooltip\.|packages/core/src/Tooltip/|apps/storybook/stories/TooltipA11y)

/**
 * @file Tooltip.a11y.chromium.spec.ts
 * @input Built tooltip stories and TOOLTIP_PATTERN in real Chromium
 * @output Browser evidence for every tooltip expectation across Tooltip's and useTooltip's representative states
 * @position Chromium lane of the Tooltip binding
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  TOOLTIP_PATTERN,
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
  TOOLTIP_BINDING_STATES,
  type TooltipBindingState,
} from './Tooltip.a11y.states';

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
  state: TooltipBindingState,
): Promise<{subject: Locator; related: Record<string, Locator>}> {
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  await holdMotionStill(page);
  const root = page.locator('#storybook-root');
  const subject =
    state.triggerRole == null
      ? root.getByText(state.triggerText, {exact: true})
      : root.getByRole(state.triggerRole, {
          name: state.triggerText,
          exact: true,
        });
  await expect(subject).toBeVisible();
  return {
    subject,
    related: {
      // The layer may mount the tooltip outside the story root, and it stays
      // in the page while hidden, so it is found page-wide, hidden included.
      tooltip: page.getByRole('tooltip', {includeHidden: true}),
      before: root.getByRole('button', {
        name: 'Before the trigger',
        exact: true,
      }),
      after: root.getByRole('button', {
        name: 'After the trigger',
        exact: true,
      }),
    },
  };
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: TooltipBindingState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: TOOLTIP_PATTERN,
    binding: 'Tooltip',
    state: state.id,
    facts: state.facts,
    mount: async () => {
      const {subject, related} = await mountState(page, state);
      return createChromiumHarness({page, cdp, subject, related});
    },
  });
}

test('every tooltip expectation is exercised by a Tooltip state', async ({
  page,
}) => {
  test.setTimeout(3 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of TOOLTIP_BINDING_STATES) {
    results.push(await runState(page, cdp, state));
  }
  expect(neverExercised(results)).toEqual([]);
});

for (const state of TOOLTIP_BINDING_STATES) {
  test(`Tooltip [${state.id}] — ${state.summary}`, async ({page}) => {
    test.setTimeout(2 * 60 * 1000);
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    const report = summarize(TOOLTIP_PATTERN, [result]);
    // Required rows block (AST-020 FR9); advisory rows report.
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}
